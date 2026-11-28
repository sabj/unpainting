# Ink & Line Drawing

Pen and wash pairs a simulated dip-pen or graphite drawing with transparent washes. Every run saves the separated line layer (`ink.jpg`) and wash layer (`wash.jpg`) alongside the finished painting (`painting.png`).

![How drawing decomposition works on Yale Rosewalk and Prout’s Laundresses: target, Qwen line extraction and traced paths, dip-pen lay-in, wash layer, and finished painting](img/ink-decomposition.webp)

## How the Qwen passes work

Before painting begins, three automated prep passes turn a finished picture into ordered millimetre strokes (never reading the target again during painting):

1. **Medium classification (`tools/seg/classify-medium.py`):** Measures how much of the picture is pen line vs. dry pencil vs. pure wash, routing it to `ink`, `pencil`, `mixed`, or `none`. Pure watercolours never get black pen outlines.
2. **Qwen-Image-Edit 2511 extraction (`tools/prepare/studies.sh`):** Runs the 8-step Lightning model across three seeds (`42, 7, 11`) with two dedicated prompts in `tools/prepare/prompts/`:
   - **`e6` (ink):** Redraws visible architectural and contour structure in black line on white paper — explicitly forbidding shading, hatching, sky, or cast shadows.
   - **`l1` (pencil lay-in):** Produces a sparse, light watercolourist’s graphite underdrawing — main form outlines and essential facial/structural landmarks only.
   - `choose_layin.py` picks the cleanest seed automatically.
3. **Vector tracing, tagging & ordering (`trace-drawing.py`, `tag-medium.py`, `order-strokes.mjs`):** Skeletonises the extracted drawing into smooth millimetre polylines, tags regions ink vs. pencil on mixed works, and orders strokes **one SAM object at a time** so the pen finishes a window, arch, or figure before moving on.

![Guardi and Tiepolo: original, Auto’s opening pen drawing, first dried washes, isolated wash layer, and finished painting](img/ink.webp)

## Dip pen & pencil physics

`src/media/pen.mjs` simulates a physical dip pen (after Kim et al.; see [reading list](reading-list.md)):

- **Pressure & speed:** More pressure spreads the nib; slower strokes deposit wider, darker ink; fast strokes thin out.
- **Ink exhaustion:** A fresh dip lays a rich bead, then thins and skips over cold-press paper crests until the pen re-dips.
- **Wet vs. dry paper:** Waterproof `black` ink stays locked under later washes; soluble `sepia` pulls into clean water; damp paper feathers the line along paper fibres.
- **Pencil (`graphite`):** Stays fixed under water and goes down in phases just ahead of the washes that need it.

![Dip-pen lines at varying speeds, soluble ink pulled with clean water, and ink drawn over a dried wash](img/technique-inking.webp)

## Common options

| Option | What it controls |
|---|---|
| `--outlinemedium auto\|ink\|graphite` | Auto picks ink when ≥0.5% of the source is pen line, else faint pencil |
| `--inkrecipe wash` | Pen-and-wash preset: opening ink (`prepink`), matched ink darkness, closing accents (`finishink`) |
| `--drawing first\|both\|last\|none` | When lines are drawn relative to the washes (`--drawingonly 1` skips washes) |
| `--inkfast auto\|1\|0` | Whether opening ink dries and sets before the first wash |
| `--inkdarkmatch c` / `--inkdarkcap c` | Calibrates pen ink darkness on scrap paper against the target’s firm lines |
