# src/paint/methods

Generic watercolor methods. A wash is a layer of diluted paint; a glaze is a transparent wash over dried paint. This folder covers paper, palette, paint order, washes, glazes, layers and the drawing. `tools/paint-plate.mjs` imports them.

- `light-to-dark.mjs`: value planning from light to dark, with the style preset's technique per value band (a light-to-dark range).
- `outline-medium.mjs`, `drawing-file.mjs`, `drawing-logic.mjs` and `material-profiles.mjs`: the ink or pencil drawing made before the first wash, and stroke-count limits on each drawing stage.
- `first-wash.mjs`, `masses.mjs` and `mop-lanes.mjs`: the opening wash and the broad mop washes.
- `passages.mjs`: the `--passages` loader. No passage modules ship; naming one fails the run.
- `wetdry.mjs`: wet blend or dry layer, and readiness checks that hold a stroke until its paper is ready.
- `painter-order.mjs`: `--order legacy-painter`, region-by-region painting order.

`drawing.mjs`, `lay.mjs`, `look.mjs`, `painter.mjs`, `palette.mjs` and `subject.mjs` are used only by tests and research tools.

```sh
node --test src/paint/methods/*.test.mjs
```

[techniques.md](../../../docs/techniques.md) lists every module here and the preset flags that turn them on.
