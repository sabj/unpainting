# Segmentation and line extraction

Segmentation divides an image into labeled regions. These scripts identify those regions and lines, once per source image. The painter reads their output files, and the pen still makes every mark.

The painter runs one of them itself. Before planning, `src/crop/segment-prep.mjs` runs `segments.py --mode regions` on the target, unless a map for the same target bytes and script version is already in `work/segments/by-hash/`. Segment Anything (SAM) must run: when the python or the checkpoint is missing, or SAM fails, the painting stops with an error and does not fall back to k-means. Every run logs a line such as `segments: SAM vit_b on mps (132 masks, 13 laid), 12 regions, 9 inside the frame; from the cache` and writes `segments.json` in its output folder. SAM takes about 20 seconds per image on an Apple M4 GPU.

| Flag | Default | Meaning |
|---|---|---|
| `--segments` | `sam` | `sam`, `kmeans` (Lab clusters, logged as such) or `off` |
| `--segpython` | `$PAINTER_SEG_PYTHON`, then the repository's `.venv-seg/bin/python`, then its `.venv/bin/python` | a python with numpy, opencv, torch and segment_anything |
| `--samcheckpoint` | `$PAINTER_SAM_CHECKPOINT`, then `work/models/` | `sam_vit_b_01ec64.pth` |
| `--segcache` | `work/segments/by-hash` | where the maps are kept |

`--mode regions` names no parts: each region is `r1`, `r2` and so on, largest first, with its area, box, mean and spread of Lab color and the share of the frame it touches. A region that touches the frame along less than 12% of its outline is marked foreground. Hooks that look up parts by name, such as `--passages sky` or `--fleckoff sky,sea`, find nothing in these maps and keep their fallbacks; the hooks that use every region or the foreground flag (`--locallights`, `--segwash`, `--segink`, `--practice`, `--darkmass auto`) use them.

| Script | Writes | Read by |
|---|---|---|
| `segment.py` | `work/masks/<base>.png`, a figure-and-ground mask from u2net | `segments.py` |
| `segments.py` | `work/segments/<base>.png` label map, `.json` legend and `-contours.json` outlines. `--mode scene` (default) names beach-scene parts by rule; `--mode regions` is SAM's masks as general regions (`sam_regions.py`) | `src/crop/segments.mjs`, `src/crop/segment-prep.mjs` |
| `sam-points.py` | One named region from Segment Anything, prompted by points, in the segments format | `src/crop/segments.mjs` |
| `sketch-map.py` | published fine/coarse structural maps and fusion, with source hashes | `sketch-lines.py`, and the wash recipe's line source (`src/paint/methods/line-model.mjs`) |
| `sketch-lines.py` | continuous hierarchical pre-paint strokes, optional sky exclusion | `--drawingfile` / `--sketchlines 1` |
| `sketch-target.mjs` | `<cache>/<target SHA-256>.png`, an image model's pen sketch of a target (one fixed prompt, OpenRouter), and its record | `--sketchcache`, checked by `src/paint/methods/sketch-check.mjs` |
| `perspective.py` | JSON: vanishing points and the share of long edges that converge on them | the linework gate, `src/paint/methods/line-gate.mjs` |
| `copy-lines.py` | observed source-ink paths and measured widths, without a sketch-detail budget | `--drawingfile` / `--copylines 1` |
| `lines.py` | `work/lines/<base>-lines.json`, Informative Drawings line map traced to polylines (paths of connected straight segments) | `src/crop/lines.mjs` |
| `lines-map.py` | A line file moved from a photograph onto the painting made from it, through a given 2x3 similarity transform (alignment by translation, rotation and uniform scale) | `src/crop/lines.mjs` |
| `select-drawing.py` | The first pen drawing for the beach painting: its outlines plus the photograph's interior lines | `--drawingfile` |
| `subject-regions.py` | A label map of named regions (person from Mask R-CNN in `pp/models.py`, parts from Segment Anything prompted by boxes or points) and its legend | `ink-lines.mjs` |
| `ink-lines.mjs` | `<out>-lines.json`, a pen-and-wash target's estimated ink (`src/crop/inkwash.mjs`) traced to polylines, each tagged with its region | `--drawingfile` |
| `face-mask.py` | A soft face ellipse from Keypoint R-CNN | `--litface` |
| `structure-filter.mjs` | A structural opening drawing from a dense traced line file: long straight lines, plus lines inside detail regions where the trace is dense and local value contrast is high (one rule, no hand boxes) | `--drawingfile` |
| `late-lines.mjs` | A late closing-pen line file: the long straight lines of a dense trace that a cleaner opening file does not already draw | `--drawingfile` for the closing pen |
| `check-sheet.mjs` | A sheet of source, label map and outlines, read back through the JavaScript loader | you |

## Setup

### Copy an existing drawing

For a source that already contains a pen drawing, use `copy-lines.py` to retain
its observed lines. It needs only NumPy and OpenCV, measures widths from a frozen
ink mask, preserves short marks, and does not join gaps or impose the structural
sketch planner's local detail budget. Inspect `-ink.png` beside the target:
separating dark wash texture and faint ink from a flattened image remains imperfect.

```sh
python3 tools/seg/copy-lines.py drawing.png --out work/lines/copy --width 1080
node tools/paint-plate.mjs --image drawing.png --drawingfile work/lines/copy \
  --width 1080 --mode fast --drawing first --outlinemedium ink \
  --inkprofile drawing-ink --inkconc 12 --drawstroke .35 --drawingonly 1 \
  --seed 0 --video 0 --targetguard strict --out work/copy-pen
```

Alternatively, `--copylines 1 --sketchpython PYTHON` runs extraction before
painting. Supply `--inkprofile drawing-ink` for the .03–1.2 mm flexible nib and
its high-concentration optical-width calibration. An explicit drawing file takes
precedence. Omit `--drawingonly 1` for a wash check and inspect the saved
`drawing-opening.png` against the final painting. Line extraction stays in
preparation; the painter deposits ink through the physical pen. The existing
wash pipeline's strict guard still permits aggregate, shape-level reference looks.

`tools/judge/line-fidelity.py` produces registered overlays, native crops, and
pixel/continuity/width diagnostics after rendering.

### Lineart models for the wash recipe

`--inkrecipe wash` takes its lines from the fused `sketch-map.py` map. It needs a python with NumPy, OpenCV, torch and controlnet_aux, and the published `lllyasviel/Annotators` weights (`sk_model.pth`, `sk_model2.pth`). The painter finds that python as it finds the line python (`--sketchpython`, `PAINTER_LINES_PYTHON`, `PAINTER_LINES_VENV`, then `.venv-lines`). A repository-local venv works:

```sh
python3 -m venv .venv-lines
.venv-lines/bin/pip install numpy opencv-python-headless scikit-image torch torchvision controlnet_aux pillow
```

CPU torch is enough. The weights download once into `work/line-models/hf`. `--linemodeloffline 1` requires them to be there already. `--linemodelcache` moves the fused maps. The fused maps are kept in `work/line-maps/<target SHA-256>-<width>x<side>-<script hash>/`, so a source is mapped once. All of `work/` is untracked.

The trace keeps small features. Components of two cells or more stay. The fine model's own marks above 0.28 join the mask inside busy detail regions, where the fused map is damped. Tight curves are traced with a three-pixel tangent window. Only a short stub (two cells or less) off a fork is pruned, so a short mark of its own stays. Polylines are simplified at 0.15 cells. Each line carries `tier` 1 when it is 57 cells or longer at 1080 px wide, else 2.

When the packages or weights are missing, the wash recipe logs a `!!!` line and falls back to `copy-lines.py` on the source's own ink; `--linemodel strict` stops instead. The painter's `paint.log` and `linework.json` record which one ran (`extractor`).

### Continuous sketch planning

`sketch-lines.py` combines an optional learned structural map with image ridges,
straight-segment fitting, continuous junction traversal and supported fragment
joins. Structure, openings and sparse ornament carry separate widths and tapered
pressure in the ordinary line-file format. It accepts any subject; there are no
subject names or tuned coordinates in its algorithm. `--segments STEM` reads an
existing label map/legend and excludes sky interiors while preserving silhouettes.

```sh
python3 -m venv work/line-env
work/line-env/bin/pip install numpy opencv-python-headless torch torchvision controlnet_aux pillow
work/line-env/bin/python tools/seg/sketch-map.py photo.jpg --out work/lines/maps
work/line-env/bin/python tools/seg/sketch-lines.py photo.jpg --out work/lines/photo \
  --map work/lines/maps/photo.png
node tools/paint-plate.mjs --image photo.jpg --drawingfile work/lines/photo \
  --drawing first --outlinemedium ink --inkprofile black-ink --targetguard strict \
  --inkconc 12 --drawstroke .35 --drawingonly 1 --out work/photo-pen
```

Large paintings run faster on a GPU; [docs/CLOUD.md](../../docs/CLOUD.md) covers batch rendering on rented machines.
Omit `--drawingonly 1` for pen plus wash; use `--outlinemedium graphite` for the
same prepared geometry at pencil pressure. `drawing-opening.png` records the
actual dried opening drawing in a full painting. A drawing-only run also writes
`painting.png`, `drawing-checkpoint.json`, material audit and target guard report.

Alternatively `--linesource photo-sketch --sketchpython work/line-env/bin/python
--sketchmap work/lines/maps/photo.png` (a plan's `drawing.source: "photo-sketch"`) runs this planner automatically
before painting; `--linesource auto` runs it on a target with little pen line when the python has numpy and OpenCV.
Without `--sketchpython` the painter picks the line python itself: `PAINTER_LINES_PYTHON`, else
`$PAINTER_LINES_VENV/bin/python`, else the repository's `.venv-lines/bin/python`, else `python3`.
`tools/cloud/setup-lines.sh` installs the venv at `PAINTER_LINES_VENV`, by default `.venv-lines`. `paint.log` and `linework.json`
record the python and its numpy, OpenCV and scikit-image versions.
An explicit `--drawingfile` takes precedence. Without a model, the JSON explicitly reports the geometric/ridge
fallback. `--map FILE.png` / painter `--sketchmap FILE.png` accepts another dark-on-white structural map. Weights and reference images must remain outside git.

Run geometry regressions with `work/line-env/bin/python tools/seg/sketch-lines-test.py`.
Geometry PNGs are planning diagnostics; only the simulator's drawing checkpoint
is evidence of the executed pen. Evaluate line extraction and pen rendering separately.

`sketch-map.py` runs the published ControlNet fine/coarse lineart pair directly. It writes both maps and a fused map in which the fine model
must support every coarse suggestion:

```sh
work/line-env/bin/pip install torch torchvision controlnet_aux pillow
work/line-env/bin/python tools/seg/sketch-map.py photo.jpg --out work/lines/maps
work/line-env/bin/python tools/seg/sketch-lines.py photo.jpg \
  --map work/lines/maps/photo.png --out work/lines/photo
```

`--cache DIR` places weights on a larger disk; `--offline` requires an existing
cache. Inference uses two CPU threads. The paired models remain optional and the
planner accepts maps from other published models in the same format. Model maps
are evidence, not the finished drawing: broad dark masks can thin to false
internal branches, and neither model understands repeated architectural units.

```sh
python3 -m venv .venv
.venv/bin/pip install onnxruntime opencv-python-headless pillow numpy
mkdir -p work/models
curl -sL -o work/models/u2net.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
.venv/bin/python tools/seg/segment.py work/masks examples/targets/*.jpg
```

`segments.py` and `sam-points.py` use Segment Anything when a checkpoint (trained model file) is present (see `segments.py` for where it looks). Without one, `segments.py --sam auto` falls back to k-means, which groups pixels by similar colors, and `--sam require` stops with an error. k-means uses Lab, a color space that separates lightness from color. `lines.py` lists its model files and cache directory in its header. `face-mask.py` and `subject-regions.py` need PyTorch and torchvision. Mask R-CNN uses torchvision's default trained model files, and Keypoint R-CNN downloads the URL in `face-mask.py`; both need network access on the first run.

u2net takes about 0.7 seconds per image on CPU. The masks are independent of object categories. That is enough for the three uses: weighting the pen to a mask's boundary over an interior fold, treating the background as a region, and keeping hatching to a form.

Model licences are listed in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

The optional `--model PATH.onnx` / `--sketchmodel PATH.onnx` route requires
`onnxruntime onnx`. `lines.fetch_model()` downloads the MIT contour export into
`~/.cache/painter-lines/`. It is less selective than the paired ControlNet models.

The planner bounds local openings and ornament separately, simplifies ornament
into rounded suggestions, and reserves heavy weight for straight or smooth
structural contours. Faded sources use a contrast-relative flat-area threshold.
Neither these heuristics nor a learned map replaces a visual review of the dry
pen checkpoint.

### Declared learned line maps

For a photo whose pre-paint learned map already describes the architecture,
`copy-lines.py MAP.png --kind line-map --out STEM` preserves connected pale
confidence evidence that photographed-ink thresholds would erase. Model widths are compressed and bounded to .7–2.4 planning cells: confidence
corridors are not measured optical nib widths. Do not apply this mode directly to a photo. Inspect the map, binary evidence mask and physical
drawing separately: a confidence map is not an artist's annotated ink layer.

The consolidated [linework guide](../../docs/linework.md) chooses among source
ink, photo sketches, structure scaffolds and linked pencil/ink stages by job.
