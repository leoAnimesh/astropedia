"""Run the same prompts through the full-precision HF model and each exported
.pte, so quantization damage is visible side by side.

Usage: python compare_pte.py <hf_dir> <a.pte> [<b.pte> ...]
"""

import sys
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from executorch.extension.llm.custom_ops import custom_ops  # noqa: F401  registers llama::custom_sdpa
from executorch.kernels import quantized  # noqa: F401  registers quantized embedding ops
from executorch.extension.llm.runner import GenerationConfig, TextLLMRunner

CHART = (
    "Chart: sun Leo, moon Scorpio, rising Virgo. Current life phase: Jupiter "
    "until 2029-03-14. Venus in 7th house. Saturn in 10th house."
)
PROMPTS = [
    ("saga", f"You are Saga, a warm Vedic astrologer. Answer in 2 to 3 plain sentences. No jargon.\n{CHART}",
     "When will I get married?"),
    ("saga", f"You are Saga, a warm Vedic astrologer. Answer in 2 to 3 plain sentences. No jargon.\n{CHART}",
     "What kind of career suits me?"),
    ("krishna", "You are Krishna, a calm friend. Reply in 3 short sentences. Plain modern English.",
     "I feel lost after losing my job."),
    ("title", "Output only a 2 to 4 word title for this chat.",
     "When will I get married and will it be a love marriage?"),
    ("offtopic", f"You are Saga, a warm Vedic astrologer. Answer in 2 to 3 plain sentences. No jargon.\n{CHART}",
     "Write me a Python function to sort a list."),
]
MAX_NEW = 96

hf_dir, ptes = sys.argv[1], sys.argv[2:]
tok = AutoTokenizer.from_pretrained(hf_dir)


def chat(system: str, user: str) -> str:
    return tok.apply_chat_template(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        tokenize=False, add_generation_prompt=True,
    )


def run_hf(prompt: str) -> str:
    model = run_hf.model
    ids = tok(prompt, return_tensors="pt").input_ids
    with torch.no_grad():
        out = model.generate(ids, max_new_tokens=MAX_NEW, do_sample=False,
                             eos_token_id=[2, 0])
    return tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True).strip()


run_hf.model = AutoModelForCausalLM.from_pretrained(hf_dir, dtype=torch.float32).eval()


def run_pte(runner: TextLLMRunner, prompt: str) -> tuple[str, float]:
    pieces: list[str] = []
    stats: list = []
    runner.reset()
    cfg = GenerationConfig(echo=False, max_new_tokens=MAX_NEW, temperature=0.0)
    runner.generate(prompt, cfg, token_callback=pieces.append, stats_callback=stats.append)
    text = "".join(pieces).replace("<|im_end|>", "").strip()
    tps = 0.0
    if stats:
        s = stats[-1]
        gen_ms = s.inference_end_ms - s.prompt_eval_end_ms
        tps = s.num_generated_tokens / (gen_ms / 1000) if gen_ms > 0 else 0.0
    return text, tps


runners = {p: TextLLMRunner(p, f"{hf_dir}/tokenizer.json") for p in ptes}

for kind, system, user in PROMPTS:
    prompt = chat(system, user)
    print(f"\n=== [{kind}] {user}")
    t = time.time()
    print(f"--- fp32 reference ({time.time() - t:.1f}s)\n{run_hf(prompt)}")
    for path, runner in runners.items():
        text, tps = run_pte(runner, prompt)
        print(f"--- {path.split('/')[-1]} ({tps:.0f} tok/s)\n{text}")
