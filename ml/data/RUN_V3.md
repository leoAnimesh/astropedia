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

# 4. Progress (records per language/task, script drops, validator pass rate on the latest
#    records, records/min, teacher calls, ETA). No API calls.
.venv/bin/python data/generate.py progress --files data/raw/answers_v4_{en,hi,bn}.jsonl --logs out/gen_v3.log
#    Spot-check one file (pass rates and failing examples):
.venv/bin/python data/validate_answer.py --raw data/raw/answers_v4_bn.jsonl --profiles data/profiles_v2.jsonl

# 5. SFT set: the v4 files, plus only the Krishna records of the v3 raw files (--reuse,
#    --reuse-tasks defaults to krishna; en 1667 / hi 409 / bn 371 kept). The v1-context Saga
#    records are not used. --max-tokens defaults to 260, the app's v2 reply cap.
.venv/bin/python data/build_sft.py --raw data/raw/answers_v4_en.jsonl data/raw/answers_v4_hi.jsonl data/raw/answers_v4_bn.jsonl --reuse data/raw/answers.jsonl data/raw/answers_ml.jsonl data/raw/pilot_ml.jsonl data/raw/pilot_ml2.jsonl --out data/sft_v2

# 6. Train. train_gemma.py --max-length defaults to 2048, so prompts of ≈650 tokens plus up to 3 turns fit.
.venv/bin/python scripts/prep_colab_gemma.py --data data/sft_v2      # then upload the folder and paste colab_cell.py

# 7. Export with a 2048-token window (export_gemma.sh CTX defaults to 2048).
scripts/export_astro_gemma.sh <hf_dir> astro_gemma_v2

# 8. App: ship the new .pte and tokenizer, bump MODEL_VERSION, and set CONTEXT_VERSION = 2 in
#    utils/local-llm.ts, all together. That switches the context to v2, replies to 260 tokens and
#    history trimming to a 2048-token budget.
```
