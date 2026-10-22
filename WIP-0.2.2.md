# 0.2.2 work in progress

This branch holds the ink legibility work that did not ship in 0.2.1. It branches from main before 0.2.1 and still needs merging onto it.

## On this branch

- Pen lines traced from the source's own strokes (centrelines and widths), gated by the lineart map.
- A line-or-wash decision per line, from SAM regions labelled by a vision model, with per-label rules (foliage is wash only, faces and hands are never shadow).
- Even, hand-like strokes in the ink's own colour, with gap closing and collinear joins.
- Opt-in: straight-line and arc fitting, cross-hatched shadows for pure ink (`--inkhatch 1`), salience.
- The ink legibility test, `tools/judge/ink-legibility.mjs`: 12 named crops judged blind.

## Open

- Lines are still too squiggly in both 0.2.1 and this branch. Next: fit each source line as one smooth stroke with few control points, drawn in one pass, in place of filtering traced pixels.
- No J1 run of this branch on the full set. The GPU boxes lack the lineart models.
- Default pencil scores below 0.2.0 on Guardi (-8.5%) and Rembrandt (-4.5%).
- Colour v2 (`--paintguard`, `--techcal`, `--no-base-palette`) was neutral in 0.2.1; it stays off.
- Pen `damp` for mushroom gill lines in the fungi demo.
