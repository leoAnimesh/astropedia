#!/usr/bin/env bash
# Export a QAT-trained Gemma checkpoint (trained with --smooth 0.5,0.65 --qat 8da4w)
# to 4-bit and 8-bit .pte files and evaluate both against the fp32 checkpoint.
# Usage: scripts/export_astro_gemma.sh <hf_dir> <name>
set -euo pipefail
cd "$(dirname "$0")/.."
P=$1; NAME=$2; C=configs/${NAME}_params.json
export HF=$P PARAMS=$C
.venv/bin/python scripts/gemma3_et.py params "$P" > "$C"
.venv/bin/python scripts/gemma3_et.py convert "$P" "out/${NAME}.pth"
.venv/bin/python scripts/gemma3_et.py smooth "$P" "out/${NAME}.pth" "$C" "out/${NAME}_head.pth" --head-only
echo "=== check (fp32 ET vs HF)"; .venv/bin/python scripts/gemma3_et.py check "$P" "out/${NAME}_head.pth" "$C"
echo "=== export 8da4w"; scripts/export_gemma.sh "${NAME}_8da4w" "out/${NAME}_head.pth" quantization.qmode=8da4w quantization.group_size=32 'quantization.embedding_quantize="8,32"'
echo "=== export 8da8w"; scripts/export_gemma.sh "${NAME}_8da8w" "out/${NAME}_head.pth" quantization.qmode=8da8w quantization.group_size=0 'quantization.embedding_quantize="8,32"'
ls -la out/${NAME}_8da4w.pte out/${NAME}_8da8w.pte
echo "=== eval"; .venv/bin/python scripts/gemma3_et.py eval "$P" "out/${NAME}.pth" "$C" "out/${NAME}_8da4w.pte" "out/${NAME}_8da8w.pte"
echo "=== run 8da4w"; .venv/bin/python scripts/gemma3_et.py run "$P" "out/${NAME}_8da4w.pte"
echo "DONE"
