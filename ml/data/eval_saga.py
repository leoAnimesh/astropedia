"""Small teacher eval for Saga answer faithfulness (no bulk generation).

Runs eval_questions.json (optionally a subset) through the teacher with the
current SAGA_SYSTEM + LANG_RULES on hand-picked edge-case profiles
(gen_eval_profiles.ts), validates every answer with validate_answer.py and
prints pass rates per language and per check.

  python data/eval_saga.py run --profiles <eval_profiles.jsonl> --out <results.jsonl> [--skip id,id] [--max-calls 170]
Answers that fail the script check are asked again like generate.py does
(SCRIPT_RETRIES), from whatever --max-calls leaves after one call per turn.
  python data/eval_saga.py run ... --rerun-failing <old_results.jsonl>     # only ids that failed there
  python data/eval_saga.py report <results.jsonl> [--revalidate]          # no API calls
"""

import argparse
import asyncio
import collections
import json
from pathlib import Path

from validate_answer import summarize, validate

DATA = Path(__file__).resolve().parent
SELF_PROFILES = ["e01_adult_f", "e02_notime_m", "e07_sydney_nb", "e09_noplace", "e10_notime_nogender",
                 "e11_sadesati", "e12_london"]


def load_profiles(path: Path) -> dict:
    return {json.loads(l)["id"]: json.loads(l) for l in path.open()}


def pick_profile(q: dict, i: int) -> str:
    return q.get("profile") or SELF_PROFILES[i % len(SELF_PROFILES)]


def ctx_of(p: dict) -> str:
    return p["context"] + "\n" + p["timing"]


def check(rec: dict, profiles: dict) -> list:
    p = profiles[rec["profile"]]
    out = []
    for i, tr in enumerate(rec["turns"]):
        v = validate(ctx_of(p), tr["user"], rec["lang"], rec["turns"][:i], tr["assistant"], today=rec["today"])
        out.append(v)
    return out


async def run(a) -> None:
    import generate as G  # needs NVIDIA_API_KEY in ml/.env (never printed)
    profiles = load_profiles(a.profiles)
    qs = json.loads((DATA / "eval_questions.json").read_text())
    skip = set(filter(None, a.skip.split(",")))
    if a.rerun_failing:
        failed = {r["id"] for r in map(json.loads, a.rerun_failing.open()) if not r["ok"]}
        qs = [q for q in qs if q["id"] in failed]
    qs = [q for q in qs if q["id"] not in skip]
    if a.only:
        only = set(a.only.split(","))
        qs = [q for q in qs if q["id"] in only or q["id"].rsplit("_", 1)[0] in only
              or "_".join(q["id"].split("_")[:2]) in only]
    calls = sum(1 + len(q.get("follow", [])) for q in qs)
    if calls > a.max_calls:
        raise SystemExit(f"{calls} calls planned > --max-calls {a.max_calls}")
    print(f"{len(qs)} questions, {calls} teacher calls + up to {a.max_calls - calls} script retries")
    t = G.Teacher(a.model, a.concurrency, a.rpm, max_calls=a.max_calls)
    base_left = calls  # first-try calls not yet made; retries may only use what's beyond them
    retries = collections.Counter()

    def can_retry() -> bool:
        return a.script_retry and t.calls_left() - base_left > 0
    order = {q["id"]: i for i, q in enumerate(json.loads((DATA / "eval_questions.json").read_text()))}

    async def one(q: dict) -> dict:
        pid = pick_profile(q, order[q["id"]])
        p = profiles[pid]
        nonlocal base_left
        msgs = [{"role": "system", "content": G.saga_system(p, q["lang"], [q["q"]] + q.get("follow", []))}]
        turns = []
        said = p["name"]
        for user in [q["q"]] + q.get("follow", []):
            msgs.append({"role": "user", "content": user})
            said += " " + user
            before = t.started
            base_left -= 1
            temp = G.LANG_TEMPERATURE.get(q["lang"], 0.8) if a.lang_temp else 0.8
            if a.bulk_validate:
                turn = await bulk_turn(t, msgs, q["lang"], p, turns, temp, retries, can_retry)
                ans = turn["assistant"]
                turn["calls"] = t.started - before
                turns.append(turn)
            else:
                ans, script_ok = await G.chat_script_checked(
                    t, msgs, q["lang"], said, temp, stats=retries, can_retry=can_retry)
                turns.append({"user": user, "assistant": ans, "calls": t.started - before, "script_ok": script_ok})
            msgs.append({"role": "assistant", "content": ans})
        rec = {"id": q["id"], "lang": q["lang"], "cat": q["cat"], "profile": pid, "today": G.profile_today(p),
               "turns": turns}
        vs = check(rec, profiles)
        rec["ok"] = all(v.ok for v in vs)
        rec["verdicts"] = [{"ok": v.ok, "fails": v.fails, "warns": v.warns, "meta": v.meta} for v in vs]
        return rec

    recs = await asyncio.gather(*(one(q) for q in qs), return_exceptions=True)
    with a.out.open("w") as f:
        for r in recs:
            if isinstance(r, Exception):
                print("error:", type(r).__name__)
                continue
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"calls={t.calls} errors={t.errors} {dict(t.err_kinds)} retries: {dict(retries)}")
    if a.bulk_validate:
        for lang in ("en", "hi", "bn"):
            n = retries[f"{lang}:turns"]
            if n:
                print(f"[{lang}] bulk validator, per turn: first try {retries[f'{lang}:first_pass']}/{n} = "
                      f"{retries[f'{lang}:first_pass'] / n:.0%}, after retries {retries[f'{lang}:final_pass']}/{n} = "
                      f"{retries[f'{lang}:final_pass'] / n:.0%}")
    report(a.out, a.profiles, revalidate=False)


async def bulk_turn(t, msgs: list, lang: str, p: dict, prev: list, temp: float, stats, can_retry) -> dict:
    """generate.ask_validated (repair + validate + up to VAL_RETRIES re-asks with a fix
    note, exactly as `generate.py bulk` does), except that retries stop when the eval's
    call budget says so. Unlike bulk, a failing turn doesn't end the conversation."""
    import generate as G
    chart = G.VA.parse_context(ctx_of(p), G.profile_today(p))
    question = msgs[-1]["content"]
    best = None
    for attempt in range(G.VAL_RETRIES + 1):
        m = msgs
        if best is not None:
            if not can_retry():
                break
            m = [{"role": "system", "content": msgs[0]["content"] + G.fix_note(best[1].fails)}] + msgs[1:]
            stats[f"{lang}:val_retry"] += 1
        ans = await t.chat(m, temp, 400)
        fixed, v = G.turn_verdict(chart, question, lang, prev, ans, G.profile_today(p), None)
        if attempt == 0:
            stats[f"{lang}:turns"] += 1
            stats[f"{lang}:first_pass"] += v.ok
            first = fixed
        if best is None or len(v.fails) < len(best[1].fails):
            best = (fixed, v)
        if v.ok:
            break
    fixed, v = best
    stats[f"{lang}:final_pass"] += v.ok
    return {"user": question, "assistant": fixed, "first_draft": first, "attempts": attempt + 1, "val_ok": v.ok}


def report(path: Path, profiles_path: Path, revalidate: bool = True) -> dict:
    profiles = load_profiles(profiles_path)
    rows = []
    recs = [json.loads(l) for l in path.open()]
    for r in recs:
        vs = check(r, profiles) if revalidate else None
        for i, tr in enumerate(r["turns"]):
            if vs:
                v = vs[i]
            else:
                d = r["verdicts"][i]
                from validate_answer import Verdict
                v = Verdict(d["ok"], [tuple(x) for x in d["fails"]], [tuple(x) for x in d["warns"]], d["meta"])
            rows.append({"lang": r["lang"], "verdict": v, "id": r["id"], "turn": i})
        if vs:
            r["ok"] = all(v.ok for v in vs)
            r["verdicts"] = [{"ok": v.ok, "fails": v.fails, "warns": v.warns, "meta": v.meta} for v in vs]
    if revalidate:
        with path.open("w") as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    s = summarize(rows)
    print(json.dumps(s, indent=1, ensure_ascii=False))
    toks = collections.defaultdict(list)
    for row in rows:
        if row["verdict"].meta.get("tokens"):
            toks[row["lang"]].append(row["verdict"].meta["tokens"])
    for lang, ts in toks.items():
        ts.sort()
        print(f"{lang} tokens: median {ts[len(ts) // 2]}, p90 {ts[int(len(ts) * .9)]}, max {ts[-1]}, "
              f">260: {sum(t > 260 for t in ts)}/{len(ts)}")
    return s


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run", "report"])
    ap.add_argument("results", nargs="?", type=Path)
    ap.add_argument("--profiles", type=Path, required=True)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--skip", default="")
    ap.add_argument("--only", default="", help="comma-separated question ids (or their 'en_27' prefixes) to run")
    ap.add_argument("--rerun-failing", type=Path)
    ap.add_argument("--max-calls", type=int, default=170)
    ap.add_argument("--no-script-retry", dest="script_retry", action="store_false",
                    help="one call per turn, no regeneration on a script failure")
    ap.add_argument("--model", default="nvidia/nemotron-3-ultra-550b-a55b")
    ap.add_argument("--concurrency", type=int, default=6)
    ap.add_argument("--rpm", type=float, default=35)
    ap.add_argument("--revalidate", action="store_true")
    ap.add_argument("--bulk-validate", action="store_true",
                    help="per turn: repair + validate + up to 2 re-asks with a fix note, like generate.py bulk")
    ap.add_argument("--lang-temp", action="store_true", help="use generate.LANG_TEMPERATURE (bn 0.6) instead of 0.8")
    a = ap.parse_args()
    if a.cmd == "run":
        asyncio.run(run(a))
    else:
        report(a.results, a.profiles, a.revalidate)


if __name__ == "__main__":
    main()
