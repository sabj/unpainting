# study_model.py JOB...: the pictures the image model makes for a subject: its three colour studies (prompts s3, s1, s4),
# its pencil lay-in (l1) and, for a pen-and-wash picture, its ink line (e6). One job is IMAGE|OUT|PROMPT|SCALE|SEED.
# Model: Qwen-Image-Edit 2511, 8-bit MLX (mflux), with the Lightning 8-step LoRA, guidance 1, 8 steps. Sizing: SCALE the
# source, cap at 1.7 megapixels, round down to 16, bring the result back to the scaled size (Lanczos). The prompts are the
# files in tools/prepare/prompts/ (PROMPT = their name, or @FILE for another text). Every line it prints (prompt, steps,
# seed, sizes) is the generation record the registry reads: keep the log (studies.sh appends it to
# $UNPAINT_PREP/guides/tools/study-model.log).
# Needs: a Python with mflux (run this file under it), about 54 GB of memory, and UNPAINT_STUDY_LORA = the path of
# Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors (lightx2v/Qwen-Image-Edit-2511-Lightning). UNPAINT_STUDY_MODEL
# names another copy of the model (default mlx-community/qwen-image-edit-2511-8bit, fetched by mflux on first use).
# One job at a time on a machine: studies.sh holds a lock.
import sys, os, time
HERE = os.path.dirname(os.path.abspath(__file__))
PROMPTS = ("s1", "s3", "s4", "l1", "e6")
def prompt_of(pid):
    f = pid[1:] if pid.startswith("@") else os.path.join(HERE, "prompts", pid + ".txt")
    if not pid.startswith("@") and pid not in PROMPTS: sys.exit("study_model: prompt %r is none of %s, nor @FILE" % (pid, ", ".join(PROMPTS)))
    return open(f).read().strip()
class SkipNegative:
    """With guidance 1 the guided noise equals the positive prediction, so the second (negative-prompt) pass is skipped:
    every other transformer call returns the previous result. Exact, not an approximation."""
    def __init__(self, tr): self.tr, self.last, self.n, self.on = tr, None, 0, False
    def __getattr__(self, k): return getattr(self.tr, k)
    def __call__(self, *a, **k):
        if not self.on: return self.tr(*a, **k)
        self.n += 1
        if self.n % 2 == 0: return self.last
        self.last = self.tr(*a, **k); return self.last
def size_for(w, h, sc):
    """(generated W, H, output W, H) for a w x h source at scale sc."""
    W0, H0 = round(w * sc), round(h * sc)
    k = min(1.0, (1.7e6 / (W0 * H0)) ** 0.5)
    return int(W0 * k) // 16 * 16, int(H0 * k) // 16 * 16, W0, H0
if __name__ == "__main__":
    jobs = [j.split("|") for j in sys.argv[1:]]
    if not jobs or any(len(j) != 5 for j in jobs): sys.exit("usage: study_model.py IMAGE|OUT|PROMPT|SCALE|SEED ...")
    for j in jobs: prompt_of(j[2])   # every prompt is read before the model is loaded
    lora = os.environ.get("UNPAINT_STUDY_LORA")
    if not lora or not os.path.isfile(lora): sys.exit("UNPAINT_STUDY_LORA is not set to the Lightning 8-step LoRA file (tools/prepare/README.md, \"The image model\")")
    import mlx.core as mx
    from PIL import Image
    from mflux.models.common.config import ModelConfig
    from mflux.models.qwen.variants.edit.qwen_image_edit import QwenImageEdit
    model = QwenImageEdit(model_path=os.environ.get("UNPAINT_STUDY_MODEL") or "mlx-community/qwen-image-edit-2511-8bit", model_config=ModelConfig.qwen_image_edit_2511(), lora_paths=[lora], lora_scales=[1.0])
    proxy = SkipNegative(model.transformer); object.__setattr__(model, "transformer", proxy)
    for img, out, pid, sc, seed in jobs:
        im = Image.open(img).convert("RGB"); W, H, W0, H0 = size_for(im.width, im.height, float(sc))
        tmp = out + ".in.png"; im.resize((W, H), Image.LANCZOS).save(tmp)
        proxy.on, proxy.n = True, 0; t = time.time()
        r = model.generate_image(seed=int(seed), prompt=prompt_of(pid), image_paths=[tmp], num_inference_steps=8, guidance=1.0, width=W, height=H)
        r.save(out + ".raw.png"); r = Image.open(out + ".raw.png").convert("RGB").resize((W0, H0), Image.LANCZOS); r.save(out); os.remove(tmp); os.remove(out + ".raw.png")
        print(f"{out}: prompt={pid} steps=8 guidance=1 seed={seed} gen={W}x{H} out={W0}x{H0} time={time.time()-t:.0f}s peak={mx.get_peak_memory()/1e9:.1f}GB", flush=True)
