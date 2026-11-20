# Painting script

A painting script is a wash plan written the way a teacher writes out how to paint a picture: passages in the order a
painter lays them, each saying what it is, where (a loose region on the sheet), the paint, the brush, the move and the
kind of mark. A model that understands painting writes it by looking at the subject, the pen drawing and the block-in
studies; the painter executes it. It replaces the wash plan the painter computes from the studies:

```sh
node tools/paint-plate.mjs ... --washplan script:SCRIPT.json --paints <the script's palette> --paintsextend 0
```

Code: `src/paint/methods/script-washes.mjs` (the plan), `src/paint/methods/script-marks.mjs` (the marks),
`tools/painter/script-crop.mjs` (a script cut to a window of its sheet, for trying a piece fast) and
`tools/painter/script-overlay.mjs` (the passages and their strokes drawn over the subject).

## Format

```json
{
  "format": "painting-script 1",
  "subject": "h36", "author": "who wrote it",
  "sheet": { "widthMm": 280, "heightMm": 186.7 },
  "palette": ["ochre", "rawsienna", "ultramarine"],
  "brushes": { "mop": { "shape": "round", "widthMm": 22 }, "r8": { "shape": "round", "widthMm": 6 } },
  "approach": "how it will be painted, for people",
  "passages": [
    { "id": "p01", "what": "first wash: the stone facade", "stage": 1,
      "region": [[6, 3], [272, 3], [272, 118], [8, 114]],
      "paint": { "pigments": { "ochre": 3, "rawsienna": 1 }, "dilution": "very pale", "swatch": "#efe0bf" },
      "brush": "mop", "move": "wet into wet", "mark": "sweep", "direction": 0, "strokes": 9, "pressure": "firm",
      "charges": [ { "pigments": { "sienna": 1 }, "dilution": "pale", "at": [[195, 88]], "brush": "r8" } ],
      "leave": "the far courtyard", "edges": "lost", "why": "one warm ground" }
  ]
}
```

| field | meaning |
|---|---|
| `sheet.widthMm` | must be the painter's `--sheetmm`; positions are sheet millimetres, x right, y down |
| `palette` | box keys (`src/crop/box.mjs`); give them to the painter with `--paints` |
| `brushes` | the kit by name; `widthMm` is the loaded belly's width at full pressure. Every brush is laid as a round today |
| `stage` | 1 first pale washes, 2 local colours and masses, 3 shadows and glazes, 4 touches, 5 darks and accents; the replay's value step |
| `region` / `regions` | loose polygons (mm) that place the strokes; a guide to the hand, never a clip |
| `paths` | polylines the point follows, for `line` |
| `paint` | pigment parts; `swatch` (or `dilution`: very pale, pale, medium, strong, rich, dark) is the mix as one wash on white paper, and sets its strength |
| `move` | `wet on dry`, `wet into wet` (clean water first, or with `into` into the wet passage just before), `beside damp` (with `into`), `glaze` (over dry, little trade with wet paint), `dry brush` |
| `into` | the passage just before; this one is laid in the same wet session. Any other passage starts on a dry sheet |
| `mark` | `sweep` (lanes across the region along `direction`, laid back and forth in loads of up to three), `tapered` (pressed on and lifted off), `dab` (a leaf or stone touch), `wedge` (from the point to a square pressed end), `line` (the point along each path), `scumble` (short broken strokes turned every way) |
| `direction` | degrees: 0 left to right, 90 down |
| `strokes`, `lengthMm`, `pressure` | about how many strokes (lanes of a sweep), their length, light, medium or firm |
| `charges` | dabs of their own mix dropped into the passage while wet, one at each `at` |
| `what`, `leave`, `edges`, `dryFirst`, `why` | for people and judges |

Touches are placed loosely over the region (a jittered spread found for the count, in bands from the top, each band
crossed the other way from the last) and each is held to the region's chord along its direction, so a streak or a dab
keeps inside the shape it is laying without being cut. Every stroke has its own small irregularity of place, angle,
length and pressure from a hand seeded by the passage's id.

## What it adds to the plan format

The wash plan becomes a file a model writes (`bench/v6/TASK.md`, "not yet executable": the wash plan was computed inside
the painter from the studies). New in the plan's vocabulary: passages with a mark kind, brush, move, direction, count
and length; charges at named points; `into` for a wet session; swatch colours. The painter's own plan (`value-plan.json`)
records each passage as an instruction with its strokes, so a script and the strokes it became can be compared.

## Not yet

- Flat brushes are laid as rounds.
- `swatch` is the mix on white paper; glazes over earlier passages compound. The plan writes, for each passage, the
  film it predicts over its cells against the subject's mean there (`summary.colourCheck`), as a check only.
- Lifting, scraping and masking fluid are not marks.
