# Getting started

Needs [Node.js 25+](https://nodejs.org/en/download) and `npm ci`. `ffmpeg` is optional for MP4 videos (pass `--video 0` to skip). WebGPU runs automatically on Apple Silicon (Metal) or NVIDIA (Vulkan); add `--gpu auto` to allow CPU fallback.

## 1. Run the bundled examples

```sh
npm run quick-start        # 5-second graded wash on CPU → work/plan-graded-wash/result.png
npm run example:animal     # Tiepolo pen-and-wash (bundled drawing + study)
npm run example:portrait   # Sargent pure watercolour (bundled study, no ink)
```

Runs never overwrite an existing folder — give each run a fresh `--out`. Sample outputs live in `examples/output/`.

## 2. Paint your own picture

Auto needs two things prepared beforehand: a **flat colour study** (or three, coarse to fine) and, if the picture has ink or pencil lines, a **clean line drawing**.

1. **Make a study** (simplify the picture to flat colour shapes at the same proportions) and optionally a **black-on-white line drawing** (see [tools/prepare](../tools/prepare/README.md) for the automated Qwen-Image-Edit scripts).
2. **Trace the drawing into strokes** (optional, requires Python with `numpy` + `opencv`):
   ```sh
   python3 tools/seg/trace-drawing.py drawing.png --out work/lines/pic-traced --target picture.jpg --sheetmm 152 --medium ink
   node tools/seg/order-strokes.mjs work/lines/pic-traced-lines.json work/lines/pic --sheetmm 152
   ```
3. **Paint it:**
   ```sh
   node tools/paint-plate.mjs --image picture.jpg --width 540 --mode fast \
     --drawingfile work/lines/pic --inkrecipe wash \
     --washplan study.png --out work/my-picture --video 0
   ```

Check your environment anytime with `npm run doctor` (checks Python, SAM checkpoint, and disk space). Each output folder contains `painting.png`, separate `ink.jpg` and `wash.jpg` layers, stage frames, and the target-guard audit ([honesty](honesty.md)).

## 3. Run the benchmark

Point `UNPAINT_SUBJECTS` at your prepared `SUBJECTS.json`, verify inputs, and run Auto or a model (`claude`, `codex`, `agy`, or `muse` CLI signed in):

```sh
export UNPAINT_SUBJECTS="/path/to/inputs/SUBJECTS.json"
npm run doctor -- --strict
node tools/paint/run-sets.mjs check core

# Auto 0.5 baseline
npm run unpaint -- prepare mittens-closeup-qs --pool local

# Model run (L1–L3 fixed rounds, L4 isolated shell)
npm run unpaint -- paint mittens-closeup-qs paint --author astra-m --level L2 --work rounds --out work/astra-L2
npm run unpaint -- paint mittens-closeup-qs paint --author astra-m --level L4 --out work/astra-L4

# Score with open2 (local Apple Silicon MLX or OpenRouter)
JUDGE_ROUTE=openrouter npm run unpaint -- score work/bench-05 --profile 0.5.1 --out work/bench-05/scores
```

Full benchmark setup, multi-machine GPU pools (`--pool mini,pod`), and adding new pictures or models:
- [Benchmark guide & full commands](../bench/README.md#run-it)
- [Preparing new pictures with Qwen-Image-Edit](../tools/prepare/README.md)
- [Model roster (`tools/paint/authors.json`)](../tools/paint/authors.json)
- **Browser demos locally:** `python3 -m http.server 8000 --directory demos`
