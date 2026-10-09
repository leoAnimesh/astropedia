"""Score the GURU_CONTEXT_FOCUS eval (focus_gen.ts): python focus_score.py prompts.jsonl answers.jsonl [--details out.jsonl]

Per set (timing / guru) and variant (full / guru / plan):
  v5 ok, v4 ok   ml/data/validate_answer.py validate() against the FULL context (claims are
                 checked against the real chart whatever the prompt left out)
  1st in top / 1st in 3w / all in 3w   timing set: the reply's first future date inside the
                 engine's best window / any of its windows (+-1 month), all future dates inside
  on-topic       the reply mentions the guru's topic (word lists below)
  share          the guru topic's share of all topic words in the reply (own / (own + other gurus'))
"""
import json, re, sys, collections
sys.path.insert(0, "/Users/animesh/Developer/projects/astropedia/ml/data")
import validate_answer as VA  # noqa: E402

TOPIC_WORDS = {
    "love": {
        "en": r"\b(love|loving|partner|relationships?|marriage|married|marry|romance|romantic|spouse|wedding|heart)\b",
        "hi": "प्रेम|प्यार|रिश्त|शादी|विवाह|साथी|जीवनसाथी|दिल",
        "bn": "প্রেম|ভালোবাস|সম্পর্ক|বিয়ে|বিবাহ|সঙ্গী|জীবনসঙ্গী",
    },
    "career": {
        "en": r"\b(work|job|career|money|business|income|office|salary|savings?|save|invest\w*|earn\w*|promotion)\b",
        "hi": "नौकरी|करियर|पैसा|पैसे|धन|व्यापार|बिज़नेस|कमाई|बचत|निवेश|काम",
        "bn": "চাকরি|কেরিয়ার|টাকা|অর্থ|ব্যবসা|আয়|সঞ্চয়|জমা|বিনিয়োগ|কাজ",
    },
    "health": {
        "en": r"\b(health|healthy|energy|rest|sleep|stress\w*|body|doctor|routine|tired|calm|exercise)\b",
        "hi": "सेहत|स्वास्थ्य|ऊर्जा|आराम|नींद|तनाव|शरीर|डॉक्टर|दिनचर्या|थकान|व्यायाम",
        "bn": "স্বাস্থ্য|শরীর|শক্তি|বিশ্রাম|ঘুম|চাপ|ডাক্তার|রুটিন|ক্লান্ত|ব্যায়াম",
    },
    "family": {
        "en": r"\b(family|home|house|parents?|mother|father|children|peace|property)\b",
        "hi": "परिवार|घर|माता|पिता|माँ|बच्चे|संतान|शांति|संपत्ति",
        "bn": "পরিবার|বাড়ি|ঘর|বাবা|মা\\b|সন্তান|শান্তি|সম্পত্তি|সংসার",
    },
    "study": {
        "en": r"\b(stud\w+|exams?|learn\w*|subjects?|course|degree|focus|education|college|school|concentrat\w+)\b",
        "hi": "पढ़ाई|पढ़|परीक्षा|विषय|सीख|कोर्स|डिग्री|ध्यान|शिक्षा|कॉलेज",
        "bn": "পড়াশোনা|পড়া|পরীক্ষা|বিষয়|শেখ|কোর্স|ডিগ্রি|মনোযোগ|শিক্ষা|কলেজ",
    },
}


def hits(text, agent, lang):
    return len(re.findall(TOPIC_WORDS[agent][lang], text, flags=re.I))


def ym(iso):
    y, m = iso[:7].split("-")
    return int(y), int(m)


def k(y, m):
    return y * 12 + m - 1


def in_win(d, w, slack=1):
    y, m = d
    a, b = k(*ym(w["start"])) - slack, k(*ym(w["end"])) + slack
    if m is None:
        return ym(w["start"])[0] <= y <= ym(w["end"])[0]
    return a <= k(y, m) <= b


def ctx_of(system):
    body = system.split("\n", 2)[2] if system.startswith("[saga]\nLang") else system.split("\n", 1)[1]
    return body.split("\n", 1)[1]  # drop Today:


P = {(r["id"], r["variant"]): r for r in map(json.loads, open(sys.argv[1]))}
A = [json.loads(l) for l in open(sys.argv[2])]
details = sys.argv[sys.argv.index("--details") + 1] if "--details" in sys.argv else None
rows = []
for a in A:
    p = P[(a["id"], a["variant"])]
    ans = a["answer"]
    lang = p["lang"]
    v5 = VA.validate(ctx_of(p["full"]), p["user"], lang, [], ans, today=p["today"], style="v5")
    v4 = VA.validate(ctx_of(p["full"]), p["user"], lang, [], ans, today=p["today"], style="v4")
    ty, tm = ym(p["today"])
    ds = []
    for lg in {lang, "en"}:
        for d in VA.find_dates(ans, lg):
            if d.get("year"):
                ds.append((d["year"], d.get("month"), d.get("pos", 0)))
    ds = sorted(set(ds), key=lambda x: x[2])
    fut = [d[:2] for d in ds if (d[1] is None and d[0] >= ty) or (d[1] is not None and k(d[0], d[1]) >= k(ty, tm))]
    W = p["windows"]
    own = hits(ans, p["agent"], lang)
    other = sum(hits(ans, g, lang) for g in TOPIC_WORDS if g != p["agent"])
    rows.append({
        "id": a["id"], "variant": a["variant"], "set": p["set"], "lang": lang, "agent": p["agent"],
        "v5": v5.ok, "v4": v4.ok, "fails": [c for c, _ in v4.fails],
        "top": bool(fut and W and in_win(fut[0], W[0])),
        "any3": bool(fut and W and any(in_win(fut[0], w) for w in W)),
        "all_in": bool(fut and W) and all(any(in_win(d, w) for w in W) for d in fut),
        "dated": bool(fut),
        "on": own > 0, "share": own / (own + other) if own + other else 0.0,
        "answer": ans,
    })


def pct(rs, key):
    return f"{100 * sum(1 for r in rs if r[key]) / max(1, len(rs)):5.1f}%"


def mean(rs, key):
    return f"{sum(r[key] for r in rs) / max(1, len(rs)):5.2f}"


for st in ["timing", "guru"]:
    print(f"\n== {st} set ==")
    cols = ["n", "v5 ok", "v4 ok"] + (["dated", "1st∈top", "1st∈3w", "all∈3w"] if st == "timing" else []) + ["on-topic", "share"]
    print(f"{'variant':<10}" + "".join(f"{c:>9}" for c in cols))
    for var in ["full", "guru", "plan"]:
        for lang in [None, "en", "hi", "bn"]:
            rs = [r for r in rows if r["set"] == st and r["variant"] == var and (lang is None or r["lang"] == lang)]
            if not rs:
                continue
            vals = [str(len(rs)), pct(rs, "v5"), pct(rs, "v4")]
            if st == "timing":
                vals += [pct(rs, "dated"), pct(rs, "top"), pct(rs, "any3"), pct(rs, "all_in")]
            vals += [pct(rs, "on"), mean(rs, "share")]
            label = var if lang is None else f"  {lang}"
            print(f"{label:<10}" + "".join(f"{v:>9}" for v in vals))
    if st == "guru":
        print("per guru (v4 ok / on-topic):")
        for g in TOPIC_WORDS:
            line = f"  {g:<8}"
            for var in ["full", "guru", "plan"]:
                rs = [r for r in rows if r["set"] == st and r["variant"] == var and r["agent"] == g]
                line += f"  {var}: {pct(rs, 'v4')} / {pct(rs, 'on')}"
            print(line)
    fc = collections.Counter()
    for var in ["full", "guru", "plan"]:
        c = collections.Counter(f for r in rows if r["set"] == st and r["variant"] == var for f in set(r["fails"]))
        print(f"  top v4 fails [{var}]:", ", ".join(f"{a} {b}" for a, b in c.most_common(5)))
if details:
    with open(details, "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
