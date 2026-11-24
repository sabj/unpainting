# Drawings and segmentation

Scripts that prepare a painting's inputs, once per source image. The painter reads their output files; the pen still makes every mark.

## A prepared drawing

The painter's only line is a drawing file (`--drawingfile STEM`). Make one in three steps: ask an image model for a clean line drawing (black on white, at the target's size and the ink level you want); trace it into strokes with width and darkness; order the strokes as a hand draws them, structure first.

```sh
python3 tools/seg/trace-drawing.py drawing.png --out work/lines/subject-traced \
  --target subject.jpg --sheetmm 280 --medium ink
node tools/seg/order-strokes.mjs work/lines/subject-traced-lines.json work/lines/subject \
  --sheetmm 280 --order passes --touch medium --hatching sparse
node tools/paint-plate.mjs --image subject.jpg --drawingfile work/lines/subject \
  --inkrecipe wash --washplan study.png --out work/subject
```

- `trace-drawing.py`: writes `<out>-lines.json`, bound to the target (`--target`), in `ink` or `pencil`.
- `order-strokes.mjs`: numbers each stroke in drawing order with its object, part and pass. `--ink none|forms|full` with `--masses MASK.png` sets how much is drawn inside painted masses; `--touch`, `--hatching`, `--budget` and `--order passes|growth` set the hand.
- `pencil-hand.mjs`: an ordered pencil file laid as a hand does at one finish (`--finish loose|medium|tight`).
- `mass-mask.py`: the painted masses a vision model names, shaped by SAM, for `--masses`.
- `thing-masks.py`: a mask per named thing, to check a drawing or study against.
- `register-lines.mjs`: registers a line file to the target's grid (the painter does this itself when the aspect is off).

[examples/drawings/](../../examples/drawings/) holds a finished file.

## Segmentation

Before planning, `src/crop/segment-prep.mjs` runs `segments.py --mode regions` on the target, unless a map for the same target bytes and script version is in `work/segments/by-hash/`. SAM must run: if Python or the checkpoint is missing, or SAM fails, the painting stops; there is no k-means fallback. Each run logs a line like `segments: SAM vit_b on mps (132 masks, 13 laid), 12 regions, 9 inside the frame; from the cache` and writes `segments.json`. SAM takes about 20 seconds per image on an M4 GPU.

| Flag | Default | Meaning |
|---|---|---|
| `--segments` | `sam` | `sam`, `kmeans` (Lab clusters, logged as such) or `off` |
| `--segpython` | `$PAINTER_SEG_PYTHON`, then `.venv-seg/bin/python`, then `.venv/bin/python` | Python with numpy, opencv, torch and segment_anything |
| `--samcheckpoint` | `$PAINTER_SAM_CHECKPOINT`, then `work/models/` | `sam_vit_b_01ec64.pth` |
| `--segcache` | `work/segments/by-hash` | where maps are kept |

`--mode regions` names no parts: each region is `r1`, `r2`, ... largest first, with area, box, mean and spread of Lab colour and the share of the frame it touches. A region touching the frame along under 12% of its outline is foreground. Hooks that look up parts by name find nothing and keep their fallbacks; those using every region or the foreground flag (`--segink`) use them.

- `segment.py`: `work/masks/<base>.png`, a figure-and-ground mask from u2net (about 0.7 s per image on CPU); read by `segments.py`.
- `segments.py`: `work/segments/<base>.png` label map, `.json` legend and `-contours.json`; `--mode regions` is SAM's masks as regions (`sam_regions.py`); read by `src/crop/segments.mjs` and `src/crop/segment-prep.mjs`.

## Setup

```sh
python3 -m venv .venv
.venv/bin/pip install onnxruntime opencv-python-headless pillow numpy
mkdir -p work/models
curl -sL -o work/models/u2net.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
.venv/bin/python tools/seg/segment.py work/masks examples/targets/*.jpg
```

`segments.py --sam auto` falls back to k-means when no checkpoint is present; `--sam require` stops with an error. `subject-regions.py` needs PyTorch and torchvision; Mask R-CNN uses torchvision's default weights and needs network on first run. Model licences: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
