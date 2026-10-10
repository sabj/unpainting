# Ink

Pen and wash is an ink drawing with watercolor over or under it. The painter keeps the two layers separate, so you can see each one.

![Two rows, Guardi's A Colonnade, Partly Ruined, with Figures and Tiepolo's Bacchus and Ariadne. Each row: the target, the painting's estimated ink, the pen drawing, the washes, and the finished painting](img/ink.webp)

Two pen-and-wash paintings. Both targets are almost all pen line. Each row: the target, the estimated ink, the pen drawing before any paint, the washes before the closing ink, and the finish. The estimated ink is worked out from the saved frames; the painter doesn't save it as a layer.

In the third image of each row, the pen drawing is thin, brown and hard-edged. In the fourth, the washes are broad and soft and settle into the shapes the pen set. The ink gives the structure and the wash gives the light.

## Ink or pencil

The painter first looks for pen line in the target. If at least 0.5% of the picture reads as ink line, the source was a pen drawing, and the painter draws in ink. Below that, it draws a light pencil underdrawing. Ink on a target without line would add marks the original lacks. Pencil is light, neutral and does not move under water, so the washes cover it.

A plan can set this itself. Its `drawing` section sets the medium, the ink color, how many lines and how heavy ([plan-format.md](plan-format.md#value-plans-the-drawing-section)).

## Where the lines come from

The pen draws only lines found in the target first:

- The ink separator in `src/crop/inkwash.mjs` sorts the picture into ink, pigment, edges and bare paper.
- `tools/seg/ink-lines.mjs` traces that estimated ink into center lines and joins pieces that continue each other.
- Optional: a trained line model (`tools/seg/lines.py`) makes a line drawing from any target. You don't need it.

The plan picks which candidates to draw. A plan with `lines: "regions"` orders lines by the part of the picture they lie in. Head and hands come first, then clothing, then the setting. `maxLines` caps the count.

## The pen

`src/media/pen.mjs` is a dip pen. It follows Kim et al., "[Hydrodynamics of Writing with Ink](https://doi.org/10.1103/PhysRevLett.107.264501)" (Physical Review Letters, 2011). The paper finds that paper pulls ink out of a nib at a steady rate. That fact explains most of how a pen line looks.

- Contact. The nib, the pen's metal tip, touches a small circle. Pressing harder spreads its two halves and widens the circle. A freshly dipped nib carries a drop, so the first marks are wider.
- Speed. A slow stroke gets more ink per millimeter, so it comes out wide and dark. A fast stroke comes out thin.
- Running dry. As the nib empties, the line thins. Then only the paper's raised fibers touch ink, so the line skips. Then the pen dips again.
- Dry paper. Ink soaks into the pores and the fibers filter the dye, so the edge is crisp and slightly ragged.
- Damp paper. The dye joins the water already in the pores and wicks along the fibers, so the line feathers.

The ink color is separate from the wash palette. The default is a warm sepia, and black is the other choice.

## Drawing order

The default recipe draws first, lets the drawing dry, paints the washes, then adds closing ink accents. The opening drawing places the forms for the washes to fill. Sepia ink can rewet, so a wash over wet ink would smear it. The washes soften and partly cover the lines. The closing pass adds a few dark accents where the target has strong edges.

| `--drawing` | Before paint | After paint |
|---|---|---|
| `both` (default recipe) | drawing | ink accents |
| `first` | ink or pencil, chosen from the target | nothing |
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

[running.md](running.md#main-command-line-controls) lists the other controls.
