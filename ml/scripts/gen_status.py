"""Readable status for the teacher-data runs.

    cd ml && .venv/bin/python scripts/gen_status.py          # v4 run (answers_v4_*), once
    cd ml && .venv/bin/python scripts/gen_status.py --v5     # v2.1 run (answers_v5_*, prompt v5)
    cd ml && while true; do clear; .venv/bin/python scripts/gen_status.py --v5; sleep 60; done

--v5 also reads each file for quality: Saga turns passing on the first try / after
validator retries, follow-up chips passing, failed and script-dropped records.

Speed and ETA come from the change since the previous run of this script
(snapshot in out/.gen_status.json), so the first run shows no speed.
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ML = Path(__file__).resolve().parent.parent
RAW = ML / "data" / "raw"
OUT = ML / "out"
SNAP = OUT / ".gen_status.json"

# language -> (target records, teacher, log)
JOBS = {
    "en": (8500, "nemotron-3-super", OUT / "gen_v3_en_super.log"),
    "hi": (3700, "nemotron-3-ultra", OUT / "gen_v3_hibn.log"),
    "bn": (3026, "nemotron-3-ultra", OUT / "gen_v3_hibn.log"),
}
NAMES = {"en": "English", "hi": "Hindi", "bn": "Bengali"}

# v2.1 (prompt v5): key -> (label, file, target records, teacher, log, language tag in the log)
JOBS_V5 = {
    "en": ("English", RAW / "answers_v5_en.jsonl", 6000, "nemotron-3-super", OUT / "gen_v5_en.log", "en"),
    "hi": ("Hindi", RAW / "answers_v5_hi.jsonl", 1200, "nemotron-3-ultra", OUT / "gen_v5_hibn.log", "hi"),
    "bn": ("Bengali", RAW / "answers_v5_bn.jsonl", 1200, "nemotron-3-ultra", OUT / "gen_v5_hibn.log", "bn"),
    "bn_read": ("bn read", RAW / "answers_v5_bn_readings.jsonl", 700, "nemotron-3-ultra",
                OUT / "gen_v5_bn_readings.log", "bn"),
}
SNAP_V5 = OUT / ".gen_status_v5.json"
LINE = re.compile(r"\[(\w+)\] \d+/\d+ .*?calls=(\d+) errors=(\d+).*?first-pass=(\d+)% final-pass=(\d+)%")


def count(lang: str, path: Path | None = None) -> tuple[int, int]:
    done = dropped = 0
    path = path or RAW / f"answers_v4_{lang}.jsonl"
    if path.exists():
        for line in path.open():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            done += 1
            dropped += bool(rec.get("dropped"))
    return done, dropped


def last_stats(log: Path, lang: str) -> dict | None:
    """Latest progress line for this language that has real calls in it."""
    if not log.exists():
        return None
    best = None
    for line in log.open(errors="replace"):
        m = LINE.search(line)
        if m and m.group(1) == lang and int(m.group(2)) > 0:
            best = m
    if not best:
        return None
    calls, errors = int(best.group(2)), int(best.group(3))
    return {"calls": calls, "errors": errors, "first": int(best.group(4)), "final": int(best.group(5))}


def bar(frac: float, width: int = 28) -> str:
    full = int(frac * width)
    return "█" * full + "░" * (width - full)


def fmt_eta(minutes: float) -> str:
    if minutes <= 0:
        return "done"
    h, m = divmod(int(minutes), 60)
    finish = time.strftime("%H:%M", time.localtime(time.time() + minutes * 60))
    return f"{h}h {m:02d}m (≈{finish})" if h else f"{m}m (≈{finish})"


def quality_v5(path: Path) -> dict:
    """Per-file quality from the records themselves (prompt v5 marks)."""
    q = dict(recs=0, dropped=0, failed=0, truncated=0, turns=0, first=0, final=0, fu=0, fu_first=0, fu_final=0,
             tasks={}, latin=0, greet=0)
    if not path.exists():
        return q
    for line in path.open():
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        q["recs"] += 1
        if r.get("dropped"):
            q["dropped"] += 1
            continue
        q["tasks"][r.get("task")] = q["tasks"].get(r.get("task"), 0) + 1
        q["failed"] += bool(r.get("val_failed"))
        q["truncated"] += bool(r.get("truncated"))
        q["latin"] += str(r.get("category", "")).endswith("_latin")
        q["greet"] += str(r.get("category", "")).startswith("greeting")
        for t in (r.get("turns") or []) + (r.get("dropped_turns") or []):
            if "val_ok" not in t:
                continue
            q["turns"] += 1
            q["first"] += t["val_ok"] and t.get("attempts", 1) == 1
            q["final"] += bool(t["val_ok"])
        fu = r.get("followups")
        if fu:
            q["fu"] += 1
            q["fu_first"] += fu["val_ok"] and fu.get("attempts", 1) == 1
            q["fu_final"] += bool(fu["val_ok"])
    return q


def api_errors(log: Path, lang: str) -> str:
    """Error kinds from the latest progress line for this language in the log."""
    if not log.exists():
        return ""
    last = None
    for line in log.open(errors="replace"):
        if line.startswith(f"[{lang}] ") and "calls=" in line:
            last = line
    if not last:
        return ""
    m = re.search(r"calls=(\d+) errors=(\d+) (\{[^}]*\})", last)
    if not m:
        return ""
    calls, errors = int(m.group(1)), int(m.group(2))
    rate = errors / (calls + errors) if calls + errors else 0
    return f"API calls {calls}, failed attempts {errors} ({rate:.0%}) {m.group(3)}"


def pct(a: int, b: int) -> str:
    return f"{a / b:.0%}" if b else "–"


def main_v5() -> None:
    now = time.time()
    prev = json.loads(SNAP_V5.read_text()) if SNAP_V5.exists() else {}
    snap = {"t": now}
    ps = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True).stdout.splitlines()
    procs = [l.strip() for l in ps if re.match(r"\s*\d+ \S*python\S* (-u )?data/generate.py bulk --prompt-version 5", l)]
    print(time.strftime("Teacher data run v2.1 (prompt v5) · %a %d %b %H:%M"), "·",
          f"{len(procs)} generator process(es) running" if procs else "NOT RUNNING")
    print()
    tot_done = tot_target = 0
    for key, (label, path, target, teacher, log, tag) in JOBS_V5.items():
        q = quality_v5(path)
        done = q["recs"]
        snap[key] = done
        tot_done += min(done, target)
        tot_target += target
        frac = min(done / target, 1.0)
        pid = next((l.split()[0] for l in procs if path.name in l), None)
        state = f"pid {pid}" if pid else ("finished" if done >= target else "not running")
        print(f"{label:<8} {bar(frac)} {frac:6.1%}   {done:>5}/{target}  ({teacher})  {path.name}  [{state}]")
        rate = None
        if key in prev and now - prev["t"] > 30:
            rate = (done - prev[key]) / ((now - prev["t"]) / 60)
        left = max(target - done, 0)
        speed = f"{rate:.2f} rec/min" if rate is not None else "speed: run again in a minute"
        eta = fmt_eta(left / rate) if rate and rate > 0 else ("done" if left == 0 else "–")
        print(f"{'':<8} {speed:<26} ETA {eta}   log {log.name}")
        if q["turns"]:
            print(f"{'':<8} turns {q['turns']}: {pct(q['first'], q['turns'])} first try → "
                  f"{pct(q['final'], q['turns'])} after retries   records failed {q['failed']}, "
                  f"truncated {q['truncated']}, dropped (script) {q['dropped']}")
        elif q["tasks"]:
            print(f"{'':<8} dropped (script) {q['dropped']}")
        if q["fu"]:
            print(f"{'':<8} chips {q['fu']}: {pct(q['fu_first'], q['fu'])} first try → "
                  f"{pct(q['fu_final'], q['fu'])} after retries")
        if q["tasks"]:
            extra = f"   latin-input {q['latin']}  greetings {q['greet']}" if key != "bn_read" else ""
            print(f"{'':<8} tasks {q['tasks']}{extra}")
        err = api_errors(log, tag)
        if err:
            print(f"{'':<8} {err}")
        print()
    print(f"Overall  {bar(tot_done / tot_target)} {tot_done / tot_target:6.1%}   {tot_done}/{tot_target}")
    SNAP_V5.write_text(json.dumps(snap))


def main() -> None:
    if "--v5" in sys.argv[1:]:
        return main_v5()
    now = time.time()
    prev = json.loads(SNAP.read_text()) if SNAP.exists() else {}
    snap = {"t": now}
    running = subprocess.run(["pgrep", "-f", "generate.py bulk"], capture_output=True).stdout.split()

    print(time.strftime("Teacher data run · %a %d %b %H:%M"), "·",
          f"{len(running)} generator process(es) running" if running else "NOT RUNNING")
    print()
    tot_done = tot_target = 0
    for lang, (target, teacher, log) in JOBS.items():
        done, dropped = count(lang)
        snap[lang] = done
        tot_done += min(done, target)
        tot_target += target
        frac = min(done / target, 1.0)
        print(f"{NAMES[lang]:<8} {bar(frac)} {frac:6.1%}   {done:>5}/{target}  ({teacher})")

        rate = None
        if lang in prev and now - prev["t"] > 30:
            rate = (done - prev[lang]) / ((now - prev["t"]) / 60)
        left = max(target - done, 0)
        speed = f"{rate:.1f} rec/min" if rate is not None else "speed: run again in a minute"
        eta = fmt_eta(left / rate) if rate and rate > 0 else ("done" if left == 0 else "–")
        print(f"{'':<8} {speed:<26} ETA {eta}")

        st = last_stats(log, lang)
        if st:
            attempts = st["calls"] + st["errors"]
            err = st["errors"] / attempts if attempts else 0
            print(f"{'':<8} quality: {st['first']}% first try → {st['final']}% after retries   "
                  f"API errors {err:.0%}   dropped (script) {dropped}")
        print()

    print(f"Overall  {bar(tot_done / tot_target)} {tot_done / tot_target:6.1%}   {tot_done}/{tot_target}")
    SNAP.write_text(json.dumps(snap))


if __name__ == "__main__":
    main()
