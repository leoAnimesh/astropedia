"""Prepare the on-device model for Hugging Face Hub hosting (no upload).

The app downloads the model from huggingface.co/leoanimesh/astropedia-models
(utils/model-download.ts). This script computes sizes + SHA-256, writes the
repo's manifest.json, a model card, and the exact upload plan. It never
uploads; run the printed commands yourself after checking them.

  cd ml && .venv/bin/python scripts/publish_model.py
  cd ml && .venv/bin/python scripts/publish_model.py --revision <commit-sha>   # step 2

Repo layout:
  manifest.json                              (mutable: announces updates)
  README.md                                  (model card + Gemma notice)
  <version>/astro-gemma.pte
  <version>/astro-gemma-tokenizer.json

Two commits, because a manifest can't name the commit it lives in:
  1. upload the model files            -> note the commit hash
  2. re-run with --revision <hash>     -> upload manifest.json (+ README)
Then set HF_REVISION in utils/model-download.ts to that hash and check the
PINNED_MODEL sizes/hashes there match (this script compares them).

Manifest format (parsed by utils/model-download-logic.ts parseManifest):
  { "schema": 1,
    "latest": "<version>",
    "models": { "<version>": {
        "revision": "<commit with the files>",
        "contextVersion": 2, "followups": true, "chatFormat": "gemma",
        "minAppVersion": "1.0.0",
        "files": [ { "path": "<version>/<file>", "size": N, "sha256": "...", "role": "model|tokenizer" } ] } } }
An app build uses `latest` only if contextVersion / followups / chatFormat /
minAppVersion fit it; otherwise it keeps its compiled-in PINNED_MODEL.
"""

import argparse
import hashlib
import json
import re
import shlex
from pathlib import Path

ML = Path(__file__).resolve().parents[1]
ROOT = ML.parent
REPO = "leoanimesh/astropedia-models"
HF_BASE = "https://huggingface.co"
APP_TS = ROOT / "utils/model-download.ts"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def app_version() -> str:
    try:
        return json.loads((ROOT / "app.json").read_text())["expo"]["version"]
    except Exception:
        return "1.0.0"


def pinned_in_app() -> dict:
    """PINNED_MODEL version + file sizes/hashes as written in utils/model-download.ts."""
    if not APP_TS.exists():
        return {}
    src = APP_TS.read_text()
    m = re.search(r"PINNED_MODEL: ModelSpec = \{(.*?)\n\};", src, re.S)
    if not m:
        return {}
    body = m.group(1)
    version = re.search(r"version: '([^']+)'", body)
    files = re.findall(r"path: '([^']+)',\s*size: ([\d_]+),\s*sha256: '([0-9a-f]+)'", body)
    revision = re.search(r"export const HF_REVISION = '([^']+)'", src)
    return {
        "version": version.group(1) if version else None,
        "revision": revision.group(1) if revision else None,
        "files": {p: (int(s.replace("_", "")), h) for p, s, h in files},
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", default="astro-gemma-v21", help="model version = folder in the repo")
    ap.add_argument("--model", default=str(ROOT / "assets/model/astro-gemma.pte"))
    ap.add_argument("--tokenizer", default=str(ROOT / "assets/model/astro-gemma-tokenizer.json"))
    ap.add_argument("--context-version", type=int, default=2)
    ap.add_argument("--no-followups", action="store_true", help="model was not trained on [followups]")
    ap.add_argument("--chat-format", default="gemma")
    ap.add_argument("--min-app-version", default=None, help=f"default: app.json version ({app_version()})")
    ap.add_argument("--revision", default=None,
                    help="commit hash of the upload that contains the files (step 2); omit for step 1")
    ap.add_argument("--existing-manifest", default=None,
                    help="current manifest.json from the repo, to keep older entries")
    ap.add_argument("--out", default=str(ML / "hf_upload"))
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    version = args.version
    sources = [(Path(args.model), "model"), (Path(args.tokenizer), "tokenizer")]

    files = []
    for src, role in sources:
        if not src.exists():
            raise SystemExit(f"missing {src}")
        print(f"hashing {src} ...", flush=True)
        files.append({
            "path": f"{version}/{src.name}",
            "size": src.stat().st_size,
            "sha256": sha256_of(src),
            "role": role,
            "_local": str(src),
        })

    manifest = {"schema": 1, "latest": version, "models": {}}
    if args.existing_manifest:
        old = json.loads(Path(args.existing_manifest).read_text())
        manifest["models"].update(old.get("models", {}))
    entry = {
        "revision": args.revision or "<FILL: commit hash from step 1>",
        "contextVersion": args.context_version,
        "followups": not args.no_followups,
        "chatFormat": args.chat_format,
        "minAppVersion": args.min_app_version or app_version(),
        "files": [{k: v for k, v in f.items() if not k.startswith("_")} for f in files],
    }
    manifest["models"][version] = entry
    manifest_path = out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    readme = out / "README.md"
    readme.write_text(f"""---
license: gemma
base_model: google/gemma-3-270m-it
tags:
  - executorch
  - on-device
  - astrology
language:
  - en
  - hi
  - bn
---

# Astropedia on-device models

ExecuTorch (`.pte`) builds of Saga, the Vedic-astrology assistant of the
Astropedia app: Gemma 3 270M fine-tuned for English, Hindi and Bengali,
8-bit quantized (8da8w; trained with 4-bit QAT), 2048-token context. The app downloads these files once and
runs them on the phone.

`manifest.json` lists every version with sizes and SHA-256; the app verifies
each file before using it.

Gemma is provided under and subject to the Gemma Terms of Use found at
https://ai.google.dev/gemma/terms
""")

    total = sum(f["size"] for f in files)
    plan = {
        "repo": REPO,
        "repo_type": "model",
        "step1_files": [{"local": f["_local"], "path_in_repo": f["path"], "size": f["size"], "sha256": f["sha256"]} for f in files],
        "step2_files": [
            {"local": str(manifest_path), "path_in_repo": "manifest.json"},
            {"local": str(readme), "path_in_repo": "README.md"},
        ],
        "urls": [f"{HF_BASE}/{REPO}/resolve/<revision>/{f['path']}" for f in files],
        "manifest_url": f"{HF_BASE}/{REPO}/resolve/main/manifest.json",
    }
    (out / "upload_plan.json").write_text(json.dumps(plan, indent=2) + "\n")

    q = shlex.quote
    print(f"\nwrote {manifest_path}\n      {readme}\n      {out / 'upload_plan.json'}\n")
    print(f"{'file':52} {'bytes':>12}  sha256")
    for f in files:
        print(f"{f['path']:52} {f['size']:>12}  {f['sha256']}")
    print(f"{'total':52} {total:>12}  ({total / 1024 / 1024:.1f} MiB)\n")

    print("Upload plan (NOT run; needs `hf auth login` with a write token):")
    print(f"  hf repo create {REPO} --repo-type model            # once, public")
    if not args.revision:
        print("  # step 1: model files, in ONE commit (its hash is the revision to pin)")
        dirs = {str(Path(f["_local"]).parent) for f in files}
        if len(dirs) == 1:
            includes = "--include " + " ".join(q(Path(f["_local"]).name) for f in files)
            print(f"  hf upload {REPO} {q(dirs.pop())} {q(version)} {includes} --commit-message {q('Add ' + version)}")
        else:
            print("  # (files are in different folders: copy them into one folder first, then)")
            print(f"  hf upload {REPO} <folder> {q(version)} --commit-message {q('Add ' + version)}")
        print(f"  # note the commit hash (hf api / repo page), then:\n"
              f"  .venv/bin/python scripts/publish_model.py --version {version} --revision <hash>")
    else:
        print("  # step 2: manifest + model card")
        print(f"  hf upload {REPO} {q(str(manifest_path))} manifest.json --commit-message {q('Manifest: ' + version)}")
        print(f"  hf upload {REPO} {q(str(readme))} README.md --commit-message 'Model card'")
        print(f"  # then in utils/model-download.ts: HF_REVISION = '{args.revision}'")
    print("  # verify: curl -sIL " + f"{HF_BASE}/{REPO}/resolve/<revision>/{files[0]['path']}" + " | grep -i -E 'content-length|x-linked-size|etag'")

    # Cross-check the app's compiled-in pin.
    pin = pinned_in_app()
    if pin:
        problems = []
        if pin.get("version") == version:
            for f in files:
                got = pin["files"].get(f["path"])
                if got != (f["size"], f["sha256"]):
                    problems.append(f"{f['path']}: app has {got}, file is {(f['size'], f['sha256'])}")
            if args.revision and pin.get("revision") != args.revision:
                problems.append(f"HF_REVISION is '{pin.get('revision')}', upload commit is '{args.revision}'")
        else:
            problems.append(f"PINNED_MODEL.version is {pin.get('version')!r}, publishing {version!r} "
                            "(fine for an over-the-air update; update the pin for the next app build)")
        print("\napp pin check:", "OK" if not problems else "")
        for p in problems:
            print("  -", p)


if __name__ == "__main__":
    main()
