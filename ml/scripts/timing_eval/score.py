"""Score date-eval answers: python score.py prompts.jsonl answers.jsonl [--details out.jsonl]"""
import json, sys, re, collections
from datetime import date
sys.path.insert(0, "/Users/animesh/Developer/projects/astropedia/ml/data")
import validate_answer as VA

P = {(r["id"], r["variant"]): r for r in map(json.loads, open(sys.argv[1]))}
A = [json.loads(l) for l in open(sys.argv[2])]
details = sys.argv[sys.argv.index("--details") + 1] if "--details" in sys.argv else None
MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
def ym(iso): y, m = iso[:7].split("-"); return int(y), int(m)
def k(y, m): return y * 12 + m - 1
def dates(ans, lang):
    out = []
    for lg in {lang, "en"}:
        for d in VA.find_dates(ans, lg):
            if d.get("year"): out.append((d["year"], d.get("month"), d.get("pos", 0)))
    return sorted(set(out), key=lambda x: x[2])
def in_win(d, w, slack=1):
    y, m = d[0], d[1]
    a, b = k(*ym(w["start"])) - slack, k(*ym(w["end"])) + slack
    if m is None: return ym(w["start"])[0] <= y <= ym(w["end"])[0]
    return a <= k(y, m) <= b
def transit_months(system):
    out = set()
    for line in system.split("\n"):
        if re.match(r"^- (Jupiter|Saturn|Rahu)\b", line) and "From around" in line:
            out |= {(int(y), MON.index(mo) + 1) for mo, y in re.findall(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})", line)}
    return out
rows = []
for a in A:
    p = P[(a["id"], a["variant"])]
    base = P[(a["id"], "baseline")]
    ty, tm = ym(p["today"])
    ds = dates(a["answer"], p["lang"])
    fut = [d for d in ds if (d[1] is None and d[0] >= ty) or (d[1] is not None and k(d[0], d[1]) >= k(ty, tm))]
    first = fut[0] if fut else None
    W = p["windows"]
    tr = transit_months(base["system"])
    ctx = p["system"].split("\n", 2)[2] if p["system"].startswith("[saga]\nLang") else p["system"].split("\n", 1)[1]
    ctx = ctx.split("\n", 1)[1]  # drop Today:
    v = VA.validate(ctx, p["user"], p["lang"], [], a["answer"], today=p["today"], style="v5")
    v4 = VA.validate(ctx, p["user"], p["lang"], [], a["answer"], today=p["today"], style="v4")
    rows.append({
        "id": a["id"], "variant": a["variant"], "lang": p["lang"], "topic": p["topic"], "today": p["today"], "profile": p["profile"],
        "any": bool(ds), "first": first[:2] if first else None,
        "top": bool(first and W and in_win(first, W[0])), "any3": bool(first and any(in_win(first, w) for w in W)),
        "all_in": bool(fut) and all(any(in_win(d, w) for w in W) for d in fut),
        "cur": bool(first and first[0] == ty and first[1] == tm),
        "oct26": any(d[0] == 2026 and d[1] == 10 for d in ds),
        "transit": bool(first and first[1] and (first[0], first[1]) in tr and not any(in_win(first, w) for w in W)),
        "v5": v.ok, "v4": v4.ok, "fails": [c for c, _ in v4.fails], "answer": a["answer"],
    })
def pct(rs, key): return f"{100 * sum(1 for r in rs if r[key]) / max(1, len(rs)):5.1f}%"
print(f"{'variant':<12} {'n':>3} {'anyDate':>8} {'1st∈top':>8} {'1st∈3w':>8} {'all∈3w':>8} {'curMon':>7} {'Oct26':>7} {'transit':>8} {'v5 ok':>7} {'v4 ok':>7} {'distinct1st':>11} {'modeShare':>9}")
for var in ["baseline", "filter", "line-top", "line-bottom"]:
    rs = [r for r in rows if r["variant"] == var]
    if not rs: continue
    firsts = [tuple(r["first"]) for r in rs if r["first"]]
    c = collections.Counter(firsts)
    share = c.most_common(1)[0][1] / len(firsts) if firsts else 0
    print(f"{var:<12} {len(rs):>3} {pct(rs,'any'):>8} {pct(rs,'top'):>8} {pct(rs,'any3'):>8} {pct(rs,'all_in'):>8} {pct(rs,'cur'):>7} {pct(rs,'oct26'):>7} {pct(rs,'transit'):>8} {pct(rs,'v5'):>7} {pct(rs,'v4'):>7} {len(c):>11} {share:>9.0%}")
    for lang in ["en", "hi", "bn"]:
        ls = [r for r in rs if r["lang"] == lang]
        print(f"  {lang:<10} {len(ls):>3} {pct(ls,'any'):>8} {pct(ls,'top'):>8} {pct(ls,'any3'):>8} {pct(ls,'all_in'):>8} {pct(ls,'cur'):>7} {pct(ls,'oct26'):>7} {pct(ls,'transit'):>8} {pct(ls,'v5'):>7} {pct(ls,'v4'):>7}")
    # per-profile distinct first dates (across topics): does each chart get one date?
    per = collections.defaultdict(list)
    for r in rs:
        if r["first"]: per[r["profile"]].append(tuple(r["first"]))
    ratios = [collections.Counter(v).most_common(1)[0][1] / len(v) for v in per.values() if v]
    print(f"  per-chart most-common first date share: {sum(ratios)/len(ratios):.0%}")
if details:
    with open(details, "w") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
