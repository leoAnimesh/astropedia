"""Filter raw teacher answers and write the student's training set.

The student sees a short task tag plus facts instead of the app's long system
prompts; the rules those prompts describe are learned from the examples. The
same formats must be used by the app at runtime (see student_* below).

v3 (multilingual, Gemma 3 270M student)
  python data/build_sft.py                 # en + hi + bn -> data/sft_gemma/{train,val}.jsonl
  python data/build_sft.py --legacy        # v2 behaviour: English ChatML set -> data/sft/{train,val}.jsonl
                                           # (byte-identical to v2 for the same input)

Languages: English v2 records (raw/answers.jsonl, no `lang` -> "en") and v3
records with lang "hi" (Devanagari) / "bn" (Bengali script) from
raw/answers_ml*.jsonl and raw/pilot_ml*.jsonl. Any other lang (the pilots'
"hinglish") is excluded.

Student prompt (what the app must send)
  The system text is exactly the v2 one for English. For hi/bn a single line
  "Lang: hi" / "Lang: bn" is inserted right after the task tag:
      [saga]\nLang: hi\nToday: 2026-10-03\n<context>...
      [krishna]\nLang: bn\nName: Asha\nVerse: ...
      [reading]\nLang: hi\nName: ...
      [title]\nLang: bn
  English has no Lang line. Facts, the verse, "Read my chart." and the title's
  "User: ...\nAssistant: ..." wrapper stay in English for every language.

Gemma chat format (no system role; the template merges it into the 1st user turn)
  <bos><start_of_turn>user\n{system}\n\n{user1}<end_of_turn>\n
  <start_of_turn>model\n{assistant1}<end_of_turn>\n
  <start_of_turn>user\n{user2}<end_of_turn>\n
  <start_of_turn>model\n            <- generation starts here; stop at <end_of_turn>
  user/assistant contents are .strip()ped (the template's `| trim`), the system
  text is not. See gemma_prompt() and ml/train/train_gemma.py, which asserts
  this equals tokenizer.apply_chat_template.
"""

import collections
import json
import random
import re
import unicodedata
from pathlib import Path

DATA = Path(__file__).resolve().parent
ROOT = DATA.parents[1]
OUT = DATA / "sft"
OUT_GEMMA = DATA / "sft_gemma"

GITA = {e["id"]: e["text"].split("\nKey terms:")[0].strip()
        for e in json.loads((ROOT / "assets/gita-corpus/verses.json").read_text())}
PROFILES = {json.loads(l)["id"]: json.loads(l) for l in (DATA / "profiles.jsonl").open()}

LANGS = ("en", "hi", "bn")

# ─── student prompt formats (mirror these in utils/ai.ts) ────────────────────


def lang_line(lang: str) -> str:
    """'' for English (identical to v2), '\\nLang: hi' / '\\nLang: bn' otherwise."""
    return "" if lang == "en" else f"\nLang: {lang}"


def student_saga_system(p: dict, today: str, lang: str = "en") -> str:
    note = "\nBirth time unknown." if not p["birthTime"] else ""
    timing = f"\n{p['timing']}" if p.get("timing") else ""
    return f"[saga]{lang_line(lang)}\nToday: {today}\n{p['context']}{note}{timing}"


def student_krishna_system(name: str | None, verse_id: str, lang: str = "en") -> str:
    who = f"\nName: {name}" if name else ""
    return f"[krishna]{lang_line(lang)}{who}\nVerse: {GITA[verse_id]}"


def student_reading_system(p: dict, lang: str = "en") -> str:
    r = p["reading"]
    lines = [f"Name: {r['firstName']}", f"Sun: {r['sun']}", f"Moon: {r['moon']}"]
    if r["rising"]:
        lines.append(f"Rising: {r['rising']}")
    lines += [f"Nakshatra: {r['nakshatra']} (lord {r['nakshatraLord']})",
              f"Phase: {r['dashaLord']} until {r['dashaEnd']}"]
    return f"[reading]{lang_line(lang)}\n" + "\n".join(lines)


def student_title_system(lang: str = "en") -> str:
    return f"[title]{lang_line(lang)}"


def gemma_prompt(messages: list[dict]) -> tuple[str, str]:
    """(prompt, completion) strings in Gemma 3's chat format. The prompt ends
    with the generation header; the completion is the final model turn plus
    <end_of_turn> (the app stops there, so the trailing newline is not trained)."""
    msgs = list(messages)
    prefix = ""
    if msgs[0]["role"] == "system":
        prefix = msgs[0]["content"] + "\n\n"
        msgs = msgs[1:]
    assert msgs[-1]["role"] == "assistant"
    s = "<bos>"
    for i, m in enumerate(msgs[:-1]):
        role = "model" if m["role"] == "assistant" else "user"
        assert role == ("user" if i % 2 == 0 else "model"), "roles must alternate"
        s += f"<start_of_turn>{role}\n{prefix if i == 0 else ''}{m['content'].strip()}<end_of_turn>\n"
    return s + "<start_of_turn>model\n", msgs[-1]["content"].strip() + "<end_of_turn>"


# ─── filters (same rules the app's post-processing enforces) ─────────────────

NAKSHATRA_NAMES = [e["text"].split(" (")[0].split(":")[0].strip() for e in json.loads(
    (ROOT / "assets/astrology-corpus/nakshatras/nakshatras.json").read_text())]
SANSKRIT = re.compile(r"\b(maha\s*dasha|mahadasha|antardasha|dasha|nakshatra|rashi|lagna|kundli|bhava|graha|"
                      r"drishti|yoga|janma|" + "|".join(re.escape(n) for n in NAKSHATRA_NAMES) + r")\b", re.I)
NON_LATIN = re.compile(r"[Ѐ-ӿऀ-ॿ぀-ヿ一-鿿가-힯]")
ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
NUMBER_WORDS = re.compile(r"\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|"
                          r"fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\b"
                          r"(?=\s+(to|or|-|years?|months?|weeks?|days?))", re.I)
HEDGES = re.compile(r"it depends on you|no one can say|hard to tell|if you stay open|can't predict the future|"
                    r"universe will show", re.I)
MARKDOWN_BLOCK = re.compile(r"^\s*(#{1,6}\s|[-*+]\s|\d+\.\s)|```", re.M)
ARCHAIC = re.compile(r"\b(thou|thee|thy|behold|O Partha|dear one|seeker|my child)\b", re.I)
REQ_KEYS = ["SUN", "MOON", "NAKSHATRA", "DASHA", "OVERVIEW"]


NUM = {w: str(i) for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
    "seventeen eighteen nineteen twenty".split())} | {"thirty": "30", "forty": "40", "fifty": "50", "sixty": "60"}


def digits(text: str) -> str:
    """'three to four years' -> '3 to 4 years' (the app wants digits).
    Only English number words match, so Hindi/Bengali text passes through
    unchanged; native_digits() handles their digit scripts."""
    def one(m: re.Match) -> str:
        w = m.group(0)
        d = NUM[w.lower()]
        return d
    # Only number words that are part of a range or a duration.
    pat = re.compile(r"\b(" + "|".join(NUM) + r")\b(?=(\s+(to|or)\s+(" + "|".join(NUM) +
                     r")\b)|\s*-?\s*(years?|months?|weeks?|days?)\b)", re.I)
    text = pat.sub(one, text)
    # Second number of a range: "3 to four years"
    return re.sub(r"(?<=\d (to|or) )(" + "|".join(NUM) + r")\b", lambda m: NUM[m.group(0).lower()], text, flags=re.I)


def strip_gita(text: str) -> str:
    """Drop a trailing '— From the Gita: "..."' block; the app appends the verse itself."""
    return re.split(r"\n*\s*[—–-]+\s*From the Gita\s*:?", text, maxsplit=1, flags=re.I)[0].strip()


def sentences(text: str) -> int:
    return len([s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if len(s) > 2])


META = re.compile(r"timing block|system prompt|the data (above|given|provided)|as an ai\b|astrological reference|"
                  r"reference (above|below)|chart data", re.I)


def check_common(t: str) -> str | None:
    if not t.strip():
        return "empty"
    if META.search(t):
        return "meta_talk"
    if "<think" in t or "</think" in t:
        return "think_tag"
    if NON_LATIN.search(t):
        return "non_latin"
    return None


HOUSE_NUMBERS = re.compile(r"\b\d{1,2}(st|nd|rd|th) house\b|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) house\b", re.I)


def check_saga(t: str, offtopic: bool = False) -> str | None:
    if r := check_common(t):
        return r
    if SANSKRIT.search(t):
        return "sanskrit"
    if HOUSE_NUMBERS.search(t):
        return "house_number"
    if len(t.split()) > 110:
        return "too_long"
    if ISO_DATE.search(t):
        return "iso_date"
    if NUMBER_WORDS.search(t):
        return "spelled_number"
    if HEDGES.search(t):
        return "hedge"
    if MARKDOWN_BLOCK.search(t) or t.count("**") > 2:
        return "markdown"
    if sentences(t) > (3 if offtopic else 5):
        return "too_long"
    return None


def check_krishna(t: str) -> str | None:
    if r := check_common(t):
        return r
    if "gita" in t.lower() or t.count('"') >= 2:
        return "quoted_verse"
    if ARCHAIC.search(t):
        return "archaic"
    if MARKDOWN_BLOCK.search(t) or "*" in t:
        return "markdown"
    if not 2 <= sentences(t) <= 6:
        return "length"
    return None


def check_reading(t: str, has_rising: bool) -> tuple[str | None, str]:
    if r := check_common(t):
        return r, t
    lines = {}
    for line in t.splitlines():
        m = re.match(r"^\s*\**([A-Z]+)\**\s*:\s*(.+)$", line)
        if m:
            lines[m.group(1)] = m.group(2).strip()
    keys = REQ_KEYS[:2] + (["RISING"] if has_rising else []) + REQ_KEYS[2:]
    if any(k not in lines for k in keys):
        return "missing_keys", t
    body = " ".join(lines[k] for k in keys)
    if SANSKRIT.search(body) or ISO_DATE.search(body):
        return "jargon", t
    return None, "\n".join(f"{k}: {lines[k]}" for k in keys)  # normalized, in app order


def clean_title(t: str) -> tuple[str | None, str]:
    t = re.sub(r"^(title\s*:\s*)", "", t.strip(), flags=re.I).strip().strip("\"'*`").rstrip(".!")
    if (r := check_common(t)) or "\n" in t:
        return r or "multiline", t
    if SANSKRIT.search(t):
        return "sanskrit", t
    return (None if 2 <= len(t.split()) <= 5 else "length"), t


# ─── Hindi / Bengali filters (v3) ────────────────────────────────────────────
# English answers never reach these; the English path above is unchanged.

# Saga length cap in Gemma tokens: English's 110-word cap is ~150 Gemma tokens
# (1.37 tokens/word on the v2 teacher set). Words don't transfer: Bengali is
# agglutinative (fewer, longer words) and both scripts tokenize less densely.
MAX_SAGA_TOKENS = 150
GEMMA_TOKENIZER = ROOT / "ml/models/gemma-3-270m-it/tokenizer.json"
_tok = None


def gemma_len(text: str) -> int:
    global _tok
    if _tok is None:
        from tokenizers import Tokenizer
        _tok = Tokenizer.from_file(str(GEMMA_TOKENIZER))
    return len(_tok.encode(text, add_special_tokens=False).ids)


# A "word" for Indic text: split on whitespace and punctuation only (Python's
# \w stops at vowel signs, so \b and \w are useless for Devanagari/Bengali).
INDIC_WORD = re.compile(r"[^\s.,!?;:।॥\"'“”‘’()\[\]{}<>—–\-/*_|…]+")
NUKTA = dict.fromkeys(map(ord, "़়"))


def words_indic(text: str) -> list[str]:
    return INDIC_WORD.findall(unicodedata.normalize("NFD", text).translate(NUKTA))


def _n(s: str) -> str:
    return unicodedata.normalize("NFD", s).translate(NUKTA)


ASTRO = json.loads((ROOT / "locales/hi/astro.json").read_text()), json.loads((ROOT / "locales/bn/astro.json").read_text())
# Nakshatra names that are also everyday words or common first names are left
# to the नक्षत्र/নক্ষত্র check (hand, root, hearing, Chitra, Rohini, Swati...).
AMBIGUOUS_NAK = {"Hasta", "Mula", "Shravana", "Chitra", "Rohini", "Swati", "Pushya", "Magha"}


def nak_stems(table: dict) -> list[str]:
    out = []
    for en, native in table["nakshatra"].items():
        if en in AMBIGUOUS_NAK:
            continue
        # "पूर्वा फाल्गुनी" -> match "फाल्गुनी"; names split/joined differently by the teacher.
        out.append(_n(native.split()[-1]))
    return out


JARGON = {
    "hi": {
        "exact": {_n(w) for w in "अंतर अन्तर अंतरा प्रत्यंतर भाव भावों भावेश गण".split()},
        "prefix": [_n(w) for w in "दशा महादशा अंतर्दशा अन्तर्दशा अंतरदशा नक्षत्र लग्न".split()],
        "substr": [_n(w) for w in "महादशा र्दशा अंतरदशा नक्षत्र".split()] + nak_stems(ASTRO[0]),
        # house numbers ("7वें भाव", "सातवें भाव", "सप्तम घर")
        "regex": re.compile(
            r"[0-9०-९]+\s*(?:वें|वाँ|वां|वीं|वी|वे|th|st|nd|rd)?\s*(?:भाव|घर|स्थान)|"
            r"(?:प्रथम|द्वितीय|तृतीय|चतुर्थ|पंचम|षष्ठ|सप्तम|अष्टम|नवम|दशम|एकादश|द्वादश)\s+(?:भाव|घर|स्थान)|"
            r"(?:पहले|दूसरे|तीसरे|चौथे|पांचवें|पाँचवें|छठे|सातवें|आठवें|नौवें|नवें|दसवें|ग्यारहवें|बारहवें)\s+भाव"),
    },
    "bn": {
        "exact": {_n(w) for w in "অন্তর গণ".split()},  # not ভাব: "মনের ভাব" is everyday; houses via regex
        "prefix": [_n(w) for w in "দশা মহাদশা অন্তর্দশা অন্তরদশা নক্ষত্র লগ্ন".split()],
        "substr": [_n(w) for w in "মহাদশা র্দশা অন্তরদশা নক্ষত্র".split()] + nak_stems(ASTRO[1]),
        "regex": re.compile(
            r"(?:সূর্য|চন্দ্র|মঙ্গল|বুধ|বৃহস্পতি|গুরু|শুক্র|শনি|রাহু|কেতু)(?:ের|এর|র|য়ের)?\s+অন্তর|"
            r"[0-9০-৯]+\s*-?\s*(?:তম|ম|য়|র্থ|ষ্ঠ|ই)?\s*(?:ভাব|ঘর|স্থান)|"
            r"(?:প্রথম|দ্বিতীয়|তৃতীয়|চতুর্থ|পঞ্চম|ষষ্ঠ|সপ্তম|অষ্টম|নবম|দশম|একাদশ|দ্বাদশ)\s+(?:ভাব|ঘর|স্থান)"),
    },
}


def indic_jargon(t: str, lang: str) -> bool:
    j = JARGON[lang]
    if j["regex"].search(_n(t)) or j["regex"].search(t):
        return True
    for w in words_indic(t):
        if w in j["exact"] or any(w.startswith(p) for p in j["prefix"]) or any(s in w for s in j["substr"]):
            return True
    return False


# Hindi "बुध का अंतर" (Mercury's sub-period) is the teacher's most common leak.
# Rewritten to "बुध का छोटा दौर" (oblique "के छोटे दौर"): the prompt's own
# wording for periods, and अंतर/दौर are both masculine so verbs still agree.
# "छोटा" keeps the sub-period distinct from the main period and avoids adding
# to the already dominant "का दौर चल रहा है". Bengali (no gender): ছোট পর্ব.
HI_PLANETS = "सूर्य|सूरज|चंद्रमा|चंद्र|चन्द्रमा|मंगल|बुध|गुरु|बृहस्पति|शुक्र|शनि|राहु|केतु"
BN_PLANETS = "সূর্য|চন্দ্র|চাঁদ|মঙ্গল|বুধ|বৃহস্পতি|গুরু|শুক্র|শনি|রাহু|কেতু"
REPAIRS = {
    "hi": [(re.compile(rf"(?<!\S)((?:\*\*)?(?:{HI_PLANETS})(?:\*\*)?\s+(का|के)(?:\s+ही)?\s+)अंतर(?=[\s,।.)!?—]|$)"),
            lambda m: m.group(1) + ("छोटा" if m.group(2) == "का" else "छोटे") + " दौर")],
    "bn": [(re.compile(rf"((?:{BN_PLANETS})(?:ের|এর|র|য়ের)\s+)অন্তর(ে|ের|টা|টি)?(?=[\s,।.)!?—]|$)"),
            lambda m: m.group(1) + "ছোট পর্ব" + (m.group(2) or ""))],
}


def repair(t: str, lang: str) -> tuple[str, int]:
    n = 0
    for pat, rep in REPAIRS.get(lang, []):
        t, k = pat.subn(rep, t)
        n += k
    return t, n


BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
DEVA_TO_ASCII = str.maketrans("०१२३४५६७८९", "0123456789")


def native_digits(t: str, lang: str) -> str:
    """Bengali prose uses Bengali digits; Hindi uses Western digits (as the
    teacher was told). Reading keys and dates are converted the same way."""
    if lang == "bn":
        return t.translate(BN_DIGITS)
    if lang == "hi":
        return t.translate(DEVA_TO_ASCII)
    return t


# Letters (Unicode L*/M*) allowed per language; anything else is a stray-script
# fragment. Danda/double danda (U+0964/5) are punctuation (Po), so Bengali keeps them.
SCRIPT = {"hi": ("DEVANAGARI",), "bn": ("BENGALI",)}


def foreign_script(t: str, lang: str) -> str | None:
    for ch in t:
        if unicodedata.category(ch)[0] in "LM":
            name = unicodedata.name(ch, "")
            if name.startswith("LATIN") or name.startswith(SCRIPT[lang]):
                continue
            if lang == "bn" and ch in "।॥":
                continue
            return name.split(" ")[0].lower() or "unknown"
    return None


ACRONYM = re.compile(r"^[A-Z0-9]{2,6}s?$")


def latin_ok(t: str, allowed: set[str]) -> bool:
    """Latin is allowed for names given in the facts/question and short
    acronyms (EMI, IELTS, MBA); any other English word means code-mixing."""
    for w in re.findall(r"[A-Za-z][A-Za-z']*", t):
        if ACRONYM.match(w) or w.lower() in allowed:
            continue
        return False
    return True


def sentences_indic(text: str) -> int:
    return len([s for s in re.split(r"(?<=[.!?।॥])\s+", text.strip()) if len(s) > 2])


META_INDIC = re.compile(r"टाइमिंग ब्लॉक|सिस्टम प्रॉम्प्ट|चार्ट डेटा|টাইমিং ব্লক|সিস্টেম প্রম্পট|চার্ট ডেটা|"
                        r"timing block|system prompt|chart data", re.I)
QUOTES = re.compile(r"[\"“”«»]")
GITA_WORD = re.compile(r"gita|गीता|গীতা", re.I)
ARCHAIC_INDIC = {_n(w) for w in "पार्थ वत्स साधक बालक पुत्र বৎস পার্থ সাধক".split()}


def check_common_indic(t: str, lang: str, allowed: set[str]) -> str | None:
    if not t.strip():
        return "empty"
    if META_INDIC.search(t):
        return "meta_talk"
    if "<think" in t or "</think" in t:
        return "think_tag"
    if s := foreign_script(t, lang):
        return f"script_{s}"
    if not latin_ok(t, allowed):
        return "latin_word"
    return None


def check_saga_indic(t: str, lang: str, allowed: set[str], offtopic: bool = False) -> str | None:
    if r := check_common_indic(t, lang, allowed):
        return r
    if SANSKRIT.search(t) or indic_jargon(t, lang):
        return "jargon"
    if HOUSE_NUMBERS.search(t):
        return "house_number"
    if gemma_len(t) > MAX_SAGA_TOKENS:
        return "too_long"
    if ISO_DATE.search(t):
        return "iso_date"
    if MARKDOWN_BLOCK.search(t) or t.count("**") > 2:
        return "markdown"
    if sentences_indic(t) > (3 if offtopic else 5):
        return "too_long"
    return None


def check_krishna_indic(t: str, lang: str, allowed: set[str]) -> str | None:
    if r := check_common_indic(t, lang, allowed):
        return r
    if GITA_WORD.search(t) or len(QUOTES.findall(t)) >= 2:
        return "quoted_verse"
    if ARCHAIC.search(t) or any(w in ARCHAIC_INDIC for w in words_indic(t)):
        return "archaic"
    if MARKDOWN_BLOCK.search(t) or "*" in t:
        return "markdown"
    if SANSKRIT.search(t) or indic_jargon(t, lang):
        return "jargon"
    if not 2 <= sentences_indic(t) <= 6:
        return "length"
    return None


def check_reading_indic(t: str, has_rising: bool, lang: str, allowed: set[str]) -> tuple[str | None, str]:
    lines = {}
    for line in t.splitlines():
        m = re.match(r"^\s*\**([A-Z]+)\**\s*:\s*(.+)$", line)
        if m:
            lines[m.group(1)] = m.group(2).strip()
    keys = REQ_KEYS[:2] + (["RISING"] if has_rising else []) + REQ_KEYS[2:]
    if any(k not in lines for k in keys):
        return "missing_keys", t
    body = " ".join(lines[k] for k in keys)
    if r := check_common_indic(body, lang, allowed):
        return r, t
    if SANSKRIT.search(body) or ISO_DATE.search(body) or indic_jargon(body, lang):
        return "jargon", t
    return None, "\n".join(f"{k}: {lines[k]}" for k in keys)


def clean_title_indic(t: str, lang: str, allowed: set[str]) -> tuple[str | None, str]:
    t = re.sub(r"^((title|शीर्षक|শিরোনাম)\s*:\s*)", "", t.strip(), flags=re.I).strip().strip("\"'*`“”").rstrip(".!।")
    if (r := check_common_indic(t, lang, allowed)) or "\n" in t:
        return r or "multiline", t
    if SANSKRIT.search(t) or indic_jargon(t, lang):
        return "jargon", t
    return (None if 1 <= len(t.split()) <= 5 and gemma_len(t) <= 16 else "length"), t


# ─── build ───────────────────────────────────────────────────────────────────


def build(rec: dict) -> tuple[str | None, dict | None]:
    task, p = rec["task"], PROFILES[rec["profile"]]
    # v1 Saga answers were written without the Timing block and leaned on stock
    # timing phrases; v2 keeps only Saga answers from the rewritten teacher prompt.
    if task in ("saga", "saga_multi", "title", "offtopic") and rec.get("prompt_version", 1) < 2:
        return "v1_saga_prompt", None
    turns = rec["turns"]
    for tr in turns:
        tr["assistant"] = digits(strip_gita(tr["assistant"]) if task == "krishna" else tr["assistant"])
    if task in ("saga", "saga_multi", "offtopic"):
        for tr in turns:
            if r := check_saga(tr["assistant"], offtopic=task == "offtopic"):
                return r, None
        msgs = [{"role": "system", "content": student_saga_system(p, rec["today"])}]
        for tr in turns:
            msgs += [{"role": "user", "content": tr["user"]}, {"role": "assistant", "content": tr["assistant"]}]
        return None, {"task": task, "messages": msgs}
    if task == "title":
        if r := check_saga(turns[0]["assistant"]):
            return r, None
        r, title = clean_title(rec.get("title", ""))
        if r:
            return f"title_{r}", None
        convo = f"User: {turns[0]['user']}\nAssistant: {turns[0]['assistant']}"
        return None, {"task": task, "messages": [{"role": "system", "content": "[title]"},
                                                 {"role": "user", "content": convo},
                                                 {"role": "assistant", "content": title}]}
    if task == "krishna":
        a = turns[0]["assistant"]
        if r := check_krishna(a):
            return r, None
        return None, {"task": task, "messages": [
            {"role": "system", "content": student_krishna_system(rec.get("name"), rec["verse"])},
            {"role": "user", "content": turns[0]["user"]}, {"role": "assistant", "content": a}]}
    if task == "reading":
        r, text = check_reading(turns[0]["assistant"], bool(p["reading"]["rising"]))
        if r:
            return f"reading_{r}", None
        return None, {"task": task, "messages": [{"role": "system", "content": student_reading_system(p)},
                                                 {"role": "user", "content": "Read my chart."},
                                                 {"role": "assistant", "content": text}]}
    return "unknown_task", None


def strip_gita_indic(t: str) -> str:
    t = strip_gita(t)
    return re.split(r"\n*\s*[—–-]+\s*(गीता|গীতা)\s*(से|থেকে)?\s*:", t, maxsplit=1)[0].strip()


def build_indic(rec: dict, lang: str, stats: collections.Counter) -> tuple[str | None, dict | None]:
    """hi/bn counterpart of build(): same tasks and message layout, Lang line in
    the system text, per-language script/jargon/length rules."""
    task, p = rec["task"], PROFILES[rec["profile"]]
    turns = rec["turns"]
    # Latin words that may legitimately appear: names from the facts and anything the user typed.
    allowed = {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z']*", " ".join(
        [p["name"], rec.get("name") or "", p["reading"]["firstName"]] + [tr["user"] for tr in turns]))}
    for tr in turns:
        a = strip_gita_indic(tr["assistant"]) if task == "krishna" else tr["assistant"]
        a, n = repair(native_digits(a, lang), lang)
        stats[f"{lang}:repaired_antar"] += n
        tr["assistant"] = a
    if task in ("saga", "saga_multi", "offtopic"):
        for tr in turns:
            if r := check_saga_indic(tr["assistant"], lang, allowed, offtopic=task == "offtopic"):
                return r, None
        msgs = [{"role": "system", "content": student_saga_system(p, rec["today"], lang)}]
        for tr in turns:
            msgs += [{"role": "user", "content": tr["user"]}, {"role": "assistant", "content": tr["assistant"]}]
        return None, {"task": task, "messages": msgs}
    if task == "title":
        if r := check_saga_indic(turns[0]["assistant"], lang, allowed):
            return r, None
        r, title = clean_title_indic(native_digits(rec.get("title", ""), lang), lang, allowed)
        if r:
            return f"title_{r}", None
        convo = f"User: {turns[0]['user']}\nAssistant: {turns[0]['assistant']}"
        return None, {"task": task, "messages": [{"role": "system", "content": student_title_system(lang)},
                                                 {"role": "user", "content": convo},
                                                 {"role": "assistant", "content": title}]}
    if task == "krishna":
        a = turns[0]["assistant"]
        if r := check_krishna_indic(a, lang, allowed):
            return r, None
        return None, {"task": task, "messages": [
            {"role": "system", "content": student_krishna_system(rec.get("name"), rec["verse"], lang)},
            {"role": "user", "content": turns[0]["user"]}, {"role": "assistant", "content": a}]}
    if task == "reading":
        r, text = check_reading_indic(turns[0]["assistant"], bool(p["reading"]["rising"]), lang, allowed)
        if r:
            return f"reading_{r}", None
        return None, {"task": task, "messages": [{"role": "system", "content": student_reading_system(p, lang)},
                                                 {"role": "user", "content": "Read my chart."},
                                                 {"role": "assistant", "content": text}]}
    return "unknown_task", None


def ngrams(text: str, n: int = 4) -> set[str]:
    w = re.findall(r"[a-z']+|\d+", text.lower())
    return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}


# Hindi/Bengali verb phrases are analytic ("चल रहा है" = "is running"), so a
# 4-gram there carries less than an English one; 5-grams at the same 2.5% share
# drop about as much as English's cap does (~18% vs ~20%), 4-grams ~31%.
INDIC_NGRAM = 5


def ngrams_indic(text: str, n: int = INDIC_NGRAM) -> set[str]:
    w = [x.lower() for x in words_indic(text)]
    return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}


def cap_repetition(examples: list[dict], rejected: collections.Counter, max_share: float = 0.025,
                   lang: str = "en") -> list[dict]:
    """Drop examples whose final answer reuses a 4-word phrase that is already
    in max_share of kept answers for the same task, so no stock phrase
    dominates the model's style (v1 had "12 to 18 months" in 14% of answers).
    Phrases made of digits only, or present in the user's question, are exempt.
    Run once per language (shares are per language x task); English uses the
    exact v2 tokenisation, hi/bn split on whitespace/punctuation."""
    grams_of = ngrams if lang == "en" else ngrams_indic
    prefix = "" if lang == "en" else f"{lang}:"
    rng = random.Random(1)
    order = examples[:]
    rng.shuffle(order)
    totals = collections.Counter(ex["task"] for ex in order)
    counts: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    kept = []
    for ex in order:
        task = ex["task"]
        if task in ("title", "reading"):
            kept.append(ex)
            continue
        limit = max(3, int(totals[task] * max_share))
        answer = ex["messages"][-1]["content"]
        question = ex["messages"][-2]["content"]
        grams = grams_of(answer) - grams_of(question)
        if lang != "en":
            grams = {g for g in grams if not all(t.isdigit() for t in g.split())}
        if any(counts[task][g] >= limit for g in grams):
            rejected[f"{prefix}{task}:repetition_cap"] += 1
            continue
        counts[task].update(grams)
        kept.append(ex)
    return kept


# ─── IO ──────────────────────────────────────────────────────────────────────


def read_jsonl(path: Path):
    """Tolerates a partially written last line (generate.py may be appending)."""
    with path.open() as f:
        for line in f:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def split_stratified(rows: list[dict], frac: float, seed: int = 0) -> tuple[list[dict], list[dict]]:
    """Per (lang, task): frac of each group to val (at least 1 if the group has 10+)."""
    groups: dict[tuple, list[dict]] = collections.defaultdict(list)
    for ex in rows:
        groups[(ex["lang"], ex["task"])].append(ex)
    rng = random.Random(seed)
    train, val = [], []
    for key in sorted(groups):
        g = groups[key]
        rng.shuffle(g)
        n_val = max(1, round(len(g) * frac)) if len(g) >= 10 else 0
        val += g[:n_val]
        train += g[n_val:]
    rng.shuffle(train)
    rng.shuffle(val)
    return train, val


def table(counter: collections.Counter, title: str) -> None:
    tasks = ["saga", "saga_multi", "offtopic", "krishna", "reading", "title"]
    print(f"\n{title}")
    print("lang " + "".join(f"{t:>11}" for t in tasks) + f"{'total':>9}")
    for lang in LANGS:
        row = [counter.get((lang, t), 0) for t in tasks]
        print(f"{lang:<5}" + "".join(f"{n:>11}" for n in row) + f"{sum(row):>9}")


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, nargs="+", default=None,
                    help="raw teacher files (default: answers.jsonl + answers_ml*.jsonl + pilot_ml*.jsonl; "
                         "with --legacy: answers.jsonl)")
    ap.add_argument("--out", type=Path, default=None, help="default data/sft_gemma (data/sft with --legacy)")
    ap.add_argument("--legacy", action="store_true",
                    help="v2 behaviour: English only, ChatML messages, unstratified 5%% val, to data/sft")
    ap.add_argument("--langs", default="en,hi,bn")
    ap.add_argument("--val-frac", type=float, default=0.05)
    ap.add_argument("--repeat", default="", help="oversample train rows, e.g. 'bn=2,hi=1' (val untouched)")
    a = ap.parse_args()
    if a.legacy:
        return main_legacy(a.raw[0] if a.raw else DATA / "raw/answers.jsonl", a.out or OUT)

    langs = [l for l in a.langs.split(",") if l]
    raws = a.raw or ([DATA / "raw/answers.jsonl"] + sorted((DATA / "raw").glob("answers_ml*.jsonl"))
                     + sorted((DATA / "raw").glob("pilot_ml*.jsonl")))
    out = a.out or OUT_GEMMA
    out.mkdir(parents=True, exist_ok=True)
    rejected: collections.Counter = collections.Counter()
    stats: collections.Counter = collections.Counter()
    raw_c: collections.Counter = collections.Counter()
    seen: set = set()
    kept: dict[str, list[dict]] = {l: [] for l in langs}
    for path in raws:
        for rec in read_jsonl(path):
            lang = rec.get("lang", "en")
            if lang not in langs:
                rejected[f"{lang}:{rec['task']}:lang_excluded"] += 1
                continue
            key = (lang, rec.get("id"))  # same record in two raw files (English keeps v2's exact set)
            if key in seen:
                rejected[f"{lang}:{rec['task']}:duplicate"] += 1
                continue
            seen.add(key)
            raw_c[(lang, rec["task"])] += 1
            reason, ex = build(rec) if lang == "en" else build_indic(rec, lang, stats)
            if reason:
                rejected[f"{lang}:{rec['task']}:{reason}"] += 1
            else:
                ex["lang"] = lang
                kept[lang].append(ex)
    rows: list[dict] = []
    for lang in langs:
        rows += cap_repetition(kept[lang], rej := collections.Counter(), lang=lang)
        for k, v in rej.items():
            task = k.split(":")[-2]
            rejected[f"{lang}:{task}:repetition_cap"] += v
    for ex in rows:
        ex["prompt"], ex["completion"] = gemma_prompt(ex["messages"])
    train, val = split_stratified(rows, a.val_frac)
    reps = dict(kv.split("=") for kv in a.repeat.split(",") if kv)
    train += [ex for ex in train for _ in range(int(reps.get(ex["lang"], 1)) - 1)]
    random.Random(2).shuffle(train)
    for name, part in (("train", train), ("val", val)):
        with (out / f"{name}.jsonl").open("w") as f:
            for ex in part:
                f.write(json.dumps({k: ex[k] for k in ("lang", "task", "messages", "prompt", "completion")},
                                   ensure_ascii=False) + "\n")

    table(raw_c, "raw records (lang x task)")
    table(collections.Counter((ex["lang"], ex["task"]) for ex in rows), "kept (before --repeat)")
    table(collections.Counter((ex["lang"], ex["task"]) for ex in train), "train")
    table(collections.Counter((ex["lang"], ex["task"]) for ex in val), "val")
    print(f"\nwrote {out}/train.jsonl ({len(train)}) and val.jsonl ({len(val)})")
    for lang in langs:
        if n := stats.get(f"{lang}:repaired_antar"):
            print(f"{lang}: repaired 'planet + अंतर/অন্তর' -> दौर/পর্ব in {n} places")
    print("\nrejected per lang (reason: count):")
    by_lang: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for k, v in rejected.items():
        lang, task, reason = k.split(":", 2)
        by_lang[lang][f"{task}:{reason}"] += v
    for lang, c in by_lang.items():
        reasons = collections.Counter()
        for k, v in c.items():
            reasons[k.split(":", 1)[1]] += v
        print(f"  {lang} ({sum(c.values())}): by reason {dict(reasons.most_common())}")
        print(f"      by task:reason {dict(c.most_common())}")


def main_legacy(raw: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    kept: list[dict] = []
    rejected: collections.Counter = collections.Counter()
    per_task: collections.Counter = collections.Counter()
    for line in raw.open():
        rec = json.loads(line)
        reason, ex = build(rec)
        if reason:
            rejected[f"{rec['task']}:{reason}"] += 1
        else:
            kept.append(ex)
            per_task[rec["task"]] += 1
    kept = cap_repetition(kept, rejected)
    random.Random(0).shuffle(kept)
    n_val = max(1, len(kept) // 20)
    for name, rows in (("val", kept[:n_val]), ("train", kept[n_val:])):
        with (out / f"{name}.jsonl").open("w") as f:
            for ex in rows:
                f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    total = len(kept) + sum(rejected.values())
    print(f"kept {len(kept)}/{total}  train={len(kept) - n_val} val={n_val}")
    print("kept per task:", dict(per_task))
    print("rejected:", dict(rejected.most_common()))


if __name__ == "__main__":
    main()
