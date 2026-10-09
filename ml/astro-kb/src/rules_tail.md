---

## 7. Where traditions disagree, and the default we choose

| Question | Positions | Default (conservative) |
|---|---|---|
| House system | Whole-sign (Parashari majority, app); Sripati / bhava chalit (equal houses around the lagna degree); Placidus (KP) | Whole-sign. Bhava chalit only as a note when a planet is within ~2° of a sign edge `[missing]`. |
| Ayanamsa | Lahiri (Govt of India, app); KP / Krishnamurti; Raman; Yukteshwar | Lahiri. |
| Nodes | Mean (app) vs true node (differ by up to ~1.5°) | Mean; matters only when a node is near a sign edge. |
| Node aspects | 7th only vs 5th/7th/9th (some readings of BPHS, Sanjay Rath school) | 7th only (engine). |
| Spouse karaka | Venus for a man's wife, Jupiter for a woman's husband (classical) vs both for everyone | Both for everyone; gender-neutral words. |
| Combustion orbs | Saturn 15° vs 16°; retrograde orbs for Mars/Venus vary | Table in 3.5; mention combustion only when clearly inside the orb. |
| Retrograde | Strong (chesta bala, classical) vs "delayed/weak" (popular modern) | Strong but its results come through revisiting; never "bad". |
| Sade sati | Named 7.5-year doom period (popular) vs Saturn gochara from the Moon with mixed, sign-dependent results (classical gochara texts) | Effort-heavy stretch for energy, mood, money; not applied to marriage, children, jobs, studies (engine `saturnHard`). |
| Manglik dosha | Houses 1/2/4/7/8/12 from lagna (some include Moon/Venus), many cancellation rules, some say it ends at 28 | App: lagna/Moon/Venus refs with exemptions and age softening (`ashtakoota.ts`); report only if asked; never fear. |
| Kaal Sarp | Popular modern "dosha" | Not in BPHS/PD/BJ/SAR: do not detect or mention; reassure if the user raises it. |
| D24 mapping | BPHS: odd from Leo, even from Cancer (both forward) vs a reading where even signs go backward | BPHS forward mapping, low weight, only with a reliable birth time. |
| Chara karakas | 7 (Sun-Saturn) vs 8 (adds Rahu, degrees counted backward) | 7-karaka scheme (BPHS ch. on karakas, simpler); Rahu excluded. |
| Gemstones | Popular primary remedy vs classical emphasis on mantra, charity, worship, conduct | Free behavioural remedies only; gemstones informational on request, never recommended to buy. |
| KP significations | Practitioner tables vary (especially divorce, foreign) | KP only as an optional cross-check, never the sole basis. |
| Love vs arranged | Modern 5th-7th link heuristic; no single classical rule | Present as a tendency with reasons. |
| Ashtakoota threshold | 18/36 minimum common; many astrologers weigh 7th house + D9 over the score | Show score + strengths + one area to work on; never "don't marry". |

---

## 8. App capability matrix (what each category needs vs what exists)

> **Baseline.** The capability analysis below is against the committed code
> at `088e949` (branch `improvement`). While this research ran, uncommitted
> work in `utils/agent/` added an answer kind (`timing | choice | nature |
> advice | yesno | why`), asks (`careerField`, `businessVsJob`, `partner`,
> `moneySources`, `studyField`, `relocation`, `strengths`, `wellbeing`,
> `whyNow`), clarification detection, and `utils/agent/astrologer.ts` (house /
> lord / aspect / amatyakaraka scoring with dignity and placement factors,
> rasi chart only). That work partly covers items 1, 2, 4 (in simplified form),
> 5 and 9 of section 10 and the AmK half of 9.10; re-check those rows once it
> lands. Still not covered by it: D9 and other vargas, combustion,
> functional nature, yogas, neecha bhanga, vedha, ashtakavarga, routing to
> compatibility / muhurat / lucky, and the safety extensions.

Legend: H = `[have]`, P = `[partial]`, M = `[missing]`, - = not needed.

| Category | Engine window | Dasha/transit facts | Sade sati | D1 house/lord/dignity | Aspects (p→p) | Combust | Funct. nature | Yogas | D9 | D10/D7/D4/D24/D12 | Ashtakoota | Muhurat/Lucky | Answer-type routing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| career_field | - | P | - | P | M | M | M | M | M | M (D10) | - | - | M |
| job_change_timing | H (job) | H | H | P | - | - | M | - | - | M | - | - | P |
| promotion | H | H | - | P | - | - | M | M | - | M | - | - | P |
| business_vs_job | H (business) | H | - | P | M | - | M | - | - | M | - | - | M |
| government_job | H (job) | H | - | P | - | M | - | M | - | M | - | - | M |
| foreign_settlement | H (foreign) | H | - | P | - | - | - | - | M | M (D4) | - | - | P |
| money_wealth | H (money) | H | H | P | M | - | M | M (dhana) | - | - | - | - | P |
| debt_loans | H (money) | H | H | P | - | - | - | - | - | - | - | - | M |
| property_vehicle | H (property) | H | - | P | - | - | - | - | - | M (D4) | - | H (buy/sign) | P |
| marriage_timing | H (marriage) | H | H | P | M | M | - | - | M | - | H (manglik) | - | P |
| love_vs_arranged | - | - | - | P | M | - | - | - | M | - | - | - | M |
| partner_traits_meeting | - | - | - | P | M | - | - | - | M | - | - | - | M |
| relationship_problems | H (love) | H | - | P | M | - | - | - | M | - | - | - | P |
| divorce_separation | H (legal) | H | - | P | M | - | - | - | M | - | - | - | M |
| compatibility_other_person | - | - | - | P | - | - | - | - | M | - | H | - | M |
| children_timing | H (children) | H | - | P | - | - | - | - | - | M (D7) | - | - | P |
| family_parents_siblings | H (general) | H | H | P | M | - | - | - | - | M (D12) | - | - | M |
| education_field | H (education) | H | - | P | - | M | - | - | - | M (D24) | - | - | M |
| exams_competitive | H (education) | H | - | P | - | - | - | - | - | M (D24) | - | - | P |
| health_wellbeing | H (health) | H | H | P | - | - | - | - | - | - | - | - | P |
| mental_health_distress | H (general) | H | H | P | - | - | - | - | - | - | - | - | M |
| legal_court | H (legal) | H | H | P | - | - | - | - | - | - | - | - | P |
| spirituality_purpose | - | P | - | P | - | - | - | M | M | - | - | - | M |
| personality | - | - | - | H | M | M | M | M | M | - | - | - | M |
| why_now_current_phase | H (general) | P | H | P | - | - | M | - | - | - | - | - | M |
| chart_technical | - | H | H | H | - | M | - | M | - | - | H (manglik) | - | H (deterministic) |
| remedies | - | H | H | P | - | - | M | - | - | - | - | - | M |
| lucky_factors | - | - | - | - | - | - | - | - | - | - | - | H | M |
| muhurat | - | - | - | - | - | - | - | - | - | - | - | H | M |
| general_luck | H (general) | H | H | P | - | - | - | - | - | - | - | - | P |

Safety / situational routes (crisis, baby sex, partner name, death, minors,
elders, other profile, no birth time, past events, exact date) are mostly
`[have]` in `plan.ts` / `reply-guards.ts`; gaps are listed per category above
(divorce mapped to legal only; no counsellor line; no emergency-symptom
route; no identity-attribute guard; no thread-level correction memory).

---

## 9. Missing computations, with formulas

All inputs exist today: sidereal longitudes λ of the nine grahas and the
ascendant degree (`getChartPositions`, `getAscendantDegree`), signs
`s = floor(λ / 30)` (0 = Aries), degree in sign `d = λ mod 30`, the sign
ruler table, `getPlanetDignity`, the natural-friendship table
(`ashtakoota.ts relation()`), `aspects()` and the dasha timeline. Everything
below is pure arithmetic over those, suitable for `utils/` with Node tests.

### 9.1 Divisional charts (BPHS ch. 6 `[text]`)

`odd(s)` means s is 0, 2, 4, … (Aries, Gemini, Leo, …: odd signs in 1-based
counting). `movable` = s mod 3 == 0, `fixed` = 1, `dual` = 2.

| Varga | Part size | Part index k | Varga sign |
|---|---|---|---|
| D9 Navamsa | 3°20′ | `k = floor(d / (10/3))` (0-8) | `floor(λ / (10/3)) mod 12`, identical to BPHS: movable from the sign, fixed from the 9th, dual from the 5th |
| D10 Dasamsa | 3° | `k = floor(d / 3)` | odd: `(s + k) mod 12`; even: `(s + 8 + k) mod 12` (start from the 9th) |
| D7 Saptamsa | 4°17′8.6″ | `k = floor(d / (30/7))` | odd: `(s + k) mod 12`; even: `(s + 6 + k) mod 12` (start from the 7th) |
| D4 Chaturthamsa | 7°30′ | `k = floor(d / 7.5)` (0-3) | `(s + 3k) mod 12` (the sign, then its 4th, 7th, 10th) |
| D12 Dvadasamsa | 2°30′ | `k = floor(d / 2.5)` | `(s + k) mod 12` |
| D24 Siddhamsa | 1°15′ | `k = floor(d / 1.25)` (0-23) | odd: `(4 + k) mod 12` (from Leo); even: `(3 + k) mod 12` (from Cancer) |
| D3 Drekkana | 10° | `k = floor(d / 10)` | `(s + 4k) mod 12` (sign, 5th, 9th) |
| D2 Hora (Parashari) | 15° | `k = floor(d / 15)` | odd: k=0 → Sun (Leo), k=1 → Moon (Cancer); even: reversed |

The varga **ascendant** uses the same formula on the ascendant degree.
Stability flag: recompute with the birth time ±5 and ±10 minutes; if the
varga lagna changes, mark that varga `unstable` and do not use its houses
(D9 lagna changes about every 13 minutes on average, D10 every 12, D24
every 5). Vargottama: `D9 sign == D1 sign`.

### 9.2 Combustion

`sep = angleDiff(λ_planet, λ_Sun)` (`utils/ephemeris.ts angleDiff`, 0-180).
Combust if `sep < orb`: Moon 12, Mars 17, Mercury 14 (12 if retrograde),
Jupiter 11, Venus 10 (8 if retrograde), Saturn 15. Nodes are never combust.
Output `{combust: boolean, sep}`; for Mercury, only surface it when sep < 3.

### 9.3 Dignity extension

- Moolatrikona ranges (table 3.2) checked before own sign.
- Natural relation of planet P to the lord L of the sign it occupies:
  friend / neutral / enemy (table 3.2).
- Temporary relation: L sits 2, 3, 4, 10, 11 or 12 signs from P → temporary
  friend, else enemy.
- Compound: friend+friend = great friend; friend+enemy or neutral+... per BPHS
  (great friend, friend, neutral, enemy, great enemy).
- Score map for the strength composite: exalted 5, moolatrikona 4, own 4, great
  friend 3, friend 2, neutral 1, enemy 0, great enemy -1, debilitated -2
  (neecha bhanga → treat as neutral 1).

### 9.4 Functional nature per lagna

For lagna sign `L`: for each planet, the houses it rules `H = {h : ruler((L + h - 1) mod 12) == planet}`.
- `trikona = H ∩ {1, 5, 9}`, `kendra = H ∩ {1, 4, 7, 10}`, `bad = H ∩ {3, 6, 8, 11}`.
- yogakaraka: `kendra ≠ ∅ and (H ∩ {5, 9}) ≠ ∅`.
- functional benefic: `trikona ≠ ∅` (and not only the 1st paired with 8th unless it is the lagna lord), functional malefic: `bad ≠ ∅ and trikona = ∅`.
- kendradhipati: natural benefic (Jupiter, Venus, Mercury, waxing Moon) owning only kendras → neutral.
- Sun and Moon own one sign each; Rahu/Ketu take their dispositor's nature.
This reproduces the table in 3.3; ship it as a computed table with tests.

### 9.5 Composite planet strength (shadbala proxy)

`strength(P) = dignityScore (9.3)`
`+ 2 if house in {1, 4, 7, 10}, + 1.5 if in {5, 9}, + 1 if in {11}, − 1.5 if in {6, 8, 12}` (Rahu/Ketu/Saturn/Mars in 3/6/11: +1 instead)
`+ 1 if dig bala house (Jupiter/Mercury 1, Sun/Mars 10, Saturn 7, Moon/Venus 4)`
`+ 1 if vargottama, + D9 dignityScore × 0.5`
`− 2 if combust (Mercury: −0.5)`
`+ 0.5 per benefic aspect/conjunction (Jupiter, Venus, well-placed Mercury, Moon waxing), − 0.5 per malefic one (Saturn, Mars, Rahu, Ketu, Sun)`
`+ 0.5 if retrograde (not Sun/Moon/nodes)`.
Rank planets; the top 2 drive personality, career fields and "strongest
area" phrasing. Full Shadbala (BPHS: sthana, dig, kala, chesta, naisargika,
drik) can replace this later; it needs exact speeds, day/night, hora lords.

### 9.6 Planet-to-planet aspects and conjunctions

`conj(A,B) = s_A == s_B`; `aspects(A → B) = aspects(A, s_A, s_B)` with the
existing whole-sign rule; mutual aspect = both directions. Output a list per
planet: `{conjunct: [...], aspectedBy: [...], aspects: [...]}`. Needed by
yogas, affliction summaries (7th, 10th, Moon), relationship_problems.

### 9.7 Yoga detectors (definitions in 3.9)

- Gajakesari: `house(s_Jupiter from s_Moon) ∈ {1,4,7,10}` and Jupiter not debilitated and not combust.
- Pancha Mahapurusha: P ∈ {Mars, Mercury, Jupiter, Venus, Saturn}, `dignity ∈ {own, exalted}`, `house from lagna ∈ {1,4,7,10}` (also report from the Moon as secondary).
- Raja yoga: for kendra lords K and trikona lords T (K ≠ T): conj or mutual aspect or exchange (`s_K` ruled by T and `s_T` ruled by K); or a yogakaraka in a kendra/trikona.
- Dhana yoga: lords of {2, 11} associated (conj / mutual aspect / exchange) with lords of {1, 5, 9}.
- Viparita raja yoga: lord of 6, 8 or 12 placed in 6, 8 or 12.
- Parivartana: `ruler(s_A) == B and ruler(s_B) == A`.
- Neecha bhanga: P debilitated and any of: `ruler(s_P)` in a kendra from lagna or Moon; the planet that is exalted in `s_P` in a kendra from lagna or Moon; the ruler of P's exaltation sign in a kendra from lagna or Moon; P conjunct or aspected by `ruler(s_P)`; P exalted in D9.
- Kemadruma (internal only): no planet other than Sun/Rahu/Ketu in the 2nd or 12th from the Moon, and none in a kendra from the Moon or lagna.
Output with strength (both planets' composite strength) so weak yogas are not
mentioned.

### 9.8 Career-field resolver (Brihat Jataka 10.1, PD ch. 5)

1. References R = {lagna, Moon, Sun} (lagna only with a birth time).
2. For each r: `t = 10th sign from r`, candidates = planets in t, `lord(t)`,
   `lord(D9 sign of lord(t))` (the BJ navamsa rule).
3. Score each candidate by composite strength (9.5) + 1 per reference it wins.
4. Top 2 planets → `field_map` (career_field rules) + element of the 10th
   sign; amatyakaraka (9.10) as a tie-breaker.
5. Leaning for job vs business: compare `strength(lord 6) + occupants(6)` vs
   `strength(lord 7) + strength(lord 3) + strength(Mercury)`.

### 9.9 Partner and meeting facts

- Traits: sign of the 7th (element/modality), occupants of the 7th, sign and
  dignity of the 7th lord, Venus and Jupiter condition, D9 7th sign.
- Meeting context: house of the 7th lord from lagna → `meeting_map`
  (partner_traits_meeting).
- Love-vs-arranged signals (modern): `link(lord5, lord7)` (conj / mutual
  aspect / exchange / one in the other's house), Venus with lord5, Rahu in 5
  or 7, versus `link(lord7, lord9)` or Jupiter aspecting the 7th.

### 9.10 Chara karakas (Jaimini, 7-karaka)

Sort Sun…Saturn by `d` (degree within sign) descending: AK (atmakaraka),
AmK (amatyakaraka), BK, MK, PiK (some swap with MK), PK (putrakaraka),
GK (gnatikaraka), DK (darakaraka, the lowest). Ties: the rarer planet by
speed order first (rare; flag). Karakamsa = D9 sign of AK.
Arudha lagna: `n = houses from lagna to lord(lagna)`; `AL = n-th house from
the lord`; if AL falls in the 1st or 7th from the lagna, take the 10th from
that. Upapada (UL) = arudha of the 12th house by the same rule.

### 9.11 Current-phase facts (for "why is this happening")

For the running maha (M) and antar (A) lords, from lagna and from the Moon:
`owns(M), owns(A)`, `house(M), house(A)`, functional nature (9.4), dignity,
combust, relation `house(s_A from s_M)` (6/8 → friction, 2/12 → cost, 1/5/9/4/10/7
→ cooperation), end date of A, next A lord and its link to the asked topic.
Plus `getSadeSati` status and the nearest Saturn/Jupiter/Rahu sign changes
(already in context). Emit as 2-3 plain sentences for the plan.

### 9.12 Gochara vedha and other planets

Transit house from the Moon for all nine planets; vedha pairs (section 4):
a good transit of Jupiter (2, 5, 7, 9, 11) is blocked when any planet except
the Moon-Mercury / Sun-Saturn exceptions occupies the paired vedha house (12,
4, 3, 10, 8); Saturn's good houses 3, 6, 11 pair with 12, 9, 5. Monthly
Sun/Mars/Venus/Mercury transits for "this month" questions.

### 9.13 Ashtakavarga (SAV)

Per BPHS's ashtakavarga chapter: for each of the seven planets and the lagna,
benefic points (bindus) are contributed to signs counted from each
contributor's position by fixed tables (e.g. Sun's BAV: from the Sun 1, 2, 4,
7, 8, 9, 10, 11; from the Moon 3, 6, 10, 11; …). Sum the seven BAVs into SAV
(total 337). Transit rule: Saturn/Jupiter through a sign with SAV ≥ 28 gives
better results, ≤ 25 weaker `[std]`. Ship the tables from a verified
translation with unit tests against a known chart (Jagannatha Hora output).

### 9.14 Muhurat personalisation

Tara bala: `t = ((nak_day − nak_birth + 27) mod 27) mod 9 + 1`; taras 3
(Vipat), 5 (Pratyak), 7 (Naidhana) avoid, 2, 4, 6, 8, 9 good. Chandra bala:
transit Moon in 1, 3, 6, 7, 10, 11 from the natal Moon good; 4, 8, 12 avoid.
Add to `evaluateDay` when a profile is present.

### 9.15 KP layer (optional, heavy)

Placidus cusps (needs latitude and sidereal time; KP ayanamsa), star lord =
nakshatra lord of the cusp/planet, sub lord = Vimshottari-proportional
subdivision of the nakshatra (13°20′ × years/120), significators in four
levels (planets in the star of occupants, occupants, planets in the star of
the owner, the owner). Use only as a cross-check.

---

## 10. Top 15 missing capabilities, ranked by impact on chat quality

| # | Capability | Why it matters | Effort |
|---|---|---|---|
| 1 | **Answer-type + sub-category routing** in `intent.ts` (which / why / how / yes_no / what-now; categories career_field, family, personality, spirituality, remedies, lucky, muhurat, compatibility, divorce, distress, off-topic, thanks) | Today only `timing` is detected, so "which domain?" and "why?" get a timing answer or a repeat: the most visible failure. | M |
| 2 | **Career-field resolver** (9.8) + field map | "Which career suits me" is the top question class; no field logic in chat today. Needs 4, 5, 6. | M |
| 3 | **Navamsa D9** + vargottama + stability flag (9.1) | Confirms every promise; marriage's main varga; feeds BJ 10.1. Pure arithmetic. | S |
| 4 | **Composite planet strength** (9.3, 9.5) | Every "strongest/weakest" sentence and every ranking depends on it; now only 4-level dignity. | M |
| 5 | **Current-phase facts** (9.11) | "Why is this happening / bad time" answers are vague without the dasha lords' houses and maha-antar relation. | S |
| 6 | **No-repeat memory + follow-up plans** (pass previous answer's plan: window, fields, reasons; forbid restating) | Repetition is the second most visible failure in multi-turn chats. | S |
| 7 | **Functional benefic/malefic + yogakaraka** (9.4) | Correct reading of dashas ("good period of X") hinges on lordship, not natural nature. | S |
| 8 | **Combustion** (9.2) | Common, cheap, changes strength verdicts (Venus/Jupiter combust). | S |
| 9 | **Partner traits + meeting context + love/arranged signals** (9.9) | High-volume relationship questions currently get only timing. | S |
| 10 | **Planet-to-planet aspects/conjunctions** (9.6) | Input for yogas and affliction summaries; small extension of `aspects()`. | S |
| 11 | **Conservative yoga detection** (9.7) | Gives the chat specific, positive, verifiable statements; replaces model-invented yogas. | M |
| 12 | **Chat routes to existing features**: compatibility (ashtakoota), muhurat, lucky values, sade sati / manglik facts | The data exists; the chat answers these from the model instead. | S |
| 13 | **Safety extensions**: divorce → relationship+legal with counsellor line; emergency symptoms → 112; identity-attribute guard; distress → counsellor line; thread-level corrections ("already married") | Closes the remaining ethical gaps listed per category. | S |
| 14 | **D10 / D7 / D4 / D24 / D12** with stability flags (9.1) | Refines career, children, property, education, parents, but only for reliable birth times. | S |
| 15 | **Gochara vedha + Ashtakavarga SAV** (9.12, 9.13) | Better transit quality in the timing engine; larger tables and testing. | L |

Next in line: chara karakas / arudha / upapada (9.10), muhurat
personalisation (9.14), KP layer (9.15), birth-time rectification from past
events.

### 10.1 Intent-layer gaps found in `utils/agent/intent.ts`

- `Intent` has `timing` but no answer type, so "which", "why", "how", "what
  should I do" fall through to timing or free text.
- No topics for family / parents / siblings, personality, spirituality,
  remedies, lucky, muhurat, compatibility, off-topic, gratitude, frustration.
- "divorce", "talaq" score as **legal** only; a divorce question needs the
  relationship sensitivity rules plus the lawyer line.
- `career` weighs 1.5 for `job`, so "which career suits me" becomes a job
  **timing** plan when any timing cue appears; the field question is lost.
- `alreadyHave` works only within one message; "but I'm already married" in
  a follow-up re-classifies as marriage (the word "married") instead of
  re-routing.
- Muhurat phrasing ("shubh muhurat", "good date to sign") classifies as the
  life topic (property / job) and returns a natal window instead of muhurat
  days.
- "Will my visa get approved" is `foreign` timing; fine, but needs the yes/no
  framing and the "documents decide" line.

---

## 11. Sources

Classical (verify verse numbers against your edition before quoting):

- **BPHS**: Brihat Parashara Hora Shastra, tr. R. Santhanam (Ranjan, 1984), 2 vols. Ch. 6 (Shodasavargas) checked verse-by-verse at [enjoylearningsanskrit.com/scriptures/parashara/chapter-6](https://enjoylearningsanskrit.com/scriptures/parashara/chapter-6) `[text]`: D7 v.10, D9 v.12, D10 v.13-14, D12 v.15, D24 v.22-23, D4 v.9. Gajakesari in ch. 36 ([chapter-36](https://enjoylearningsanskrit.com/scriptures/parashara/chapter-36)) `[text]`. Bhava effects, dasha effects, raja/dhana yogas, ashtakavarga, remedial chapters `[std]`. Varga significations summary: [Wikipedia, Varga (astrology)](https://en.wikipedia.org/wiki/Varga_(astrology)).
- **BJ**: Varahamihira, Brihat Jataka, tr. N. Chidambaram Iyer (1885) / B. Suryanarain Rao; ch. 10 (Karmajiva: profession from the 10th from lagna/Moon/Sun, its lord, and the navamsa lord of the 10th lord) `[std]`, summary at [Wikipedia, Karmasthana](https://en.wikipedia.org/wiki/Karmasthana_(astrology)).
- **PD**: Mantreswara, Phaladeepika, tr. V. Subrahmanya Sastri / G.S. Kapoor; ch. 5 (livelihood), ch. 6-7 (yogas, raja yogas incl. neecha bhanga), ch. 10 (spouse), ch. 12 (children), ch. 26 (gochara) `[std]`.
- **SAR**: Kalyana Varma, Saravali, tr. R. Santhanam; house and planet-in-sign results `[std]`.
- **JP**: Vaidyanatha Dikshita, Jataka Parijata; XI.18 on the 10th lord (via [Wikipedia, Karmasthana](https://en.wikipedia.org/wiki/Karmasthana_(astrology))) `[std]`.
- **UK**: Kalidasa, Uttara Kalamrita, tr. P.S. Sastri; khanda 5 karakatwa (house and planet significations) `[std]`.
- Surya Siddhanta combustion orbs as tabulated by [Drik Panchang (Mercury asta)](https://www.drikpanchang.com:443/planet/asta/budha-asta-date-time.html) and [Vedicmarga](https://vedicmarga.com/combust-planets-in-transit/) `[std]`.

Modern:

- **HJH**: B.V. Raman, *How to Judge a Horoscope*, vols. 1-2 (Motilal Banarsidass), house-lord-karaka method, 10th house as "the pivot" ([MLBD listing](https://www.mlbd.com/products/how-to-judge-a-horoscope-vol-2-raman-b-v-hb-mlbd-publications)); also *Three Hundred Important Combinations* (yogas) `[std]`.
- **KNR**: K.N. Rao, *Timing Events through Vimshottari Dasha*, *Planets and Children*, *Astrology, Destiny and the Wheel of Time* (Vani); double-transit practice `[std]`; marriage-timing application in [Timing of Marriage with Tested Techniques](https://www.exoticindia.com/book/details/timing-of-marriage-with-tested-techniques-nao509).
- **SR**: Sanjay Rath, *Jaimini Maharishi's Upadesa Sutras* ([Bagchee](https://www.bagchee.com/books/BB108191/jaimini-maharishis-upadesa-sutras)), *Vedic Remedies in Astrology* ([Exotic India](https://www.exoticindiaart.com/book/details/vedic-remedies-in-astrology-IDJ596/)), *Crux of Vedic Astrology* `[std]`. Chara karaka overview: [Wikipedia, Atmakaraka](https://en.wikipedia.org/wiki/Atmakaraka).
- **KP**: K.S. Krishnamurti, *KP Reader* I-VI; house groups summarised from practitioner sources ([dekhopanchang KP system](https://dekhopanchang.com/en/learn/kp-system), [roxyapi KP guide](https://roxyapi.com/blogs/kp-astrology-krishnamurti-paddhati-sub-lord-horary-guide)) `[modern]`, inconsistent between sources.
- Divisional-chart practice notes: [Jagannatha Hora D10 guide](https://jagannathhora.com/?p=2709) `[modern]`.

Ethics and law:

- **NCGR** (National Council for Geocosmic Research) code of ethics: avoid statements that cause fear, including predicting death; qualify predictions; quoted at [Beliefnet, Astrological Musings](https://www.beliefnet.com/columnists/astrologicalmusings/?p=1006) (secondary; check ncgr.org) `[std]`. Practitioner guidance on medical disclaimers: [Jagannatha Hora, ethical boundaries in medical astrology](https://jagannathhora.com/?p=440) `[modern]`.
- **DMR**: Drugs and Magic Remedies (Objectionable Advertisements) Act, 1954: "magic remedy" includes talismans, mantras, kavachas and charms claimed to diagnose, cure or prevent disease ([India Code](https://www.indiacode.nic.in/indiacode/handle/123456789/1412), [Wikipedia](https://en.wikipedia.org/wiki/Drugs_and_Magic_Remedies_(Objectionable_Advertisements)_Act,_1954)) `[text]`.
- **PCPNDT**: Pre-Conception and Pre-Natal Diagnostic Techniques (Prohibition of Sex Selection) Act, 1994: prohibits determination and communication of foetal sex `[std]`.
- **Tele-MANAS**: Government of India mental-health helpline 14416 (already in `chat:safety.crisis`); emergency 112; women's helpline 181.
