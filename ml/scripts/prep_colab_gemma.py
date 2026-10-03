"""Assemble ml/train/colab_upload_gemma/ for a Colab (T4) fine-tune of Gemma 3
270M and write the paste-ready cell with the current md5s.

  .venv/bin/python scripts/prep_colab_gemma.py [--model models/gemma-3-270m-it-pruned]

Re-run after rebuilding the SFT set (data/build_sft.py) or the pruned vocab:
md5s and the model zip are regenerated. Upload every file in the folder
except colab_cell.py (drag into Colab's Files panel), then paste colab_cell.py.
"""

import argparse
import hashlib
import shutil
import zipfile
from pathlib import Path

ML = Path(__file__).resolve().parents[1]
OUT = ML / "train/colab_upload_gemma"

# Pinned to the versions the script was tested with locally (ml/.venv); torch
# stays Colab's own build (CUDA-matched). torchao 0.18.0 = local export env.
REQUIREMENTS = """\
transformers==5.18.0
trl==1.14.1
datasets==5.0.1
accelerate==1.15.0
torchao==0.18.0
"""

CELL = r'''# ── Astropedia: Gemma 3 270M fine-tune (en/hi/bn) + 8da4w QAT ──────────────
# Upload first (Files panel, into /content): {files}
# Runtime: GPU (T4). One cell: install -> verify -> train -> zip -> download.
# Optional, survives disconnects: mount Drive and keep checkpoints there; re-running
# this cell then resumes from the last checkpoint (saved every 100 steps).
USE_DRIVE = False
QAT = "8da4w"          # "none" for a plain fine-tune
SMOOTH = "{smooth}"   # "none" or "0.5,0.65": SmoothQuant folded in before QAT (export then smooths the head only)
EPOCHS = 2

import hashlib, os, subprocess, sys, zipfile
os.chdir("/content")
!pip -q install {pip}
EXPECTED = {md5s}
for f, h in EXPECTED.items():
    got = hashlib.md5(open(f, "rb").read()).hexdigest()
    assert got == h, f"{{f}}: md5 {{got}} != {{h}} (re-upload)"
print("md5 ok:", ", ".join(EXPECTED))
if not os.path.isdir("{model_dir}"):
    zipfile.ZipFile("{model_zip}").extractall("{model_dir}")

import torch, transformers, trl, torchao
print(torch.__version__, transformers.__version__, trl.__version__, torchao.__version__, torch.cuda.get_device_name(0))
# fail fast if this torch/torchao pair can't fake-quantize
from torchao.quantization import quantize_, Int8DynamicActivationIntxWeightConfig
from torchao.quantization.granularity import PerGroup
from torchao.quantization.qat import QATConfig
_l = torch.nn.Sequential(torch.nn.Linear(64, 64)).cuda()
quantize_(_l, QATConfig(Int8DynamicActivationIntxWeightConfig(weight_dtype=torch.int4, weight_granularity=PerGroup(32)), step="prepare"))
_l(torch.randn(4, 64, device="cuda")).sum().backward(); del _l
print("torchao QAT self-test ok")

CKPT = "ckpt"
if USE_DRIVE:
    from google.colab import drive
    drive.mount("/content/drive")
    CKPT = "/content/drive/MyDrive/astro-gemma-ckpt"
!rm -rf astro-gemma astro-gemma.zip
!python train_gemma.py --model {model_dir} --out astro-gemma --ckpt-dir $CKPT --qat $QAT --smooth $SMOOTH --epochs $EPOCHS 2>&1 | tee train.log

assert os.path.exists("astro-gemma/model.safetensors"), "training failed: see train.log"
!cp train.log astro-gemma/ && cd astro-gemma && zip -q -r ../astro-gemma.zip . && cd .. && ls -la astro-gemma.zip
from google.colab import files
files.download("astro-gemma.zip")
'''


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, default=ML / "models/gemma-3-270m-it-pruned")
    ap.add_argument("--data", type=Path, default=ML / "data/sft_gemma")
    ap.add_argument("--smooth", default="none", help="default SMOOTH value written into the cell")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy(a.data / "train.jsonl", OUT / "train.jsonl")
    shutil.copy(a.data / "val.jsonl", OUT / "val.jsonl")
    shutil.copy(ML / "train/train_gemma.py", OUT / "train_gemma.py")
    (OUT / "requirements.txt").write_text(REQUIREMENTS)
    model_dir = a.model.name
    model_zip = OUT / f"{model_dir}.zip"
    with zipfile.ZipFile(model_zip, "w", zipfile.ZIP_STORED) as z:  # safetensors don't compress
        for f in sorted(a.model.iterdir()):
            if f.is_file() and f.name != "prune_map.json":
                z.write(f, f.name)
    files = ["train.jsonl", "val.jsonl", "train_gemma.py", model_zip.name]
    md5s = {f: md5(OUT / f) for f in files}
    pip = " ".join(f'"{l}"' for l in REQUIREMENTS.split())
    cell = CELL.format(files=", ".join(files), pip=pip, md5s=md5s, model_dir=model_dir, model_zip=model_zip.name,
                      smooth=a.smooth)
    (OUT / "colab_cell.py").write_text(cell)
    (OUT / "MD5SUMS").write_text("".join(f"{h}  {f}\n" for f, h in md5s.items()))
    for f in files + ["requirements.txt", "colab_cell.py"]:
        print(f"{(OUT / f).stat().st_size / 1e6:9.1f} MB  {f}")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
