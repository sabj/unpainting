# Segmentation and line extraction

Segmentation divides an image into labeled regions. These scripts identify those regions and lines, once per source image. The painter reads their output files; no trained model runs during painting, and the pen still makes every mark.

| Script | Writes | Read by |
|---|---|---|
| `segment.py` | `work/masks/<base>.png`, a figure-and-ground mask from u2net | `segments.py` |
| `segments.py` | `work/segments/<base>.png` label map, `.json` legend and `-contours.json` outlines | `src/crop/segments.mjs` |
| `sam-points.py` | One named region from Segment Anything, prompted by points, in the segments format | `src/crop/segments.mjs` |
| `lines.py` | `work/lines/<base>-lines.json`, Informative Drawings line map traced to polylines (paths of connected straight segments) | `src/crop/lines.mjs` |
| `lines-map.py` | A line file moved from a photograph onto the painting made from it, through a given 2x3 similarity transform (alignment by translation, rotation and uniform scale) | `src/crop/lines.mjs` |
| `select-drawing.py` | The first pen drawing for the beach painting: its outlines plus the photograph's interior lines | `--drawingfile` |
| `subject-regions.py` | A label map of named regions (person from Mask R-CNN in `pp/models.py`, parts from Segment Anything prompted by boxes or points) and its legend | `ink-lines.mjs` |
| `ink-lines.mjs` | `<out>-lines.json`, a pen-and-wash target's estimated ink (`src/crop/inkwash.mjs`) traced to polylines, each tagged with its region | `--drawingfile` |
| `face-mask.py` | A soft face ellipse from Keypoint R-CNN | `--litface` |
| `check-sheet.mjs` | A sheet of source, label map and outlines, read back through the JavaScript loader | you |

## Setup

```sh
python3 -m venv .venv
.venv/bin/pip install onnxruntime opencv-python-headless pillow numpy
mkdir -p work/models
curl -sL -o work/models/u2net.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
.venv/bin/python tools/seg/segment.py work/masks examples/targets/*.jpg
```

`segments.py` and `sam-points.py` use Segment Anything when a checkpoint (trained model file) is present (see `segments.py` for where it looks). Without one, `segments.py` falls back to k-means, which groups pixels by similar colors. It uses Lab, a color space that separates lightness from color. `lines.py` lists its model files and cache directory in its header. `face-mask.py` and `subject-regions.py` need PyTorch and torchvision. Mask R-CNN uses torchvision's default trained model files, and Keypoint R-CNN downloads the URL in `face-mask.py`; both need network access on the first run.

u2net takes about 0.7 seconds per image on CPU. The masks are independent of object categories. That is enough for the three uses: weighting the pen to a mask's boundary over an interior fold, treating the background as a region, and keeping hatching to a form.

Model licences are listed in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
