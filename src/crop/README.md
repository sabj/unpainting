# src/crop: target-image analysis

Target analysis for the automatic stroke planner. These modules read the target picture before painting starts: its regions, values, palette, lines and techniques. `tools/paint-plate.mjs` calls them while it builds a plan. The [guard](../../docs/honesty.md) blocks target-pixel reads once painting starts.

- `box.mjs`, `boxpick.mjs`, `palette.mjs`, `palettepick.mjs`, `palettewide.mjs`, `pigments.mjs` and `mixes.mjs`: the paint box, the paints a picture needs, and the mixtures made from them.
- `segments.mjs`: brings the map of named image regions from `tools/seg/segments.py` onto the plan's grid.
- `technique.mjs`: `chooseTechnique` picks wet on wet, wet on dry, dry brush or built up for each passage, a wash or group of marks with one job.
- `inkwash.mjs`, `contours.mjs`, `outline.mjs`, `inktiers.mjs` and `lines.mjs`: finding and ranking the lines the pen draws.
- `gesture.mjs`, `motor.mjs` and `simplify.mjs`: turning a traced path into a drawn, hand-like one.
- `lights.mjs`: small highlights protected with masking fluid.
- `fur.mjs` and `curls.mjs`: fur flicks and ringlet fur.
- `styletarget.mjs`: a watercolor-style target for a photograph without a reference artwork.

Run the tests with `node --test "src/crop/*.test.mjs"`.

[Ink](../../docs/ink.md) covers line finding. [Pigments and paper](../../docs/pigments-and-paper.md) covers paint selection, and [Techniques](../../docs/techniques/README.md) lists each technique and its code.
