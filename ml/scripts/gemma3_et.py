"""Gemma 3 (270M) on ExecuTorch 1.4.1's own llama `export_llm` pipeline.

Why this exists
---------------
ExecuTorch 1.4.1's portable llama model (examples/models/llama) has most Gemma
knobs in ModelArgs but does not apply several of them, so a Gemma checkpoint
loads "fine" (strict=False) yet produces garbage (logit diff ~270 vs HF):
  * TransformerBlock never creates `post_attention_norm` / `post_ffn_norm`
    (keys load as "unexpected" and are silently dropped).
  * FeedForward is hard-wired to SiLU; Gemma uses GELU(tanh) (`act_fn` ignored).
  * `embedding_scale_factor` (sqrt(hidden)=sqrt(640)) is never applied.
  * `local_rope_theta` is ignored: Gemma's sliding layers use RoPE base 1e4,
    the global (every 6th) layers use 1e6.
Already correct upstream (no patch needed): unit-offset RMSNorm (1 + w) for
all norms incl. q/k norm via `rms_norm_add_unit_offset`, q/k norm before RoPE,
HF half-split RoPE (`use_hf_rope`), attention scale 1/sqrt(256) (=
query_pre_attn_scalar), tied output (converter copies the embedding).
Sliding-window attention (512) is supplied by ExecuTorch's own ring-buffer KV
cache via `model.local_global_attention=[512,512,512,512,512,0]` (pattern
repeats over 18 layers); export_gemma.sh passes it, so max_context 1024 works
with exact Gemma semantics (window = query and the 511 previous tokens).

This module monkeypatches those classes in-process (no site-packages edits)
and then runs export_llm's normal hydra entry, so quantization, XNNPACK
lowering and metadata are identical to the SmolLM2 path. It also re-enables
qmode "8da8w" (implemented in quantize.py, just missing from the config
validator).

Quantization quality (why `smooth` exists)
------------------------------------------
The lowered .pte matches the eager torchao-quantized model, so the export
itself is faithful; the loss comes from XNNPACK's dynamic per-token int8
activation quantization meeting Gemma's outlier channels (final hidden state:
one channel ~455 mean |h| vs median ~4). Plain 8da8w therefore gives KL ~0.6-0.8
vs fp32 on Hindi/Bengali. `smooth` is a fp32-exact weight rewrite
(SmoothQuant, alpha 0.5, w2 0.65, folded into RMSNorm weights / wv / w3) plus
a split output head that keeps the 16 largest-activation input channels in
fp32 (SplitHead, ~17 MB); it cuts 8da8w KL ~10x. 4-bit layers still need QAT.

QAT checkpoints (ml/train/train_gemma.py --smooth 0.5,0.65 --qat 8da4w) already
carry the layer smoothing, and QAT trained the layers on that grid: use
`smooth --head-only` (final-norm fold + SplitHead only, layer tensors untouched)
and export with use_hqq=False (export_gemma.sh does this for 8da4w). For qmode
8da4w/4w the output head is always quantized 8da8w per-channel, never 4-bit
(QAT does not train it); GEMMA_HEAD_QMODE=same|none overrides.

Usage
-----
  python scripts/gemma3_et.py convert <hf_dir> <out.pth>
  python scripts/gemma3_et.py smooth  <hf_dir> <in.pth> <params.json> <out.pth> [alpha=0.5 alpha_w2=0.65 head_k=16] [--head-only]
      (--head-only for checkpoints from train_gemma.py --smooth: layers already smoothed / QAT'd)
  python scripts/gemma3_et.py check   <hf_dir> <ckpt.pth> <params.json>   # eager vs HF
  python scripts/gemma3_et.py eval    <hf_dir> <ckpt.pth> <params.json> <a.pte|eager:qmode:group[:emb][@ckpt]> ...
  python scripts/gemma3_et.py run     <hf_dir> <a.pte> [b.pte ...]          # greedy replies
  python scripts/gemma3_et.py export  <export_llm hydra overrides...>
  python scripts/gemma3_et.py params  <hf_dir>                              # params json
(scripts/export_gemma.sh <name> <ckpt.pth> [overrides] wraps export.)
`smooth` reads calibration chats from ml/data/raw (read-only).
"""

from __future__ import annotations

import copy
import json
import os
import sys
from pathlib import Path

import torch
import torch.nn.functional as F

from executorch.examples.models.llama import feed_forward as _ff
from executorch.examples.models.llama import llama_transformer as _lt
from executorch.examples.models.llama.norm import RMSNorm
from executorch.examples.models.llama.rope import Rope

GEMMA_LAYER_TYPES = ("sliding_attention", "full_attention")
_PATCHED = False


def _is_gemma(args) -> bool:
    return bool(args.post_attention_norm) and args.local_rope_theta is not None


class SplitHead(torch.nn.Module):
    """Output layer with its k largest-activation input channels kept in fp32.

    logits = main(h * mask) + h[..., idx] @ w_fp.T, where `main` is a normal
    nn.Linear (quantized by export_llm like any other linear) whose idx
    columns are zero. Per-token dynamic activation quantization then no longer
    has to cover the final hidden state's outlier channels. Built automatically
    when a checkpoint carries `output.idx` (see `smooth`)."""

    def __init__(self, dim: int, vocab: int, k: int):
        super().__init__()
        self.main = torch.nn.Linear(dim, vocab, bias=False)
        self.register_buffer("w_fp", torch.zeros(vocab, k))
        self.register_buffer("idx", torch.zeros(k, dtype=torch.long))
        self.register_buffer("mask", torch.ones(dim))

    def forward(self, h):
        return self.main(h * self.mask) + F.linear(h.index_select(-1, self.idx), self.w_fp)


def _split_head_pre_hook(module, state_dict, prefix, *_):
    key = prefix + "output.idx"
    if key in state_dict and not isinstance(module.output, SplitHead):
        with torch.device(module.output.weight.device):
            module.output = SplitHead(module.params.dim, module.output.weight.shape[0],
                                      state_dict[key].numel())


# --------------------------------------------------------------------------- #
# Patches
# --------------------------------------------------------------------------- #
def patch() -> None:
    global _PATCHED
    if _PATCHED:
        return
    _PATCHED = True

    # export_llm's config validator omits "8da8w" although quantize.py implements
    # it (torchao Int8DynamicActivationIntxWeightConfig, int8 weights) and
    # XNNPACK lowers it as qd8 x qc8w GEMM.
    from executorch.extension.llm.export.config.llm_config import QuantizationConfig

    if "8da8w" not in QuantizationConfig.QMODE_OPTIONS:
        QuantizationConfig.QMODE_OPTIONS.append("8da8w")

    # Keep the output head out of 4-bit: QAT (train_gemma.py) only trains the
    # block linears, and the 262k/60k-row head is the most quantization-
    # sensitive layer. For qmode 8da4w / 4w the head (output, or SplitHead's
    # output.main) is quantized first with 8da8w per-channel, then hidden from
    # the layer quantizer. Override with env GEMMA_HEAD_QMODE=same|8da8w|none.
    from executorch.examples.models.llama.source_transformation import quantize as _q

    orig_quantize = _q.quantize

    def quantize(model, qmode, *args, **kw):
        head_mode = os.environ.get("GEMMA_HEAD_QMODE", "8da8w")
        out = getattr(model, "output", None)
        if qmode not in ("8da4w", "4w") or head_mode == "same" or out is None:
            return orig_quantize(model, qmode, *args, **kw)
        if head_mode == "8da8w":
            box = torch.nn.Sequential(out)  # so a bare nn.Linear head is a child
            orig_quantize(box, "8da8w", group_size=0,
                          quantize_with_hqq=kw.get("quantize_with_hqq", True))
            out = box[0]
        print(f"[gemma3_et] output head: {head_mode} (layers: {qmode}, "
              f"hqq={kw.get('quantize_with_hqq', True)})")
        model.output = torch.nn.Identity()
        try:
            model = orig_quantize(model, qmode, *args, **kw)
        finally:
            model.output = out
        return model

    _q.quantize = quantize

    # FeedForward: honor an activation chosen per instance (default SiLU).
    def ff_forward(self, x):
        h = self.w1(x)
        if getattr(self, "gelu_tanh", False):
            h = F.gelu(h, approximate="tanh")
        else:
            h = F.silu(h)
        return self.w2(h * self.w3(x))

    _ff.FeedForward.forward = ff_forward

    # TransformerBlock: Gemma post norms, GELU-tanh, local RoPE for sliding layers.
    orig_block_init = _lt.TransformerBlock.__init__
    orig_block_forward = _lt.TransformerBlock.forward

    def block_init(self, args, attention, mlp_type="default", layer_id=0):
        orig_block_init(self, args, attention, mlp_type=mlp_type, layer_id=layer_id)
        self.gemma = _is_gemma(args)
        if not self.gemma:
            return
        kw = dict(eps=args.norm_eps, add_unit_offset=args.rms_norm_add_unit_offset)
        self.post_attention_norm = RMSNorm(args.dim, **kw)
        if args.post_ffn_norm:
            self.post_ffn_norm = RMSNorm(args.dim, **kw)  # used by upstream forward
        if args.act_fn.value == "gelu_approx" and hasattr(self, "feed_forward"):
            self.feed_forward.gelu_tanh = True
        lt = args.layer_types[layer_id] if args.layer_types else "full_attention"
        self.is_sliding = lt == "sliding_attention"

    def block_forward(self, x, freqs_cos, freqs_sin, attn_options):
        if not getattr(self, "gemma", False):
            return orig_block_forward(self, x, freqs_cos, freqs_sin, attn_options)
        if self.is_sliding:
            freqs_cos, freqs_sin = self.rope_local.get_freqs(
                attn_options.get("input_pos"), x.shape[1]
            )
        h, upd = self.attention(self.attention_norm(x), freqs_cos, freqs_sin, **attn_options)
        h = x + self.post_attention_norm(h)
        out = h + self.post_ffn_norm(self.feed_forward(self.ffn_norm(h)))
        return out, upd

    _lt.TransformerBlock.__init__ = block_init
    _lt.TransformerBlock.forward = block_forward

    # Transformer: shared local-RoPE table + embedding scale.
    orig_tf_init = _lt.Transformer.__init__
    orig_tf_forward = _lt.Transformer.forward

    def tf_init(self, params, layers, rope):
        orig_tf_init(self, params, layers, rope)
        if not _is_gemma(params):
            return
        self._register_load_state_dict_pre_hook(_split_head_pre_hook, with_module=True)
        lp = copy.copy(params)
        lp.rope_freq_base = params.local_rope_theta
        self.rope_local = Rope(lp)
        for layer in self.layers:
            if getattr(layer, "is_sliding", False):
                layer.rope_local = self.rope_local  # shared submodule, like `rope`

    def tf_forward(self, tokens=None, attn_options=None, h=None):
        scale = self.params.embedding_scale_factor
        if tokens is not None and h is None and self.apply_embedding and scale != 1.0:
            h = self.tok_embeddings(tokens) * scale
            tokens = None
        return orig_tf_forward(self, tokens=tokens, attn_options=attn_options, h=h)

    _lt.Transformer.__init__ = tf_init
    _lt.Transformer.forward = tf_forward


# --------------------------------------------------------------------------- #
# Checkpoint conversion (HF Gemma3 dir -> ExecuTorch llama state dict)
# --------------------------------------------------------------------------- #
_MAP = {
    "self_attn.q_proj": "attention.wq", "self_attn.k_proj": "attention.wk",
    "self_attn.v_proj": "attention.wv", "self_attn.o_proj": "attention.wo",
    "self_attn.q_norm": "attention.q_norm_fn", "self_attn.k_norm": "attention.k_norm_fn",
    "input_layernorm": "attention_norm", "post_attention_layernorm": "post_attention_norm",
    "pre_feedforward_layernorm": "ffn_norm", "post_feedforward_layernorm": "post_ffn_norm",
    "mlp.gate_proj": "feed_forward.w1", "mlp.down_proj": "feed_forward.w2",
    "mlp.up_proj": "feed_forward.w3",
}


def convert(hf_dir: str) -> dict[str, torch.Tensor]:
    """No q/k permutation: params use use_hf_rope=True (half-split RoPE)."""
    from safetensors.torch import load_file

    files = sorted(Path(hf_dir).glob("*.safetensors"))
    sd: dict[str, torch.Tensor] = {}
    for f in files:
        sd.update(load_file(f))
    out: dict[str, torch.Tensor] = {}
    for k, v in sd.items():
        k = k.removeprefix("model.language_model.").removeprefix("model.")
        if k == "embed_tokens.weight":
            out["tok_embeddings.weight"] = v
        elif k == "norm.weight":
            out["norm.weight"] = v
        elif k == "lm_head.weight":
            continue
        elif k.startswith("layers."):
            _, i, rest = k.split(".", 2)
            mod, leaf = rest.rsplit(".", 1)
            out[f"layers.{i}.{_MAP[mod]}.{leaf}"] = v
        else:
            raise KeyError(f"unexpected key {k}")
    lm = sd.get("lm_head.weight")
    if lm is not None and not torch.equal(lm, out["tok_embeddings.weight"]):
        print("warning: lm_head differs from embedding; using lm_head for output")
        out["output.weight"] = lm
    else:
        out["output.weight"] = out["tok_embeddings.weight"]
    return out


def params_from_hf(hf_dir: str) -> dict:
    c = json.loads((Path(hf_dir) / "config.json").read_text())
    c = c.get("text_config", c)
    # transformers < 5 writes rope_theta / rope_local_base_freq; 5.x writes
    # rope_parameters: {full_attention: {rope_theta}, sliding_attention: {rope_theta}}.
    if "rope_parameters" in c:
        rope = {k: v["rope_theta"] for k, v in c["rope_parameters"].items()}
    else:
        rope = {"full_attention": c["rope_theta"], "sliding_attention": c["rope_local_base_freq"]}
    return {
        "dim": c["hidden_size"], "n_layers": c["num_hidden_layers"],
        "n_heads": c["num_attention_heads"], "n_kv_heads": c["num_key_value_heads"],
        "head_dim": c["head_dim"], "hidden_dim": c["intermediate_size"],
        "vocab_size": c["vocab_size"], "norm_eps": c["rms_norm_eps"],
        "rope_theta": rope["full_attention"], "local_rope_theta": rope["sliding_attention"],
        "sliding_window": c["sliding_window"], "layer_types": c["layer_types"],
        "use_hf_rope": True, "use_qk_norm": True, "qk_norm_before_rope": True,
        "post_attention_norm": True, "post_ffn_norm": True,
        "embedding_scale_factor": c["hidden_size"] ** 0.5,
        "rms_norm_add_unit_offset": True, "act_fn": "gelu_approx",
    }


# --------------------------------------------------------------------------- #
# Eager validation against HF
# --------------------------------------------------------------------------- #
PROMPTS = [
    "What is the capital of France?",
    "मेरी शादी कब होगी? एक वाक्य में बताइए।",
    "আমার বিয়ে কবে হবে? এক বাক্যে বলুন।",
]


def eos_ids(tok) -> list[int]:
    """<eos> and <end_of_turn> ids (1, 106 originally; different after vocab pruning)."""
    return tok.convert_tokens_to_ids(["<eos>", "<end_of_turn>"])


def chat(q: str) -> str:
    return f"<bos><start_of_turn>user\n{q}<end_of_turn>\n<start_of_turn>model\n"


def build_et(params: dict, ckpt: str, kv: bool, max_len: int = 1024, ring: bool = True):
    from executorch.examples.models.llama.model_args import ModelArgs

    patch()
    args = ModelArgs(**params, max_seq_len=max_len, max_context_len=max_len,
                     use_kv_cache=kv, enable_dynamic_shape=kv, generate_full_logits=not kv)
    m = _lt.construct_transformer(args).eval()
    missing, unexpected = m.load_state_dict(torch.load(ckpt), strict=False)
    missing = [k for k in missing if k.endswith(".weight")]
    assert not missing and not unexpected, (missing, unexpected)
    m = m.float()
    if kv and ring:
        from executorch.examples.models.llama.source_transformation.custom_kv_cache import (
            replace_kv_cache_with_ring_kv_cache,
        )
        w = params["sliding_window"]
        replace_kv_cache_with_ring_kv_cache(
            m, [w if t == "sliding_attention" else 0 for t in params["layer_types"]])
    return m


def check(hf_dir: str, ckpt: str, params_path: str) -> None:
    from transformers import AutoModelForCausalLM, AutoTokenizer

    params = json.loads(Path(params_path).read_text())
    tok = AutoTokenizer.from_pretrained(hf_dir)
    hf = AutoModelForCausalLM.from_pretrained(hf_dir, dtype=torch.float32).eval()
    full = build_et(params, ckpt, kv=False)
    kvm = build_et(params, ckpt, kv=True)
    ok = True
    for q in PROMPTS:
        ids = tok(chat(q), return_tensors="pt", add_special_tokens=False).input_ids
        with torch.no_grad():
            ref = hf(ids).logits[0]
            got = full(tokens=ids)
            got = (got[0] if isinstance(got, tuple) else got)[0]
            # KV-cache path: prefill all but last, then one decode step per token.
            for c in kvm.modules():
                if hasattr(c, "k_cache"):
                    c.k_cache.zero_(); c.v_cache.zero_()
            n = ids.shape[1]
            out = kvm(tokens=ids[:, : n - 4], attn_options={"input_pos": torch.tensor([0])})
            kv_last = []
            for p in range(n - 4, n):
                o = kvm(tokens=ids[:, p : p + 1], attn_options={"input_pos": torch.tensor([p])})
                kv_last.append((o[0] if isinstance(o, tuple) else o).reshape(-1))
            kv_last = torch.stack(kv_last)
        d_full = (ref - got).abs().max().item()
        t_full = (ref.argmax(-1) == got.argmax(-1)).float().mean().item()
        d_kv = (ref[-4:] - kv_last).abs().max().item()
        t_kv = (ref[-4:].argmax(-1) == kv_last.argmax(-1)).float().mean().item()
        print(f"[{n:3d} tok] full: max|d|={d_full:.4f} top1={t_full:.0%} | "
              f"kv decode: max|d|={d_kv:.4f} top1={t_kv:.0%} | ref logit range "
              f"{ref.abs().max().item():.1f} | {q[:30]}")
        ok &= t_full == 1.0 and t_kv == 1.0 and d_full < 0.05 and d_kv < 0.05
    # Long sequence (>512) to exercise the sliding window in the kv path.
    text = " ".join(["The planets move slowly through the twelve signs of the zodiac."] * 60)
    ids = tok(text, return_tensors="pt").input_ids[:, :700]
    with torch.no_grad():
        ref = hf(ids).logits[0]
        for c in kvm.modules():
            if hasattr(c, "k_cache"):
                c.k_cache.zero_(); c.v_cache.zero_()
        kvm(tokens=ids[:, :600], attn_options={"input_pos": torch.tensor([0])})
        outs = []
        for p in range(600, 700):
            o = kvm(tokens=ids[:, p : p + 1], attn_options={"input_pos": torch.tensor([p])})
            outs.append((o[0] if isinstance(o, tuple) else o).reshape(-1))
        outs = torch.stack(outs)
    d = (ref[600:] - outs).abs().max().item()
    t = (ref[600:].argmax(-1) == outs.argmax(-1)).float().mean().item()
    print(f"[700 tok, sliding window active] kv decode 600..699: max|d|={d:.4f} top1={t:.0%}")
    ok &= t > 0.98
    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


# --------------------------------------------------------------------------- #
# .pte greedy test (plain forward(tokens, input_pos) + argmax, as the app does)
# --------------------------------------------------------------------------- #
# Note: ExecuTorch's Python TextLLMRunner sampled the out-of-range id 262144
# (<image_soft_token>; the tokenizer has 262145 entries, the model 262144
# logits) on the Hindi prompt, then crashed in aten::embedding. Calling the
# method directly gives correct logits, and the app's runner (rn-executorch
# legacy BaseLLMRunner) sizes its sampler from the logits tensor, so this test
# drives the method directly.
def run_ptes(hf_dir: str, ptes: list[str], max_new: int = 40) -> None:
    import time

    from executorch.extension.llm.custom_ops import custom_ops  # noqa: F401
    from executorch.kernels import quantized  # noqa: F401
    from executorch.runtime import Runtime
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(hf_dir)
    hf = AutoModelForCausalLM.from_pretrained(hf_dir, dtype=torch.float32).eval()
    progs = {p: Runtime.get().load_program(p) for p in ptes}
    for q in PROMPTS:
        ids = tok(chat(q), return_tensors="pt", add_special_tokens=False).input_ids
        with torch.no_grad():
            o = hf.generate(ids, max_new_tokens=max_new, do_sample=False, eos_token_id=eos_ids(tok))
        ref = o[0, ids.shape[1]:].tolist()
        print(f"\n=== {q}\n--- HF fp32\n{tok.decode(ref, skip_special_tokens=True).strip()!r}")
        for p, prog in progs.items():
            m = prog.load_method("forward")  # fresh method = fresh KV cache
            t0 = time.time()
            logits = m.execute([ids, torch.tensor([0])])[0].reshape(-1)
            t1 = time.time()
            out, pos = [], ids.shape[1]
            while len(out) < max_new:
                nxt = int(logits.argmax())
                out.append(nxt)
                if nxt in eos_ids(tok):
                    break
                logits = m.execute([torch.tensor([[nxt]]), torch.tensor([pos])])[0].reshape(-1)
                pos += 1
            t2 = time.time()
            n_dec = max(len(out) - 1, 1)
            same = next((i for i, (a, b) in enumerate(zip(out, ref)) if a != b), min(len(out), len(ref)))
            print(f"--- {Path(p).name}: prefill {ids.shape[1] / (t1 - t0):.0f} tok/s, "
                  f"decode {n_dec / (t2 - t1):.0f} tok/s, "
                  f"{'identical to HF' if out == ref else f'first {same} tokens match HF'}\n"
                  f"{tok.decode(out, skip_special_tokens=True).strip()!r}")


TEXTS = [
    "Saturn in the tenth house often brings slow but steady growth in career. "
    "Patience and discipline are rewarded, and recognition tends to arrive after the age of thirty.",
    "शनि दसवें भाव में हो तो करियर में धीमी लेकिन स्थिर प्रगति होती है। धैर्य और अनुशासन का फल मिलता है।",
    "দশম ভাবে শনি থাকলে কর্মজীবনে ধীর কিন্তু স্থির উন্নতি হয়। ধৈর্য ও শৃঙ্খলার ফল পাওয়া যায়।",
]


def evaluate(hf_dir: str, ckpt: str, params_path: str, specs: list[str]) -> None:
    """Teacher-forced agreement with HF fp32 on the chat prompts (+ HF greedy
    replies) and plain en/hi/bn text. spec = path.pte | eager:<qmode>:<group>[:<emb>]
    (eager = same torchao transforms applied to the eager ET model, no lowering;
    append @ckpt.pth to use another checkpoint)."""
    from executorch.extension.llm.custom_ops import custom_ops  # noqa: F401
    from executorch.kernels import quantized  # noqa: F401
    from executorch.runtime import Runtime
    from transformers import AutoModelForCausalLM, AutoTokenizer

    params = json.loads(Path(params_path).read_text())
    tok = AutoTokenizer.from_pretrained(hf_dir)
    hf = AutoModelForCausalLM.from_pretrained(hf_dir, dtype=torch.float32).eval()
    seqs = []  # (lang, ids, n_prefix)
    for q, lang in zip(PROMPTS, ("en", "hi", "bn")):
        ids = tok(chat(q), return_tensors="pt", add_special_tokens=False).input_ids
        with torch.no_grad():
            o = hf.generate(ids, max_new_tokens=40, do_sample=False, eos_token_id=eos_ids(tok))
        seqs.append((lang, o, ids.shape[1] - 1))
    for t, lang in zip(TEXTS, ("en", "hi", "bn")):
        seqs.append((lang, tok(t, return_tensors="pt").input_ids[:, :48], 4))
    for i, t in enumerate(load_chats("eval")):
        ids = tok(t, return_tensors="pt", add_special_tokens=False).input_ids[:, :256]
        seqs.append((("en", "hi", "bn")[i // 10], ids, 4))
    with torch.no_grad():
        refs = [hf(ids).logits[0, n - 1 : ids.shape[1] - 1] for _, ids, n in seqs]

    for spec in specs:
        outs = []
        if spec.startswith("eager:"):
            body, _, ck = spec.partition("@")  # optional @other_ckpt.pth
            _, qmode, group, *emb = body.split(":")
            patch()  # before importing quantize: it wraps quantize() (8-bit head)
            from executorch.examples.models.llama.source_transformation.quantize import (
                get_quant_embedding_transform, quantize,
            )
            m = build_et(params, ck or ckpt, kv=False)
            if emb:
                m = get_quant_embedding_transform(emb[0])(m)
            if qmode != "none":
                m = quantize(m, qmode, group_size=int(group))
            with torch.no_grad():
                for _, ids, n in seqs:
                    o = m(tokens=ids)
                    o = (o[0] if isinstance(o, tuple) else o)[0]
                    outs.append(o[n - 1 : ids.shape[1] - 1])
        else:
            prog = Runtime.get().load_program(spec)
            for _, ids, n in seqs:
                meth = prog.load_method("forward")
                rows = [meth.execute([ids[:, :n], torch.tensor([0])])[0].reshape(-1)]
                for p in range(n, ids.shape[1] - 1):
                    rows.append(meth.execute([ids[:, p : p + 1], torch.tensor([p])])[0].reshape(-1))
                outs.append(torch.stack(rows))
        agg: dict[str, list] = {}
        for (lang, _, _), r, o in zip(seqs, refs, outs):
            kl = F.kl_div(o.log_softmax(-1), r.log_softmax(-1), log_target=True, reduction="none").sum(-1)
            a = agg.setdefault(lang, [0, 0, 0.0, 0.0])
            a[0] += int((r.argmax(-1) == o.argmax(-1)).sum()); a[1] += r.shape[0]
            a[2] += float(kl.sum()); a[3] = max(a[3], float((r - o).abs().max()))
        print(spec + "  " + " | ".join(
            f"{k}: top1 {a[0] / a[1]:.3f} KL {a[2] / a[1]:.4f}" for k, a in agg.items()), flush=True)


# --------------------------------------------------------------------------- #
# SmoothQuant-style rescaling (pure weight transform, fp32-equivalent)
# --------------------------------------------------------------------------- #
# Gemma's linear inputs have a few huge channels (final hidden: one channel
# with mean |h| ~455 vs median ~4). XNNPACK's 8da* kernels quantize activations
# per token, so those channels wipe out the rest. Moving the per-channel scale
# s_j = amax(X_j)^a / amax(W_j)^(1-a) into the preceding op (RMSNorm weight,
# wv / w3 rows) keeps the fp32 function identical and makes activations
# quantization-friendly. Folds:
#   attention_norm -> wq,wk,wv | ffn_norm -> w1,w3 | final norm -> output
#   w3 rows -> w2 cols         | wv rows (shared kv head) -> wo cols (all heads)
DATA = Path(__file__).resolve().parent.parent / "data" / "raw"


def load_chats(split: str) -> list[str]:
    """Chat-formatted samples from the teacher data (read-only).
    calib: en 24 / hi 24 / bn 10;  eval: disjoint en 10 / hi 10 / bn 10."""
    def rows(f, lang=None):
        out = []
        for line in open(DATA / f):
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if lang is None or d.get("lang") == lang:
                out.append(d)
        return out

    def fmt(d):
        s = "<bos>"
        for t in d["turns"]:
            s += f"<start_of_turn>user\n{t['user']}<end_of_turn>\n<start_of_turn>model\n{t['assistant']}<end_of_turn>\n"
        return s

    en, hi = rows("answers_snapshot_v2.jsonl"), rows("answers_ml.jsonl", "hi")
    bn = rows("pilot_ml.jsonl", "bn")
    if split == "calib":
        picked = en[:24] + hi[:24] + bn[:10]
    else:
        picked = en[1000:1010] + hi[300:310] + bn[10:20]
    return [fmt(d) for d in picked]


def smooth(hf_dir: str, ckpt: str, params_path: str, out: str, alpha: float = 0.5,
           alpha_w2: float | None = None, head_split_k: int = 16, head_only: bool = False) -> None:
    """head_only: skip the per-layer folds (for checkpoints trained with
    train_gemma.py --smooth, whose layers are already smoothed and QAT'd on
    that grid); only fold the final-norm scale into the head and split it."""
    from transformers import AutoTokenizer

    params = json.loads(Path(params_path).read_text())
    tok = AutoTokenizer.from_pretrained(hf_dir)
    m = build_et(params, ckpt, kv=False, max_len=1024)
    amax: dict[str, torch.Tensor] = {}

    def hook(name):
        def f(mod, inp, _):
            a = inp[0].detach().abs().reshape(-1, inp[0].shape[-1]).amax(0)
            amax[name] = torch.maximum(amax[name], a) if name in amax else a
        return f

    hs = [mod.register_forward_hook(hook(n)) for n, mod in m.named_modules()
          if isinstance(mod, torch.nn.Linear)]
    with torch.no_grad():
        for text in load_chats("calib"):
            ids = tok(text, return_tensors="pt", add_special_tokens=False).input_ids[:, :1024]
            m(tokens=ids)
    for h in hs:
        h.remove()

    sd = {k: v.float().clone() for k, v in torch.load(ckpt).items()}
    sd["output.weight"] = sd["output.weight"].clone()  # untie from tok_embeddings

    def scale(x_amax, ws, alpha=alpha):
        w_amax = torch.stack([w.abs().amax(0) for w in ws]).amax(0)
        s = x_amax.clamp(min=1e-5) ** alpha / w_amax.clamp(min=1e-5) ** (1 - alpha)
        return s.clamp(min=1e-5)

    def fold_norm(key, s):  # unit-offset RMSNorm: out = n(x) * (1 + w)
        sd[key] = (1.0 + sd[key]) / s - 1.0

    nh, hd = params["n_heads"], params["head_dim"]
    for i in range(0 if head_only else params["n_layers"]):
        p = f"layers.{i}."
        qkv = [sd[p + f"attention.w{c}.weight"] for c in "qkv"]
        s = scale(amax[p + "attention.wq"], qkv)
        fold_norm(p + "attention_norm.weight", s)
        for c in "qkv":
            sd[p + f"attention.w{c}.weight"] *= s[None, :]
        s = scale(amax[p + "feed_forward.w1"], [sd[p + "feed_forward.w1.weight"], sd[p + "feed_forward.w3.weight"]])
        fold_norm(p + "ffn_norm.weight", s)
        sd[p + "feed_forward.w1.weight"] *= s[None, :]
        sd[p + "feed_forward.w3.weight"] *= s[None, :]
        s = scale(amax[p + "feed_forward.w2"], [sd[p + "feed_forward.w2.weight"]],
                  alpha if alpha_w2 is None else alpha_w2)
        sd[p + "feed_forward.w3.weight"] /= s[:, None]
        sd[p + "feed_forward.w2.weight"] *= s[None, :]
        # wo input = concat over q heads of attention over the single kv head's v
        assert params["n_kv_heads"] == 1, "wo fold assumes one kv head"
        xo = amax[p + "attention.wo"].view(nh, hd).amax(0)
        wo = sd[p + "attention.wo.weight"]
        s = scale(xo, [wo.view(-1, nh, hd).abs().amax(1)])
        sd[p + "attention.wv.weight"] /= s[:, None]
        sd[p + "attention.wo.weight"] = (wo.view(-1, nh, hd) * s[None, None, :]).reshape(wo.shape)
    s = scale(amax["output"], [sd["output.weight"]])
    fold_norm("norm.weight", s)
    sd["output.weight"] *= s[None, :]
    if head_split_k:
        idx = (amax["output"] / s).topk(head_split_k).indices.sort().values
        w = sd.pop("output.weight")
        sd["output.idx"], sd["output.w_fp"] = idx, w[:, idx].clone()
        sd["output.mask"] = torch.ones(w.shape[1]).index_fill_(0, idx, 0.0)
        sd["output.main.weight"] = w.index_fill(1, idx, 0.0)
    torch.save(sd, out)
    print(f"wrote {out} (alpha={alpha}, alpha_w2={alpha_w2}, head_k={head_split_k}, "
          f"{'head only' if head_only else 'layers + head'})")


def export(overrides: list[str]) -> None:
    patch()
    from executorch.extension.llm.export import export_llm
    from executorch.extension.llm.export.builder import LLMEdgeManager

    # LLMEdgeManager overwrites metadata get_max_seq_len with export.max_seq_length, but the
    # graph accepts max_seq_length-1 tokens per call; keep a value passed in base.metadata
    # (export_gemma.sh writes the real bound so TextLLMRunner chunks prefill correctly).
    if not getattr(LLMEdgeManager, "_gemma_meta_patched", False):
        _init = LLMEdgeManager.__init__

        def init(self, *a, **kw):
            want = (kw.get("metadata") or {}).get("get_max_seq_len")
            _init(self, *a, **kw)
            if want is not None:
                self.metadata["get_max_seq_len"] = want

        LLMEdgeManager.__init__ = init
        LLMEdgeManager._gemma_meta_patched = True

    sys.argv = ["export_llm", *overrides]
    export_llm.main()


if __name__ == "__main__":
    cmd, rest = sys.argv[1], sys.argv[2:]
    if cmd == "convert":
        torch.save(convert(rest[0]), rest[1])
        print(f"wrote {rest[1]}")
    elif cmd == "params":
        print(json.dumps(params_from_hf(rest[0]), indent=2))
    elif cmd == "check":
        check(*rest)
    elif cmd == "run":
        run_ptes(rest[0], rest[1:])
    elif cmd == "smooth":
        ho = "--head-only" in rest
        rest = [x for x in rest if x != "--head-only"]
        a = [float(x) for x in rest[4:6]] + [int(x) for x in rest[6:7]]
        smooth(rest[0], rest[1], rest[2], rest[3], *a, head_only=ho)
    elif cmd == "eval":
        evaluate(rest[0], rest[1], rest[2], rest[3:])
    elif cmd == "export":
        export(rest)
    else:
        raise SystemExit(__doc__)
