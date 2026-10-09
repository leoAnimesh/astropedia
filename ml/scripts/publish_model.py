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

Model catalog (Settings -> On-device model -> Change model): the manifest also
carries `"catalog": [...]`, copied from ml/model_catalog.json (parsed by
utils/model-catalog.ts parseCatalog; builds before the catalog ignore the key,
so `latest` / `models` stay backward compatible). Catalog files may live in
other repos (react-native-executorch's own .pte exports), pinned by commit:
  { "id", "name", "description": {en,hi,bn}, "descriptionKey", "adapter": "gemma21"|"instruct",
    "chatTemplate", "contextWindow", "languages": {en,hi,bn: best|good|fair|basic},
    "minRamMB", "recommended", "license": {id,name,url,notice?},
    "repo", "revision", "files": [ {path|url, size, sha256, role: model|tokenizer|tokenizer_config} ] }

  # catalog only (keeps the published models; no re-hashing, no upload):
  cd ml && .venv/bin/python scripts/publish_model.py --catalog-only --verify-remote
"""

import argparse
import hashlib
import json
import re
import shlex
import urllib.error
import urllib.request
from pathlib import Path

ML = Path(__file__).resolve().parents[1]
ROOT = ML.parent
REPO = "leoanimesh/astropedia-models"
HF_BASE = "https://huggingface.co"
APP_TS = ROOT / "utils/model-download.ts"
CATALOG_JSON = ML / "model_catalog.json"
MANIFEST_URL = f"{HF_BASE}/{REPO}/resolve/main/manifest.json"
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
REPO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")
QUALITIES = {"best", "good", "fair", "basic"}


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


def load_catalog(path: Path) -> list:
    """ml/model_catalog.json entries, checked like utils/model-catalog.ts parseCatalogEntry (strictly)."""
    entries = json.loads(path.read_text())["catalog"]
    seen = set()
    for e in entries:
        where = f"catalog entry {e.get('id')!r}"
        assert re.fullmatch(r"[A-Za-z0-9._-]{1,64}", e.get("id", "")), f"{where}: bad id"
        assert e["id"] not in seen, f"{where}: duplicate id"
        seen.add(e["id"])
        assert e.get("adapter") in ("gemma21", "instruct"), f"{where}: adapter"
        assert isinstance(e.get("contextWindow"), int) and e["contextWindow"] >= 512, f"{where}: contextWindow"
        assert e.get("description", {}).get("en"), f"{where}: description.en"
        assert e.get("languages", {}).get("en") in QUALITIES, f"{where}: languages.en"
        assert all(q in QUALITIES for q in e["languages"].values()), f"{where}: languages"
        assert isinstance(e.get("minRamMB"), int), f"{where}: minRamMB"
        lic = e.get("license", {})
        assert lic.get("id") and lic.get("name") and str(lic.get("url", "")).startswith("https://"), f"{where}: license"
        roles = [f["role"] for f in e["files"]]
        assert roles.count("model") == 1 and roles.count("tokenizer") == 1, f"{where}: model + tokenizer"
        assert roles.count("tokenizer_config") <= 1, f"{where}: at most one tokenizer_config"
        if e["adapter"] == "instruct":
            assert roles.count("tokenizer_config") == 1, f"{where}: instruct models need a tokenizer_config"
        names = [Path(f["path"]).name for f in e["files"]]
        assert len(set(names)) == len(names), f"{where}: duplicate file names"
        for f in e["files"]:
            repo = f.get("repo", e.get("repo"))
            rev = f.get("revision", e.get("revision"))
            assert repo and REPO_RE.match(repo), f"{where}: repo for {f['path']}"
            assert rev and COMMIT_RE.match(rev), f"{where}: {f['path']} must be pinned to a commit"
            assert isinstance(f["size"], int) and f["size"] > 0 and SHA_RE.match(f["sha256"]), f"{where}: {f['path']}"
    return entries


def file_url(entry: dict, f: dict) -> str:
    repo = f.get("repo", entry.get("repo"))
    rev = f.get("revision", entry.get("revision"))
    return f"{HF_BASE}/{repo}/resolve/{rev}/{f['path']}"


def verify_remote(entries: list) -> list:
    """HEAD each catalog file (LFS: X-Linked-Size / X-Linked-ETag = sha256); small non-LFS files are hashed."""
    problems = []

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    head = urllib.request.build_opener(NoRedirect)
    for e in entries:
        for f in e["files"]:
            url = file_url(e, f)
            try:
                req = urllib.request.Request(url, method="HEAD")
                try:
                    resp = head.open(req, timeout=30)
                    hdr = resp.headers
                except urllib.error.HTTPError as err:  # 302/307 carry the headers we need
                    if err.code not in (301, 302, 303, 307, 308):
                        raise
                    hdr = err.headers
                size = hdr.get("X-Linked-Size")
                etag = (hdr.get("X-Linked-ETag") or "").strip('"')
                if size and SHA_RE.match(etag):
                    ok = int(size) == f["size"] and etag == f["sha256"]
                else:
                    with urllib.request.urlopen(url, timeout=60) as r:
                        data = r.read(64 * 1024 * 1024 + 1)
                    ok = len(data) == f["size"] and hashlib.sha256(data).hexdigest() == f["sha256"]
                print(f"  {'ok ' if ok else 'BAD'} {e['id']:16} {f['path']}")
                if not ok:
                    problems.append(f"{e['id']}: {f['path']} size/sha256 differ from {url}")
            except Exception as err:  # noqa: BLE001
                problems.append(f"{e['id']}: {f['path']}: {err}")
                print(f"  ERR {e['id']:16} {f['path']}: {err}")
    return problems


def check_catalog_against_app(entries: list) -> list:
    """utils/model-catalog.ts FALLBACK_CATALOG_RAW lists the same ids, files, sizes and hashes."""
    ts = (ROOT / "utils/model-catalog.ts").read_text()
    problems = []
    for e in entries:
        if f"id: '{e['id']}'" not in ts:
            problems.append(f"{e['id']} missing from FALLBACK_CATALOG_RAW")
        for f in e["files"]:
            if f["sha256"] not in ts or f"{f['size']:_}" not in ts:
                problems.append(f"{e['id']}: {f['path']} differs in FALLBACK_CATALOG_RAW")
    return problems


def write_readme(out: Path, catalog: list) -> Path:
    readme = out / "README.md"
    third_party = ""
    if catalog:
        rows = "\n".join(
            f"| {e['name']} | `{e['adapter']}` | {sum(f['size'] for f in e['files']) / 1e6:.0f} MB | "
            f"{', '.join(f'{k} {v}' for k, v in e['languages'].items())} | [{e['license']['name']}]({e['license']['url']}) |"
            for e in catalog)
        notices = "\n\n".join(e["license"]["notice"] for e in catalog if e["license"].get("notice"))
        third_party = f"""
## Model catalog

`manifest.json` also lists the models the app offers in Settings ->
On-device model -> Change model (`catalog`). Only one runs at a time.
Models other than Saga are downloaded from their publishers' repositories
(react-native-executorch's ExecuTorch exports), pinned by commit and
checked by SHA-256; they are not redistributed here.

| Model | Adapter | Download | Languages | Licence |
| --- | --- | --- | --- | --- |
{rows}

{notices}
"""
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
{third_party}
Gemma is provided under and subject to the Gemma Terms of Use found at
https://ai.google.dev/gemma/terms
""")
    return readme


def catalog_only(args) -> None:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    catalog = load_catalog(Path(args.catalog))
    if args.existing_manifest:
        manifest = json.loads(Path(args.existing_manifest).read_text())
        src = args.existing_manifest
    else:
        with urllib.request.urlopen(MANIFEST_URL, timeout=30) as r:
            manifest = json.loads(r.read())
        src = MANIFEST_URL
    assert "latest" in manifest and "models" in manifest, f"{src}: not a manifest"
    manifest["schema"] = manifest.get("schema", 1)
    manifest["catalog"] = catalog
    manifest_path = out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    readme = write_readme(out, catalog)
    plan = {
        "repo": REPO, "repo_type": "model", "step1_files": [],
        "step2_files": [
            {"local": str(manifest_path), "path_in_repo": "manifest.json"},
            {"local": str(readme), "path_in_repo": "README.md"},
        ],
        "manifest_url": MANIFEST_URL,
    }
    (out / "upload_plan.json").write_text(json.dumps(plan, indent=2) + "\n")
    print(f"wrote {manifest_path} (latest/models from {src}, catalog from {args.catalog})\n      {readme}\n")
    print(f"{'catalog id':18} {'adapter':9} {'MB':>6}  minRAM  licence")
    for e in catalog:
        mb = sum(f["size"] for f in e["files"]) / 1e6
        print(f"{e['id']:18} {e['adapter']:9} {mb:6.0f}  {e['minRamMB']:>5}  {e['license']['id']}")
    problems = check_catalog_against_app(catalog)
    if args.verify_remote:
        print("\nverifying catalog files on Hugging Face ...")
        problems += verify_remote(catalog)
    print("\nUpload plan (NOT run; needs `hf auth login` with a write token):")
    print(f"  hf upload {REPO} {shlex.quote(str(manifest_path))} manifest.json --commit-message 'Manifest: model catalog'")
    print(f"  hf upload {REPO} {shlex.quote(str(readme))} README.md --commit-message 'Model card: catalog'")
    print("\ncatalog check:", "OK" if not problems else "")
    for p in problems:
        print("  -", p)
    if problems:
        raise SystemExit(1)


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
    ap.add_argument("--catalog", default=str(CATALOG_JSON), help="selectable models (manifest `catalog`)")
    ap.add_argument("--no-catalog", action="store_true", help="write the manifest without a catalog")
    ap.add_argument("--catalog-only", action="store_true",
                    help="only (re)write the catalog into the current manifest (no hashing; models from "
                         "--existing-manifest, else fetched from the Hub)")
    ap.add_argument("--verify-remote", action="store_true",
                    help="check every catalog file's size + sha256 on Hugging Face (HEAD; small files downloaded)")
    args = ap.parse_args()
    if args.catalog_only:
        catalog_only(args)
        return

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
    catalog = [] if args.no_catalog else load_catalog(Path(args.catalog))
    if catalog:
        manifest["catalog"] = catalog
    manifest_path = out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    readme = write_readme(out, catalog)

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
