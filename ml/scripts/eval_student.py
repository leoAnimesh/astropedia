"""Compare the fine-tuned model in full precision (HF) with its exported .pte on
held-out validation prompts, scored with the same rules build_sft.py uses to
filter teacher answers.

Usage: python eval_student.py <hf_dir> <model.pte> [n_examples] [--show K]
"""

import collections
import json
import sys
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from executorch.extension.llm.custom_ops import custom_ops  # noqa: F401
from executorch.kernels import quantized  # noqa: F401
from executorch.extension.llm.runner import GenerationConfig, TextLLMRunner

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
import build_sft as rules  # noqa: E402

hf_dir, pte = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 and not sys.argv[3].startswith("--") else 60
show = int(sys.argv[sys.argv.index("--show") + 1]) if "--show" in sys.argv else 6
MAX_NEW = 200

val = [json.loads(l) for l in (Path(__file__).resolve().parents[1] / "data/sft/val.jsonl").open()][:n]
tok = AutoTokenizer.from_pretrained(hf_dir)
hf = AutoModelForCausalLM.from_pretrained(hf_dir, dtype=torch.float32).eval()
runner = TextLLMRunner(pte, f"{hf_dir}/tokenizer.json")


def check(task: str, text: str, msgs: list[dict]) -> str | None:
    if task in ("saga", "saga_multi"):
        return rules.check_saga(text)
    if task == "offtopic":
        return rules.check_saga(text, offtopic=True)
    if task == "krishna":
        return rules.check_krishna(text)
    if task == "reading":
        return rules.check_reading(text, "Rising:" in msgs[0]["content"])[0]
    if task == "title":
        return rules.clean_title(text)[0]
    return None


def gen_hf(prompt: str) -> str:
    enc = tok(prompt, return_tensors="pt")
    with torch.no_grad():
        out = hf.generate(**enc, max_new_tokens=MAX_NEW, do_sample=False, eos_token_id=[2, 0])
    return tok.decode(out[0, enc.input_ids.shape[1]:], skip_special_tokens=True).strip()


def gen_pte(prompt: str) -> tuple[str, float]:
    pieces, stats = [], []
    runner.reset()
    runner.generate(prompt, GenerationConfig(echo=False, max_new_tokens=MAX_NEW, temperature=0.0),
                    token_callback=pieces.append, stats_callback=stats.append)
    s = stats[-1] if stats else None
    tps = s.num_generated_tokens / ((s.inference_end_ms - s.prompt_eval_end_ms) / 1000) if s and s.inference_end_ms > s.prompt_eval_end_ms else 0
    return "".join(pieces).replace("<|im_end|>", "").strip(), tps


score = {"hf": collections.Counter(), "pte": collections.Counter()}
fails = {"hf": collections.Counter(), "pte": collections.Counter()}
speeds = []
shown = 0
t0 = time.time()
for ex in val:
    task, msgs = ex["task"], ex["messages"]
    prompt = tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True)
    a_hf = gen_hf(prompt)
    a_pte, tps = gen_pte(prompt)
    speeds.append(tps)
    for name, a in (("hf", a_hf), ("pte", a_pte)):
        r = check(task, a, msgs)
        score[name][task, r is None] += 1
        if r:
            fails[name][f"{task}:{r}"] += 1
    if shown < show:
        shown += 1
        print(f"\n=== [{task}] {msgs[-2]['content'][:110]}")
        print(f"--- fp32 : {a_hf}")
        print(f"--- 4-bit: {a_pte}")
        print(f"--- teach: {msgs[-1]['content']}")

print(f"\n{len(val)} held-out prompts in {time.time() - t0:.0f}s; 4-bit speed on this Mac ~{sum(speeds) / len(speeds):.0f} tok/s")
for name in ("hf", "pte"):
    passed = sum(v for (t, ok), v in score[name].items() if ok)
    print(f"{name:4s} rule pass rate: {passed}/{len(val)}   failures: {dict(fails[name].most_common(6))}")
tasks = sorted({t for t, _ in score["pte"]})
for t in tasks:
    print(f"  {t:10s} fp32 {score['hf'][t, True]}/{score['hf'][t, True] + score['hf'][t, False]}"
          f"   4-bit {score['pte'][t, True]}/{score['pte'][t, True] + score['pte'][t, False]}")
