# Painting script

A script lists the washes and marks in the order the painter will lay them. Positions and brush widths are in millimetres. The model gets [brief 5](../tools/paint/BRIEF.md) with the format, marks and painting tips.

For a big sky, the brief suggests a broad brush, about 24–38 mm across. Its examples use a 38 mm mop or a 25.4 mm flat. Set `paper: "wet"` to wet the sheet first. A second colour can go into the still-wet wash with `into` and `wait: "none"`. For white paper, paint around the spot or reserve it in `lights`. Authored scripts get no automatic mask from the source pixels.

```sh
npm run paint -- SUBJECT paint --author script:SCRIPT.json --lines standard
```

For a standalone script, `--lines standard` asks for the subject’s registered drawing. Pass `--lines FILE.json` to supply your own line choices.

Code: `src/paint/methods/script-washes.mjs` (the plan) and `script-marks.mjs` (the marks). `tools/painter/script-overlay.mjs` draws a script's passages over the picture before painting.

## Format (painting-script 2)

```json
{
  "format": "painting-script 2",
  "subject": "h36", "author": "who wrote it",
  "sheet": { "widthMm": 280, "heightMm": 186.7 },
  "palette": ["ochre", "rawsienna", "ultramarine"],
  "brushes": { "mop": { "shape": "round", "widthMm": 38 }, "r8": { "shape": "round", "widthMm": 6 } },
  "approach": "how it will be painted, for people",
  "lights": [ { "what": "lit sill", "region": [[40, 34], [70, 34], [70, 37.5], [40, 37.5]] } ],
  "passages": [
    { "id": "p01", "what": "first wash: the stone front", "stage": 1, "kind": "wash",
      "region": [[6, 3], [272, 3], [272, 118], [8, 114]],
      "paint": { "pigments": { "ochre": 3, "rawsienna": 1 }, "dilution": "very pale", "swatch": "#efe0bf" },
      "paper": "wet", "edges": "lost",
      "handling": { "hold": "side", "start": "belly", "pressure": [0.7, 0.8, 0.6], "direction": 0, "speed": "fast", "load": "flooded" },
      "charges": [ { "pigments": { "sienna": 1 }, "dilution": "pale", "at": [[195, 88]], "brush": "r8" } ] },
    { "id": "p11", "what": "tree shadows", "stage": 3, "kind": "strokes", "brush": "mop", "paper": "dry",
      "paint": { "pigments": { "ultramarine": 3, "rose": 1 }, "dilution": "pale" },
      "strokes": [ { "points": [[50, 38, 0.2], [58, 47, 0.7], [66, 58, 0.9], [76, 78, 0.15]] } ] }
  ]
}
```

Positions are sheet millimetres, x right, y down.

| Field | Meaning |
|---|---|
| `sheet` | `widthMm`, `heightMm` of the sheet |
| `palette` | paints by key (`src/crop/box.mjs`), at most 14 |
| `brushes` | the kit, named as the author likes: `shape` (`round`, `flat`) and `widthMm`, the loaded belly's width at full pressure |
| `plan`, `approach` | the author's plan in words, for people |
| `lights` | polygons kept as paper under every passage for the whole painting |
| `passages` | below, in painting order |

A passage:

| Field | Meaning |
|---|---|
| `id`, `what`, `why` | its name, and notes for people and judges |
| `stage` | the order of work. 1 is the first pale washes, 2 the main colours and large masses, 3 shadows and glazes, 4 small touches, 5 darks and accents |
| `kind` | `wash`: an area filled with overlapping strokes (lanes). By default the lanes follow the shape's own flow; a number in `handling.direction` lays them straight at that angle, and `"form"` asks for the shape's flow explicitly. The lanes take the wash's `path`, `pressure` and `mark`, so a wash can curve and swell. Its outline is irregular, not the exact polygon. `strokes`: a few separate strokes. `touches`: short marks scattered as a hand would. `lines`: a line drawn along each of `paths`. `erase`: pencil rubbed out |
| `region`, `regions` | polygons that place the strokes. They guide the hand and never cut off a stroke |
| `paths` | polylines, for `lines` |
| `strokes` | strokes written one at a time: `{points: [[x, y, pressure], ...]}`, with at least two points and a pressure from 0 to 1. An optional fourth number is the hand's speed in mm/s. A stroke may name its own `brush` |
| `count`, `character` | for a group of strokes or touches: how many there are, and `size` (even, varied), `spread` (scattered, clustered, along a line), `denser` (top, bottom, left, right, edges, middle) |
| `paint` | `pigments` in parts, and its strength as either `swatch` (the mix as one wash on white paper) or `dilution` (very pale, pale, medium, strong, rich or dark) |
| `brush` | a name from `brushes` |
| `paper` | `dry`, `wet` or `damp`. `wet` puts clean water down first under the passage's own area, or lays it into the wet passage just before when `into` is set. `damp` is used with `into` |
| `into` | the passage just before, which is still wet. This one is laid in the same sitting |
| `wait` | how far the sheet dries first: `dry` (the default), `damp` or `none` |
| `edges` | `lost`: every edge is soft, because the paint is laid into a damp patch of its own area. `found` or `mixed`: every edge is hard |
| `handling` | `mark` (below), `hold` (upright, side), `start` (point, belly), `pressure` (a list from start to end, and the width follows it; or a word: `light`, `medium`, `firm`, `swell`, `taper`, `fade`, `press`), `path` (straight, curved, s-curve, zigzag, flick, wobble), `direction` (degrees: 0 right, 90 down; or `"form"` to follow the shape), `speed` (slow, medium, fast), `load` (flooded, loaded, damp, dry), `lengthMm`, `look` (a note for people) |
| `charges` | colour dropped in while the passage is wet. It has `pigments`, `dilution`, `brush`, and one drop at each point in `at` |
| `glaze` | `[i, n]`: glaze number `i` of `n` over the same area |

`handling.mark` names one of 26 brush marks (`src/paint/marks/kinds.mjs`), such as `sweep`, `taper`, `comma`, `drag` or `flying-white`. The mark sets each stroke's pressure, speed, brush angle and water. A passage that writes its own `pressure` is laid as written.

An `erase` passage takes no paint or brush: `widthMm` (0.5 to 10, default 3) and either `strokes` or a `region` that is rubbed in lanes. It needs dry paper.

At L3 and L4, a passage may name the shapes traced from the studies by number, with `shapes`, `reserve` and `{along: n}` (`tools/painter/script-resolve.mjs`).

Current script limits: each passage uses one edge style (`lost` or `found`) and wets only its own region; top-level `lights` stay reserved for the whole run (use per-passage `reserve` for temporary masks); and `into` only works into the immediately preceding passage.

## Beside the script

The model's choice names its script and may also set the drawing: `{"kind": "script", "script": "script.json", "medium": "pen", "ink": "waterproof", "lines": "my-lines.json"}`. `medium` is `pencil`, `pen` or `none`; `ink` is `waterproof` or `soluble`; `lines` says when each prepared line is drawn (before the washes, with a stage, after them or not at all) and can add freehand lines at any level. At L1 and L2 only the model’s own lines are available. At L3 and L4 the prepared drawing starts off. Choose a medium or select the prepared lines you want.

For a freehand pencil mark, put this in `lines.own` inside the drawing choice:

```json
[{ "points": [[60, 40], [72, 54], [80, 56]], "medium": "pencil", "widthMm": 0.35, "dark": 0.35, "when": "before" }]
```
