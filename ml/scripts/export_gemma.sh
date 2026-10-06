#!/usr/bin/env bash
# Export a converted Gemma 3 270M checkpoint to an ExecuTorch .pte for the app,
# through export_llm + the Gemma patches in scripts/gemma3_et.py.
#
# Usage: scripts/export_gemma.sh <name> <checkpoint.pth> [extra hydra overrides...]
#   fp32:            scripts/export_gemma.sh g_fp32 out/gemma3_270m_it.pth
#   8-bit:           ... quantization.qmode=8da8w quantization.group_size=0 'quantization.embedding_quantize="8,32"'
#   4-bit layers:    ... quantization.qmode=8da4w quantization.group_size=32 'quantization.embedding_quantize="8,32"'
#                    (use_hqq=False added automatically; head stays 8-bit)
# Make the checkpoint from an HF dir (base or fine-tuned) first; for any
# quantized export also run `smooth` (fp32-exact rewrite, needed for 8da* quality;
# add --head-only for train_gemma.py --smooth/--qat checkpoints, whose layers are
# already smoothed and QAT'd):
#   .venv/bin/python scripts/gemma3_et.py convert <hf_dir> out/<name>.pth
#   .venv/bin/python scripts/gemma3_et.py smooth <hf_dir> out/<name>.pth configs/gemma3_270m_params.json out/<name>_sq.pth
#   .venv/bin/python scripts/gemma3_et.py check <hf_dir> out/<name>_sq.pth configs/gemma3_270m_params.json
# Env: HF (HF dir the checkpoint came from, default models/gemma-3-270m-it; its
#      tokenizer gives the bos/eos ids written to the .pte metadata),
#      PARAMS (default configs/gemma3_270m_params.json), CTX (default 2048, the context
#      window context-v2 models are trained for; astro-gemma-v1 was exported with CTX=1024).
# Pruned vocab: HF=models/gemma-3-270m-it-pruned PARAMS=configs/gemma3_270m_pruned_params.json
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.venv/bin:$PATH"
name=$1 ckpt=$2; shift 2
params=${PARAMS:-configs/gemma3_270m_params.json}
ctx=${CTX:-2048}
# Sliding-window pattern from the params' layer_types (512 for sliding, 0 = full).
hf=${HF:-models/gemma-3-270m-it}
meta=$(.venv/bin/python -c "import json;t=json.load(open('$hf/tokenizer.json'));v=t['model']['vocab'];print(json.dumps({'get_bos_id':v['<bos>'],'get_eos_ids':[v['<eos>'],v['<end_of_turn>']]}))")
pv=$(.venv/bin/python -c "import json;print(json.load(open('$params'))['vocab_size'])")
hv=$(.venv/bin/python -c "import json;print(json.load(open('$hf/config.json'))['vocab_size'])")
[ "$pv" = "$hv" ] || { echo "PARAMS vocab $pv != $hf vocab $hv" >&2; exit 1; }
# 8da4w is meant for QAT checkpoints (train_gemma.py), whose fake quant uses
# absmax scales: default use_hqq=False there (HQQ scales measured KL 39 vs QAT
# fake quant). Pass quantization.use_hqq=True explicitly to override.
extra=()
if [[ " $* " == *"quantization.qmode=8da4w"* && " $* " != *"quantization.use_hqq="* ]]; then
  extra+=(quantization.use_hqq=False)
fi
# The output head never goes to 4-bit: gemma3_et.py quantizes it 8da8w per-channel
# (env GEMMA_HEAD_QMODE=same to quantize it like the layers).
# Prefill chunk (export.max_seq_length). The sliding layers' ring-buffer KV cache holds
# 2 x sliding_window (1024) slots; one forward call may write at most sliding_window (512)
# tokens or a chunk evicts keys its own first tokens still need (torch.export also refuses
# > 1024). The runner prefills longer prompts in chunks of this size. CTX=1024 builds (v1)
# keep 1024: their whole prompt is one call from position 0, which never wraps.
prefill=${PREFILL:-$(.venv/bin/python -c "import json;p=json.load(open('$params'));c=$ctx;print(c if c<=2*p['sliding_window'] and c<=1024 else p['sliding_window'])")}
# The exported graph takes at most prefill-1 tokens per call (export_llm's dynamic dim is
# max_seq_length-1) but export_llm writes get_max_seq_len=max_seq_length, so ExecuTorch's
# TextLLMRunner would chunk 1 token too wide; write the real bound.
meta=$(.venv/bin/python -c "import json;m=json.loads('$meta');m['get_max_seq_len']=$prefill-1;print(json.dumps(m))")
lga=$(.venv/bin/python -c "import json,sys;p=json.load(open('$params'));print('['+','.join(str(p['sliding_window']) if t=='sliding_attention' else '0' for t in p['layer_types'])+']')")
.venv/bin/python scripts/gemma3_et.py export \
  base.model_class=smollm2 base.checkpoint="$ckpt" base.params="$params" \
  "base.metadata='$meta'" \
  model.use_kv_cache=True model.use_sdpa_with_kv_cache=True model.dtype_override=fp32 \
  "model.local_global_attention=$lga" \
  export.max_seq_length="$prefill" export.max_context_length="$ctx" \
  export.output_dir=out export.output_name="$name.pte" \
  backend.xnnpack.enabled=True backend.xnnpack.extended_ops=True ${extra[@]+"${extra[@]}"} "$@" > "out/$name.log" 2>&1
mv "$name.pte" "out/$name.pte"  # export_llm ignores output_dir for the .pte
echo "$name: $(du -h "out/$name.pte" | cut -f1)"
