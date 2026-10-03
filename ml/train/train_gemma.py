"""Fine-tune Gemma 3 270M-it (vocab-pruned) on the Astropedia SFT set
(en + hi + bn), optionally with quantization-aware training that simulates the
app's ExecuTorch export (8-bit dynamic per-token activations, 4-bit symmetric
grouped weights, group 32) on the transformer-block linears.

Data: train.jsonl / val.jsonl from ml/data/build_sft.py (v3). Each row has
`prompt` (Gemma chat string ending in "<start_of_turn>model\\n") and
`completion` ("{answer}<end_of_turn>"); loss is on the completion only. At
startup the prompt strings are checked against the tokenizer's chat template.

  # Colab (T4):
  python train_gemma.py --model gemma-3-270m-it-pruned --out astro-gemma
  # QAT off / delayed / from the first step:
  python train_gemma.py --model ... --qat none
  python train_gemma.py --model ... --qat 8da4w --qat-start 0.25   # default
  python train_gemma.py --model ... --qat 8da4w --qat-start 0
  # CPU smoke test:
  python train_gemma.py --model ../models/gemma-3-270m-it --limit 32 --max-steps 4 --max-length 256 --batch 2

Precision: fp32 by default. Gemma 3's residual stream reaches ~1e5 on our data
(measured on the pruned base: 103k entering layer 14's norms), past fp16's
65504: a pure-fp16 forward gives NaN loss on every example. Under fp16
autocast the residual stays fp32 but post_feedforward_layernorm emits fp16
values up to 35.7k (1.8x headroom), so overflow during fine-tuning is a real
risk; T4 has no bf16. A 270M model fits easily in fp32 (weights+grads+Adam
~2.2 GB at the 60k pruned vocab). `--precision auto` picks bf16 autocast on
GPUs that have it (L4/A100), fp32 otherwise; `--precision fp16` is available
(NaN guard aborts the run) but not recommended.

Output (--out): a plain HF fp32 checkpoint (fake-quant modules converted back
to nn.Linear; weights are the QAT-trained fp32 values) + tokenizer, plus
samples.txt (one greedy reply per language x task, generated *with* fake-quant
on, i.e. what the exported model computes) and train_log.json.

Smoothing x QAT: SmoothQuant rescales input channels of every block linear, so
applied AFTER QAT it moves the weights off the int4 grid QAT trained them for
(measured: QAT'd model, en/hi completion loss after 8da4w 2.456/3.737 direct
vs 2.487/3.846 if smoothed at export). Use `--smooth 0.5,0.65` to fold the
same rewrite in BEFORE training (fp32-exact), then export WITHOUT the layer part
of gemma3_et.py smooth (keep only its final-norm/SplitHead head handling), and
with use_hqq=False so the exporter computes the same absmax scales QAT used
(eager torchao 8da4w PTQ == this fake quant, bit-exact):
  gemma3_et.py convert <out> x.pth  ->  head-only smooth  ->
  export_gemma.sh name x.pth quantization.qmode=8da4w quantization.group_size=32 \\
      quantization.use_hqq=False 'quantization.embedding_quantize="8,32"'
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import time
from collections import defaultdict
from pathlib import Path

import torch

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="gemma-3-270m-it-pruned",
                help="HF model dir (the vocab-pruned base; token ids are read from its tokenizer, never hardcoded)")
ap.add_argument("--train", default="train.jsonl")
ap.add_argument("--val", default="val.jsonl")
ap.add_argument("--out", default="astro-gemma")
ap.add_argument("--ckpt-dir", default="ckpt", help="Trainer checkpoints; put on Google Drive to survive disconnects")
ap.add_argument("--epochs", type=float, default=2)
ap.add_argument("--max-steps", type=int, default=-1, help="overrides --epochs (smoke tests)")
ap.add_argument("--lr", type=float, default=5e-5)
ap.add_argument("--warmup", type=float, default=0.03, help="warmup fraction")
ap.add_argument("--batch", type=int, default=16, help="per-device batch")
ap.add_argument("--grad-accum", type=int, default=2)
ap.add_argument("--max-length", type=int, default=1024, help="longer examples are dropped (counted), not truncated")
ap.add_argument("--precision", choices=["auto", "fp32", "bf16", "fp16"], default="auto")
ap.add_argument("--qat", choices=["none", "8da4w"], default="8da4w")
ap.add_argument("--qat-start", type=float, default=0.25,
                help="when fake quant turns on: fraction of total steps if < 1, else a step number (0 = from start)")
ap.add_argument("--group-size", type=int, default=32)
ap.add_argument("--smooth", default="none",
                help="'none' or 'ALPHA,ALPHA_W2' (e.g. 0.5,0.65): fold SmoothQuant into the block linears/norms "
                     "BEFORE training (fp32-exact), so QAT trains the exact weights the exporter quantizes. "
                     "Export must then skip the layer part of gemma3_et.py smooth (head split only).")
ap.add_argument("--save-steps", type=int, default=100)
ap.add_argument("--eval-steps", type=int, default=100)
ap.add_argument("--limit", type=int, default=0, help="use only the first N train / N//4 val rows (smoke tests)")
ap.add_argument("--samples", type=int, default=1, help="greedy samples per lang x task after training")
ap.add_argument("--no-resume", action="store_true", help="ignore checkpoints in --ckpt-dir")
ap.add_argument("--attn", default="sdpa", help="attn_implementation (sdpa | eager)")
ap.add_argument("--seed", type=int, default=42)
a = ap.parse_args()

from datasets import Dataset  # noqa: E402
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainerCallback  # noqa: E402
from trl import SFTConfig, SFTTrainer  # noqa: E402

cuda = torch.cuda.is_available()
precision = a.precision
if precision == "auto":
    precision = "bf16" if cuda and torch.cuda.is_bf16_supported() else "fp32"
print(f"torch {torch.__version__}  device {'cuda:' + torch.cuda.get_device_name(0) if cuda else 'cpu'}  "
      f"precision {precision}  qat {a.qat}")

tok = AutoTokenizer.from_pretrained(a.model)
END = tok.convert_tokens_to_ids("<end_of_turn>")
assert END != tok.unk_token_id, "tokenizer has no <end_of_turn>"
BOS = tok.bos_token_id


# ─── data ────────────────────────────────────────────────────────────────────

def read(path: str, limit: int) -> list[dict]:
    rows = [json.loads(l) for l in open(path, encoding="utf-8")]
    return rows[:limit] if limit else rows


def check_template(rows: list[dict]) -> None:
    """Our prompt strings must equal the tokenizer's own Gemma chat template."""
    for r in rows:
        ref = tok.apply_chat_template(r["messages"][:-1], add_generation_prompt=True, tokenize=False)
        full = tok.apply_chat_template(r["messages"], tokenize=False)
        assert ref == r["prompt"], f"prompt differs from chat template:\n{ref!r}\n{r['prompt']!r}"
        assert full.startswith(r["prompt"] + r["completion"]), "completion differs from chat template"


def encode(rows: list[dict], name: str) -> Dataset:
    out, dropped = defaultdict(list), defaultdict(int)
    for r in rows:
        p = tok(r["prompt"], add_special_tokens=False).input_ids
        c = tok(r["completion"], add_special_tokens=False).input_ids
        assert p[0] == BOS and c[-1] == END and p.count(BOS) == 1, "special tokens not parsed as expected"
        if len(p) + len(c) > a.max_length:
            dropped[(r["lang"], r["task"])] += 1
            continue
        out["input_ids"].append(p + c)
        out["labels"].append([-100] * len(p) + c)
        out["lang"].append(r["lang"])
        out["task"].append(r["task"])
    if dropped:
        print(f"{name}: dropped {sum(dropped.values())} rows longer than {a.max_length} tokens: {dict(dropped)}")
    lens = sorted(len(x) for x in out["input_ids"])
    print(f"{name}: {len(lens)} rows, tokens/row p50 {lens[len(lens) // 2]} p95 {lens[int(len(lens) * .95)]} "
          f"max {lens[-1]}, total {sum(lens)}")
    return Dataset.from_dict(dict(out))


train_rows, val_rows = read(a.train, a.limit), read(a.val, a.limit // 4 if a.limit else 0)
check_template(train_rows[:200] + val_rows)
train_ds, val_ds = encode(train_rows, "train"), encode(val_rows, "val")
eval_ds = val_ds.remove_columns(["lang", "task"])

# ─── model + QAT ─────────────────────────────────────────────────────────────

dtype = torch.bfloat16 if precision == "bf16" and not cuda else torch.float32  # master weights fp32 on GPU
model = AutoModelForCausalLM.from_pretrained(a.model, dtype=dtype, attn_implementation=a.attn)
model.config.use_cache = False

# Transformer-block linears only: q/k/v/o and gate/up/down. Not the embedding
# (exported 8-bit) or the tied lm_head.
QAT_LINEAR = re.compile(r"(^|\.)layers\.\d+\.(self_attn|mlp)\.(q|k|v|o|gate|up|down)_proj$")


def qat_filter(mod: torch.nn.Module, fqn: str) -> bool:
    return isinstance(mod, torch.nn.Linear) and bool(QAT_LINEAR.search(fqn)) and \
        mod.in_features % a.group_size == 0


def export_base_config():
    """The exact PTQ config ExecuTorch's export_llm applies for qmode=8da4w
    (examples/models/llama/source_transformation/quantize.py), so QATConfig
    derives matching fake quantizers: int8 per-token asymmetric activations,
    int4 symmetric weights per group of 32, absmax ("affine") scales."""
    from torchao.quantization import Int8DynamicActivationIntxWeightConfig
    from torchao.quantization.granularity import PerGroup
    return Int8DynamicActivationIntxWeightConfig(weight_dtype=torch.int4, weight_granularity=PerGroup(a.group_size))


def set_fake_quant(model: torch.nn.Module, enabled: bool) -> int:
    n = 0
    for m in model.modules():
        for attr in ("activation_fake_quantizer", "weight_fake_quantizer"):
            fq = getattr(m, attr, None)
            if fq is not None:
                fq.enabled = enabled
                n += 1
    return n


def smooth_layers(model, rows: list[dict], alpha: float, alpha_w2: float) -> None:
    """Same per-layer rewrite as ml/scripts/gemma3_et.py `smooth` (SmoothQuant
    folded into the unit-offset RMSNorms, v_proj and up_proj), done on the HF
    model. Exact in fp32; moves activation outliers into the weights so the
    8-bit per-token activation quantization loses less. Calibration: up to 24
    training rows per language."""
    model.to("cuda" if cuda else "cpu")
    by_lang = defaultdict(list)
    for r in rows:
        if len(by_lang[r["lang"]]) < 24:
            by_lang[r["lang"]].append(r)
    amax = {}

    def hook(name):
        def f(mod, inp, _):
            x = inp[0].detach().float().abs().reshape(-1, inp[0].shape[-1]).amax(0)
            amax[name] = torch.maximum(amax[name], x) if name in amax else x
        return f

    hs = [m.register_forward_hook(hook(n)) for n, m in model.named_modules() if QAT_LINEAR.search(n)]
    with torch.no_grad():
        for r in (r for v in by_lang.values() for r in v):
            ids = tok(r["prompt"] + r["completion"], add_special_tokens=False, return_tensors="pt").input_ids
            model(ids[:, :a.max_length].to(model.device))
    for h in hs:
        h.remove()

    def scale(x, ws, al):
        w = torch.stack([w.abs().amax(0) for w in ws]).amax(0)
        return (x.clamp(min=1e-5) ** al / w.clamp(min=1e-5) ** (1 - al)).clamp(min=1e-5)

    nh, hd = model.config.num_attention_heads, model.config.head_dim
    assert model.config.num_key_value_heads == 1, "o_proj fold assumes one kv head"
    with torch.no_grad():
        for n, layer in ((n, m) for n, m in model.named_modules() if re.search(r"layers\.\d+$", n)):
            at, mlp = layer.self_attn, layer.mlp
            s = scale(amax[n + ".self_attn.q_proj"], [at.q_proj.weight, at.k_proj.weight, at.v_proj.weight], alpha)
            layer.input_layernorm.weight.copy_((1 + layer.input_layernorm.weight) / s - 1)
            for lin in (at.q_proj, at.k_proj, at.v_proj):
                lin.weight.mul_(s[None, :])
            s = scale(amax[n + ".mlp.gate_proj"], [mlp.gate_proj.weight, mlp.up_proj.weight], alpha)
            layer.pre_feedforward_layernorm.weight.copy_((1 + layer.pre_feedforward_layernorm.weight) / s - 1)
            mlp.gate_proj.weight.mul_(s[None, :])
            mlp.up_proj.weight.mul_(s[None, :])
            s = scale(amax[n + ".mlp.down_proj"], [mlp.down_proj.weight], alpha_w2)
            mlp.up_proj.weight.div_(s[:, None])
            mlp.down_proj.weight.mul_(s[None, :])
            xo = amax[n + ".self_attn.o_proj"].view(nh, hd).amax(0)
            wo = at.o_proj.weight
            s = scale(xo, [wo.view(-1, nh, hd).abs().amax(1)], alpha)
            at.v_proj.weight.div_(s[:, None])
            wo.copy_((wo.view(-1, nh, hd) * s[None, None, :]).reshape(wo.shape))


if a.smooth != "none":
    al, al2 = (float(x) for x in a.smooth.split(","))
    smooth_layers(model, train_rows, al, al2)
    print(f"smoothed block linears before training (alpha {al}, w2 {al2}); export: head-only smoothing")

n_qat = 0
if a.qat == "8da4w":
    from torchao.quantization import quantize_
    from torchao.quantization.qat import QATConfig
    quantize_(model, QATConfig(export_base_config(), step="prepare"), filter_fn=qat_filter)
    n_qat = sum(1 for m in model.modules() if hasattr(m, "weight_fake_quantizer"))
    n_expected = sum(1 for n, m in model.named_modules() if QAT_LINEAR.search(n))
    assert n_qat == n_expected == 7 * model.config.num_hidden_layers, (n_qat, n_expected)
    print(f"QAT: fake-quantized {n_qat} linears (8-bit dyn act per token, int4 sym weights, group {a.group_size})")

# ─── trainer ─────────────────────────────────────────────────────────────────

steps_per_epoch = max(1, math.ceil(len(train_ds) / (a.batch * a.grad_accum)))
total_steps = a.max_steps if a.max_steps > 0 else math.ceil(steps_per_epoch * a.epochs)
qat_start = int(a.qat_start * total_steps) if a.qat_start < 1 else int(a.qat_start)
if n_qat:
    print(f"QAT phase: steps {qat_start}..{total_steps} (fp phase: 0..{qat_start})")


class QATSwitch(TrainerCallback):
    """Delayed fake quant (torchao/torchtune recipe: let the model adapt in
    full precision first, then train against the quantized forward). State is
    derived from global_step, so a resumed run lands in the right phase."""

    def _apply(self, state, model):
        on = state.global_step >= qat_start
        if getattr(self, "on", None) != on:
            set_fake_quant(model, on)
            self.on = on
            print(f"[step {state.global_step}] fake quant {'ON' if on else 'off'}")

    def on_train_begin(self, args, state, control, model=None, **kw):
        self._apply(state, model)

    def on_step_begin(self, args, state, control, model=None, **kw):
        self._apply(state, model)

    def on_evaluate(self, args, state, control, model=None, **kw):
        self._apply(state, model)


class NanGuard(TrainerCallback):
    def on_log(self, args, state, control, logs=None, **kw):
        if logs and any(isinstance(v, float) and not math.isfinite(v) for k, v in logs.items() if "loss" in k):
            raise RuntimeError(f"non-finite loss at step {state.global_step}: {logs} (try --precision fp32)")


def group_by_length_kw() -> dict:
    import dataclasses
    names = {f.name for f in dataclasses.fields(SFTConfig)}
    if "train_sampling_strategy" in names:      # transformers >= 5
        return {"train_sampling_strategy": "group_by_length"}
    return {"group_by_length": True} if "group_by_length" in names else {}


cfg = SFTConfig(
    output_dir=a.ckpt_dir,
    num_train_epochs=a.epochs,
    max_steps=a.max_steps,
    learning_rate=a.lr,
    lr_scheduler_type="cosine",
    warmup_steps=max(1, int(a.warmup * total_steps)),
    weight_decay=0.01,
    max_grad_norm=1.0,
    per_device_train_batch_size=a.batch,
    gradient_accumulation_steps=a.grad_accum,
    per_device_eval_batch_size=a.batch,
    max_length=a.max_length,
    completion_only_loss=True,     # labels already mask the prompt; kept for clarity
    bf16=precision == "bf16" and cuda,
    fp16=precision == "fp16" and cuda,
    eval_strategy="steps",
    eval_steps=a.eval_steps,
    save_strategy="steps",
    save_steps=a.save_steps,
    save_total_limit=2,
    # With delayed QAT the eval loss jumps when fake quant turns on, so "best"
    # would pick a pre-QAT checkpoint; keep the final weights instead.
    load_best_model_at_end=False,
    logging_steps=10,
    report_to="none",
    seed=a.seed,
    dataloader_num_workers=2 if cuda else 0,
    **group_by_length_kw(),        # less padding (rows vary ~100..1000 tokens)
)
trainer = SFTTrainer(model=model, args=cfg, train_dataset=train_ds.remove_columns(["lang", "task"]),
                     eval_dataset=eval_ds, processing_class=tok,
                     callbacks=([QATSwitch()] if n_qat else []) + [NanGuard()])

resume = None
if not a.no_resume and Path(a.ckpt_dir).is_dir() and any(Path(a.ckpt_dir).glob("checkpoint-*")):
    resume = True
    print("resuming from the latest checkpoint in", a.ckpt_dir)
t0 = time.time()
trainer.train(resume_from_checkpoint=resume)
train_min = (time.time() - t0) / 60
final_eval = trainer.evaluate()
print(f"trained in {train_min:.1f} min; final eval (fake quant {'on' if n_qat else 'n/a'}):", final_eval)

# ─── samples (with fake quant on: close to what the exported model will say) ─

model = trainer.model.eval()
model.config.use_cache = True
if n_qat:
    set_fake_quant(model, True)
eos = [END] + ([tok.eos_token_id] if tok.eos_token_id is not None else [])
val_raw = {(r["lang"], r["task"]): [] for r in val_rows}
for r in val_rows:
    val_raw[(r["lang"], r["task"])].append(r)
out_dir = Path(a.out)
out_dir.mkdir(parents=True, exist_ok=True)
lines = []
with torch.no_grad():
    for key in sorted(val_raw):
        for r in val_raw[key][:a.samples]:
            ids = tok(r["prompt"], add_special_tokens=False, return_tensors="pt").input_ids.to(model.device)
            gen = model.generate(ids, attention_mask=torch.ones_like(ids), max_new_tokens=300 if key[1] == "reading" else 160,
                                 do_sample=False, eos_token_id=eos, pad_token_id=tok.pad_token_id)
            reply = tok.decode(gen[0, ids.shape[1]:], skip_special_tokens=True).strip()
            user = r["messages"][-2]["content"]
            block = (f"[{key[0]} / {key[1]}]\nUSER : {user[:160]}\nMODEL: {reply}\n"
                     f"TEACH: {r['messages'][-1]['content']}\n" + "-" * 80)
            print(block)
            lines.append(block)
(out_dir / "samples.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

# ─── convert fake quant back to nn.Linear and save a plain HF fp32 checkpoint ─

qat_eval = None
if n_qat:
    from torchao.quantization import quantize_
    from torchao.quantization.qat import QATConfig
    qat_eval = final_eval
    # step="convert" without a base config = module swap only (FakeQuantizedLinear
    # -> nn.Linear with the same fp32 weights); the real quantization happens at export.
    quantize_(model, QATConfig(step="convert"), filter_fn=lambda m, fqn: hasattr(m, "weight_fake_quantizer"))
    assert not any(hasattr(m, "weight_fake_quantizer") for m in model.modules()), "fake-quant modules left"
model = model.float()
model.config.use_cache = True
model.save_pretrained(out_dir, safe_serialization=True)
tok.save_pretrained(out_dir)
fp_eval = trainer.evaluate() if n_qat else final_eval  # same weights, fake quant removed
log = {"args": vars(a), "precision": precision, "train_minutes": round(train_min, 1),
       "train_rows": len(train_ds), "val_rows": len(val_ds), "total_steps": total_steps,
       "qat_start_step": qat_start if n_qat else None, "eval_fake_quant": qat_eval, "eval_fp32": fp_eval,
       "log_history": trainer.state.log_history}
(out_dir / "train_log.json").write_text(json.dumps(log, indent=1, default=str))
print("eval fp32 (converted):", fp_eval)
print("saved", out_dir, sorted(os.listdir(out_dir)))
