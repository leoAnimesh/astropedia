"""Perplexity of Gemma 3 270M under different torchao quantization configs, on
short English, Hindi and Bengali passages. Cheap stand-in for exporting each
variant: tells us which parts of the model tolerate 4-bit."""
import copy, math, sys, torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from torchao.quantization import quantize_, Int8DynamicActivationIntxWeightConfig, IntxWeightOnlyConfig
from torchao.quantization.granularity import PerGroup, PerAxis

P = sys.argv[1] if len(sys.argv) > 1 else 'models/gemma-3-270m-it'
TEXTS = {
 'en': "Saturn is moving through your tenth house this year, so work may feel slow and demanding. Progress comes from steady effort rather than luck. Keep your routines tight, finish what you start, and by spring the results of your patience will start to show.",
 'hi': "इस साल शनि आपके दसवें घर से गुज़र रहा है, इसलिए काम धीमा और मेहनत भरा लग सकता है। तरक्की किस्मत से नहीं, लगातार कोशिश से आएगी। अपनी दिनचर्या मज़बूत रखें, जो शुरू करें उसे पूरा करें, और वसंत तक आपके धैर्य का फल दिखने लगेगा।",
 'bn': "এই বছর শনি আপনার দশম ঘর দিয়ে যাচ্ছে, তাই কাজ ধীর আর পরিশ্রমের মনে হতে পারে। উন্নতি আসবে ভাগ্য থেকে নয়, নিয়মিত চেষ্টা থেকে। রোজকার অভ্যাস ঠিক রাখুন, যা শুরু করবেন তা শেষ করুন, আর বসন্তের মধ্যে আপনার ধৈর্যের ফল দেখা দিতে শুরু করবে।",
}
tok = AutoTokenizer.from_pretrained(P)
base = AutoModelForCausalLM.from_pretrained(P, dtype=torch.float32).eval()
enc = {k: tok(v, return_tensors='pt').input_ids for k, v in TEXTS.items()}

def ppl(m):
    out = {}
    with torch.no_grad():
        for k, ids in enc.items():
            out[k] = math.exp(m(ids, labels=ids).loss.item())
    return out

def lin_cfg(bits, group):
    dt = {4: torch.int4, 8: torch.int8}[bits]
    g = PerAxis(0) if group == 0 else PerGroup(group)
    return Int8DynamicActivationIntxWeightConfig(weight_dtype=dt, weight_granularity=g)

def wo_cfg(bits, group):
    # Weight-only: activations stay in float.
    dt = {4: torch.int4, 8: torch.int8}[bits]
    g = PerAxis(0) if group == 0 else PerGroup(group)
    return IntxWeightOnlyConfig(weight_dtype=dt, granularity=g)

def emb_cfg(bits, group):
    dt = {4: torch.int4, 8: torch.int8}[bits]
    g = PerAxis(0) if group == 0 else PerGroup(group)
    return IntxWeightOnlyConfig(weight_dtype=dt, granularity=g)

def variant(layers=None, head=None, emb=None, wo=False):
    m = copy.deepcopy(base)
    # Untie so the output layer and embedding can be quantized separately (as the export does).
    m.lm_head.weight = torch.nn.Parameter(m.model.embed_tokens.weight.detach().clone())
    is_layer = lambda mod, fqn: isinstance(mod, torch.nn.Linear) and fqn.startswith('model.layers')
    lc = wo_cfg if wo else lin_cfg
    if layers: quantize_(m, lc(*layers), filter_fn=is_layer)
    if head:   quantize_(m, lc(*head), filter_fn=lambda mod, fqn: fqn == 'lm_head')
    if emb:    quantize_(m, emb_cfg(*emb), filter_fn=lambda mod, fqn: isinstance(mod, torch.nn.Embedding))
    return m

runs = [
  ('fp32',                    {}),
  ('W-ONLY layers 4w g32',    dict(layers=(4, 32), wo=True)),
  ('W-ONLY head 4w g32',      dict(head=(4, 32), wo=True)),
  ('W-ONLY all 4w g32',       dict(layers=(4, 32), head=(4, 32), emb=(4, 32), wo=True)),
  ('W-ONLY layers4 head4 emb8', dict(layers=(4, 32), head=(4, 32), emb=(8, 0), wo=True)),
]
print(f"{'variant':26} {'en':>8} {'hi':>8} {'bn':>8}")
for name, kw in runs:
    r = ppl(variant(**kw) if kw else base)
    print(f"{name:26} {r['en']:8.2f} {r['hi']:8.2f} {r['bn']:8.2f}", flush=True)
