#!/usr/bin/env bash
# Wait for a trained model zip from Colab, then unzip, convert, export to the
# app's 4-bit .pte, and run the held-out evaluation.
# Usage: scripts/after_download.sh <version-name>   e.g. v2
set -euo pipefail
cd "$(dirname "$0")/.."
ver=${1:?version name}
zip="$HOME/Downloads/astro-135m.zip"

echo "waiting for $zip ..."
last=-1
while true; do
  if [ -f "$zip" ]; then
    size=$(stat -f%z "$zip")
    # Chrome writes to a .crdownload first; treat the zip as done once its size is stable.
    if [ "$size" = "$last" ] && [ "$size" -gt 100000000 ]; then break; fi
    last=$size
  fi
  sleep 20
done
echo "downloaded: $(du -h "$zip" | cut -f1)  md5 $(md5 -q "$zip")"

dir="models/astro-135m-$ver"
rm -rf "$dir" && mkdir -p "$dir" && unzip -q -o "$zip" -d "$dir"
.venv/bin/python scripts/convert_hf_to_et.py "$dir" "out/astro_135m_$ver.pth"
.venv/bin/python scripts/check_conversion.py "$dir" "out/astro_135m_$ver.pth" configs/smollm2_135m_params.json 2>&1 | grep "logit diff"
scripts/export.sh "astro_135m_$ver" "out/astro_135m_$ver.pth" configs/smollm2_135m_params.json quantization.embedding_quantize=\'4,32\'
.venv/bin/python scripts/eval_student.py "$dir" "out/astro_135m_$ver.pte" 120 --show 10 2>&1 \
  | grep -vE "^W1001|Redirects|register_constant|^I tokenizers|^\[|PyTorchObserver|Reached to the end|RSS after|Loading weights"
echo "DONE $ver"
