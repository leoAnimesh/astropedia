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
