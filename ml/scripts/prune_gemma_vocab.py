"""Prune Gemma 3 270M's 262k vocabulary to English + Hindi + Bengali.

Produces a self-contained HF model dir (default models/gemma-3-270m-it-pruned):
model.safetensors with only the kept embedding rows (lm_head is tied), config /
generation_config with the new vocab size and ids, and a compact tokenizer.json
(+ tokenizer_config.json, special_tokens_map.json, chat_template.jinja) with
contiguous new ids. A prune_map.json (new id -> original id) is written for
reference; nothing at runtime needs it.

Tokenizer surgery (Gemma's tokenizer.json is a BPE model with 514,906 merges,
byte_fallback, a "▁"-for-space normalizer and no real pre-tokenization):
  * Kept set K = mandatory tokens (pad/eos/bos/unk, <start_of_turn>,
    <end_of_turn>, newline / space / tab runs, the html added tokens, all 256
    byte-fallback tokens <0x00>..<0xFF>) + every token used in the selection
    corpora + generic script coverage (tokens whose text is only Latin /
    Latin-1, Devanagari, Bengali, digits, punctuation, whitespace) ranked by
    original id (Gemma ids follow SentencePiece score, i.e. frequency) up to
    the target size.
  * K is closed under merge ancestry: for every kept token, both inputs of
    every merge that produces it are kept (recursively). Merges are kept iff
    both inputs and the result are in K, in the original order.
  * Why this is exact: BPE applies, at each step, the lowest-rank merge among
    adjacent pairs. If a text's original tokens are all in K, every merge on
    its original path has its inputs/outputs in K (ancestor closure) and is
    kept; removing other merges only removes competitors, so the same merge
    wins at every step and the pruned tokenization is identical (just with new
    ids). Texts that used a dropped token fall back to smaller kept pieces or
    to byte tokens, never to <unk>.
New ids follow original id order, so <pad>=0 <eos>=1 <bos>=2 <unk>=3 keep
their ids; <start_of_turn>/<end_of_turn> move (printed at the end; the export
script reads them from the tokenizer).

Selection uses records whose index % 10 != 0 in each jsonl; index % 10 == 0 is
held out for the coverage report. Hinglish is excluded.

Usage: python scripts/prune_gemma_vocab.py [--src models/gemma-3-270m-it]
           [--out models/gemma-3-270m-it-pruned] [--target 60000] [--min-count 1]
"""

from __future__ import annotations

import argparse
import json
import shutil
import unicodedata
from collections import Counter
from pathlib import Path

ML = Path(__file__).resolve().parent.parent
ROOT = ML.parent
SKIP_KEYS = {"id", "profile", "teacher", "task", "kind", "category", "today", "lang",
             "prompt_version", "role", "ref"}


# --------------------------------------------------------------------------- #
# Corpora
# --------------------------------------------------------------------------- #
def strings(x, key=None):
    if isinstance(x, str):
        if key not in SKIP_KEYS and x.strip():
            yield x
    elif isinstance(x, dict):
        for k, v in x.items():
            yield from strings(v, k)
    elif isinstance(x, list):
        for v in x:
            yield from strings(v, key)


def jsonl(path: Path):
    """Line-delimited JSON; tolerates a partial last line (file being appended)."""
    with open(path) as f:
        for line in f:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def lang_of(text: str) -> str:
    deva = sum("ऀ" <= c <= "ॿ" for c in text)
    beng = sum("ঀ" <= c <= "৿" for c in text)
    if max(deva, beng) < 3:
        return "en"
    return "hi" if deva >= beng else "bn"


def corpora() -> tuple[list[str], dict[str, list[str]]]:
    """(selection texts, held-out texts by language)."""
    sel: list[str] = []
    held: dict[str, list[str]] = {"en": [], "hi": [], "bn": []}
    files = [ML / "data/sft/train.jsonl", ML / "data/sft/val.jsonl",
             *sorted((ML / "data/raw").glob("answers_ml*.jsonl")), ML / "data/raw/questions_hi.jsonl",
             ML / "data/raw/questions_bn.jsonl", *sorted((ML / "data/raw").glob("pilot_ml*.jsonl"))]
    for f in files:
        if not f.exists():
            print(f"  (missing {f.relative_to(ML)})")
            continue
        n = 0
        for i, rec in enumerate(jsonl(f)):
            if rec.get("lang") == "hinglish":
                continue
            texts = list(strings(rec))
            if i % 10 == 0:
                for t in texts:
                    held[lang_of(t)].append(t)
            else:
                sel.extend(texts)
            n += 1
        print(f"  {f.relative_to(ML)}: {n} records")
    for lang in ("en", "hi", "bn"):
        for f in sorted((ROOT / "locales" / lang).glob("*.json")):
            sel.extend(strings(json.loads(f.read_text())))
    sel.extend(strings(json.loads((ROOT / "assets/gita-corpus/curated-verses.json").read_text())))
    return sel, held


HANDWRITTEN = {
    "en": ["hey whats my horoscope 4 today?? feeling kinda lost lol",
           "When will I get maried and will it be love or arranged",
           "Is Saturn bad for my career? I'm 29 and stuck at the same job 😩",
           "Can you explain my moon sign in simple words, no jargon pls",
           "Thanks!! That really helped. Good night 🙏"],
    "hi": ["मेरी शादी कब होगी? एक वाक्य में बताइए।",
           "मेरा करियर कैसा रहेगा अगले साल",
           "भाई मेरी नौकरी कब लगेगी, बहुत परेशान हूँ 😔",
           "क्या शनि की साढ़े साती मुझ पर चल रही है?",
           "धन्यवाद! आपने बहुत अच्छे से समझाया।",
           "मुझे गुस्सा बहुत आता है, गीता इसके बारे में क्या कहती है"],
    "bn": ["আমার বিয়ে কবে হবে? এক বাক্যে বলুন।",
           "আমার চাকরি কবে হবে, খুব চিন্তায় আছি",
           "শনি কি আমার কর্মজীবনের জন্য খারাপ?",
           "আগামী বছর আমার ভাগ্য কেমন যাবে",
           "ধন্যবাদ! খুব সুন্দর করে বুঝিয়েছেন 🙏",
           "মন খারাপ লাগছে, গীতা এ বিষয়ে কী বলে"],
}


# --------------------------------------------------------------------------- #
# Script filter
# --------------------------------------------------------------------------- #
def allowed_char(c: str) -> bool:
    o = ord(c)
    if c in "▁\n\t\r" or 0x20 <= o <= 0x7E or 0xA0 <= o <= 0xFF:
        return True  # ▁ (space), whitespace, ASCII, Latin-1
    if 0x0900 <= o <= 0x097F or 0xA8E0 <= o <= 0xA8FF or 0x1CD0 <= o <= 0x1CFF:
        return True  # Devanagari (+ extended, Vedic)
    if 0x0980 <= o <= 0x09FF:
        return True  # Bengali
    if o in (0x200C, 0x200D, 0x20B9, 0x2122):
        return True  # ZWNJ, ZWJ (Indic conjuncts), ₹, ™
    if 0x2010 <= o <= 0x205E:
        return True  # general punctuation: dashes, quotes, ellipsis, bullets
    return False


def script_ok(tok: str) -> bool:
    return bool(tok) and all(allowed_char(c) for c in tok)


def indic(tok: str) -> bool:
    return any("\u0900" <= c <= "\u09ff" for c in tok)


def emoji(tok: str) -> bool:
    body = tok.replace("\u2581", "").replace("\u200d", "").replace("\ufe0f", "")
    return bool(body) and all(unicodedata.category(c) == "So" for c in body)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ML / "models/gemma-3-270m-it"))
    ap.add_argument("--out", default=str(ML / "models/gemma-3-270m-it-pruned"))
    ap.add_argument("--target", type=int, default=60000)
    ap.add_argument("--min-count", type=int, default=1)
    ap.add_argument("--emoji", type=int, default=400, help="most frequent emoji tokens to keep")
    a = ap.parse_args()
    src, out = Path(a.src), Path(a.out)

    from tokenizers import Tokenizer

    tj = json.loads((src / "tokenizer.json").read_text())
    model = tj["model"]
    assert model["type"] == "BPE" and model["byte_fallback"], model["type"]
    vocab: dict[str, int] = model["vocab"]
    id2tok = {i: t for t, i in vocab.items()}
    added = {x["id"]: x for x in tj["added_tokens"]}
    merges = [tuple(m) if isinstance(m, list) else tuple(m.split(" ")) for m in model["merges"]]
    by_result: dict[str, list[tuple[str, str]]] = {}
    for l, r in merges:
        by_result.setdefault(l + r, []).append((l, r))

    # Mandatory ids.
    keep_added = {i for i, x in added.items()
                  if i <= 4 or 105 <= i <= 237 or x["content"].startswith("\t")}
    byte_ids = {vocab[f"<0x{b:02X}>"] for b in range(256)}
    mandatory = keep_added | byte_ids
    names = {id2tok[i] for i in (105, 106)}
    assert names == {"<start_of_turn>", "<end_of_turn>"}, names

    print("reading corpora")
    sel, held = corpora()
    tok = Tokenizer.from_file(str(src / "tokenizer.json"))
    counts: Counter = Counter()
    for enc in tok.encode_batch(sel, add_special_tokens=False):
        counts.update(enc.ids)
    corpus_ids = {i for i, c in counts.items() if c >= a.min_count}
    print(f"selection texts {len(sel)}, distinct tokens used {len(counts)}, kept (count>={a.min_count}) {len(corpus_ids)}")

    def closure(ids: set[int]) -> set[int]:
        todo, seen = list(ids), set(ids)
        while todo:
            t = id2tok.get(todo.pop())
            for l, r in by_result.get(t, ()):
                for p in (l, r):
                    j = vocab[p]
                    if j not in seen:
                        seen.add(j)
                        todo.append(j)
        return seen

    cand = [(i, t) for t, i in vocab.items() if i >= 494 and i not in added]
    indic_ids = {i for i, t in cand if script_ok(t) and indic(t)}
    emoji_ids = sorted(i for i, t in cand if emoji(t))[: a.emoji]
    latin_ids = sorted(i for i, t in cand if script_ok(t) and not indic(t))
    base = closure(mandatory | corpus_ids)
    tier2 = closure(base | indic_ids | set(emoji_ids))
    print(f"mandatory {len(mandatory)} | +corpus (closed) {len(base)} | +all Devanagari/Bengali "
          f"({len(indic_ids)}) and {len(emoji_ids)} emoji (closed) {len(tier2)} | "
          f"Latin/other script-filter candidates {len(latin_ids)} "
          f"(everything closed: {len(closure(tier2 | set(latin_ids)))})")
    lo, hi = 0, len(latin_ids)
    while lo < hi:  # largest Latin prefix (by original id ~ frequency) whose closure fits
        mid = (lo + hi + 1) // 2
        if len(closure(tier2 | set(latin_ids[:mid]))) <= a.target:
            lo = mid
        else:
            hi = mid - 1
    keep = closure(tier2 | set(latin_ids[:lo]))
    print(f"added {lo} Latin/other tokens (cut at original id {latin_ids[lo - 1] if lo else '-'}); "
          f"final vocab {len(keep)}")

    # New contiguous ids in original order.
    old_ids = sorted(keep)
    new_of = {o: n for n, o in enumerate(old_ids)}
    keep_tok = {id2tok[o] for o in old_ids}
    new_vocab = {id2tok[o]: new_of[o] for o in old_ids}
    new_merges = [[l, r] for l, r in merges if l in keep_tok and r in keep_tok and (l + r) in keep_tok]
    tj2 = dict(tj)
    tj2["model"] = dict(model, vocab=new_vocab, merges=new_merges)
    tj2["added_tokens"] = [dict(x, id=new_of[i]) for i, x in sorted(added.items()) if i in keep]
    tj2["post_processor"]["special_tokens"]["<bos>"]["ids"] = [new_of[2]]

    out.mkdir(parents=True, exist_ok=True)
    (out / "tokenizer.json").write_text(json.dumps(tj2, ensure_ascii=False, separators=(",", ":")))
    tc = json.loads((src / "tokenizer_config.json").read_text())
    tc["added_tokens_decoder"] = {str(new_of[int(i)]): v for i, v in tc["added_tokens_decoder"].items()
                                  if int(i) in keep}
    for k in ("boi_token", "eoi_token", "image_token", "extra_special_tokens"):
        tc.pop(k, None)
    (out / "tokenizer_config.json").write_text(json.dumps(tc, ensure_ascii=False, indent=2))
    stm = json.loads((src / "special_tokens_map.json").read_text())
    for k in ("boi_token", "eoi_token", "image_token"):
        stm.pop(k, None)
    (out / "special_tokens_map.json").write_text(json.dumps(stm, indent=2))
    shutil.copy(src / "chat_template.jinja", out / "chat_template.jinja")
    sot, eot = new_of[105], new_of[106]

    # Model: slice embedding rows (lm_head is tied).
    import torch
    from safetensors.torch import load_file, save_file

    sd = load_file(src / "model.safetensors")
    idx = torch.tensor(old_ids)
    emb_key = next(k for k in sd if k.endswith("embed_tokens.weight"))
    sd[emb_key] = sd[emb_key][idx].contiguous()
    if "lm_head.weight" in sd:
        sd["lm_head.weight"] = sd["lm_head.weight"][idx].contiguous()
    save_file(sd, out / "model.safetensors", metadata={"format": "pt"})
    cfg = json.loads((src / "config.json").read_text())
    cfg.update(vocab_size=len(old_ids), bos_token_id=new_of[2], eos_token_id=[new_of[1], eot],
               pad_token_id=new_of[0])
    (out / "config.json").write_text(json.dumps(cfg, indent=2))
    gc = json.loads((src / "generation_config.json").read_text())
    gc["eos_token_id"] = [new_of[1], eot]
    (out / "generation_config.json").write_text(json.dumps(gc, indent=2))
    (out / "prune_map.json").write_text(json.dumps(old_ids))
    (out / "prune_info.json").write_text(json.dumps({
        "vocab_size": len(old_ids), "pad": new_of[0], "eos": new_of[1], "bos": new_of[2],
        "unk": new_of[3], "start_of_turn": sot, "end_of_turn": eot,
        "target": a.target, "min_count": a.min_count, "latin_tokens_added": lo, "emoji": a.emoji,
        "corpus_tokens": len(corpus_ids)}, indent=2))
    print(f"wrote {out}: vocab {len(old_ids)}, merges {len(new_merges)}, "
          f"tokenizer.json {(out / 'tokenizer.json').stat().st_size / 1e6:.2f} MB, "
          f"<start_of_turn>={sot} <end_of_turn>={eot}")

    # Coverage on held-out + handwritten text.
    tok2 = Tokenizer.from_file(str(out / "tokenizer.json"))
    print("\ncoverage (held-out records index%10==0, + handwritten):")
    for lang in ("en", "hi", "bn"):
        for name, texts in (("held-out", held[lang]), ("handwritten", HANDWRITTEN[lang])):
            if not texts:
                print(f"  {lang} {name}: no texts")
                continue
            same = n0 = n1 = n0d = n1d = 0
            for t in texts:
                e0 = tok.encode(t, add_special_tokens=False).ids
                e1 = [old_ids[i] for i in tok2.encode(t, add_special_tokens=False).ids]
                n0 += len(e0); n1 += len(e1)
                if e0 == e1:
                    same += 1
                else:
                    n0d += len(e0); n1d += len(e1)
                assert tok2.decode(tok2.encode(t, add_special_tokens=False).ids) == \
                    tok.decode(tok.encode(t, add_special_tokens=False).ids), t
            infl = f", differing texts +{100 * (n1d / n0d - 1):.1f}% tokens" if n0d else ""
            print(f"  {lang} {name:11}: {same}/{len(texts)} identical ({100 * same / len(texts):.1f}%), "
                  f"total tokens +{100 * (n1 / n0 - 1):.2f}%{infl}")


if __name__ == "__main__":
    main()
