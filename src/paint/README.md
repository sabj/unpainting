# src/paint

The painter's decisions: what to paint, in what order, with which brush and mix. The physics lives in `src/media`. [How it paints](../../docs/how-it-paints.md) covers the stages and flags.

Pen drawing, in `methods/` unless noted:

- `line-source.mjs` (here): the one line source, the drawing file.
- `ink-lines-file.mjs`, `ink-lines.mjs`, `ink-recipe.mjs`: the target's line darkness for the pen's load, and `--inkrecipe`.
- `drawing-stages.mjs`, `drawing-file.mjs`, `drawing-hand.mjs`: opening and closing stages, the hand plan.
- `ink-match.mjs`, `ink-res.mjs`, `fine-erase.mjs`, `fine-material.mjs`, `material-profiles.mjs`: the ink load, pen and pencil on the fine sheet, the eraser.

Painting: washes come from block-in studies (`methods/study-washes.mjs`). `methods/` holds generic methods that work on any subject; `techniques/` holds named techniques (passage moves, shaped marks, softening).

- `recipe.mjs`: `--recipe` presets. `default`, `general` and `combined` are one general process. Presets and the `v096` recipe were removed in 0.3.3; naming one fails the run. `none` and unknown names add no flags; a value plan's drawing flags still apply.
- `removed-options.mjs`: options the painter no longer has; naming one stops the run with the reason.
- `run-cache.mjs`: disk cache for slow steps that depend only on their inputs.
- `film-timeline.mjs`: `--timeline` re-times a run's frames to a target sequence.
- `output-directory.mjs`: refuses to erase an existing run's folder.

Entry point: `tools/paint-plate.mjs`. Tests: `node --test src/paint/*.test.mjs src/paint/*/*.test.mjs src/paint/*/*/*.test.mjs`.
