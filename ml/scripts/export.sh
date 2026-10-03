#!/usr/bin/env bash
# Export a converted SmolLM2 checkpoint to an ExecuTorch .pte for the app.
# Usage: scripts/export.sh <name> <checkpoint.pth> <params.json> [extra hydra overrides...]
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.venv/bin:$PATH"
name=$1 ckpt=$2 params=$3; shift 3
.venv/bin/python -m executorch.extension.llm.export.export_llm \
  base.model_class=smollm2 base.checkpoint="$ckpt" base.params="$params" \
  'base.metadata="{\"get_bos_id\":1,\"get_eos_ids\":[2,0]}"' \
  model.use_kv_cache=True model.use_sdpa_with_kv_cache=True model.dtype_override=fp32 \
  export.max_seq_length=1024 export.max_context_length=1024 \
  export.output_dir=out export.output_name="$name.pte" \
  backend.xnnpack.enabled=True backend.xnnpack.extended_ops=True \
  quantization.qmode=8da4w quantization.group_size=32 "$@" > "out/$name.log" 2>&1
mv "$name.pte" "out/$name.pte"  # export_llm ignores output_dir for the .pte
echo "$name: $(du -h "out/$name.pte" | cut -f1)"
