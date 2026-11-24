# Drawings and segmentation

These scripts prepare a painting's inputs, once per source image. The painter reads their output files, and the pen still makes every mark.

## A prepared drawing

The painter's only line is a drawing file (`--drawingfile STEM`). Make one in three steps:

1. Ask an image model for a clean line drawing of the subject, black lines on white, at the target's size and at the ink level you want.
2. Trace it: one stroke per drawn line, with its width and darkness.
3. Order the strokes as a hand draws them, structure first. For pencil, lay them as a hand would with `pencil-hand.mjs`.

```sh
python3 tools/seg/trace-drawing.py drawing.png --out work/lines/subject-traced \
  --target subject.jpg --sheetmm 280 --medium ink
node tools/seg/order-strokes.mjs work/lines/subject-traced-lines.json work/lines/subject \
  --sheetmm 280 --order passes --touch medium --hatching sparse
node tools/paint-plate.mjs --image subject.jpg --drawingfile work/lines/subject \
  --inkrecipe wash --washplan study.png --out work/subject
```

| Script | Writes |
|---|---|
| `trace-drawing.py` | `<out>-lines.json`: a clean line drawing traced to strokes, bound to the target (`--target`), in `ink` or `pencil` |
| `order-strokes.mjs` | the line file again, each stroke numbered in drawing order with its object, part and pass. `--ink none\|forms\|full` with `--masses MASK.png` sets how much is drawn inside painted masses; `--touch`, `--hatching`, `--budget` and `--order passes\|growth` set the hand |
| `pencil-hand.mjs` | an ordered pencil file laid as a hand does at one finish (`--finish loose\|medium\|tight`) |
| `mass-mask.py` | the painted masses a vision model names, shaped by SAM, for `order-strokes.mjs --masses` |
| `thing-masks.py` | the mask of each named thing, to check a drawing or a study against |
| `register-lines.mjs` | a line file registered to the target's grid; the painter also does this itself when a file's aspect is off |

[examples/drawings/](../../examples/drawings/) holds a finished drawing file.

## Segmentation

The painter runs `segments.py` itself. Before planning, `src/crop/segment-prep.mjs` runs `segments.py --mode regions` on the target, unless a map for the same target bytes and script version is already in `work/segments/by-hash/`. Segment Anything (SAM) must run: when the python or the checkpoint is missing, or SAM fails, the painting stops with an error and does not fall back to k-means. Every run logs a line such as `segments: SAM vit_b on mps (132 masks, 13 laid), 12 regions, 9 inside the frame; from the cache` and writes `segments.json` in its output folder. SAM takes about 20 seconds per image on an Apple M4 GPU.

| Flag | Default | Meaning |
|---|---|---|
| `--segments` | `sam` | `sam`, `kmeans` (Lab clusters, logged as such) or `off` |
| `--segpython` | `$PAINTER_SEG_PYTHON`, then the repository's `.venv-seg/bin/python`, then its `.venv/bin/python` | a python with numpy, opencv, torch and segment_anything |
| `--samcheckpoint` | `$PAINTER_SAM_CHECKPOINT`, then `work/models/` | `sam_vit_b_01ec64.pth` |
| `--segcache` | `work/segments/by-hash` | where the maps are kept |

`--mode regions` names no parts: each region is `r1`, `r2` and so on, largest first, with its area, box, mean and spread of Lab color and the share of the frame it touches. A region that touches the frame along less than 12% of its outline is marked foreground. Hooks that look up parts by name find nothing in these maps and keep their fallbacks; the hooks that use every region or the foreground flag (`--segink`) use them.

| Script | Writes | Read by |
|---|---|---|
| `segment.py` | `work/masks/<base>.png`, a figure-and-ground mask from u2net | `segments.py` |
| `segments.py` | `work/segments/<base>.png` label map, `.json` legend and `-contours.json` outlines; `--mode regions` is SAM's masks as general regions (`sam_regions.py`) | `src/crop/segments.mjs`, `src/crop/segment-prep.mjs` |

## Setup

```sh
python3 -m venv .venv
.venv/bin/pip install onnxruntime opencv-python-headless pillow numpy
mkdir -p work/models
curl -sL -o work/models/u2net.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
.venv/bin/python tools/seg/segment.py work/masks examples/targets/*.jpg
```

`segments.py` uses Segment Anything when a checkpoint (trained model file) is present (see `segments.py` for where it looks). Without one, `segments.py --sam auto` falls back to k-means, which groups pixels by similar colors, and `--sam require` stops with an error. k-means uses Lab, a color space that separates lightness from color. `subject-regions.py` needs PyTorch and torchvision. Mask R-CNN uses torchvision's default trained model files, and needs network access on the first run.

u2net takes about 0.7 seconds per image on CPU. The masks are independent of object categories.

Model licences are listed in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

The painter's own line extraction from the subject was removed in 0.4 ([Running the painter](../../docs/running.md)).
