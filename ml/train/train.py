"""Fine-tune SmolLM2-135M-Instruct on the Astropedia SFT set (same steps as
train_colab.ipynb). Expects train.jsonl / val.jsonl in the working directory.

  python train.py --epochs 3 --out astro-135m
"""

import argparse

import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="HuggingFaceTB/SmolLM2-135M-Instruct")
ap.add_argument("--epochs", type=float, default=2)
ap.add_argument("--lr", type=float, default=1e-4)
ap.add_argument("--out", default="astro-135m")
ap.add_argument("--samples", type=int, default=8, help="held-out prompts to print after training")
a = ap.parse_args()

ds = load_dataset("json", data_files={"train": "train.jsonl", "val": "val.jsonl"})
# Train only on the final assistant turn; earlier turns are context.
ds = ds.map(lambda ex: {"prompt": ex["messages"][:-1], "completion": ex["messages"][-1:]},
            remove_columns=["messages"])

bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
tok = AutoTokenizer.from_pretrained(a.base)
model = AutoModelForCausalLM.from_pretrained(a.base, dtype=torch.float32)

steps_per_epoch = max(1, len(ds["train"]) // 32)
eval_every = max(10, min(250, steps_per_epoch // 2))
cfg = SFTConfig(
    output_dir="ckpt",
    num_train_epochs=a.epochs,
    learning_rate=a.lr,
    lr_scheduler_type="cosine",
    warmup_steps=max(1, int(0.03 * steps_per_epoch * a.epochs)),
    weight_decay=0.01,
    per_device_train_batch_size=16,
    gradient_accumulation_steps=2,
    per_device_eval_batch_size=32,
    max_length=1024,
    completion_only_loss=True,
    bf16=bf16,
    fp16=torch.cuda.is_available() and not bf16,
    eval_strategy="steps",
    eval_steps=eval_every,
    save_strategy="steps",
    save_steps=eval_every,
    save_total_limit=2,
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    logging_steps=max(1, eval_every // 5),
    report_to="none",
)
trainer = SFTTrainer(model=model, args=cfg, train_dataset=ds["train"], eval_dataset=ds["val"],
                     processing_class=tok)
trainer.train()
print("final eval:", trainer.evaluate())

model = trainer.model.eval()
# SmolLM2 ties lm_head to the embeddings, and the checkpoint stores it once;
# make sure reloading the best checkpoint kept them tied.
model.tie_weights()
assert model.lm_head.weight.data_ptr() == model.get_input_embeddings().weight.data_ptr(), "lm_head not tied"
for ex in ds["val"].select(range(min(a.samples, len(ds["val"])))):
    enc = tok.apply_chat_template(ex["prompt"], add_generation_prompt=True, return_tensors="pt", return_dict=True)
    ids = enc["input_ids"].to(model.device)
    out = model.generate(ids, attention_mask=enc["attention_mask"].to(model.device), max_new_tokens=160,
                         do_sample=False, eos_token_id=[2, 0])
    print("TASK  :", ex["prompt"][0]["content"].split("\n")[0], "|", ex["prompt"][-1]["content"][:120])
    print("MODEL :", tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True).strip())
    print("TEACH :", ex["completion"][0]["content"])
    print("-" * 80)

trainer.save_model(a.out)
tok.save_pretrained(a.out)
print("saved", a.out)
