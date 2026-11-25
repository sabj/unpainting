# Plan format

A stroke plan is a JSON file of brush strokes in painting order: each names a brush, its paint and water, how wet it expects the paper to be, and its path. A whole painting is written as a [painting script](painting-script.md) instead.

```sh
node tools/run-plan.mjs examples/plans/graded-wash.json --out work/plan-graded-wash
```

This writes `result.png`, the dried sheet, and `run.json`.

![The graded-wash plan's stroke paths over its dried result](img/graded-wash.webp)

## Units

Positions are 0 to 1 of the sheet; brush widths (`widthMm`) and contact radii (`rMm`) are millimetres. The sheet's size is fixed in millimetres. So a plan painted with half as many cells keeps every stroke in the same place and at the same real size.

## Top level

| Field | Meaning |
|---|---|
| `version` | `1` |
| `grid` | `{w, h, mmPerCell}`. A cell is one small square of the sheet. 384 × 160 cells at 0.125 mm is a sheet of 48 × 20 mm |
| `paperRGB` | `[r, g, b]` of bare paper |
| `paper`, `paperSeed` | `fibres` and `tooth` (0 to 1), and optionally `coldPress`. The seed sets the paper texture and the brush hairs |
| `palette` | pigment keys from `src/crop/box.mjs` |
| `commands` | strokes and drying steps, in order |

## Commands

```json
{
  "id": "grade-1",
  "operation": "stroke",
  "requiredPaper": "wet",
  "role": "paint",
  "brush": { "kind": "flat", "widthMm": 8, "orientation": "follow", "free": 0.4, "feed": 0.4, "film": 0.25, "wetMix": 0.85 },
  "load": { "capacityMm3": 160, "waterQuantityMm3": 112, "concentration": { "ultramarine": 0.65 } },
  "paths": [[
    { "x": 0.15, "y": 0.25, "p": 0.85, "rMm": 4.0 },
    { "x": 0.85, "y": 0.25, "p": 0.85, "rMm": 4.0 }
  ]]
}
```

- `id`: unique; seeds the stroke's bristles.
- `operation`: `stroke`, or `dry`. `dry` dries everything and fixes the wash as its own layer. The sheet is always dried before rendering.
- `requiredPaper`: `dry`, `wet` or `any`. The runner checks the paper first and warns if it is not as required.
- `role`: `paint`, or `clean-water`, which wets the paper with a clean brush.
- `brush`: `kind` (`flat` or `round`), `widthMm`, and `orientation`: `follow` turns the brush with every segment. `sweep` holds it square to the direction of the stroke. `free`, `feed`, `film` and `wetMix` are passed to `createBrush` in `src/media/brush.mjs`.
- `load`: `capacityMm3` is what the brush can hold. `waterQuantityMm3` is what it holds after dipping. `concentration` is the amount of each paint, by palette key, and is empty for clean water.
- `paths`: polylines of `x`, `y`, pressure `p` (0 to 1) and contact radius `rMm`.

`--stroke-gate reject` refuses a plan that fills large areas with tiny dabs ([stroke sizes](judging.md#stroke-sizes)).

## Line files

A drawing file is `STEM-lines.json` (or `.json.gz`), given to the painter as `--drawingfile STEM`. `tools/seg/trace-drawing.py` writes it from a clean line drawing and `tools/seg/order-strokes.mjs` orders it ([tools/seg](../tools/seg/README.md)); [examples/drawings/](../examples/drawings/) holds one.

| Field | Meaning |
|---|---|
| `inputKind` | `drawing` |
| `medium` | `ink` or `pencil` |
| `image` | `{w, h}`: the pixel size the lines were traced on |
| `targetSHA256` | the picture it belongs to; a file made for another image is refused |
| `lines` | strokes in drawing order, each with `points` (pixels), `width`, `weight`, `role`, `seq`, `object`, `part`, `pass` |

## Value plans

`--valueplan FILE` sets the sheet, the drawing steps, the paints and the order of the parts for `tools/paint-plate.mjs`. The washes still come from the studies. `src/paint/plan-keys.mjs` lists every key it reads, and [examples/plans/white-ships.json](../examples/plans/white-ships.json) is one.

## The V6 draft plan

[bench/v6/TASK.md](../bench/v6/TASK.md) drafts a plan for a whole painting, to be written by a model. It is not run.
