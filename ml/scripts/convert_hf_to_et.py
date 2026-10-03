"""Convert a Hugging Face Llama-architecture checkpoint (SmolLM2) to the
Meta-style state dict that ExecuTorch's llama `export_llm` expects.

HF stores q/k projections permuted for its half-split RoPE; ExecuTorch's
default RoPE is interleaved, so we undo that permutation here.

Usage: python convert_hf_to_et.py <hf_dir> <out.pth>
"""

import json
import sys
from pathlib import Path

import torch
from safetensors.torch import load_file


def unpermute(w: torch.Tensor, n_heads: int) -> torch.Tensor:
    out_dim, in_dim = w.shape
    return (
        w.view(n_heads, 2, out_dim // n_heads // 2, in_dim)
        .transpose(1, 2)
        .reshape(out_dim, in_dim)
    )


def convert(hf_dir: Path) -> dict[str, torch.Tensor]:
    cfg = json.loads((hf_dir / "config.json").read_text())
    n_heads, n_kv = cfg["num_attention_heads"], cfg["num_key_value_heads"]
    sd = load_file(hf_dir / "model.safetensors")
    out: dict[str, torch.Tensor] = {
        "tok_embeddings.weight": sd["model.embed_tokens.weight"],
        "norm.weight": sd["model.norm.weight"],
    }
    out["output.weight"] = sd.get("lm_head.weight", out["tok_embeddings.weight"])
    for i in range(cfg["num_hidden_layers"]):
        p = f"model.layers.{i}."
        q = f"layers.{i}."
        out[q + "attention.wq.weight"] = unpermute(sd[p + "self_attn.q_proj.weight"], n_heads)
        out[q + "attention.wk.weight"] = unpermute(sd[p + "self_attn.k_proj.weight"], n_kv)
        out[q + "attention.wv.weight"] = sd[p + "self_attn.v_proj.weight"]
        out[q + "attention.wo.weight"] = sd[p + "self_attn.o_proj.weight"]
        out[q + "feed_forward.w1.weight"] = sd[p + "mlp.gate_proj.weight"]
        out[q + "feed_forward.w2.weight"] = sd[p + "mlp.down_proj.weight"]
        out[q + "feed_forward.w3.weight"] = sd[p + "mlp.up_proj.weight"]
        out[q + "attention_norm.weight"] = sd[p + "input_layernorm.weight"]
        out[q + "ffn_norm.weight"] = sd[p + "post_attention_layernorm.weight"]
    return out


if __name__ == "__main__":
    hf_dir, dst = Path(sys.argv[1]), Path(sys.argv[2])
    torch.save(convert(hf_dir), dst)
    print(f"wrote {dst}")
