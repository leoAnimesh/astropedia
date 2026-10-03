#!/usr/bin/env bash
# Export Gemma 3 270M with one quantization variant and print sample replies.
# Usage: scripts/gemma_quant_probe.sh <name> [optimum-cli quant flags...]
set -uo pipefail
cd "$(dirname "$0")/.."
name=$1; shift
out=out/gemma-$name
mkdir -p "$out"
.venv-gemma/bin/optimum-cli export executorch --model "${MODEL:-models/gemma-3-270m-it}" --task text-generation \
  --recipe xnnpack --use_custom_sdpa --use_custom_kv_cache --max_seq_len 1024 --output_dir "$out" "$@" > "$out/export.log" 2>&1
M="${MODEL:-models/gemma-3-270m-it}"; for f in config.json generation_config.json tokenizer.json tokenizer_config.json special_tokens_map.json tokenizer.model chat_template.jinja; do [ -f "$M/$f" ] && cp "$M/$f" "$out/"; done
echo "== $name $* : $(du -h "$out/model.pte" | cut -f1)"
.venv-gemma/bin/python - "$out" <<'PY' 2>&1 | grep "^>>"
import sys
from transformers import AutoTokenizer
from optimum.executorch import ExecuTorchModelForCausalLM
d = sys.argv[1]
tok = AutoTokenizer.from_pretrained(d); m = ExecuTorchModelForCausalLM.from_pretrained(d)
for q in ["What is the capital of France?", "मेरी शादी कब होगी? एक वाक्य में बताइए।", "আমার বিয়ে কবে হবে? এক বাক্যে বলুন।"]:
    p = tok.apply_chat_template([{"role": "user", "content": q}], add_generation_prompt=True, tokenize=False)
    out = m.text_generation(tokenizer=tok, prompt=p, max_seq_len=90)
    reply = out.split('model', 1)[-1].split('<end_of_turn>')[0]
    print('>>', q, '=>', repr(reply[:160]))
PY
