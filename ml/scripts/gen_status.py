"""Readable status for the v3 teacher-data run.

    cd ml && .venv/bin/python scripts/gen_status.py          # once
    cd ml && while true; do clear; .venv/bin/python scripts/gen_status.py; sleep 60; done

Speed and ETA come from the change since the previous run of this script
(snapshot in out/.gen_status.json), so the first run shows no speed.
"""
import json
import re
import subprocess
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
LINE = re.compile(r"\[(\w+)\] \d+/\d+ .*?calls=(\d+) errors=(\d+).*?first-pass=(\d+)% final-pass=(\d+)%")


def count(lang: str) -> tuple[int, int]:
    done = dropped = 0
    path = RAW / f"answers_v4_{lang}.jsonl"
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


def main() -> None:
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
