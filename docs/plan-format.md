# Plan format

A stroke plan is a JSON file of brush strokes in painting order. Each stroke names a brush, a paint concentration and amount of water, and the paper moisture it expects; its path is in sheet coordinates with pressure and radius at each point. A `dry` entry dries the sheet before the next stroke. Text fields are notes; the simulator ignores them.

```sh
node tools/run-plan.mjs examples/plans/graded-wash.json --out work/plan-graded-wash
```

This writes `result.png` (the dried sheet) and `run.json`. Stroke-size admission warns by default; `--stroke-gate reject` refuses tiny-dab plans before painting ([stroke sizes](judging.md#stroke-sizes)).

![The graded-wash plan's stroke paths over its dried result](img/graded-wash.webp)

The example is [examples/plans/graded-wash.json](../examples/plans/graded-wash.json); its saved output is [examples/output/graded-wash-result.png](../examples/output/graded-wash-result.png).

## Units

A plan uses physical and relative units, never cells, so it paints at any resolution.

- Positions in `paths`, region `bounds` and reserve `bounds` are 0 to 1 of the sheet or target.
- Brush widths (`widthMm`) and contact radii (`rMm`) are millimetres.
- Line files are in target pixels and carry the image size they were drawn on (`image: {w, h}`).
- The sheet's width is fixed in mm (`grid` here; `sheet.widthMm` or `--sheetmm` for value plans). The width in cells (`grid.w`, or `--width`) only sets `mmPerCell`.

A plan painted at half the width keeps every stroke in place at the same physical size; only detail under one cell is lost.

## Top level

| field | meaning |
|---|---|
| `version` | `1` |
| `id`, `title` | names |
| `source` | optional notes on what the plan imitates |
| `grid` | `{w, h, mmPerCell}`; 384 × 160 cells at 0.125 mm is a 48 × 20 mm study |
| `paperRGB` | `[r, g, b]` of bare paper |
| `paper` | `fibres` and `tooth` (0 to 1), optional `coldPress` (`src/media/paper-relief.mjs`) |
| `paperSeed` | seed for paper texture and brush hairs; same plan and seed, same sheet on the same backend |
| `palette` | pigment keys from `src/crop/box.mjs`: `ultramarine`, `ochre`, `sienna`, `sapgreen`, `lampblack` |
| `budget` | `maxGestures`, `maxWallSeconds`, `maxNativeSteps`; read by nothing in `run-plan`, not copied to `run.json` |
| `commands` | strokes and drying steps, in order |
| `criteria` | pass and fail notes for a judge; ignored |

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
- `operation`: `stroke` or `dry`.
- `requiredPaper`: `dry`, `wet` or `any`. `run-plan` measures the paper before the stroke and warns when it is not met.
- `role`: `paint`, or `clean-water` to wet the paper with a clean brush.
- `brush.kind`: `flat` or `round`. `brush.widthMm`: width in mm.
- `brush.orientation`: `follow` turns the brush with every segment; `sweep` holds it square to the stroke's overall run.
- `brush.free`, `feed`, `film`, `wetMix` (defaults 0.4, 0.4, 0.25, 0.85): passed to `createBrush` in `src/media/brush.mjs`. `free` is the liquid threshold for release, `feed` the flow from reservoir to bristles, `film` the liquid layer left on contact, `wetMix` the exchange with wet paint.
- `load.capacityMm3`: what the brush holds. `load.waterQuantityMm3`: what it holds after dipping; the ratio is the water load.
- `load.concentration`: pigment per palette key; empty for clean water.
- `paths`: polylines of 0 to 1 sheet coordinates (`x` across, `y` down), pressure `p` (0 to 1) and contact radius `rMm`.

A drying step is `{ "id": "finish-dry", "operation": "dry" }`. It dries everything and sets the current wash as its own layer. If the last command is not `dry`, `run-plan` dries the sheet before rendering. While a stroke is laid, water and pigment step every 8 brush samples, so wet strokes run together.

`graded-wash.json` is a 48 × 20 mm graded sky: an 18 mm clean-water sweep, four 8 mm ultramarine strokes at concentrations 0.65, 0.43, 0.26 and 0.12, then `finish-dry`. `tools/run-plan.test.mjs` checks that the top band dries darker than the bottom.

Other plans: [glazes.json](../examples/plans/glazes.json) (three bands, each dried before the next; see [pigments-and-paper.md](pigments-and-paper.md)), [drying-dry-between.json](../examples/plans/drying-dry-between.json) and [drying-too-wet.json](../examples/plans/drying-too-wet.json) (the same two strokes with and without drying between).

## Line files

A drawing file is `STEM-lines.json` or `STEM-lines.json.gz`, given to the painter as `--drawingfile STEM`. `tools/seg/trace-drawing.py` writes it from a clean line drawing and `tools/seg/order-strokes.mjs` orders it; [examples/drawings/](../examples/drawings/) holds one.

| field | meaning |
|---|---|
| `inputKind` | `drawing` |
| `medium` | `ink` or `pencil` |
| `image` | `{w, h}`: pixel size the lines were traced on |
| `targetSHA256` | the target it belongs to; a file made for another image is refused |
| `lines` | strokes in drawing order, each with `points` (target pixels), `width`, `weight`, `role`, `seq`, `object`, `part`, `pass` |

The painter maps the image box onto the target (`src/paint/methods/drawing-registration.mjs`) and draws each line as it is.

## Painting script

`--washplan script:FILE.json` takes the washes from a painting script written by a planning model: [painting-script.md](painting-script.md).

## Value plan file

`--valueplan FILE` reads a JSON object. The washes still come from the studies. `src/paint/plan-keys.mjs` lists every key the painter reads; a key nothing reads makes the run log `UNUSED PLAN KEYS`, write `unused-plan-keys.txt` and exit 3 after its outputs (`--allowunusedplan 1` keeps exit 0). The resolved plan and any command-line overrides are written to `pipeline-plan.json`.

| field | meaning |
|---|---|
| `sheet` | `{ widthMm, seed, targetGuard }`; `widthMm` sets `--sheetmm` and must match it when both are given |
| `drawing` | below |
| `washes` | `paints` (box keys), `sessions` (`dry`, `passage`, `connected`), `inkAware`, `soften`, `physics` (`holeRimMm`, `marangoni`, `slope`) |
| `order` | `subjects` (`{id, bounds}` or `{id, families}`) and `strength` 0 to 1 |
| `families` | `{id, bounds, drawingRole}`; `drawingRole` is `none`, `scaffold`, `structural` or `focal` and keeps or leaves out each line whole |

`rationale`, `drawingNote`, `run` and a subject's `reason` are notes. [examples/plans/white-ships.json](../examples/plans/white-ships.json) is a value plan.

### Value plans: the drawing section

```json
"drawing": { "medium": "ink", "ink": { "color": "sepia" }, "stages": { "prepInk": { "from": "lines" }, "finishInk": { "from": "prepInk", "restate": 0.3 } } }
```

| field | values | meaning |
|---|---|---|
| `medium` | `none`, `graphite`, `ink`, `auto` | `none` sets `--drawing none`; the others set `--outlinemedium` |
| `reason` | text | logged |
| `ink` | `{ "color": "sepia" or "black", "waterproof": bool }` | waterproof defaults to true for black |
| `amount`, `maxLines` | 0 to 1; integer | share or count of lines drawn, strongest first |
| `lines` | `all`, `contours`, `subject`, `regions` | `contours` leaves out dark fill, `subject` leaves out the setting, `regions` orders by region |
| `weight` | 0 to 1 | line heaviness |
| `closingLines` | 0 to 1 | how much the closing pen draws; 0 none |
| `stages` | `prep`, `prepInk`, `finishInk` | linked stages cut from the drawing file |

Stage fields: `prep.amount`, `weight`, `fade`, `frames`; `prepInk.from` (`prep` or `lines`), `keep`, `add`, `amount`, `deviate`, `method` (`contour` or `scribble`); `finishInk.from`, `select` (`edges`, `darks`, `both`), `restate`, `deviate`, `method` (`accent` or `architecture`), `masses` (`none` or `scribble`). The finish runs after every wash. Code: `src/paint/drawing-plan.mjs`, `src/paint/methods/drawing-stages.mjs`.
