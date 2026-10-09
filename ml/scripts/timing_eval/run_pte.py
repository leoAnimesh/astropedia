"""Greedy answers from the exported .pte for prompts.jsonl rows {id, variant, system, user}.
usage: run_pte.py prompts.jsonl answers.jsonl [variants]"""
import json, sys, time
from pathlib import Path
ML = Path("/Users/animesh/Developer/projects/astropedia/ml")
sys.path.insert(0, str(ML / "data"))
import build_sft as B  # noqa
from executorch.extension.llm.custom_ops import custom_ops  # noqa
from executorch.kernels import quantized  # noqa
from executorch.extension.llm.runner import GenerationConfig, TextLLMRunner
PTE = str(ML / "out/astro_gemma_v21_8da8w.pte")
TOK = "/Users/animesh/Developer/projects/astropedia/assets/model/astro-gemma-tokenizer.json"
src, dst = sys.argv[1], Path(sys.argv[2])
want = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
runner = TextLLMRunner(PTE, TOK)
done = set()
if dst.exists():
    done = {(r["id"], r["variant"]) for r in map(json.loads, dst.open()) }
rows = [json.loads(l) for l in open(src)]
with dst.open("a") as f:
    for k, r in enumerate(rows):
        if want and r["variant"] not in want or (r["id"], r["variant"]) in done:
            continue
        msgs = [{"role": "system", "content": r["system"]}, {"role": "user", "content": r["user"]}, {"role": "assistant", "content": ""}]
        prompt = B.gemma_prompt(msgs)[0]
        pieces = []
        runner.reset()
        t0 = time.time()
        runner.generate(prompt, GenerationConfig(echo=False, max_new_tokens=260, temperature=float(__import__("os").environ.get("TEMP","0"))), token_callback=pieces.append)
        ans = "".join(pieces)
        for stop in ("<end_of_turn>", "<eos>"):
            ans = ans.split(stop)[0]
        f.write(json.dumps({"id": r["id"], "variant": r["variant"], "answer": ans.strip(), "wall_s": round(time.time() - t0, 2)}, ensure_ascii=False) + "\n")
        f.flush()
        print(f"[{k+1}/{len(rows)}] {r['variant']} {r['id']}: {ans.strip()[:80]!r}", flush=True)
print("DONE")
