# src/paint

The painter's decisions: what to paint, in what order, with which brush and mix. The physics it calls lives in [src/media](../media/).

## Inking

The pen drawing, in `methods/` unless noted ([how it paints](../../docs/how-it-paints.md#8-lines)):

- `line-source.mjs` (here): the one line source, the drawing file.
- `ink-lines-file.mjs`, `ink-lines.mjs`, `ink-recipe.mjs`: the target's line darkness for the pen's load, and the `--inkrecipe` flags.
- `drawing-stages.mjs`, `drawing-file.mjs`, `drawing-hand.mjs`: the opening and closing stages, and the hand plan.
- `ink-match.mjs`, `ink-res.mjs`, `fine-erase.mjs`, `fine-material.mjs`, `material-profiles.mjs`: the ink load, the pen and the pencil on the fine sheet, and the eraser followed there.

## Painting

The washes come from block-in studies (`methods/study-washes.mjs`):

- [methods/](methods/): generic watercolor methods that work the same on any subject.
- [techniques/](techniques/): named techniques: passage moves, shaped marks, softening.
- `recipe.mjs`: the `--recipe` presets of painter settings. `default`, `general` and `combined` are one general process. Presets and the `v096` recipe were removed in 0.3.3 (settings fitted to one subject); naming one fails the run. `none` and unknown names add no recipe flags; drawing flags from a value plan still apply.
- `removed-options.mjs`: options the painter no longer has; naming one stops the run with the reason.
- `run-cache.mjs`: a disk cache for slow steps whose results depend only on their inputs.
- `film-timeline.mjs`: `--timeline`, which re-times a run's frames to follow a target sequence.
- `output-directory.mjs`: refuses to erase an existing run's output folder.

`tools/paint-plate.mjs` is the entry point. Run the tests with:

```sh
node --test src/paint/*.test.mjs src/paint/*/*.test.mjs src/paint/*/*/*.test.mjs
```

[How it paints](../../docs/how-it-paints.md) explains the stages, modules and recipe flags.
