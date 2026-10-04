"""Original Hindi and Bengali renderings of the curated Gita verses the app
prints under Krishna's replies.

The teacher translates from the Sanskrit original (public domain) in its own
words, so the app doesn't ship anyone's published translation. Output goes
into assets/gita-corpus/curated-verses.json as `text_hi` / `text_bn` next to
the English `text` (which the model keeps seeing as its prompt).

Usage: ../.venv/bin/python translate_verses.py [--langs hi,bn] [--force]
"""
import argparse
import os
import asyncio
import json
import re
import sys
from pathlib import Path

sys.argv, _argv = sys.argv[:1], sys.argv  # generate.py parses argv on import only in main()
import generate as g  # noqa: E402
sys.argv = _argv

CURATED = g.ROOT / "assets/gita-corpus/curated-verses.json"

LANG = {
    "hi": ("Hindi", "Devanagari", r"[ऀ-ॿ]", r"[ঀ-৿؀-ۿ一-鿿가-힯]"),
    "bn": ("Bengali", "Bengali", r"[ঀ-৿]", r"[ऀ-ॣ०-ॿ؀-ۿ一-鿿가-힯]"),
}


def prompt(ref: str, english: str, lang: str) -> str:
    name, script, _, _ = LANG[lang]
    return (
        f"Translate Bhagavad Gita verse {ref} from the original Sanskrit into simple, faithful modern {name} "
        f"({script} script), the way a thoughtful person would explain it to a friend.\n"
        f"For reference, its meaning in English: \"{english}\"\n\n"
        "Rules:\n"
        "- Your own words. Do not reproduce any published translation (Gita Press, ISKCON, etc.).\n"
        "- One or two sentences, faithful to the verse, no commentary, no verse number, no quotes.\n"
        f"- Only {script} script; no English words, no Sanskrit transliteration in Latin letters.\n"
        "- Krishna is speaking; keep 'you' addressing the listener."
    )


def valid(text: str, lang: str) -> bool:
    _, _, native, foreign = LANG[lang]
    return bool(re.search(native, text)) and not re.search(foreign, text) and not re.search(r"[A-Za-z]{3,}", text)


async def main(langs: list[str], force: bool) -> None:
    data = json.loads(CURATED.read_text())
    g.load_env()
    t = g.Teacher(os.environ.get("TEACHER_MODEL", g.DEFAULT_MODEL), concurrency=2, rpm=8)

    async def one(vid: str, v: dict, lang: str) -> None:
        key = f"text_{lang}"
        if v.get(key) and not force:
            return
        for attempt in range(3):
            try:
                text = await t.chat([{"role": "user", "content": prompt(v["ref"], v["text"], lang)}],
                                    temperature=0.3, max_tokens=200)
            except Exception as e:  # overloaded/timeouts: try again, skip if it keeps failing
                print(f"{v['ref']} {lang}: error {str(e)[:60]}", flush=True)
                continue
            text = text.strip().strip('"“”').strip()
            if valid(text, lang):
                v[key] = text
                CURATED.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")  # keep progress
                print(f"{v['ref']} {lang}: {text}", flush=True)
                return
            print(f"{v['ref']} {lang}: rejected attempt {attempt + 1}: {text[:80]}", flush=True)
        print(f"{v['ref']} {lang}: FAILED", flush=True)

    await asyncio.gather(*(one(vid, v, lang) for vid, v in data["verses"].items() for lang in langs))
    CURATED.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    done = {lang: sum(1 for v in data["verses"].values() if v.get(f"text_{lang}")) for lang in langs}
    print("done:", done, "of", len(data["verses"]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default="hi,bn")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    asyncio.run(main(a.langs.split(","), a.force))
