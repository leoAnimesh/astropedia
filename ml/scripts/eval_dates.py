"""Date-generalisation eval for the trained student (Saga v3).

Every profiles_v2.jsonl row shares today=2026-10-04, so the v2 teacher answers
repeat the same transit dates ("Oct 2026" for Jupiter, "Jun 2027" for Saturn,
"Dec 2026" for Rahu). A student that memorised them will write those dates for
profiles dated later. data/eval_dates.json asks ~30 timing questions x en/hi/bn
on profiles dated 2027-06-15 and 2028-03-15 (data/eval_dates_profiles.jsonl);
this script checks that every month-year in an answer exists in that profile's
context / timing (validate_answer's parse_context + check_dates).

  # 1. answers from the HF checkpoint (greedy, transformers generate; the same
  #    prompt format build_sft.py trains on)
  python scripts/eval_dates.py generate --hf <hf_dir> --out out/eval_dates_answers.jsonl
  #    or from an exported .pte (ExecuTorch TextLLMRunner, as eval_student.py)
  python scripts/eval_dates.py generate --hf <hf_dir> --pte out/astro_gemma_v2.pte --out ...
  #    or any other runner: write the prompts, run them, save {"id", "answer"} lines
  python scripts/eval_dates.py prompts --out /tmp/eval_dates_prompts.jsonl
  # 2. score (no model needed)
  python scripts/eval_dates.py score --answers out/eval_dates_answers.jsonl [--show 8] [--details x.jsonl]

Scored per answer: any month-year not offered by the context (invented), one
before the profile's today that the context doesn't give (stale), the v2 shared
dates (month-years in >= 30% of profiles_v2 contexts) when this context doesn't
give them, "Oct 2026" itself, and validate_answer.check_dates failures
(date_invented*, date_event_mismatch, date_misattributed, ...).
"""

import argparse
import collections
import json
import re
import sys
from pathlib import Path

ML = Path(__file__).resolve().parents[1]
DATA = ML / "data"
sys.path.insert(0, str(DATA))
import validate_answer as VA  # noqa: E402

SPEC = DATA / "eval_dates.json"
OCT_2026 = (2026, 10)


def load_spec(path: Path = SPEC) -> tuple[list[dict], dict[str, dict]]:
    doc = json.loads(path.read_text())
    profiles = {json.loads(l)["id"]: json.loads(l) for l in (DATA / doc["profiles_file"]).open()}
    return doc["items"], profiles


def month_years(text: str) -> set[tuple[int, int]]:
    """Month + year mentions in any of en/hi/bn (month names, ASCII or native digits)."""
    return {(d["year"], d["month"]) for lg in ("en", "hi", "bn") for d in VA.find_dates(text, lg)
            if d.get("month") and d.get("year")}


def v2_shared_dates(min_share: float = 0.3) -> set[tuple[int, int]]:
    """Month-years that most profiles_v2 contexts carry (all dated 2026-10-04)."""
    path = DATA / "profiles_v2.jsonl"
    if not path.exists():
        return {OCT_2026}
    c: collections.Counter = collections.Counter()
    n = 0
    for l in path.open():
        p = json.loads(l)
        n += 1
        c.update(month_years(p["context"]))
    return {ym for ym, k in c.items() if k / n >= min_share} | {OCT_2026}


def fmt(ym: tuple[int, int]) -> str:
    return f"{VA.MON[ym[1] - 1]} {ym[0]}"


# ─── prompts / generation ────────────────────────────────────────────────────

def prompt_of(item: dict, p: dict) -> str:
    import build_sft as B  # student prompt format (mirrors utils/ai.ts)
    msgs = [{"role": "system", "content": B.student_saga_system(p, item["today"], item["lang"])},
            {"role": "user", "content": item["q"]}, {"role": "assistant", "content": ""}]
    return B.gemma_prompt(msgs)[0]


def cmd_prompts(a) -> None:
    items, profiles = load_spec()
    with a.out.open("w") as f:
        for it in items[: a.limit or None]:
            f.write(json.dumps({"id": it["id"], "prompt": prompt_of(it, profiles[it["profile"]])},
                               ensure_ascii=False) + "\n")
    print(f"wrote {min(len(items), a.limit or len(items))} prompts to {a.out}")


def cmd_generate(a) -> None:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    items, profiles = load_spec()
    items = items[: a.limit or None]
    tok = AutoTokenizer.from_pretrained(a.hf)
    eos = [i for i in tok.convert_tokens_to_ids(["<eos>", "<end_of_turn>"]) if i is not None]
    runner = model = None
    if a.pte:
        from executorch.extension.llm.custom_ops import custom_ops  # noqa: F401
        from executorch.kernels import quantized  # noqa: F401
        from executorch.extension.llm.runner import GenerationConfig, TextLLMRunner
        runner = TextLLMRunner(a.pte, f"{a.hf}/tokenizer.json")
    else:
        model = AutoModelForCausalLM.from_pretrained(a.hf, dtype=torch.float32).eval()
    done = set()
    if a.out.exists():  # resume
        done = {json.loads(l)["id"] for l in a.out.open() if l.strip()}
    with a.out.open("a") as f:
        for k, it in enumerate(items):
            if it["id"] in done:
                continue
            prompt = prompt_of(it, profiles[it["profile"]])
            if runner is not None:
                pieces: list[str] = []
                runner.reset()
                runner.generate(prompt, GenerationConfig(echo=False, max_new_tokens=a.max_new, temperature=0.0),
                                token_callback=pieces.append)
                ans = "".join(pieces).split("<end_of_turn>")[0].strip()
            else:
                ids = tok(prompt, return_tensors="pt", add_special_tokens=False).input_ids
                with torch.no_grad():
                    out = model.generate(ids, max_new_tokens=a.max_new, do_sample=False, eos_token_id=eos)
                ans = tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True).strip()
            f.write(json.dumps({"id": it["id"], "answer": ans}, ensure_ascii=False) + "\n")
            f.flush()
            print(f"[{k + 1}/{len(items)}] {it['id']}: {ans[:100]!r}", flush=True)


# ─── scoring ─────────────────────────────────────────────────────────────────

def score_one(it: dict, p: dict, ans: str, shared: set) -> dict:
    chart = VA.parse_context(p["context"] + "\n" + (p.get("timing") or ""), it["today"])
    t = chart.today
    allowed = set(chart.dates) | {(t.year, t.month), (t.year + t.month // 12, t.month % 12 + 1)}
    if chart.birth:
        allowed.add((chart.birth.year, chart.birth.month))
    mys = month_years(ans)
    invented = mys - allowed
    fails: list = []
    VA.check_dates(ans, it["lang"], chart, fails, [])
    return {"id": it["id"], "lang": it["lang"], "today": it["today"], "dates": sorted(mys),
            "invented": sorted(invented),
            "stale": sorted(ym for ym in invented if ym < (t.year, t.month)),
            "v2_shared": sorted(ym for ym in invented if ym in shared),
            "oct2026": OCT_2026 in invented,
            "date_fails": sorted({c for c, _ in fails if c.startswith("date_")}),
            "answer": ans}


def cmd_score(a) -> None:
    items, profiles = load_spec()
    by_id = {it["id"]: it for it in items}
    answers = {}
    for l in a.answers.open():
        if l.strip():
            r = json.loads(l)
            answers[r["id"]] = r["answer"]
    missing = [i for i in by_id if i not in answers]
    unknown = [i for i in answers if i not in by_id]
    shared = v2_shared_dates()
    print(f"v2 shared dates (in >= 30% of profiles_v2 contexts): {', '.join(fmt(x) for x in sorted(shared))}")
    if missing or unknown:
        print(f"note: {len(missing)} eval items without an answer, {len(unknown)} answers with unknown ids")
    rows = [score_one(by_id[i], profiles[by_id[i]["profile"]], ans, shared) for i, ans in answers.items() if i in by_id]
    if not rows:
        raise SystemExit("no answers to score")

    def line(name: str, rs: list[dict]) -> str:
        n = len(rs)
        pct = lambda k: sum(1 for r in rs if r[k]) / n  # noqa: E731
        return (f"{name:<16} n={n:<4} any date {pct('dates'):5.0%}  invented {pct('invented'):5.0%}  "
                f"stale {pct('stale'):5.0%}  v2-shared {pct('v2_shared'):5.0%}  Oct 2026 {pct('oct2026'):5.0%}  "
                f"check_dates fail {pct('date_fails'):5.0%}")

    print("\n% of answers (an answer counts once)")
    print(line("all", rows))
    for lang in ("en", "hi", "bn"):
        rs = [r for r in rows if r["lang"] == lang]
        if rs:
            print(line(lang, rs))
    for today in sorted({r["today"] for r in rows}):
        print(line(f"today {today}", [r for r in rows if r["today"] == today]))
    inv = collections.Counter(fmt(tuple(ym)) for r in rows for ym in r["invented"])
    if inv:
        print("\nmost common invented month-years: " + ", ".join(f"{k} x{v}" for k, v in inv.most_common(10)))
    codes = collections.Counter(c for r in rows for c in r["date_fails"])
    if codes:
        print("check_dates failures: " + ", ".join(f"{k} x{v}" for k, v in codes.most_common()))
    bad = [r for r in rows if r["invented"]]
    for r in bad[: a.show]:
        print(f"\n--- {r['id']} (today {r['today']}) invented {[fmt(tuple(x)) for x in r['invented']]}\n{r['answer']}")
    if a.details:
        with a.details.open("w") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("prompts", help="write {id, prompt} lines for any runner")
    s.add_argument("--out", type=Path, required=True)
    s.add_argument("--limit", type=int, default=0)
    s = sub.add_parser("generate", help="greedy answers from the HF checkpoint (or --pte)")
    s.add_argument("--hf", required=True, help="HF checkpoint dir (tokenizer too)")
    s.add_argument("--pte", help="optional exported .pte, run with the ExecuTorch TextLLMRunner instead")
    s.add_argument("--out", type=Path, required=True)
    s.add_argument("--max-new", type=int, default=260, help="the app's v2 reply cap")
    s.add_argument("--limit", type=int, default=0)
    s = sub.add_parser("score", help="check the answers' month-years against each profile's context")
    s.add_argument("--answers", type=Path, required=True, help="jsonl with id, answer")
    s.add_argument("--show", type=int, default=6, help="print this many answers with invented dates")
    s.add_argument("--details", type=Path, help="write per-answer results here")
    a = ap.parse_args()
    {"prompts": cmd_prompts, "generate": cmd_generate, "score": cmd_score}[a.cmd](a)


if __name__ == "__main__":
    main()
