# src/paint/methods

Generic watercolor methods. A wash is a layer of diluted paint; a glaze is a transparent wash over dried paint. This folder covers the study wash plan, brushes, paper wetness, the drawing and the pen. `tools/paint-plate.mjs` imports them.

- `study-washes.mjs`, `study-shapes.mjs`, `sweep-fill.mjs`, `puddles.mjs`: the washes read from block-in studies, their shapes, lanes and mixes.
- `drawing-file.mjs`, `drawing-hand.mjs`, `stroke-order.mjs`, `pencil-hand.mjs`: the drawing file's lines, laid as a hand draws them.
- `ink-lines-file.mjs`, `ink-match.mjs`, `ink-recipe.mjs`: the pen's load from the target's line darkness, and the `--inkrecipe` flags.
- `outline-medium.mjs`, `medium-decision.mjs`, `material-profiles.mjs`: ink or pencil, and the drawing materials.
- `wetdry.mjs`: readiness checks that hold a stroke until its paper is ready.

```sh
node --test src/paint/methods/*.test.mjs
```

[How it paints](../../../docs/how-it-paints.md) indexes the modules here.
