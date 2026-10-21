# Ink

Pen and wash is an ink drawing with watercolor over or under it. The painter keeps the two layers separate, so you can see each one.

![Two rows, Guardi's A Colonnade, Partly Ruined, with Figures and Tiepolo's Bacchus and Ariadne. Each row: the target, the painting's estimated ink, the pen drawing, the washes, and the finished painting](img/ink.webp)

Two pen-and-wash paintings. Both targets are almost all pen line. Each row: the target, the estimated ink, the pen drawing before any paint, the washes before the closing ink, and the finish. The estimated ink is worked out from the saved frames; the painter doesn't save it as a layer.

In the third image of each row, the pen drawing is thin, brown and hard-edged. In the fourth, the washes are broad and soft and settle into the shapes the pen set. The ink gives the structure and the wash gives the light.

## Ink or pencil

The painter first looks for pen line in the target. If at least 0.5% of the picture reads as ink line, the source was a pen drawing, and the painter draws in ink. Below that, it draws a light pencil underdrawing. Ink on a target without line would add marks the original lacks. Pencil is light, neutral and does not move under water, so the washes cover it.

A plan can set this itself. Its `drawing` section sets the medium, the ink color, how many lines and how heavy ([plan-format.md](plan-format.md#value-plans-the-drawing-section)).

## Where the lines come from

A plan picks the line set with `drawing.source`:

| Source | Use it for | Avoid it for |
|---|---|---|
| `source-ink` | pen drawings and pen-and-wash masters: the target's own pen lines, traced | photographs (it traces dark ridges, not structure) |
| `photo-sketch` | architecture photographs: continuous structural lines with a width hierarchy (`tools/seg/sketch-lines.py`) | portraits and loose landscapes, where it is weaker; it needs python3 with numpy and OpenCV |
| `auto` (default) | anything: `source-ink` when at least 0.5% of the target reads as pen line, else `photo-sketch` when it can run, else the pen finds its own lines | |

Under the plan's choice, the painter's tools are:

- The ink separator in `src/crop/inkwash.mjs` sorts the picture into ink, pigment, edges and bare paper.
- `tools/seg/ink-lines.mjs` traces that estimated ink into center lines and joins pieces that continue each other.
- Optional: a trained line model (`tools/seg/lines.py`) makes a line drawing from any target. You don't need it.
- Optional: `tools/seg/sketch-map.py` runs the published fine and coarse lineart models once before painting. `sketch-lines.py --map` uses that map as evidence ([setup](../tools/seg/README.md)).

The line tools need python with numpy and OpenCV. The painter picks `--sketchpython`, else `PAINTER_LINES_PYTHON`, else `$PAINTER_LINES_VENV/bin/python`, else the repo's `.venv-lines/bin/python`, else `python3`. `tools/cloud/setup-lines.sh` installs `.venv-lines`.

The plan picks which candidates to draw. A plan with `lines: "regions"` orders lines by the part of the picture they lie in. Head and hands come first, then clothing, then the setting. `maxLines` caps the count.

## The pen

`src/media/pen.mjs` is a dip pen. It follows Kim et al., "[Hydrodynamics of Writing with Ink](https://doi.org/10.1103/PhysRevLett.107.264501)" (Physical Review Letters, 2011). The paper finds that paper pulls ink out of a nib at a steady rate. That fact explains most of how a pen line looks.

- Contact. The nib, the pen's metal tip, touches a small circle. Pressing harder spreads its two halves and widens the circle. A freshly dipped nib carries a drop, so the first marks are wider.
- Speed. A slow stroke gets more ink per millimeter, so it comes out wide and dark. A fast stroke comes out thin.
- Running dry. As the nib empties, the line thins. Then only the paper's raised fibers touch ink, so the line skips. Then the pen dips again.
- Dry paper. Ink soaks into the pores and the fibers filter the dye, so the edge is crisp and slightly ragged.
- Damp paper. The dye joins the water already in the pores and wicks along the fibers, so the line feathers.

The ink color is separate from the wash palette. The default is a warm sepia, and black is the other choice.

Black opening ink sets before the washes by default; sepia stays soluble. `drawing.ink.waterproof` chooses whether it sets (`--inkfast auto|1|0`). The pen uses the declared `--inkconc` load. It keeps one nib reservoir across marks until it needs another dip. A plan can say the target is drawn in pen. Then the pen draws the source's own ink, short descriptive marks included, without the sparse sketch's 12-line, 8 mm limits. The plan says so with an `ink-and-wash` style, `drawing.medium: "ink"`, or a prepared line file (`--drawingfile`). A painted target without such a plan keeps the sparse limits. The separator also reads dark painted edges, such as foliage and windows, as ink. `--sourceink 0|1` overrides the choice. The source-ink closing pen defaults to pressure 0.6. Explicit `--openinglines`, `--closinglines`, `--openingminmm` and pressure flags win.

Three flags shape the closing pen. `--closingshare c` gives the opening and closing pens one line budget, with `c` of it for the closing pass. `--inkdarkskip v` cuts closing lines where the plan's value is above `v`, since the wash already states those edges. `--closingconc f` dilutes the closing ink, so accents stay lighter than the darkest wash.

See [Choosing linework](linework.md) for the short job-to-tool guide and its defaults.

## Linework stages

A drawing is up to three jobs, each from the same line set:

| Stage | Job | Medium | When to use it | Skip it when |
|---|---|---|---|---|
| `prep` | place the big shapes lightly before any ink | pencil (graphite) | placement is hard: architecture in perspective, portrait proportions, or a style that shows graphite | the subject is a simple silhouette, or the source is pen only |
| `prepInk` | the opening pen drawing, before the washes | ink | the structure must hold the washes (pen and wash, urban sketch) | pure watercolor with no visible line |
| `finishInk` | closing accents over the dry washes | ink | edges and darks the washes softened need restating | the opening ink already reads at the finish |

The stages are linked. Prep ink follows the pencil with small deviations: it refines each line, drops some (that pencil stays visible) and adds a few the pencil left out. Finish ink restates a share of the prep ink where the target's edges or darks are strongest. With no `stages` in the plan, prep ink and finish ink are each planned on their own.

Each stage takes a few choices ([plan-format.md](plan-format.md#value-plans-the-drawing-section)):

| Choice | Pick | For |
|---|---|---|
| `prepInk.method` | `contour` (default) | clean outlines; architecture and most subjects |
| | `connected` | longer, joined gestures over the same lines |
| | `scribble` | black or curly coats, dark hair: fewer longer strokes, lit edges left open, dark masses as loose scribble |
| `finishInk.method` | `accent` (default) | the strongest part of each chosen line, restated |
| | `architecture` | frames, arches, cornices and sills restated whole, thin and dark at full pressure (the Y1 closing pen) |
| `finishInk.masses` | `scribble` | a black coat that needs a pen texture over its paint; off by default, since a dark surface is paint's job |

Ink is waterproof (`drawing.ink.waterproof`) by default for black and soluble for sepia. Waterproof ink suits pen and watercolor and urban sketches, where the line must survive the washes. Soluble sepia suits brown ink-and-wash masters, where a wet wash should soften the line.

Each run with stages writes `stage-prep.jpg`, `stage-prepink.jpg` and `stage-finishink.jpg`, the sheet after each stage. It also writes `layer-*.jpg`, what each stage laid on its own, with the stage line files and `linework.json`.

## Drawing order

The default recipe (`--drawing first`) draws first, lets the drawing dry, then paints the washes. A plan can add closing ink accents with a `finishInk` stage or `closingLines`. The opening drawing places the forms for the washes to fill. Sepia ink can rewet, so a wash over wet ink would smear it. The pen keeps one reservoir across marks and dips again when it runs low, so a long line does not run dry. The washes soften and partly cover the lines. The closing pass adds a few dark accents where the target has strong edges.

| `--drawing` | Before paint | After paint |
|---|---|---|
| `both` | drawing | ink accents |
| `first` (default recipe) | ink or pencil, chosen from the target | closing ink only if the plan asks (`finishInk` or `closingLines`) |
| `last` | nothing | ink |
| `none` | nothing | nothing |
| `detect` | ink if the target shows pen line | ink if it does not |

Each image run writes `ink.jpg` and `wash.jpg` next to `painting.jpg`.

## Try it

```sh
npm run example:drawing
node tools/paint-plate.mjs --image <target> --drawing last
node tools/paint-plate.mjs --image <target> --outlinemedium graphite
node tools/paint-plate.mjs --image <target> --inkprofile black-ink
```

For a value plan that selects `ink-and-wash`, the default recipe keeps the target's paper tone (`--paperrgb source`), a lean fitted palette, nested light-to-dark value masses and planned stroke lanes (`--strokeplan 1 --laneadapt 1`).

[running.md](running.md#main-command-line-controls) lists the other controls.
