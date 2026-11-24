# Ink

Pen and wash pairs an ink drawing with watercolour washes over or under it. The painter keeps the drawing and the washes separate so you can inspect each layer.

![Two rows, Guardi's A Colonnade, Partly Ruined, with Figures and Tiepolo's Bacchus and Ariadne. Each row: the target, the painting's estimated ink, the pen drawing, the washes, and the finished painting](img/ink.webp)

Guardi's *A Colonnade* and Tiepolo's *Bacchus and Ariadne* (release 0.1.0, painter V096, sim 100). Each row shows the target, estimated ink, opening pen drawing, washes and finished sheet.

## Ink or pencil

`--outlinemedium` defaults to `graphite` (a light pencil drawing that does not move under water). Ink is drawn when requested with `--outlinemedium ink`, a plan's `drawing.medium: "ink"`, or `--inkrecipe wash`. `--outlinemedium auto` draws in ink when at least 0.5% of the source reads as pen line (`--penfirst`), and in pencil below that (`src/paint/methods/medium-decision.mjs`, recorded in `run-card.json` under `drawing.mediumDecision`).

On a pencil drawing, Auto lays only a lay-in (`src/paint/methods/drawing-default.mjs`): contours, lay-in strokes, inner growth contours, the top quarter of lines by contribution and lines around facial features, no darker than the lay-in; hatching and texture tagged `drop` are left for the washes. A pen drawing lays all lines.

## Prepared drawing files

The only line source is a prepared drawing file (`--drawingfile STEM`, `src/paint/line-source.mjs`). An image model makes a clean line drawing of the subject; `tools/seg/trace-drawing.py` traces it into strokes with width and darkness, and `tools/seg/order-strokes.mjs` orders them as a hand draws (`tools/seg/pencil-hand.mjs` for pencil; see [tools/seg/README.md](../tools/seg/README.md)). Without `--drawingfile`, the painter logs `!!! NO LINE` and draws nothing.

The pen or pencil draws the file's lines as they are. Before painting, the painter reads only the target's line darkness to set the pen's load (`src/paint/methods/ink-lines-file.mjs`, written to `ink-lines.json`):

- `--inkdarkmatch c`: scales the ink load on scrap until test strokes are `c` times as dark as the target's firm lines (`ink-dark-match.json`).
- `--inkdarkcap c`: caps the load so a test line on scrap is at most `c` times as dark as the target's lines (`src/paint/methods/ink-scrap.mjs`).
- `--inkwidthfloor f`: draws no line thinner than `f` target pixels.

## The dip pen

`src/media/pen.mjs` models a dip pen after Kim et al., "[Hydrodynamics of Writing with Ink](https://doi.org/10.1103/PhysRevLett.107.264501)" (*Physical Review Letters*, 2011):

- **Contact**: pressing harder spreads the nib halves and widens the line; a fresh dip carries a drop that widens the first marks.
- **Speed**: slow strokes deposit more ink per millimetre (wide and dark); fast strokes thin out.
- **Depletion**: as the reservoir empties, the line thins, skips across raised paper fibres and then re-dips.
- **Paper**: dry paper filters the dye into a crisp edge; damp paper wicks it along fibres so the line feathers.

Ink colour is separate from the wash palette: warm `sepia` (default, soluble) or `black` (waterproof by default before washes). `drawing.ink.waterproof` or `--inkfast auto|1|0` controls whether opening ink sets before the washes.

## Pen-and-wash recipe (`--inkrecipe wash`)

`--inkrecipe wash` (`src/paint/methods/ink-recipe.mjs`) configures ink for pen-and-wash works (such as Guardi or Tiepolo). Command-line flags override the recipe:

| Flag | `wash` | Default (`none`) |
|---|---|---|
| `--outlinemedium`, `--drawing` | `ink`, `both` | `graphite`, `first` |
| `--drawingstages`, `--stages` | `off`, `prepink,finishink` | `auto`, none |
| `--prepinkfrom`, `--prepinkamount`, `--prepinkkeep`, `--prepinkadd`, `--prepinkdeviate` | `lines`, `1`, `1`, `0`, `0` | stage defaults |
| `--openingpressure` | `1` | `0.3` on staged runs |
| `--drawinghand`, `--drawstroke`, `--inkhand` | `1`, `0`, `1` | `0`, `0.12`, `0` |
| `--drawtaperin`, `--drawtaperout`, `--drawtaperstart`, `--drawtaperend` | `2`, `6`, `0.7`, `0.45` | `3`, `5`, `0.45`, `0.3` |
| `--drawdetailscale`, `--drawflickmm`, `--drawwidthgain`, `--drawjoingap` | `0.75`, `0`, `1`, `14` | `1`, `0`, `0.95`, `4` |
| `--inkdarkmatch` | `1` | `0` |
| `--inkhue`, `--inkhuegain` | `source`, `1.5` | `profile`, `1` |
| `--inkdamp`, `--inkbleed` | `0`, `0.35` | `0`, `0` |
| `--inkres` | `round(2160 / width)`, 1 to 4 | `1` |
| `--inkwidthfloor` | `0` when `--inkres >= 2`, else `1` | `0` |

Both pen and pencil drawings from a drawing file render on the fine sheet (`--inkres`, near 2,160 px wide) so fine lines stay crisp, and erasers (`src/paint/methods/fine-erase.mjs`) lift graphite from both the fine sheet and the wash grid. `--inkrecipe v2` sets `--inkdarkmatch 1 --inkdamp 0.3` without forcing ink on.

`--drawinghand 1` joins facing continuations within a role and region (`--drawjoingap`, `--drawjoincos`, `--drawjoinaim`), orders strokes from the last pen lift with entry/exit tapers (`--drawtaperin`, `--drawtaperout`), and breaks contours across lit spans (`--drawlit`).

## Linework stages and drawing order

A value plan ([plan-format.md](plan-format.md#value-plans-the-drawing-section)) or `--stages` can cut up to three stages from the drawing file:

| Stage | Job | Medium |
|---|---|---|
| `prep` | Light placement of major geometry before ink (`{"prep": {"amount": 0.35}}`) | Pencil (graphite) |
| `prepInk` | Opening pen drawing before washes (`{"prepInk": {"from": "lines", "amount": 1, "deviate": 0}}`) | Ink |
| `finishInk` | Selective closing accents over dry washes (`{"finishInk": {"from": "prepInk", "select": "both", "restate": 0.2}}`) | Ink |

`--drawing` controls when lines run: `first` (default: before washes), `both` (opening drawing plus closing accents from `--drawinglast` or `finishink`), `last` (closing ink only) or `none`.

```sh
npm run example:animal
node tools/paint-plate.mjs --image <target> --drawingfile <stem> --inkrecipe wash --washplan <study.png>
node tools/paint-plate.mjs --image <target> --drawingfile <stem> --inkrecipe wash --drawingonly 1
```
