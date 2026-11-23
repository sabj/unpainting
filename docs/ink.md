# Ink

Pen and wash is an ink drawing with watercolor over or under it. The painter keeps the two layers separate, so you can see each one.

![Two rows, Guardi's A Colonnade, Partly Ruined, with Figures and Tiepolo's Bacchus and Ariadne. Each row: the target, the painting's estimated ink, the pen drawing, the washes, and the finished painting](img/ink.webp)

Two pen-and-wash paintings. Both targets are almost all pen line. Each row: the target, the estimated ink, the pen drawing before any paint, the washes before the closing ink, and the finish. The estimated ink is worked out from the saved frames; the painter doesn't save it as a layer. Both were painted with release 0.1.0 (painter V096, sim 100).

In the third image of each row, the pen drawing is thin, brown and hard-edged. In the fourth, the washes are broad and soft and settle into the shapes the pen set. The ink gives the structure and the wash gives the light.

## Ink or pencil

`--outlinemedium` defaults to graphite, a light pencil drawing. Ink is drawn only when asked for: with `--outlinemedium ink`, a plan's ink medium, or `--inkrecipe wash` (see [Pen and wash ink](#pen-and-wash-ink)). Pencil is light, neutral and does not move under water, so the washes cover it. `--outlinemedium auto` draws in ink if at least 0.5% of the picture reads as ink line (`--penfirst`), and in pencil below that.

The medium is decided before painting (`src/paint/methods/medium-decision.mjs`). A `--subjectmedium` on the command line wins, then a plan's `drawing.medium`. An ink request is kept only when the source shows at least `--penfirst` per cent pen line; below that the drawing is graphite. The run card records the decision under `drawing.mediumDecision`.

## Where the lines come from

The only line is a prepared drawing file (`--drawingfile STEM`, `src/paint/line-source.mjs`). An image model draws a clean line drawing of the subject. `tools/seg/trace-drawing.py` traces it, one stroke per drawn line with its width and darkness, and `tools/seg/order-strokes.mjs` orders the strokes as a hand draws, structure first. For pencil, `tools/seg/pencil-hand.mjs` lays it as a hand would. [tools/seg/README.md](../tools/seg/README.md) has the commands.

The pen or pencil draws the file's lines as they are. Nothing cuts, smooths, re-decides or re-measures them. With no drawing file the log prints `!!! NO LINE` and no line is drawn.

The painter reads only the target's line darkness, before painting, to set the pen's load (`src/paint/methods/ink-lines-file.mjs`):

- `--inkdarkmatch c` draws a sample of the stage's strokes on a blank scrap and scales the ink load until they are `c` times as dark as the target's firm lines. The load can rise or fall. It writes `ink-dark-match.json`.
- `--inkdarkcap c` caps the load so a test line on scrap is at most `c` times as dark as the target's lines (`src/paint/methods/ink-scrap.mjs`). It only lightens.
- `--inkwidthfloor f` draws no line thinner than `f` target pixels on the sheet.

These write the target's line measures to `ink-lines.json`.

## The pen

`src/media/pen.mjs` is a dip pen. It follows Kim et al., "[Hydrodynamics of Writing with Ink](https://doi.org/10.1103/PhysRevLett.107.264501)" (Physical Review Letters, 2011). The paper finds that paper pulls ink out of a nib at a steady rate. That fact explains most of how a pen line looks.

- Contact. The nib, the pen's metal tip, touches a small circle. Pressing harder spreads its two halves and widens the circle. A freshly dipped nib carries a drop, so the first marks are wider.
- Speed. A slow stroke gets more ink per millimeter, so it comes out wide and dark. A fast stroke comes out thin.
- Running dry. As the nib empties, the line thins. Then only the paper's raised fibers touch ink, so the line skips. Then the pen dips again.
- Dry paper. Ink soaks into the pores and the fibers filter the dye, so the edge is crisp and slightly ragged.
- Damp paper. The dye joins the water already in the pores and wicks along the fibers, so the line feathers.

The ink color is separate from the wash palette. The default is a warm sepia, and black is the other choice.

Black opening ink sets before the washes by default; sepia stays soluble. `drawing.ink.waterproof` chooses whether it sets (`--inkfast auto|1|0`). The pen keeps one nib reservoir across marks until it needs another dip.

## Pen and wash ink

`--inkrecipe wash` is ink for pen drawings and pen-and-wash sources, such as a Guardi or Tiepolo sheet. It is off by default and turns ink on by itself (`src/paint/methods/ink-recipe.mjs`). A flag given on the command line wins over the recipe.

| Flag | Wash | Off |
|---|---|---|
| `--outlinemedium`, `--drawing` | `ink`, `both` | `graphite`, `first` |
| `--drawingstages`, `--stages` | `off`, `prepink,finishink` | `auto`, none |
| `--prepinkfrom`, `--prepinkamount`, `--prepinkkeep`, `--prepinkadd`, `--prepinkdeviate` | `lines`, 1, 1, 0, 0 | stage defaults |
| `--openingpressure` | 1 | 0.3 on a staged run |
| `--drawinghand`, `--drawstroke`, `--inkhand` | 1, 0, 1 | 0, 0.12, 0 |
| `--drawtaperin`, `--drawtaperout`, `--drawtaperstart`, `--drawtaperend` | 2, 6, 0.7, 0.45 | 3, 5, 0.45, 0.3 |
| `--drawdetailscale`, `--drawflickmm`, `--drawwidthgain`, `--drawjoingap` | 0.75, 0, 1, 14 | 1, 0, 0.95, 4 |
| `--inkdarkmatch` | 1 | 0 |
| `--inkhue`, `--inkhuegain` | `source`, 1.5 | `profile`, 1 |
| `--inkdamp`, `--inkbleed` | 0, 0.35 | 0, 0 |
| `--inkres` | 2160 over the width, from 1 to 4 | 1 |
| `--inkwidthfloor` | 0 with `--inkres` 2 or more, else 1 | 0 |

The pens draw on a sheet near 2160 px wide: `--inkres` is 4 at 540 px, 2 at 1080 px, 1 from 2400 px. The saved `drawing-opening.png`, `painting.png` and frames are N times the painting's width.

A drawing laid from a drawing file, pencil or a pen chosen without the wash recipe, is drawn on the same fine sheet at the same N (0.4 rc3; `drawingInkResArgs` in `src/paint/methods/ink-recipe.mjs`), its graphite carried down into the painting's sheet as the pen's ink is: washes lie over it there, and every eraser (the prep erase, an erase passage, `--pencilerase`) rubs it there and takes the same share off the fine sheet (`src/paint/methods/fine-erase.mjs`). Beside ink the pencil has its own channel on the fine sheet. Before rc3 the pencil was laid on the painting's own coarser cells, where a line finer than a cell was widened to a cell and read broken and fuzzy.

With `--drawingonly 1` the wash recipe lays the drawing alone on dry paper, in near-black drawing ink with the flexible drawing nib, one opening pen.

`--inkrecipe v2` sets `--inkdarkmatch 1` and `--inkdamp 0.3`. It does not turn ink on.

The recipe is not for photographs. On a target with less pen line than `--penfirst` (0.5%) the painter warns.

## Linework stages

A drawing is up to three jobs, each cut from the drawing file:

| Stage | Job | Medium | When to use it | Skip it when |
|---|---|---|---|---|
| `prep` | place the big shapes lightly before any ink | pencil (graphite) | placement is hard: architecture in perspective, portrait proportions | the subject is a simple silhouette, or the source is pen only |
| `prepInk` | the opening pen drawing, before the washes | ink | the structure must hold the washes | pure watercolor with no visible line |
| `finishInk` | closing accents over the dry washes | ink | edges the washes softened need restating | the opening ink already reads at the finish |

`--stages` names them; a plan's `drawing.stages` sets their shares and methods ([plan-format.md](plan-format.md#value-plans-the-drawing-section)). A closing pen needs a finish stage or its own file (`--drawinglast`). Each run with stages writes `stage-prep.jpg`, `stage-prepink.jpg` and `stage-finishink.jpg`.

Ink is waterproof by default for black and soluble for sepia. Waterproof ink suits pen and watercolor, where the line must survive the washes. Soluble sepia suits brown ink-and-wash masters, where a wet wash should soften the line.

## Drawing order

The default recipe sets `--drawing first`: the drawing goes down first and dries, then the washes. The washes soften and partly cover the lines.

| `--drawing` | Before paint | After paint |
|---|---|---|
| `both` | drawing | ink accents, from `--drawinglast` or a finish stage |
| `first` (default) | pencil, or ink if asked | nothing |
| `last` | nothing | ink, from `--drawinglast` or a finish stage |
| `none` | nothing | nothing |

Without a closing file or finish stage, `both` and `last` log `!!! NO CLOSING LINE` and skip the closing pen. Each image run writes `ink.jpg` and `wash.jpg` next to `painting.jpg`.

## Try it

```sh
npm run example:animal
node tools/paint-plate.mjs --image <target> --drawingfile <stem> --inkrecipe wash --washplan <study.png>
node tools/paint-plate.mjs --image <target> --drawingfile <stem> --inkrecipe wash --drawingonly 1
```

[running.md](running.md#main-command-line-controls) lists the other controls.
