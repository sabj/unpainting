# Ink

Pen and wash pairs an ink drawing with washes over or under it. The drawing and the washes are kept separate so each layer can be inspected.

![Two rows, Guardi's A Colonnade, Partly Ruined, with Figures and Tiepolo's Bacchus and Ariadne. Each row: the target, the painting's estimated ink, the pen drawing, the washes, and the finished painting](img/ink.webp)

## Ink or pencil

`--outlinemedium` defaults to `graphite` (light pencil that does not move under water). Ink is drawn with `--outlinemedium ink`, a plan's `drawing.medium: "ink"` or `--inkrecipe wash`. `--outlinemedium auto` draws ink when at least 0.5% of the source reads as pen line (`--penfirst`), else pencil (`src/paint/methods/medium-decision.mjs`; recorded in `run-card.json` under `drawing.mediumDecision`).

On a pencil drawing Auto lays only a lay-in (`src/paint/methods/drawing-default.mjs`): contours, lay-in strokes, inner growth contours, the top quarter of lines by contribution and lines round facial features, no darker than the lay-in. Hatching and texture tagged `drop` are left for the washes. A pen drawing lays all lines.

## Prepared drawing files

The only line source is a drawing file (`--drawingfile STEM`, `src/paint/line-source.mjs`), made as in [tools/seg/README.md](../tools/seg/README.md). Without it the painter logs `!!! NO LINE` and draws nothing.

The pen or pencil draws the file's lines as they are. Before painting the painter reads only the target's line darkness, to set the pen's load (`src/paint/methods/ink-lines-file.mjs`, written to `ink-lines.json`):

- `--inkdarkmatch c`: scales the ink load on scrap until test strokes are `c` times as dark as the target's firm lines (`ink-dark-match.json`).
- `--inkdarkcap c`: caps the load so a scrap test line is at most `c` times as dark as the target's (`src/paint/methods/ink-scrap.mjs`).
- `--inkwidthfloor f`: no line thinner than `f` target pixels.

## The dip pen

`src/media/pen.mjs` models a dip pen after Kim et al., "[Hydrodynamics of Writing with Ink](https://doi.org/10.1103/PhysRevLett.107.264501)" (*Physical Review Letters*, 2011).

- Contact: more pressure spreads the nib and widens the line; a fresh dip carries a drop that widens the first marks.
- Speed: slow strokes deposit more ink per millimetre; fast strokes thin out.
- Depletion: as the reservoir empties the line thins, skips over raised fibres, then re-dips.
- Paper: dry paper gives a crisp edge; damp paper wicks ink along fibres and the line feathers.

Ink colour is separate from the wash palette: `sepia` (default, soluble) or `black` (waterproof by default before washes). `drawing.ink.waterproof` or `--inkfast auto|1|0` sets whether opening ink sets before the washes.

## Pen-and-wash recipe

`--inkrecipe wash` (`src/paint/methods/ink-recipe.mjs`) configures ink for pen-and-wash works; flags on the command line override it. `--inkrecipe v2` sets only `--inkdarkmatch 1 --inkdamp 0.3`.

With `wash`, `--outlinemedium` is `ink` (default `graphite`), `--drawing` is `both` (`first`), `--stages` is `prepink,finishink` (none), `--inkdarkmatch` is `1` (`0`), `--inkhue source`, `--inkhuegain 1.5`, `--inkbleed 0.35`, and `--inkres` is `round(2160 / width)` from 1 to 4 (`1`) with `--inkwidthfloor 0` when `--inkres >= 2`, else `1`. It also sets the hand and taper flags (`--drawinghand`, `--drawstroke`, `--inkhand`, `--drawtaperin`, `--drawtaperout`, `--drawtaperstart`, `--drawtaperend`, `--drawdetailscale`, `--drawflickmm`, `--drawwidthgain`, `--drawjoingap`, `--openingpressure`, `--prepink*`); see `src/paint/methods/ink-recipe.mjs` for every value.

Pen and pencil drawings from a file render on a fine sheet (`--inkres`, near 2,160 px wide); erasers (`src/paint/methods/fine-erase.mjs`) lift graphite from the fine sheet and the wash grid. `--drawinghand 1` joins facing continuations within a role and region (`--drawjoingap`, `--drawjoincos`, `--drawjoinaim`), orders strokes from the last pen lift with entry and exit tapers (`--drawtaperin`, `--drawtaperout`), and breaks contours across lit spans (`--drawlit`).

## Stages and order

A value plan ([plan-format.md](plan-format.md#value-plans-the-drawing-section)) or `--stages` can cut up to three stages from the drawing file:

- `prep`: light pencil placement of major geometry before ink (`{"prep": {"amount": 0.35}}`).
- `prepInk`: the opening pen drawing before the washes (`{"prepInk": {"from": "lines", "amount": 1, "deviate": 0}}`).
- `finishInk`: selective closing accents over dry washes (`{"finishInk": {"from": "prepInk", "select": "both", "restate": 0.2}}`).

`--drawing` sets when lines run: `first` (default), `both` (opening drawing plus closing accents from `--drawinglast` or `finishink`), `last` (closing ink only) or `none`.

```sh
npm run example:animal
node tools/paint-plate.mjs --image <target> --drawingfile <stem> --inkrecipe wash --washplan <study.png>
node tools/paint-plate.mjs --image <target> --drawingfile <stem> --inkrecipe wash --drawingonly 1
```
