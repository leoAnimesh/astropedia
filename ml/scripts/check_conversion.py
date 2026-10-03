"""Check that the converted checkpoint matches Hugging Face's logits in eager
mode, before any quantization.

Usage: python check_conversion.py <hf_dir> <converted.pth> <params.json>
"""

import json
import sys

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from executorch.examples.models.llama.llama_transformer import construct_transformer
from executorch.examples.models.llama.model_args import ModelArgs

hf_dir, ckpt, params = sys.argv[1:4]

tok = AutoTokenizer.from_pretrained(hf_dir)
ids = tok("My sun sign is Leo and my moon is in Scorpio.", return_tensors="pt").input_ids

hf = AutoModelForCausalLM.from_pretrained(hf_dir, torch_dtype=torch.float32).eval()
with torch.no_grad():
    ref = hf(ids).logits[0]

args = ModelArgs(**json.loads(open(params).read()), max_seq_len=128, max_context_len=128)
et = construct_transformer(args).eval()
et.load_state_dict(torch.load(ckpt), strict=False)
with torch.no_grad():
    got = et(tokens=ids)
    got = (got[0] if isinstance(got, tuple) else got)[0]
    if got.dim() == 1:  # model may only return last-position logits
        ref = ref[-1]

diff = (ref - got).abs().max().item()
same_top = (ref.argmax(-1) == got.argmax(-1)).float().mean().item()
print(f"max |logit diff| = {diff:.4f}, top-1 agreement = {same_top:.2%}")
sys.exit(0 if diff < 1e-2 else 1)
