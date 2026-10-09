#!/usr/bin/env python3
"""Build ml/astro-kb/rules.md and ml/astro-kb/rules.json from src/.

    python3 ml/astro-kb/src/build_kb.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from kb_categories import CATEGORIES  # noqa: E402
from vocab import ANSWER_TYPES, FORBID, PLAN  # noqa: E402

TOP_MISSING = [
    ("answer_type_routing", "Answer-type + sub-category routing in intent.ts", "M"),
    ("career_field_resolver", "Career-field resolver (Brihat Jataka 10.1 + field map)", "M"),
    ("navamsa_d9", "Navamsa D9 + vargottama + stability flag", "S"),
    ("composite_strength", "Composite planet strength (dignity ext., house, dig bala, combustion, aspects)", "M"),
    ("current_phase_facts", "Current-phase facts (dasha lords' houses, maha-antar relation)", "S"),
    ("no_repeat_followups", "No-repeat memory + follow-up plans", "S"),
    ("functional_nature", "Functional benefic/malefic + yogakaraka per lagna", "S"),
    ("combustion", "Combustion", "S"),
    ("partner_facts", "Partner traits + meeting context + love/arranged signals", "S"),
    ("planet_aspects", "Planet-to-planet aspects and conjunctions", "S"),
    ("yogas", "Conservative yoga detection", "M"),
    ("feature_routes", "Chat routes to compatibility, muhurat, lucky, sade sati/manglik facts", "S"),
    ("safety_extensions", "Safety extensions (divorce, emergency symptoms, identity attributes, distress, corrections)", "S"),
    ("other_vargas", "D10 / D7 / D4 / D24 / D12 with stability flags", "S"),
    ("vedha_ashtakavarga", "Gochara vedha + Ashtakavarga SAV", "L"),
]

DIVISIONAL_FORMULAS = {
    "notation": "lambda = sidereal longitude; s = floor(lambda/30) (0=Aries); d = lambda mod 30; odd(s) = s % 2 == 0 (Aries, Gemini, ...)",
    "D9": "floor(lambda / (10/3)) mod 12",
    "D10": "k=floor(d/3); odd: (s+k) mod 12; even: (s+8+k) mod 12",
    "D7": "k=floor(d/(30/7)); odd: (s+k) mod 12; even: (s+6+k) mod 12",
    "D4": "k=floor(d/7.5); (s+3k) mod 12",
    "D12": "k=floor(d/2.5); (s+k) mod 12",
    "D24": "k=floor(d/1.25); odd: (4+k) mod 12; even: (3+k) mod 12",
    "D3": "k=floor(d/10); (s+4k) mod 12",
    "D2": "odd: d<15 -> Leo else Cancer; even: d<15 -> Cancer else Leo",
    "combustion_orbs": {"Moon": 12, "Mars": 17, "Mercury": [14, 12], "Jupiter": 11, "Venus": [10, 8], "Saturn": 15, "note": "[direct, retrograde]"},
    "source": "BPHS ch.6 (verified verse pages: enjoylearningsanskrit.com/scriptures/parashara/chapter-6)",
}


def bullets(xs, indent=""):
    return "\n".join(f"{indent}- {x}" for x in xs)


def render_category(i, c):
    lines = [f"### 5.{i} {c['title']} (`{c['id']}`)", ""]
    lines.append(f"*Answer types:* {', '.join(c['answer_types'])}. *Engine topic:* {c['engine_topic'] or 'none'}. "
                 f"*Intent today:* {c['intent_today']}.")
    lines.append("")
    p = c["patterns"]
    lines.append("**Question patterns**")
    lines.append("")
    for k, label in (("en", "en"), ("hi", "hi"), ("hinglish", "Hinglish"), ("bn", "bn"), ("banglish", "Banglish")):
        if p.get(k):
            lines.append(f"- {label}: " + " / ".join(f"\"{q}\"" for q in p[k]))
    lines.append("")
    f = c.get("factors") or {}
    if any(f.get(k) for k in ("houses", "lords", "karakas", "vargas")) or f.get("jaimini") or f.get("kp"):
        lines.append("**Chart factors**")
        lines.append("")
        for k, label in (("houses", "Houses"), ("lords", "Lords"), ("karakas", "Karakas"), ("vargas", "Divisional charts")):
            if f.get(k):
                lines.append(f"- {label}: " + "; ".join(f[k]))
        if f.get("jaimini"):
            lines.append(f"- Jaimini: {f['jaimini']}")
        if f.get("kp"):
            lines.append(f"- KP: {f['kp']}")
        lines.append("")
    for key, label in (("field_map", "Planet → career fields (BJ ch.10, PD ch.5; Rahu/Ketu modern)"),
                       ("meeting_map", "7th lord's house → likely meeting context"),
                       ("free_remedies", "Free remedies by planet (choose 1-3; optional, faith-respecting)")):
        if c.get(key):
            lines.append(f"**{label}**")
            lines.append("")
            lines.append("| Key | Meaning |")
            lines.append("|---|---|")
            for k, v in c[key].items():
                lines.append(f"| {k} | {v} |")
            lines.append("")
    for key, label in (("judge", "What to judge"), ("timing", "Timing"), ("say", "Say it plainly")):
        lines.append(f"**{label}**")
        lines.append("")
        lines.append(bullets(c[key]))
        lines.append("")
    lines.append(f"**Example answer (en, placeholders from the plan):** {c['example']}")
    lines.append("")
    lines.append("**Must include:** " + "; ".join(c["must_include"]) + ".")
    lines.append("")
    lines.append("**Never:** " + "; ".join(c["never"]) + ".")
    lines.append("")
    lines.append("**Edge cases**")
    lines.append("")
    lines.append(bullets(c["edge_cases"]))
    lines.append("")
    app = c["app"]
    lines.append("**App today:** have: " + ("; ".join(app["have"]) or "nothing specific") +
                 ". Missing: " + ("; ".join(app["missing"]) or "nothing") + ".")
    lines.append("")
    lines.append("**Sources:** " + "; ".join(c["sources"]) + ".")
    lines.append("")
    return "\n".join(lines)


def main():
    head = open(os.path.join(HERE, "rules_head.md"), encoding="utf-8").read()
    tail = open(os.path.join(HERE, "rules_tail.md"), encoding="utf-8").read()
    parts = [head.rstrip() + "\n", "---\n", "## 5. Category rules\n",
             "Each category: patterns, chart factors (with app status), what to judge, timing, how to say it, "
             "a model answer, must-include / never lists (the judge checks these), edge cases, app status, sources.\n"]
    toc, group = [], None
    for i, c in enumerate(CATEGORIES, 1):
        if c["group"] != group:
            group = c["group"]
            toc.append(f"\n**{group}:** ")
        toc.append(f"5.{i} `{c['id']}`;")
    parts.append(" ".join(toc).strip() + "\n")
    group = None
    for i, c in enumerate(CATEGORIES, 1):
        if c["group"] != group:
            group = c["group"]
            parts.append(f"\n#### {group}\n")
        parts.append(render_category(i, c))
    parts.append("---\n\n## 6. Answer types and the shared check vocabulary\n")
    parts.append("Used by `question_bank.jsonl` (`expected_plan_codes`, `forbidden_codes`) and `judge_rubric.md`.\n")
    parts.append("| Answer type | Meaning |\n|---|---|\n" + "\n".join(f"| `{k}` | {v} |" for k, v in ANSWER_TYPES.items()) + "\n")
    parts.append("\n**Plan items (must include)**\n\n| Code | Text |\n|---|---|\n" + "\n".join(f"| `{k}` | {v} |" for k, v in PLAN.items()) + "\n")
    parts.append("\n**Forbidden**\n\n| Code | Text |\n|---|---|\n" + "\n".join(f"| `{k}` | {v} |" for k, v in FORBID.items()) + "\n")
    parts.append(tail)
    md = "\n".join(parts)
    md = md.replace("\n\n\n", "\n\n")
    with open(os.path.join(OUT, "rules.md"), "w", encoding="utf-8") as fh:
        fh.write(md)

    data = {
        "version": "1.0",
        "date": "2026-10-09",
        "conventions": {
            "zodiac": "sidereal, Lahiri ayanamsa", "houses": "whole-sign from lagna; Moon sign (Chandra lagna) without birth time/place",
            "dasha": "Vimshottari from Moon nakshatra", "nodes": "mean",
            "status_tags": {"have": "computed today", "partial": "part exists", "missing": "not computed"},
            "source_tags": {"text": "checked against a translation/verse page", "std": "standard textbook teaching",
                            "modern": "modern practitioner method", "app": "Astropedia product rule"},
        },
        "answer_protocol": [
            "Answer the asked answer type in the first sentence (when→window, which→2-3 options, why→cause, yes_no→likelihood+window, what/how→2-3 points).",
            "1-2 chart reasons in plain words.",
            "Dates only when asked/essential and only from the timing engine.",
            "One practical step.",
            "Caveat only when it matters (no birth time, other person, professional advice).",
            "60-140 words first answer; 30-90 words follow-ups with new information only.",
            "Reply in the user's language and script.",
            "Warm, specific, non-fatalistic; certainty ladder by engine strength.",
        ],
        "hard_rules": [FORBID[k] for k in ("death", "diagnosis", "stop_treatment", "baby_sex", "partner_name", "legal_outcome",
                                           "visa_guarantee", "paid_remedy", "caste", "gender_assume", "romance_minor",
                                           "fatalism", "kaal_sarp", "invented_facts", "shared_transit_date", "exact_day")],
        "answer_types": ANSWER_TYPES,
        "plan_items": PLAN,
        "forbidden": FORBID,
        "categories": CATEGORIES,
        "divisional_formulas": DIVISIONAL_FORMULAS,
        "top_missing_capabilities": [{"rank": i, "id": a, "title": b, "effort": e} for i, (a, b, e) in enumerate(TOP_MISSING, 1)],
    }
    with open(os.path.join(OUT, "rules.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"rules.md {len(md.splitlines())} lines; rules.json {len(CATEGORIES)} categories")


if __name__ == "__main__":
    main()
