# Saga v2 data run (context v2, prompt v4): commands

Step 1 ran on 2026-10-04 (3000 profiles); step 3 started 2026-10-04. TS commands run from the repo root; Python commands run from `ml/`.

```sh
# 0. One date for everything. gen_profiles.ts writes it into every row as "today",
#    and generate.py uses that for the teacher's "Today:" line, the age and each record's "today".
TODAY=2026-10-04   # the date used for profiles_v2.jsonl

# 1. Profiles in context v2 (the default), dated $TODAY. Use a new file: data/profiles.jsonl
#    holds the v1 profiles that the older raw records point to.
npx tsx --tsconfig ml/data/tsconfig.json ml/data/gen_profiles.ts 3000 ml/data/profiles_v2.jsonl 42 $TODAY --context-version 2

# 2. Check the gate first (≈110–170 teacher calls).
npx tsx --tsconfig ml/data/tsconfig.json ml/data/gen_eval_profiles.ts ml/data/eval_profiles_spec.json /tmp/eval_profiles.jsonl $TODAY
.venv/bin/python data/eval_saga.py run --profiles /tmp/eval_profiles.jsonl --out /tmp/eval.jsonl --max-calls 170 --lang-temp

# 3. Teacher answers: one detached run for all three languages, sharing one teacher
#    (one --rpm budget). Krishna is not regenerated (--mix krishna=0): its student prompt
#    ([krishna] + Lang + Name + Verse) doesn't contain the chart context, so the v3 Krishna
#    answers are reused in step 5. Bengali runs 1.7x the n you give (LANG_OVERSAMPLE).
#    Teacher-only per-call notes: minors asking about marriage/love (no romance timing) and
#    hi/bn users writing Hinglish/Banglish or तुम/তুমি (always आप/আপনি).
#    Every Saga/off-topic/title turn is repaired + validated at generation time and re-asked up to
#    2 times with a teacher-only fix note (VAL_RETRIES); a later multi-turn turn that still fails is
#    cut off (record keeps its passing turns), a failing first turn is written with val_ok=false and
#    build_sft drops it. Records written before this (no val_ok marks) were pruned with
#    `generate.py prune --files ...` (.bak kept) so the resume regenerates the failing ones.
#    Each pass resumes the files; failed calls (after ~6.5 min of 429/5xx backoff) are not
#    written, so the next pass generates them. Rerun the same command after a crash.
cd ml && nohup caffeinate -dimsu sh -c 'for pass in 1 2 3 4; do echo "=== pass $pass $(date)"; .venv/bin/python -u data/generate.py bulk --profiles data/profiles_v2.jsonl --mix krishna=0 --concurrency 12 --rpm 38 --job en:8500:41:data/raw/answers_v4_en.jsonl --job hi:3700:42:data/raw/answers_v4_hi.jsonl --job bn:1780:43:data/raw/answers_v4_bn.jsonl; done; echo "=== all passes finished $(date)"' > out/gen_v3.log 2>&1 &

# 3b. Date-varied English profiles + answers (2026-10-06). profiles_v2.jsonl shares one today, so every
#    v2 context carries the same transit dates and 17–28% of kept answers say "Oct 2026"; the student could
#    memorise dates instead of copying them. profiles_v2_dates.jsonl: 3000 profiles (ids d00000…, seed 44,
#    same diversity mix as profiles_v2), each with its own today drawn from 2025-01-01..2029-12-31; context,
#    Age line, transits, timing and the reading's dasha all use the row's date. Teacher: Nemotron 3 Super at
#    --rpm 30 (the hi/bn Ultra job above runs at --rpm 8; the key's limit is 40 rpm). Seed 44 gives ids a44_…,
#    which don't collide with answers_v4_en.jsonl (a41_…).
npx tsx --tsconfig ml/data/tsconfig.json ml/data/gen_profiles.ts 3000 ml/data/profiles_v2_dates.jsonl 44 --context-version 2 --today-range 2025-01-01:2029-12-31 --id-prefix d
cd ml && nohup caffeinate -dimsu sh -c 'for pass in 1 2 3 4; do echo "=== pass $pass $(date)"; .venv/bin/python -u data/generate.py bulk --model nvidia/nemotron-3-super-120b-a12b --profiles data/profiles_v2_dates.jsonl --mix krishna=0 --concurrency 6 --rpm 30 --job en:3000:44:data/raw/answers_v4_en_dates.jsonl; done; echo "=== all passes finished $(date)"' > out/gen_v3_en_dates.log 2>&1 &

# 4. Progress (records per language/task, script drops, validator pass rate on the latest
#    records, records/min, teacher calls, ETA). No API calls.
.venv/bin/python data/generate.py progress --files data/raw/answers_v4_{en,hi,bn}.jsonl --logs out/gen_v3.log
.venv/bin/python data/generate.py progress --files data/raw/answers_v4_en_dates.jsonl --logs out/gen_v3_en_dates.log
#    Spot-check one file (pass rates and failing examples):
.venv/bin/python data/validate_answer.py --raw data/raw/answers_v4_bn.jsonl --profiles data/profiles_v2.jsonl

# 5. SFT set: the v4 files, plus only the Krishna records of the v3 raw files (--reuse,
#    --reuse-tasks defaults to krishna; en 1667 / hi 409 / bn 371 kept). The v1-context Saga
#    records are not used. --max-tokens defaults to 260, the app's v2 reply cap.
#    Each record names its profiles file (profiles_file), so v2 and dated records mix freely.
#    --date-share-cap (default 0.06): no month-year may appear in more than 6% of a language's kept
#    saga + saga_multi examples; excess v4 examples are dropped at random (seeded), reported as
#    date_share_cap with the top month-year shares before -> after. Per language: '0.06,hi=0.15,bn=0.15'.
.venv/bin/python data/build_sft.py --raw data/raw/answers_v4_en.jsonl data/raw/answers_v4_en_dates.jsonl data/raw/answers_v4_hi.jsonl data/raw/answers_v4_bn.jsonl --reuse data/raw/answers.jsonl data/raw/answers_ml.jsonl data/raw/pilot_ml.jsonl data/raw/pilot_ml2.jsonl --date-share-cap 0.06,hi=0.12,bn=0.12 --out data/sft_v2   # cap agreed 2026-10-06: en 6%, hi/bn 12%

# 6. Train. train_gemma.py --max-length defaults to 2048, so prompts of ≈650 tokens plus up to 3 turns fit.
.venv/bin/python scripts/prep_colab_gemma.py --data data/sft_v2      # then upload the folder and paste colab_cell.py

# 7. Export with a 2048-token window (export_gemma.sh CTX defaults to 2048).
scripts/export_astro_gemma.sh <hf_dir> astro_gemma_v2

# 7b. Date-generalisation eval (after training): ~30 timing questions x en/hi/bn x 2 dates (180 items,
#    data/eval_dates.json) on the eval spec profiles dated 2027-06-15 and 2028-03-15
#    (data/eval_dates_profiles.jsonl). Every month-year in an answer must exist in that profile's
#    context/timing; reports % of answers with invented / stale dates, the v2 shared dates
#    (Oct 2026, Dec 2026, Jun 2027, ...) and validate_answer.check_dates failures, per language and date.
#    Rebuild the profiles (only if the chart code changes):
#      npx tsx --tsconfig ml/data/tsconfig.json ml/data/gen_eval_profiles.ts ml/data/eval_profiles_spec.json /tmp/ed1.jsonl 2027-06-15 --id-suffix _2706
#      npx tsx --tsconfig ml/data/tsconfig.json ml/data/gen_eval_profiles.ts ml/data/eval_profiles_spec.json /tmp/ed2.jsonl 2028-03-15 --id-suffix _2803
#      cat /tmp/ed1.jsonl /tmp/ed2.jsonl > ml/data/eval_dates_profiles.jsonl
.venv/bin/python scripts/eval_dates.py generate --hf <hf_dir> --out out/eval_dates_v2.jsonl            # greedy, HF fp32
.venv/bin/python scripts/eval_dates.py generate --hf <hf_dir> --pte out/astro_gemma_v2.pte --out out/eval_dates_v2_pte.jsonl  # optional
.venv/bin/python scripts/eval_dates.py score --answers out/eval_dates_v2.jsonl --show 8
#    (Other runners: `eval_dates.py prompts --out p.jsonl`, generate, then score a jsonl of {id, answer}.)

# 8. App: ship the new .pte and tokenizer, bump MODEL_VERSION, and set CONTEXT_VERSION = 2 in
#    utils/local-llm.ts, all together. That switches the context to v2, replies to 260 tokens and
#    history trimming to a 2048-token budget.
```

## Shipped v2 (2026-10-06)

- **Model:** `ml/out/astro_gemma_v2_8da8w.pte` → `assets/model/astro-gemma.pte`. md5 `0a88b9114ecf7d3bb09284e1c6cc9e7c`, 195,659,264 B (186.6 MiB). 8da8w, `get_max_context_len` 2048, `get_max_seq_len` 511 (prefill chunk; react-native-executorch 0.10.4 prefills longer prompts in 511-token chunks).
- **Tokenizer:** unchanged (`assets/model/astro-gemma-tokenizer.json`, same vocab as v2's).
- **v1 backup:** `ml/out/astro_gemma_v1_8da8w.pte` (md5 `d3167033c7548fb4f161d5db3b65d521`, identical to the previously bundled file). Roll back = copy it back, `MODEL_VERSION = 'astro-gemma-v1'`, `CONTEXT_VERSION = 1`.
- **utils/local-llm.ts:** `MODEL_VERSION = 'astro-gemma-v2'` (Android re-copies the model), `CONTEXT_VERSION = 2` → v2 chart context, reply cap 260, `CONTEXT_WINDOW` 2048, budget-aware Saga history.
- **App guards (CONTEXT_VERSION 2 only; utils/reply-guards.ts):** follow-up repetition retry (4-gram/sentence overlap ≥ 0.5 with the previous answer → one retry at T=0.6), hi/bn script retry (< 40% native letters), Bengali reading seeded with `SUN: স্বভাবে ` (retry `SUN: তিনি `, Hindi retry `SUN: स्वभाव से `, then English fallback), canned greeting for pure greetings (`chat:greeting.*`). Chart-reading cache key bumped to `chart_reading_v3_*` so v1 readings regenerate.
- Eval: scratchpad `v2-eval.md`. Next data pass: Bengali readings (~400+), Hinglish/Banglish questions with native answers, follow-ups that need new content, short greetings.

## v2.1 (prompt v5: plain answers + follow-up chips) — LEAN run started 2026-10-06

Why: user feedback on v2 — replies read like a chart dump ("your Moon sits in Aquarius in the partnership house … its ruler Saturn in your career house … the Jupiter chapter runs until March 2031"); follow-ups repeat the previous answer; no suggestion chips. v5 answers lead with the human meaning: at most one chart fact said as everyday meaning, no sign names, no house names (in any words: "work area", "… वाले हिस्से", "… জায়গায়"), no ruler/lord, no period labels (stretch, chapter, "Jupiter period", गुरु का दौर, বৃহস্পতির পর্ব), at most one planet name, a concrete month-year for "when", and a different date for a "when exactly?" follow-up.

What changed in code (no API needed to review):
- `teacher_prompts.py`: `SAGA_SYSTEM_V5`, `LANG_RULES_V5` (hi/bn), `FOLLOWUPS_SYSTEM` + `FOLLOWUPS_LANG_RULE`, `saga_prompts(version)`. v4 prompts untouched.
- `generate.py`: `--prompt-version 5` (default; `4` or `SAGA_PROMPT_VERSION=4` rebuilds v4). A file is never resumed with a different prompt version. v5-only draws (v4 resumes stay identical): 35% of saga/saga_multi records also get 3 follow-up chips (`rec["followups"]`, validated + up to 2 re-asks); hi/bn: 15% of conversations typed in Latin letters (Hinglish/Banglish banks, answered in native script); 35% of off-topic records are bare greetings. `questions --latin` builds the Hinglish/Banglish bank (hi falls back to `raw/questions_hinglish.jsonl`).
- `validate_answer.py`: `validate(..., style="v5")` = every v4 check + `check_plain_v5` (jargon_v5_sign / house / ruler / period_label / planets, behav_when_no_date, behav_followup_same_date, behav_copies_example) + 90-word cap + next month is not a free date. `validate_followups()` (exactly 3 lines, ≤ 8 words (hi 9), "?", script, no astro words, no death/name/baby-sex/remedy topics, no "your", not a repeat of an asked question incl. Hinglish/Banglish ↔ native via consonant skeletons, no duplicates, dates only from the conversation). `plain_stats()` counts chart talk for any answer. `--selftest` covers both.
- `build_sft.py`: v5 records validated with style v5; `rec["followups"]` becomes a `followups` example: system `[followups]` (+ `Lang: xx`), user = `User: …\nAssistant: …` per turn (same wrapper as `[title]`), model = exactly 3 lines. The app will need the same prompt and a 3-line parser (not done: no app changes in this step).
- `eval_saga.py`: `--prompt-version`, `--lang`; records carry `prompt_version` and are revalidated with the matching style.

Sample gate (2026-10-06; scratchpad `v21-samples.md`): after bulk-style retries v5 passes the v5 rules at en 17/17, hi 12/16, bn 14/16 (first try 71% / 69% / 33%); v4 answers to the same questions pass 1/43 under v5 rules (≈4 chart-jargon terms and ≈3.7 planet names per answer). v4 raw data under v5 rules: saga/saga_multi/title 0–1%, offtopic 15–24%. So v4 Saga-family data can't be mixed in: it is exactly the style being removed.

### Recommendation
Regenerate the whole Saga family (saga, saga_multi, offtopic/greetings) in v5; add follow-up chips; reuse what doesn't depend on the answer style:
- **Reuse:** Krishna (v3, as in v2), readings en/hi (v4 + v3), titles (v4; the title is a 2–4-word label, its input being a v4-style answer is a small shift — optionally regenerate en titles from v5 turns with Super, cheap).
- **New:** bn readings ×450 (Ultra; the v2 model answered bn readings in English 9–11/12), Banglish question bank, hi/bn greeting banks.
- **Do not mix** v4 saga/saga_multi/offtopic into v2.1 SFT.

### Counts and teachers (raw records; kept ≈ 90% en/hi, ≈ 80% bn)

| job | teacher | records | mix | ≈ teacher calls |
|---|---|---|---|---|
| en | Nemotron 3 Super (`--rpm 30`) | 6,000 on `profiles_v2_dates.jsonl` (dated 2025–2029) | saga .45, saga_multi .42, offtopic .08 (35% greetings), title .05 | ≈ 14k (≈ 1.35 calls/turn at 71% first pass + ≈ 2,000 chip calls) |
| hi | Nemotron 3 Ultra | 2,000 on `profiles_v2_dates.jsonl` | saga .45, saga_multi .42, offtopic .13; 15% Hinglish | ≈ 5k (1.4 calls/turn) |
| bn | Nemotron 3 Ultra | 2,000 (`--no-oversample`) + 450 readings | as hi; 15% Banglish | ≈ 7.5k (≈ 1.9 calls/turn at 33–40% first pass + script retries) |
| question banks | Ultra | bn `--latin` (≈ 20), hi/bn greetings (2) | | ≈ 25 |

Chips come out at ≈ 0.35 × kept saga-family records: en ≈ 1,900, hi ≈ 600, bn ≈ 550.

### ETA at current NVIDIA rates
- Super: 25–30 calls/min sustained, 0 errors in the sample gate (latency 1.6–3.7 s) → en ≈ 14k calls ≈ **8–10 h**.
- Ultra: the v4 bulk run averaged ≈ 2.6 successful calls/min over 11 h (429/503 on most attempts). In today's gate it was worse: 503 "Service temporarily overloaded" on ≈ 70% of attempts, 6–490 s per successful call including backoff, ≈ 1 call/min with 3 jobs sharing it. hi + bn ≈ 12.5k calls → **≈ 3.3 days at 2.6/min, up to ≈ 8 days at 1/min**. Run hi and bn as one `bulk` (they share the Ultra limit), en in a separate process on Super.
- Lean option if that is too slow: hi 1,200 + bn 1,200 (+ 450 bn readings) ≈ 7.5k Ultra calls ≈ 2 days at 2.6/min. Hindi/Bengali quality with Super is not an option (v4 test: hi 29→51%, bn 17→20% after retries).

### Commands (when approved; nothing below has been run)
```sh
# from ml/; profiles: reuse profiles_v2_dates.jsonl (per-row today 2025..2029) for every language
# 0. question banks (≈ 25 Ultra calls): greetings for hi/bn (only the new categories are generated), Banglish bank
.venv/bin/python data/generate.py questions --lang hi --per-category 60 --model nvidia/nemotron-3-ultra-550b-a55b
.venv/bin/python data/generate.py questions --lang bn --per-category 60 --model nvidia/nemotron-3-ultra-550b-a55b
.venv/bin/python data/generate.py questions --lang bn --latin --per-category 60 --model nvidia/nemotron-3-ultra-550b-a55b
# 1. en on Super
nohup caffeinate -dimsu sh -c 'for pass in 1 2 3; do .venv/bin/python -u data/generate.py bulk --prompt-version 5 --model nvidia/nemotron-3-super-120b-a12b --profiles data/profiles_v2_dates.jsonl --mix saga=0.45,saga_multi=0.42,offtopic=0.08,title=0.05,krishna=0,reading=0 --concurrency 6 --rpm 30 --job en:6000:51:data/raw/answers_v5_en.jsonl; done' > out/gen_v5_en.log 2>&1 &
# 2. hi + bn on Ultra (one process, shared limit); bn readings as their own job (reading-only mix)
nohup caffeinate -dimsu sh -c 'for pass in 1 2 3 4; do .venv/bin/python -u data/generate.py bulk --prompt-version 5 --model nvidia/nemotron-3-ultra-550b-a55b --profiles data/profiles_v2_dates.jsonl --mix saga=0.45,saga_multi=0.42,offtopic=0.13,title=0,krishna=0,reading=0 --no-oversample --concurrency 8 --rpm 8 --job hi:2000:52:data/raw/answers_v5_hi.jsonl --job bn:2000:53:data/raw/answers_v5_bn.jsonl; done' > out/gen_v5_hibn.log 2>&1 &
#    then: bulk --mix saga=0,saga_multi=0,offtopic=0,title=0,krishna=0,reading=1 --job bn:450:54:data/raw/answers_v5_bn_readings.jsonl
# 3. SFT: v5 files + reused Krishna (v3) + readings/titles (v4/v3)
.venv/bin/python data/build_sft.py --raw data/raw/answers_v5_{en,hi,bn}.jsonl data/raw/answers_v5_bn_readings.jsonl --reuse data/raw/answers.jsonl data/raw/answers_ml.jsonl data/raw/pilot_ml.jsonl data/raw/pilot_ml2.jsonl data/raw/answers_v4_en.jsonl data/raw/answers_v4_en_dates.jsonl data/raw/answers_v4_hi.jsonl data/raw/answers_v4_bn.jsonl --reuse-tasks krishna,reading,title --date-share-cap 0.06,hi=0.12,bn=0.12 --out data/sft_v21
```
Open items before bulk: (1) the app side of `[followups]` (prompt + 3-line parse; chips UI) and the v5 reply cap (answers are now ≈ 50–70 words, so 260 tokens is ample); (2) relative-time phrases ("about 1 month from now") are not checked against Today; (3) v4 titles/readings in `--reuse` must be the v4-validated ones (build_sft already applies the v4 checks by their prompt_version).

App side of `[followups]` (prepared, off): `utils/local-llm.ts` `MODEL_FOLLOWUPS = false` — **flip to true when bundling v2.1** (together with MODEL_VERSION; leave false for astro-gemma-v2, which never saw the task). `utils/follow-ups.ts` builds the prompt byte-for-byte as `student_followups_system` + `followups_convo` (last ≤ 3 turns, the reply's language), parses/validates the 3 lines like `validate_followups` (≤ 8 words, hi 9, ≤ 60 chars, "?", script, no astro words, no unsafe topics, no "your", no invented years, not a repeat of an asked question incl. Hinglish/Banglish skeletons, no duplicates); `utils/ai.ts` `suggestFollowUps` runs it at T=0.2, ≤ 48 new tokens (hi/bn 64), only when the model is already loaded. The chat shows rule-based chips at once and swaps in model chips (≥ 2 valid; rule-based chips fill the rest) with a short fade; the user's next message cancels the run; chips are cached per message id (MMKV `followups_v1_<id>`).

### Launched 2026-10-06 (lean option)
Status: `cd ml && .venv/bin/python scripts/gen_status.py --v5` (plain `gen_status.py` still shows the v4 run).
- Banks (Ultra, ≈ 22 calls): `questions --lang hi|bn` added `greeting:greeting`; `questions --lang bn --latin` → `raw/questions_bn_latin.jsonl` (20 entries); `raw/questions_hi_latin.jsonl` = `questions_hinglish.jsonl` minus Krishna, plus `greeting:greeting` from `questions --lang hi --latin`. A few real questions were removed from the generated greeting lists by hand (e.g. 'शादी कब होगी?').
- Profiles: `profiles_v2_dates.jsonl` for every job (per-row today 2025-01-01..2029-12-31, 1,487 distinct; 231 minors, 208 aged 60+, 444 asked about someone else, 592 without birth time, 120 without place, 347 southern hemisphere).
- en: Super, `--rpm 28 --concurrency 6`, mix as in the table (incl. title .05), `--job en:6000:51:data/raw/answers_v5_en.jsonl`, log `out/gen_v5_en.log`, 3 resume passes.
- hi + bn: one Ultra process, `--rpm 7 --concurrency 2 --no-oversample`, mix saga .45 / saga_multi .42 / offtopic .13, `--job hi:1200:52:data/raw/answers_v5_hi.jsonl --job bn:1200:53:data/raw/answers_v5_bn.jsonl`, log `out/gen_v5_hibn.log`, 4 passes.
- bn readings: separate Ultra process, `--rpm 3 --concurrency 1 --no-oversample --mix …reading=1 --job bn:700:54:data/raw/answers_v5_bn_readings.jsonl`, log `out/gen_v5_bn_readings.log`, 4 passes. 700 indices because ≈ 35% are script drops (target ≈ 450 kept). Teacher-only `READING_NAME_RULE` (generate.py): the bn reading prompt asks for the name in Bengali script and a Latin-letter name now fails the script check (re-asked).
- Account budget: 28 + 7 + 3 = 38 rpm. SFT command above: replace `answers_v5_bn_readings.jsonl` with `answers_v5_bn_readings.jsonl`.

### v2.1 build (2026-10-08)
build_sft as above but WITHOUT answers_v4_en_dates.jsonl in --reuse, then en reading/title downsampled (seed 7) to ~800/~950 to keep the v2 task balance: train 12411, val 660 (data/sft_v21). Log: out/build_sft_v21.log.

## Shipped v2.1 (2026-10-08)

- **Model:** `ml/out/astro_gemma_v21_8da8w.pte` → `assets/model/astro-gemma.pte`, and over the prebuilt native copies `ios/astropedia/astro-gemma.pte` and `android/app/src/main/assets/models/astro-gemma.pte`. md5 `1333982650092d4ab2e21c5109276318` (all three checked), 195,659,264 B. Same recipe and metadata as v2: 8da8w, context 2048, prefill chunk 511.
- **Tokenizer:** unchanged (`astro-gemma-tokenizer.json`, md5 `56270e9ef1b419486193829a80f09df3`). Every .pte eval run used this file.
- **utils/local-llm.ts:** `MODEL_VERSION = 'astro-gemma-v21'` (Android re-copies the model), `MODEL_FOLLOWUPS = true` (model-written chips, ≥ 2 valid in 97% of eval runs). `CONTEXT_VERSION` stays 2, reply cap stays 260, `CONTEXT_WINDOW` stays 2048.
- **App guards** (`utils/reply-guards.ts`, wired in `utils/ai.ts`; Saga with CONTEXT_VERSION 2 only):
  - **Canned replies, no model run.**
    - Baby's-sex questions (en/hi/bn and Hinglish/Banglish) get a gentle decline: `chat:safety.childSex`. It says no chart can show this and that sex determination before birth isn't allowed in India.
    - Partner name or initial questions get `chat:safety.partnerName`.
    - Detection is `cannedQuestion`. Questions that only state a name, or that ask "what kind of boy", are not caught.
  - **Countdown strip.** `stripCountdowns` removes clauses like "about N months from now", "यानी करीब N महीने में" and "মানে প্রায় N মাসের মধ্যে" (Western or native digits) and tidies the punctuation. The month-year stays. While streaming, the reply goes through `createSentenceFilter` one sentence at a time, so a countdown is never shown and then removed. A run-on of more than 240 characters is let through early. In the eval this caught 108 of 108.
  - **Health and legal.** If the question is about health or medicine and the reply names no doctor, `chat:safety.doctor` is appended as its own paragraph. A legal question with no lawyer named gets `chat:safety.lawyer`. Detection is `missingAdvice`. On the 101-question set it flags exactly the 6 eval failures.
  - **Current-month guard.** For a timing question (`needsDate`, `today` = the prompt's Today), a reply whose only date is the current month counts as failed (`dateStatus` = 'current'). It is held and retried once at T=0.6. The retry is kept only if it names a later date; otherwise the first reply is shown.
  - **Kept from v2:**
    - repeat retry
    - hi/bn script retry
    - the "when → needs a month or year" check
    - the canned greeting
  - **Reading:** `readingSeed('bn', 0)` = `''` (v2.1 is 12/12 Bengali unseeded). The script check and the retry seeds `SUN: তিনি ` / `SUN: स्वभाव से ` stay. The cache key is bumped to `chart_reading_v4_*` so v2 readings regenerate.
  - **Strings:** `locales/{en,hi,bn}/chat.json` `safety.{childSex,partnerName,doctor,lawyer}`. The key sets are identical across the three languages.
- **Rollback to v2:**
  1. Copy `ml/out/astro_gemma_v2_8da8w.pte` (md5 `0a88b9114ecf7d3bb09284e1c6cc9e7c`) over the three files above.
  2. Set `MODEL_VERSION = 'astro-gemma-v2'` and `MODEL_FOLLOWUPS = false`.

  The guards are harmless with v2. You can optionally set `readingSeed('bn', 0)` back to `'SUN: স্বভাবে '`, since v2 needs it for Bengali readings.
- **Rebuild:** `npx expo run:ios --configuration Release --device` and `npx expo run:android --variant release`. The copies in `ios/` and `android/` are already replaced, so no prebuild is needed. A `yarn clean-prebuild` would copy `assets/model` again via `plugins/with-bundled-model.js`.
- Eval: scratchpad `v21-eval.md`. Still open for v2.2:
  - date collapse onto the nearest transit
  - follow-up repetition
  - Bengali weather fabrication
  - Hindi date attribution
  - a gender line in the reading prompt

## Saga v2.2: timing windows (app side shipped 2026-10-09; data pass not run yet)

**Problem.** v2.1 gave almost every chart the same date: the first transit ingress in the context ("Jupiter … From around Oct 2026 it moves into …"). Every chart with the same `today` shares that line. The fix moved astrology out of the model. `utils/timing-engine.ts` works out the window the way an astrologer does: Vimshottari maha/antar/pratyantar lords tied to the topic's houses and karakas, plus Jupiter/Saturn double transit from the Lagna and the Moon (sources are in the file header). The app pipeline (`utils/agent/`) then feeds that window to the model and checks the reply against it.

**What the app sends now (gemma21 adapter, `TIMING_PROMPT_MODE = 'line-bottom'`).** This applies to a timing question with a life topic (`utils/agent/intent.ts`):
- "Now (sky today)" lines whose ingress month is outside the engine windows (±1 month) lose their dated sentence. Where the planet sits now stays.
- The Timing block gets one more line at the end, in its own grammar: `- Best window for marriage: Mar 2028 to Nov 2028 (peak Jul 2028)`. Topic words come from `gemma21-prompt.ts TOPIC_PHRASE`.
- The verify layer (`utils/agent/verify.ts`) checks each sentence as it streams. If a sentence's dates are outside the windows, or name the current month, the first such sentence is replaced with "The best window for this is …" in en/hi/bn. Any later ones are dropped. A reply with no date gets that sentence appended. The old copied-transit retry is gone.

**Eval** (`ml/scripts/timing_eval`, profiles `ml/data/eval_timing_profiles.jsonl`): 69 timing questions, en/hi/bn rotating, 10 charts, today ∈ {2026-10-09, 2027-04-15, 2027-11-20, 2028-06-10}, `ml/out/astro_gemma_v21_8da8w.pte`. "1st∈top" = the first future month-year in the answer falls inside the engine's best window. "transit" = the answer copies a context ingress month that is outside the windows.

| greedy | 1st∈top | 1st∈any of 3 | current month | Oct 2026 | transit copy | per-chart same date | v5 pass | v4 pass |
|---|---|---|---|---|---|---|---|---|
| baseline (v2.1 as shipped) | 21.7% | 27.5% | 33.3% | 24.6% | 60.9% | 81% | 85.5% | 92.8% |
| filter only | 36.2% | 47.8% | 4.3% | 1.4% | 8.7% | 69% | 88.4% | 92.8% |
| + line at top of Timing | 62.3% | 71.0% | 5.8% | 1.4% | 5.8% | 50% | 84.1% | 85.5% |
| **+ line at bottom (chosen)** | **68.1%** | **75.4%** | 2.9% | 1.4% | 5.8% | 43% | 84.1% | 85.5% |
| chosen + verify layer | 94.2% | **100%** | 0% | 0% | 0% | 39% | 88.4% | 89.9% |
| T=0.3: baseline → chosen → chosen + verify | 21.7 → 66.7 → 94.2% | 30.4 → 75.4 → 100% | 36.2 → 4.3 → 0% | | 60.9 → 4.3 → 0% | 77 → 41 → 38% | 94.2 → 85.5 → 89.9% | |

In the chosen mode the verify sentence was needed in 19 of 69 greedy answers (21 of 69 at T=0.3). Most of the validator drop comes from `date_event_mismatch`: the model ties the window date to Jupiter ("from Apr 2031 Jupiter's support …"). `validate_answer.py` doesn't know the window line. Often the window really does come from a Jupiter transit, but the attribution isn't checked. Teach the student to say "that is the best window" instead of naming a planet for it (see below).

**Data pass for v2.2 (the model should learn the line natively):**
1. Profiles: `gen_profiles.ts … --windows` adds `windows[topic] = {line, context, start, end, peak, strength, confidence, others, nextStrong}` for all 13 engine topics, as of the row's today.
2. Questions: tag each timing question with its engine topic. Either use `utils/agent/intent.ts classifyIntent` (port it, or run it through `npx tsx` over the question bank), or map `questions.py` categories directly. Questions about planets, transits or dashas stay topic-less (topic `chart`): no line, no filter.
3. Student prompt (`build_sft.student_saga_system`): for a tagged timing question, use `windows[topic].context` in place of `context`, and append `windows[topic].line` to `timing`. Keep everything else byte-identical. It must match `utils/agent/adapters/gemma21-prompt.ts sagaSystem(..., mode 'line-bottom')`.
4. Teacher prompt (`teacher_prompts.py`): give the same line and add a rule. When there is a "Best window" line, the timing in the answer is that window (one month-year from it, or "between X and Y"). Say the window is when the life timeline and the slow planets line up for this. Don't credit it to one planet's move. If `strength` is weak, say it's the best of quieter years. If the birth time is unknown, say the dates are approximate. Add the window months to the validator's allowed dates (`parse_context` already reads Timing lines, and `check_date_events` should accept window dates for the topic sentence).
5. Validator: treat `- Best window for …` as its own event ("window") so sentences that use its dates without a planet pass. A sentence that puts a window date on a named planet's move should fail (`date_misattributed`).
6. Mix: about 30% of Saga timing turns should get a line, including "when exactly?" follow-ups (answer: the peak month) and past questions ("did I…": no line; the app answers those from the engine's past windows).
7. Gate before shipping v2.2: re-run `ml/scripts/timing_eval` (first date in the best window ≥ 85% raw, transit copy ≤ 2%, v5 pass ≥ baseline). The app keeps the verify layer either way.

## GURU_CONTEXT_FOCUS eval (2026-10-09): stays off

Focused chart context per guru (AnswerPlan.focus = guru areas + question topic area; `guru` = the
guru's areas alone, identical prompts for 185/189 items) vs the full v2 context, v2.1 `.pte`, greedy,
line-bottom timing line. `ml/scripts/timing_eval/focus_gen.ts` → `run_pte.py` → `focus_score.py`;
validator (`validate_answer.validate`) always against the full context.

| set | variant | n | v5 ok | v4 ok | 1st date in best window | 1st in any window | on-topic |
|---|---|---|---|---|---|---|---|
| timing (69, guru by topic) | full | 69 | 84.1% | 85.5% | 68.1% | 75.4% | 89.9% |
| | focus (plan) | 69 | 87.0% | 87.0% | 73.9% | 79.7% | 91.3% |
| guru, non-timing (40 Qs x en/hi/bn) | full | 120 | 80.8% | 83.3% | – | – | 93.3% |
| | focus (plan) | 120 | 72.5% | 75.8% | – | – | 95.8% |

Guru set by language (v4): en 87.5 → 90.0, hi 85.0 → 72.5, bn 77.5 → 65.0. Extra failures with focus:
script_latin_word 2 → 8, date_event_mismatch 3 → 8, date_misattributed 0 → 3. Per guru (v4): love 100 → 87.5,
health 54.2 → 41.7, family 91.7 → 79.2, career and study unchanged. Decision: OFF (all 189: 84.1% → 79.9% v4);
the small timing gain doesn't matter after the verify layer, which already puts every shown date in a window.

## Saga v2.3: answer types (app side, 2026-10-09)

Bug from a phone (Career guru, en): "Which roles I should apply for?" and then "Like I'm asking which domain?"
got the same reply twice ("…the shift toward a new role begins by October 2026…"). Causes, checked in code:
the intent had no topic for "roles / domain" and no notion of a which / what-kind question, so the plan was
empty and v2.1 copied the shared Jupiter ingress date ("From around Oct 2026") from the context; and the
repeat guard decided on the first 16 words (overlap 0.00 for a fresh opener, 0.76 for the whole reply).

App changes (utils/agent): answer kinds + asks + clarification re-reading (intent.ts); a deterministic
astrologer per ask (astrologer.ts: career field from the 10th, its lord and dispositor, occupants, aspects
and the Jaimini Amatyakaraka; partner from the 7th + Venus; money 2nd/11th; study 4th/5th/9th; strengths;
health habits; abroad vs home; business vs job; why-now from the running dasha and Saturn's transit over the
Moon; no D9/D10); the items on the matching Life areas line (gemma21 `line`) or as instructions (instruct);
templates for every ask in en/hi/bn that never repeat the thread; verify: unasked dates dropped, sentences
already said in any earlier reply dropped, a model reply must keep 2+ sentences and use 2+ item words after
that, else one retry, then the template.

Eval (scratchpad agent/at: eval.ts, score.ts, validate.py; v2.1 .pte, greedy, retry T=0.6): 11
conversations (the report's two turns + 10 three-turn conversations; career domain / roles, clarifications,
business vs job, abroad, partner, money, study, strengths, health habits, why-now) x en/hi/bn on 8 profiles
= 96 turns, run through the real pipeline modules. Baseline = HEAD before this change.

| | baseline | new (line, history kept) |
|---|---|---|
| names a plan item (final reply) | 35.4% | 100% |
| model's first try names one | 36.5% | 52.1% |
| unasked date (outside engine windows / the current month) | 70.8% | 1.0% |
| repeats an earlier reply (overlap >= 0.5, turns 2+) | 77.8% | 0% |
| hi/bn in native script | 100% | 100% |
| template answer shown | 0% | 81.3% |
| v5 validator | 30.2% | 64.6% (85.4% counting engine-window dates as known) |

Prompt variants (model's first try names an item): nodate 38.5%, line + clarification sent alone 44.8%,
line + history kept 52.1% (chosen), line + every which/what question rewritten to the training seed
phrasing 41.7%. Timing questions: prompts byte-identical (276/276), repaired timing answers identical.
v2.1 rarely writes a usable domain / trait answer on its own, hence the high template share: the next data
pass should add answer-type SFT rows built from these plans (the `best fits:` line as input).
