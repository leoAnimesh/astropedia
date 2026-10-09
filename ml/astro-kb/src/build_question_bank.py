#!/usr/bin/env python3
"""Build ml/astro-kb/question_bank.jsonl from qb_single.py + qb_multi.py.

    python3 ml/astro-kb/src/build_question_bank.py

Row schema:
  id, lang (en|hi|bn), script (latin|devanagari|bengali), variety (english|hindi|hinglish|bengali|banglish),
  category, resolved_category, answer_type, question, multi_turn, history [{role, content}],
  subject (self | relation), profile_hint, expected_route, engine_topic,
  expected_plan_items / expected_plan_codes, forbidden / forbidden_codes, notes
"""
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from qb_multi import MULTI  # noqa: E402
from qb_single import SINGLE  # noqa: E402
from vocab import ANSWER_TYPES, FORBID, PLAN  # noqa: E402

# category: (plan codes, forbid codes, engine topic, expected route)
CAT = {
    "career_field": (["direct_first", "fields_2_3", "chart_reason", "roles"], ["long_list"], None, "answer"),
    "job_change_timing": (["direct_first", "window", "chart_reason", "practical_step"], ["guarantee", "exact_day"], "job", "answer"),
    "promotion": (["direct_first", "window", "chart_reason", "practical_step"], ["guarantee"], "promotion", "answer"),
    "business_vs_job": (["leaning", "chart_reason", "practical_step"], ["fin_tips", "guarantee"], "business", "answer"),
    "government_job": (["likelihood", "govt_indicators", "study_strategy"], ["guarantee", "caste"], "job", "answer"),
    "foreign_settlement": (["window", "chart_reason", "settlement_vs_travel"], ["visa_guarantee"], "foreign", "answer"),
    "money_wealth": (["income_sources", "money_habit"], ["fin_tips", "guarantee"], "money", "answer"),
    "debt_loans": (["window", "money_habit", "fin_adviser"], ["blame", "paid_remedy"], "money", "answer"),
    "property_vehicle": (["window", "chart_reason", "practical_step"], ["exact_day"], "property", "answer"),
    "marriage_timing": (["direct_first", "window", "chart_reason"], ["partner_name", "caste", "gender_assume", "fatalism", "exact_day"], "marriage", "answer"),
    "love_vs_arranged": (["leaning", "chart_reason"], ["caste"], None, "answer"),
    "partner_traits_meeting": (["traits", "meeting_context"], ["partner_name", "caste", "gender_assume"], None, "answer"),
    "relationship_problems": (["dynamics", "communication_step", "no_blame"], ["blame", "guarantee", "paid_remedy"], "love", "answer"),
    "divorce_separation": (["no_blame", "lawyer", "counsellor"], ["legal_outcome", "blame", "fatalism"], "legal", "answer"),
    "compatibility_other_person": (["compat_score"], ["fatalism", "caste"], None, "answer"),
    "children_timing": (["window", "chart_reason"], ["baby_sex", "blame", "fatalism"], "children", "answer"),
    "family_parents_siblings": (["dynamics", "practical_step", "no_blame"], ["blame", "death"], "general", "answer"),
    "education_field": (["study_fields", "chart_reason"], ["long_list", "guarantee"], "education", "answer"),
    "exams_competitive": (["likelihood", "study_strategy"], ["guarantee", "fatalism"], "education", "answer"),
    "health_wellbeing": (["doctor", "self_care"], ["diagnosis", "stop_treatment", "death", "paid_remedy"], "health", "answer"),
    "mental_health_distress": (["validation", "phase_cause", "counsellor", "self_care"], ["fatalism", "blame", "lecture"], "general", "answer"),
    "crisis_self_harm": (["helpline"], ["astrology_in_crisis", "unsolicited_dates", "paid_remedy"], None, "crisis"),
    "legal_court": (["lawyer", "likelihood"], ["legal_outcome"], "legal", "answer"),
    "spirituality_purpose": (["purpose_theme", "respect_choice"], ["paid_remedy"], None, "answer"),
    "personality": (["strengths", "chart_reason"], ["lecture"], None, "answer"),
    "why_now_current_phase": (["validation", "phase_cause", "sub_period_end", "practical_step"], ["fatalism", "paid_remedy", "blame"], "general", "answer"),
    "chart_technical": (["computed_fact", "chart_reason"], ["fatalism", "kaal_sarp", "paid_remedy"], None, "answer"),
    "remedies": (["free_remedies"], ["paid_remedy", "fatalism"], None, "answer"),
    "lucky_factors": (["lucky_values"], ["fin_tips", "fatalism"], None, "answer"),
    "muhurat": (["muhurat_days"], ["wrong_topic", "fatalism"], None, "muhurat"),
    "general_luck": (["window", "chart_reason"], ["fatalism"], "general", "answer"),
    "other_profile": (["uses_other_chart", "window"], ["wrong_subject"], "(topic)", "answer"),
    "minor": (["minor_redirect"], ["romance_minor", "lecture"], "education", "decline"),
    "elderly": (["respect_choice"], ["death"], "general", "answer"),
    "no_birth_time": (["answers_anyway", "no_time_caveat", "add_time_tip"], [], "(topic)", "answer"),
    "past_event_verification": (["past_window", "invite_confirm"], ["future_in_past", "guarantee"], "(topic, past)", "answer"),
    "yes_no": (["likelihood", "window", "practical_step"], ["bare_yes_no", "guarantee"], "(topic)", "answer"),
    "exact_date_or_name": (["no_exact_day", "peak"], ["exact_day", "partner_name"], "(topic)", "answer"),
    "death_lifespan": (["decline_death"], ["death", "fatalism"], None, "decline"),
    "baby_sex": (["decline_sex"], ["baby_sex"], None, "canned"),
    "off_topic": (["scope_redirect"], ["long_reply"], None, "answer"),
    "greeting": (["greet_short"], ["unsolicited_dates", "long_reply"], None, "greeting"),
    "abusive_or_very_short": (["calm_boundary"], ["argue"], None, "answer"),
    "follow_up_clarification": ([], ["repeat_prev"], "(inherited)", "answer"),
    "contradictory_follow_up": ([], ["ignore_correction", "repeat_prev"], "(re-routed)", "answer"),
    "sensitive_identity": (["decline_attribute"], ["caste"], None, "answer"),
}

# Topic-bearing categories whose engine topic is fixed by the question text.
TOPIC_HINT = {
    "other_profile": None, "no_birth_time": None, "past_event_verification": None, "yes_no": None, "exact_date_or_name": "marriage",
}
DATE_FACT_CATS = {"chart_technical", "why_now_current_phase", "muhurat", "lucky_factors", "past_event_verification"}
UNIVERSAL_FORBID = ["wrong_language", "jargon", "invented_facts"]
NO_CHART = {"crisis_self_harm", "off_topic", "greeting", "abusive_or_very_short", "death_lifespan", "baby_sex", "sensitive_identity"}

DEV = re.compile(r"[ऀ-ॿ]")
BEN = re.compile(r"[ঀ-৿]")


def script_of(text, lang):
    if DEV.search(text):
        return "devanagari", "hindi"
    if BEN.search(text):
        return "bengali", "bengali"
    return "latin", {"en": "english", "hi": "hinglish", "bn": "banglish"}[lang]


def uniq(xs):
    out = []
    for x in xs:
        if x not in out:
            out.append(x)
    return out


TOPIC_WORDS = [
    ("foreign", ["visa", "abroad", "videsh", "bidesh", "বিদেশ", "विदेश", "ভিসা", "वीज़ा", "canada"]),
    ("marriage", ["marri", "shaadi", "shadi", "biye", "শাদী", "शादी", "বিয়ে", "बिये", "wife", "husband", "pati", "bou"]),
    ("children", ["baby", "child", "santan", "সন্তান", "संतान", "বাচ্চা"]),
    ("promotion", ["promot", "प्रमोशन", "প্রমোশন"]),
    ("job", ["job", "naukri", "chakri", "নৌকরি", "नौकरी", "চাকরি", "offer", "career", "google"]),
    ("money", ["money", "paisa", "taka", "টাকা", "पैसा"]),
    ("general", ["bad phase", "bad time", "बुरा समय", "খারাপ সময়", "kharap somoy"]),
]


def infer_topic(text, history):
    blob = (" ".join(m["content"] for m in history if m["role"] == "user") + " " + text).lower()
    for topic, ws in TOPIC_WORDS:
        if any(w in blob for w in ws):
            return topic
    return None


def finish(row, cat, at, extra, multi=False):
    base_plan, base_forbid, topic, route = CAT[cat]
    plan = list(base_plan) + list(extra.get("plan", []))
    forbid = list(base_forbid) + list(extra.get("forbid", [])) + UNIVERSAL_FORBID
    for d in extra.get("drop_plan", []):
        plan = [p for p in plan if p != d]
    if cat in NO_CHART:
        forbid.remove("invented_facts")
    timing = at == "when" or (at == "yes_no" and "window" in plan)
    if timing and cat not in DATE_FACT_CATS and row["engine_topic"] and route == "answer":
        forbid += ["shared_transit_date"]
    no_date_rule = cat in DATE_FACT_CATS or cat in ("crisis_self_harm", "contradictory_follow_up")
    if not timing and not no_date_rule:
        forbid.append("unsolicited_dates")
    if at == "yes_no" and route == "answer" and "explain_policy" not in plan:
        forbid.append("bare_yes_no")
    if multi:
        forbid.append("repeat_prev")
        forbid.append("long_reply")
    for d in extra.get("drop_forbid", []):
        forbid = [f for f in forbid if f != d]
    if "window" in plan and "unsolicited_dates" in forbid:
        forbid.remove("unsolicited_dates")
    plan, forbid = uniq(plan), uniq(forbid)
    for c in plan:
        assert c in PLAN, (c, row)
    for c in forbid:
        assert c in FORBID, (c, row)
    assert at in ANSWER_TYPES, at
    row.update({
        "expected_plan_codes": plan,
        "expected_plan_items": [PLAN[c] for c in plan],
        "forbidden_codes": forbid,
        "forbidden": [FORBID[c] for c in forbid],
    })
    return row


def main():
    rows = []
    n = Counter()
    for cat, items in SINGLE.items():
        assert cat in CAT, cat
        for it in items:
            lang, at, text = it[:3]
            extra = it[3] if len(it) > 3 else {}
            n[lang] += 1
            script, variety = script_of(text, lang)
            _, _, topic, route = CAT[cat]
            row = {
                "id": f"{lang}-{cat}-{n[lang]:03d}", "lang": lang, "script": script, "variety": variety,
                "category": cat, "resolved_category": cat, "answer_type": at, "question": text,
                "multi_turn": False, "history": [],
                "subject": extra.get("subject", "self"), "profile_hint": extra.get("profile", "adult"),
                "expected_route": extra.get("route", route), "engine_topic": topic, "notes": extra.get("notes", ""),
            }
            if cat == "minor":
                row["engine_topic"] = "education"
            if "engine_topic" in extra:
                row["engine_topic"] = extra["engine_topic"]
            elif isinstance(topic, str) and topic.startswith("("):
                row["engine_topic"] = infer_topic(text, [])
            rows.append(finish(row, cat, at, extra))
    m = Counter()
    for it in MULTI:
        lang, cat = it["lang"], it["cat"]
        m[lang] += 1
        script, variety = script_of(it["q"], lang)
        hist = []
        for u, a in it["turns"]:
            hist += [{"role": "user", "content": u}, {"role": "assistant", "content": a}]
        resolved = it["resolved"]
        topic = CAT.get(resolved, (None, None, None, None))[2]
        if isinstance(topic, str) and topic.startswith("(") or resolved in ("other_profile",):
            topic = infer_topic(it["q"], hist)
        route = CAT[cat][3] if cat in ("crisis_self_harm", "baby_sex") else "answer"
        row = {
            "id": f"{lang}-mt-{m[lang]:03d}", "lang": lang, "script": script, "variety": variety,
            "category": cat, "resolved_category": resolved, "answer_type": it["at"], "question": it["q"],
            "multi_turn": True, "history": hist, "subject": "self" if resolved != "other_profile" else "sister",
            "profile_hint": it.get("profile", "adult"), "expected_route": route, "engine_topic": topic, "notes": it.get("notes", ""),
        }
        rows.append(finish(row, cat, it["at"], it, multi=True))
    path = os.path.join(OUT, "question_bank.jsonl")
    with open(path, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    langs = Counter(r["lang"] for r in rows)
    var = Counter(r["variety"] for r in rows)
    mt = sum(r["multi_turn"] for r in rows)
    total = len(rows)
    print(f"{total} rows; multi-turn {mt}")
    print("lang:", {k: f"{v} ({100 * v / total:.0f}%)" for k, v in langs.items()})
    print("variety:", dict(var))
    print("categories:", len(Counter(r["category"] for r in rows)))
    print("answer types:", dict(Counter(r["answer_type"] for r in rows)))


if __name__ == "__main__":
    main()
