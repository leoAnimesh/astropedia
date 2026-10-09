# Astropedia chat: Vedic answer rule base

Version 1 (2026-10-09). Research artefact, not app code. It describes how a
competent, ethical practising Vedic astrologer (Parashari first, with Jaimini
and KP notes where they are standard) answers each kind of question a chat
user asks, and what Astropedia can and cannot compute today.

Files in `ml/astro-kb/`:

| File | What it is |
|---|---|
| `rules.md` | This document (generated: `python3 ml/astro-kb/src/build_kb.py`). |
| `rules.json` | The same category rules, machine-readable (same build). |
| `question_bank.jsonl` | Tagged user questions in en / hi / bn incl. multi-turn threads (`src/build_question_bank.py`). |
| `judge_rubric.md` | Per-answer scoring rubric for an LLM judge or a human. |
| `src/` | Sources for the generated files. Edit these, then rebuild. |

How the pieces map onto the app's answer pipeline (`utils/agent/*`):
`intent.ts` should recognise the **category** (section 5) and **answer
type** (section 6), `plan.ts` should attach the **chart factors** and **timing**
the category lists, the renderer (model or template) follows **say it
plainly** and **never**, and `verify.ts` / an eval judge checks the
**must include** and **forbidden** items (`judge_rubric.md`).

---

## 0. Conventions

- **Zodiac and houses.** Sidereal zodiac, Lahiri (Chitrapaksha) ayanamsa;
  whole-sign houses from the sidereal ascendant (lagna). Without a birth time
  or place, houses are counted from the Moon sign (Chandra lagna). Vimshottari
  dasha from the Moon's nakshatra. Mean lunar nodes. These are the app's
  conventions (`utils/astrology.ts`, `utils/timing-engine.ts`) and the
  majority Parashari practice in India.
- **Status tags** used throughout:
  `[have]` the app computes it today; `[partial]` part of it exists;
  `[missing]` not computed (formula in section 9).
- **Source confidence tags**: `[text]` checked against a published
  translation or verse page during this research; `[std]` standard
  textbook teaching found consistently across sources (verify the verse
  before quoting it to users); `[modern]` a modern practitioner method;
  `[app]` an Astropedia product rule. Source keys (BPHS, PD, BJ, SAR, JP,
  UK, HJH, KNR, SR, KP, NCGR, DMR, PCPNDT) are expanded in section 11.
- **Houses in plain words** (what the chat says instead of numbers): 1 self /
  body, 2 money / family / speech, 3 effort / siblings / courage /
  communication, 4 home / mother / peace / property / vehicles / schooling,
  5 romance / children / intelligence / study / mantra, 6 daily work /
  service / health routines / rivals / debts / disputes, 7 partner /
  marriage / business partners / public dealings, 8 sudden change / hidden
  matters / research / inheritance, 9 luck / father / teachers / higher
  learning / dharma / long journeys, 10 career / status / action, 11 gains /
  income / friends / wishes fulfilled, 12 expenses / rest / abroad /
  retreat / spirituality. (BPHS bhava chapters; Uttara Kalamrita khanda 5
  karakatwa lists `[std]`.)

---

## 1. Universal answer protocol (applies to every category)

1. **Answer the asked question type first, in the first sentence.**
   - *when* → the engine's best window as month-year range (peak month if
     the user asks to narrow);
   - *which* → name 2-3 concrete options (fields, roles, subjects, places)
     with one chart reason each;
   - *what / how* → 2-3 concrete points or steps;
   - *why* → the cause in the chart (current dasha and/or transit) in one or
     two sentences;
   - *yes/no* → a likelihood word (strong / reasonable / slow) plus the
     window, never a bare yes or no and never a guarantee;
   - *other* (greeting, off-topic, emotional) → the route in section 5
     ("Question forms" and "Wellbeing").
2. **One or two chart reasons, in plain words.** "Your career house ruler
   Mercury is strong" rather than "10th lord Mercury exalted in the 6th
   aspecting the 12th". Technical terms only with a gloss, and only when the
   user used them first.
3. **Timing only when asked or essential.** Dates come only from the timing
   engine's windows (`plan.timing`), never from the sky-today transit lines
   (those are the same for everyone: the v2.1 "October 2026" failure).
4. **One practical step** the person controls (prepare, apply, talk, save,
   rest, see a professional).
5. **Caveat only when it matters**: no birth time, reading someone else's
   chart, a professional is needed (doctor / lawyer / counsellor /
   financial adviser).
6. **Length.** First answer 60-140 words. Follow-ups 30-90 words and must add
   something new (narrower month, the reason, a next step), never restate.
7. **Language.** Reply in the user's language **and script**: Devanagari
   Hindi → Devanagari; Hinglish (Latin) → Hinglish; Bengali script →
   Bengali; Banglish → Banglish; mixed → the dominant one. Digits as the app
   localises them.
8. **Tone.** Warm, specific, calm, non-fatalistic. The chart shows
   tendencies and seasons, the person keeps agency. Use "you" (or the other
   person's name / relation), gender-neutral partner words unless the user
   specified.
9. **Certainty ladder** (engine strength → words):

| Engine | English | Hindi | Bengali |
|---|---|---|---|
| strong, high confidence | "a strong period for…" | "…के लिए मज़बूत समय" | "…র জন্য জোরালো সময়" |
| moderate | "a reasonable chance; it gets stronger if…" | "अच्छी संभावना, खासकर अगर…" | "ভালো সম্ভাবনা, বিশেষ করে যদি…" |
| weak / far | "slower; steady effort matters more; the next stronger stretch is…" | "धीमा समय; मेहनत ज़्यादा काम आएगी; अगला मज़बूत समय…" | "একটু ধীর সময়; চেষ্টা বেশি কাজে দেবে; পরের ভালো সময়…" |
| no time / uncertain nakshatra | add "approximate, since the birth time is not known" | "जन्म समय पता न होने से अनुमानित" | "জন্মসময় জানা না থাকায় আনুমানিক" |

Never: "definitely", "100%", "guaranteed", "never", "doomed", "curse",
"bad karma", "dosha will ruin" (and hi/bn equivalents: पक्का, ज़रूर होगा, कभी नहीं,
श्राप; নিশ্চিত, অবশ্যই হবে, কখনও না, অভিশাপ).

---

## 2. Universal hard rules (never, in any category)

| Rule | Why | Source |
|---|---|---|
| No death, lifespan, accident-date or "maraka" predictions, for the user or anyone else. Decline kindly and turn to wellbeing. | Causes fear and harm; most professional codes forbid it. | NCGR `[std]`, KNR (public stance), `[app]` `decline: 'death'` |
| No medical diagnosis, prognosis, or advice to change/stop treatment. Health = wellbeing patterns and self-care windows + "see a doctor". | Diagnosis is a medical act; magic-cure claims are restricted in India. | DMR Act 1954 s.2/3 `[text]`, `[app]` `advice: doctor` |
| No prediction of a baby's sex; no "son yoga". | Sex determination of a foetus is illegal in India; fuels sex selection. | PCPNDT Act 1994 `[std]`, `[app]` canned `childSex` |
| No partner's name, initials, caste, community, religion, skin colour, or "where exactly / which city". | Unknowable from a chart; harmful stereotypes. | `[app]` canned `partnerName` |
| No guarantees about court cases, visas, exams, job offers, loans, investments. | Outcomes depend on people and institutions. | NCGR `[std]` |
| No paid remedies: never sell or push gemstones, pujas, yantras, paid consultations. Free behavioural remedies only (section 5, `remedies`). | Fear-based selling is the main ethical failure in the trade. | BPHS remedial chapters prescribe japa, dana, worship `[std]`; SR *Vedic Remedies in Astrology* `[std]`; NCGR `[std]` |
| No caste, religion or community statements; no "inter-caste marriage yoga". | Discriminatory, not in the classical rules as a modern user means it. | `[app]` |
| No gender assumptions: partner gender neutral unless the user says; spouse karaka: both Venus and Jupiter for everyone. | Inclusive and matches the engine. | `[app]` `TOPIC_RULES.marriage` |
| No romance / marriage / childbirth timing for minors (< 18). Studies and growth instead. | Child safety. | `[app]` `decline: 'minorRomance'` |
| No childbirth timing from age 50; gentle redirection. | Medical reality, kindness. | `[app]` `decline: 'elderChildren'` |
| Self-harm or suicide language → crisis route immediately (Tele-MANAS 14416, emergency 112), no astrology. | Safety first. | `[app]` `isCrisisMessage` |
| No fear words for doshas (Manglik, Kaal Sarp, Pitra, Kemadruma, sade sati). Name them only if the user does, explain the cancellations and the limited scope. | Fear harms and pushes paid remedies. "Kaal Sarp" is not in BPHS. | `[std]`, ashtakoota.ts manglik exemptions `[have]` |
| Never invent chart facts the plan does not contain (yogas, D9/D10 placements, degrees). | The model cannot compute; facts must come from the context/plan. | `[app]` |
| Never present the current month or a shared transit ingress date as the person's own event date. | Same date for every chart (v2.1 failure). | `[app]` verify.ts |

---

## 3. Judging toolkit: how strong is a promise?

A practising astrologer judges every topic the same way: **the house, its
lord, and its natural significator (karaka)**, read from the lagna and
confirmed from the Moon and the relevant divisional chart. If all three are
strong the matter is promised and flows; two of three, it comes with effort;
one or none, it is delayed or comes in a modified form (HJH method; BPHS
bhava chapters `[std]`). Only then is timing attempted ("promise first,
then timing", KNR `[std]`).

### 3.1 House classes `[have]` (whole-sign)

- Kendra (angles) 1, 4, 7, 10: strength, visibility. Trikona 1, 5, 9: grace,
  luck. Upachaya 3, 6, 10, 11: improve with time and effort (malefics do well
  here). Dusthana 6, 8, 12: obstacles, loss, hidden matters (a planet ruling
  or sitting there weakens other topics; the engine's `against`).
- Maraka houses 2 and 7 exist in the texts; **internal only**, never used
  to talk about death.

### 3.2 Dignity `[partial]`

| Planet | Exalted (deep) | Debilitated | Moolatrikona | Own |
|---|---|---|---|---|
| Sun | Aries 10° | Libra | Leo 0-20° | Leo |
| Moon | Taurus 3° | Scorpio | Taurus 4-30° (texts: 3-30°) | Cancer |
| Mars | Capricorn 28° | Cancer | Aries 0-12° | Aries, Scorpio |
| Mercury | Virgo 15° | Pisces | Virgo 16-20° | Gemini, Virgo |
| Jupiter | Cancer 5° | Capricorn | Sagittarius 0-10° | Sagittarius, Pisces |
| Venus | Pisces 27° | Virgo | Libra 0-15° | Taurus, Libra |
| Saturn | Libra 20° | Aries | Aquarius 0-20° | Capricorn, Aquarius |

BPHS (planetary dignities chapter) `[std]`. The app has exalted /
debilitated / own / neutral (`getPlanetDignity`); missing: moolatrikona,
friend / enemy sign (natural friendship table, BPHS `[std]`), temporary
friendship (planets 2,3,4,10,11,12 from each other are temporary friends),
compound (panchadha) relationship. Natural friendships:

| Planet | Friends | Neutral | Enemies |
|---|---|---|---|
| Sun | Moon, Mars, Jupiter | Mercury | Venus, Saturn |
| Moon | Sun, Mercury | Mars, Jupiter, Venus, Saturn | none |
| Mars | Sun, Moon, Jupiter | Venus, Saturn | Mercury |
| Mercury | Sun, Venus | Mars, Jupiter, Saturn | Moon |
| Jupiter | Sun, Moon, Mars | Saturn | Mercury, Venus |
| Venus | Mercury, Saturn | Mars, Jupiter | Sun, Moon |
| Saturn | Mercury, Venus | Jupiter | Sun, Moon, Mars |

(`utils/ashtakoota.ts` already has this table as `relation()` for graha
maitri `[have]`, reusable.)

**Neecha bhanga** (cancellation of debilitation) `[missing]`: any of (a) the
lord of the debilitation sign, or (b) the lord of the planet's exaltation
sign, is in a kendra from the lagna or the Moon; (c) the debilitated planet
is aspected by / conjunct its debilitation-sign lord; (d) the planet is
exalted in D9. Phaladeepika ch. 7 and BPHS list variants; sources differ on
the exact set, so use it only to *soften* a weakness, never to promise a
"raja yoga" `[std]`.

### 3.3 Functional nature by lagna `[missing]`

Parashari lordship rules (BPHS, results of house lords; Laghu Parashari
`[std]`): lords of trikonas (1, 5, 9) are functional benefics; lords of
3, 6, 11 functional malefics; natural benefics owning kendras lose their
beneficence (kendradhipati dosha) and natural malefics owning kendras lose
their malefic edge; the 8th lord is malefic unless it also rules the lagna;
a planet owning both a kendra and a trikona is a **yogakaraka**.

| Lagna | Yogakaraka / best | Chief functional malefics |
|---|---|---|
| Aries | Sun, Jupiter (5/9) | Mercury (3/6), Saturn (10/11) mixed |
| Taurus | **Saturn** (9/10) | Jupiter (8/11), Moon (3), Venus (1/6) mixed |
| Gemini | Venus (5/12) | Mars (6/11), Sun (3) |
| Cancer | **Mars** (5/10) | Mercury (3/12), Venus (4/11) mixed, Saturn (7/8) |
| Leo | **Mars** (4/9) | Mercury (2/11), Venus (3/10) mixed, Saturn (6/7) |
| Virgo | Venus (2/9), Mercury | Mars (3/8), Moon (11) |
| Libra | **Saturn** (4/5) | Jupiter (3/6), Sun (11), Mars (2/7) |
| Scorpio | Moon (9), Sun (10), Jupiter (2/5) | Mercury (8/11), Venus (7/12) |
| Sagittarius | Sun (9), Mars (5/12) | Venus (6/11), Saturn (2/3) |
| Capricorn | **Venus** (5/10) | Jupiter (3/12), Mars (4/11), Moon (7) |
| Aquarius | **Venus** (4/9) | Jupiter (2/11), Moon (6), Mars (3/10) |
| Pisces | Moon (5), Mars (2/9) | Saturn (11/12), Venus (3/8), Sun (6) |

Use: a dasha of a functional benefic gives good results of the houses it
rules; of a functional malefic, effort and friction (not "bad events").

### 3.4 Aspects `[partial]`

Graha drishti in whole signs: every planet the 7th; Mars also 4th and 8th;
Jupiter 5th and 9th; Saturn 3rd and 10th (BPHS aspects chapter `[std]`).
Rahu/Ketu 5th/9th are disputed; default 7th only (the engine's choice).
The engine has `aspects(planet, from, to)` for planet → house; missing:
planet → planet aspects and conjunction lists for affliction and yogas.
Jaimini rasi drishti (movable signs aspect fixed signs except the adjacent
one, etc.) is not used in chat.

### 3.5 Combustion (asta) `[missing]`

A planet within these degrees of the Sun is combust and gives weaker,
hidden or ego-clouded results of what it rules: Moon 12°, Mars 17°,
Mercury 14° (12° when retrograde), Jupiter 11°, Venus 10° (8° when
retrograde), Saturn 15° (Surya Siddhanta / Brihat Jataka tradition; Saturn
is 16° in some lists) `[std]`. Mercury is very often combust and its
combustion is mild in practice (budha-aditya is a common combination):
**do not mention Mercury's combustion to users unless it is within ~3°**.

### 3.6 Retrogression `[have]` (flag)

Classically a retrograde planet has high motional strength (chesta bala,
BPHS / Saravali `[std]`); modern practice reads its results as delayed,
revisited or more internal `[modern]`. Default: say "results come through
second attempts / revisiting" only if relevant; never call it bad.

### 3.7 Vargottama and divisional confirmation `[missing]`

A planet in the same sign in D1 and D9 is vargottama: steady and reliable.
A D1 promise confirmed in the relevant varga (D9 marriage, D10 career, D7
children, D4 property, D24 education, D12 parents; BPHS ch. 6 `[text]`)
is stronger. Vargas beyond D9 need an accurate birth time (the D10
ascendant changes about every 12 minutes, D24 every 5); when the birth
time is approximate, do not use them.

### 3.8 Directional strength (dig bala) `[missing]`

Strongest: Jupiter and Mercury in the 1st, Sun and Mars in the 10th, Saturn
in the 7th, Moon and Venus in the 4th (BPHS shadbala chapter `[std]`).

### 3.9 Yogas to detect (conservative list) `[missing]`

Detect only these, phrase them as "a supportive combination", never as
a guarantee, and never name fear-yogas.

| Yoga | Definition (D1) | Topic | Source |
|---|---|---|---|
| Gajakesari | Jupiter in a kendra (1/4/7/10) from the Moon; stronger when Jupiter is not debilitated, combust or in an enemy sign and is aspected by benefics | reputation, support, wisdom | BPHS ch. 36 `[text]` |
| Pancha Mahapurusha (Ruchaka Mars, Bhadra Mercury, Hamsa Jupiter, Malavya Venus, Sasa Saturn) | the planet in own or exaltation sign **and** in a kendra from lagna (Moon as a secondary reference) | personality, career style | BPHS, BJ `[std]` |
| Raja yoga (Parashari) | a kendra lord and a trikona lord conjoined, in mutual aspect, or exchanging signs; yogakaraka alone counts | status, career rise in its dasha | BPHS raja yoga chapter `[std]` |
| Dhana yoga | lords of 2 / 11 associated (conjunction, aspect, exchange) with lords of 1 / 5 / 9 | wealth | BPHS dhana yoga chapter `[std]` |
| Viparita raja yoga | lords of 6, 8, 12 placed in 6, 8 or 12 | rise after difficulty | BPHS `[std]` |
| Neecha bhanga | 3.2 | softens a weakness | PD ch. 7 `[std]` |
| Parivartana (exchange) | two planets each in the other's sign | links the two houses' topics | `[std]` |
| Budha-Aditya | Sun and Mercury in one sign | very common: mention only with other support | `[std]` |
| Kemadruma | no planet (excluding Sun, Rahu, Ketu) in the 2nd or 12th from the Moon, and none in a kendra from lagna/Moon (cancellation) | **internal only**: never tell a user | BPHS / PD `[std]` |

Do not detect or mention: Kaal Sarp (not in BPHS or the other classics
listed), "Pitra dosha", "Shrapit", "Guru Chandal" as fear labels.

### 3.10 Synthesis order

1. Main house: lord's dignity and house, occupants, aspects (benefic /
   malefic, functional nature).
2. Karaka: dignity, combustion, house.
3. Same from the Moon (Chandra lagna); agreement adds confidence.
4. Varga confirmation where the birth time allows (D9 always, others only
   with a reliable time).
5. Yogas touching the topic.
6. Then timing (section 4).

---

## 4. Timing toolkit

- **Promise first.** If the topic's house, lord and karaka are all weak, say
  the matter needs more effort / comes later, and still give the best
  window, worded softly (`notes: noStrong`).
- **Vimshottari dasha** `[have]`: an event comes in the major period of a
  planet linked to the topic (lord, occupant, aspecting, karaka; a node gives
  its dispositor's results) and is triggered in the sub-period of another
  linked planet; the pratyantar narrows the month. A sub-period lord 6th or
  8th from the major-period lord brings friction (BPHS dasha chapters; KNR
  *Timing Events through Vimshottari Dasha* `[std]`). Dasha results depend on
  the lord's ownership and placement from the lagna **and** from the Moon
  `[std]`.
- **Double transit** `[have]`: Jupiter and Saturn both occupying or aspecting
  the topic's main house (or its lord, or the same house from the Moon) in the
  same months activates a promised event (KNR's popularisation; secondary
  sources differ on house vs lord, the engine uses both) `[std]`.
- **Gochara from the Moon** `[have]`: Jupiter good in the 2, 5, 7, 9, 11th
  from the Moon; Saturn good in the 3, 6, 11th (PD ch. 26 `[std]`). Vedha
  (obstruction) pairs `[missing]`: Jupiter 2-12, 5-4, 7-3, 9-10, 11-8;
  Saturn 3-12, 6-9, 11-5 (good house - vedha house: the good result is
  blocked if another planet transits the vedha house, except Sun-Saturn and
  Moon-Mercury pairs) `[std]`.
- **Sade sati / ashtama / kantaka shani** `[have]`: Saturn 12th, 1st, 2nd
  from the Moon (sade sati), 8th (ashtama), 4th (kantaka). The named 7.5-year
  "sade sati" is a later systematisation of the gochara rules, not a
  BPHS chapter `[std]`: explain it as a slower, effort-heavy stretch, mainly
  for energy, money pressure and mood; it does **not** stop marriage,
  children, jobs or studies (the engine applies it only to health, money,
  legal and general).
- **KP (optional cross-check)** `[missing]`: the cuspal sub-lord of the
  topic's cusp (Placidus) must signify the topic's houses; timing in the
  dasha-bhukti-antara of joint significators, transits narrow the month
  (K.S. Krishnamurti, *KP Reader* `[std]`). House groups used by KP
  practitioners: marriage 2-7-11 (1-6-10 obstruct); service / job 2-6-10-11;
  promotion 10-11 (+2, 6); business 7-10-11 (+2); foreign residence
  3-9-12 (+ 12 strong); property / vehicle 4-11-12 (purchase) ; children
  2-5-11; education 4-9-11; litigation win 6-11, loss 5-12; illness 6-8-12,
  recovery 1-5-11; separation 1-6-10-12 `[modern]`, secondary sources
  disagree on several of these, so KP is never the sole basis.
- **Jaimini chara dasha** (KNR, SR) is not used in chat; the Jaimini
  karakas (AmK, DK) are used only as descriptive colour (section 9).
- **Windows, not days.** Life events are given as month-year windows with a
  peak month. Requests for an exact day are narrowed to the peak month and,
  for a chosen action (sign, buy, travel, start work), sent to the Muhurat
  feature. Never "on 14 March".
- **Confidence downgrades** `[have]`: no birth time or place (houses from
  the Moon, dasha balance uncertain), Moon nakshatra uncertain on the birth
  day, lagna within a few minutes of a sign border; `[missing]` D9/D10
  ascendant unstable within ±10 minutes.

