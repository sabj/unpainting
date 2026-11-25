# Drawings and segmentation

Scripts that prepare a painting's inputs, once per picture. The painter reads their files; the pen still makes every mark.

## A drawing file

The painter's only line is a drawing file (`--drawingfile STEM`). Ask an image model for a clean line drawing, black on white, at the picture's proportions. Then trace it into strokes with width and darkness, and order the strokes as a hand draws them, structure first.

```sh
python3 tools/seg/trace-drawing.py drawing.png --out work/lines/subject-traced \
  --target subject.jpg --sheetmm 280 --medium ink
node tools/seg/order-strokes.mjs work/lines/subject-traced-lines.json work/lines/subject \
  --sheetmm 280 --order passes --touch medium --hatching sparse
```

- `trace-drawing.py` writes `<out>-lines.json`, bound to the picture by `--target`, in `ink` or `pencil`.
- `order-strokes.mjs` numbers each stroke in drawing order with its object, part and pass. `--touch`, `--hatching`, `--budget` and `--order passes|growth` set the hand; `--ink none|forms|full` with `--masses MASK.png` (from `mass-mask.py`) sets how much is drawn inside painted masses.

[examples/drawings/](../../examples/drawings/) holds a finished file; its fields are in [plan format](../../docs/plan-format.md#line-files).

## Segmentation

Before planning, the painter runs `segments.py --mode regions` on the picture (about 20 seconds on an M4 GPU), unless a map for the same bytes is cached in `work/segments/by-hash/`. SAM must run: if Python or the checkpoint is missing the painting stops. Regions are `r1`, `r2`, ... largest first, with area, box and colour.

| Flag | Default |
|---|---|
| `--segpython` | `$PAINTER_SEG_PYTHON`, then `.venv-seg/bin/python`, then `.venv/bin/python`: Python with numpy, opencv, torch and segment_anything |
| `--samcheckpoint` | `$PAINTER_SAM_CHECKPOINT`, then `work/models/sam_vit_b_01ec64.pth` |
| `--segments` | `sam`; `kmeans` (colour clusters, logged as such) or `off` |

Setup, once:

```sh
python3 -m venv .venv-seg
.venv-seg/bin/pip install numpy scipy scikit-image pillow opencv-python-headless torch segment-anything
mkdir -p work/models
curl -L -o work/models/sam_vit_b_01ec64.pth https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth
tools/cloud/setup-lines.sh      # the line tools' Python, .venv-lines
npm run doctor
```

Model licences: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
