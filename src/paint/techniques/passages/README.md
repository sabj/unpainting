# Passages

A passage is a wash or group of marks with one job. The value ladder is a sequence of paint layers from light to dark.

One module per section of the picture, run by `tools/paint-plate.mjs --passages sea,sand` at the point its `when` names:
`washes` (after the first washes with the broad brush), `shapes` (after the dark shapes, before the value ladder), `finish` (after the ladder).

A module exports `when` and `async paint(ctx)`. SC scales the plan grid; W2 and H2 are the simulation width and height in cells. `ctx` carries the sheet and the plan (`sheet, w, h, n, SC, W2, H2, A`: the sheet, dimensions, scale and planned
optical density, how much light each pigment blocks in each grid cell; `PIGS`: the pigment list; `expected` to record the planned pigment for each passage, `used` for counts),
the segments (`seg.regions[].mask` at the plan grid, `seg.regions[].name`, `seg.contours`), the subject mask, the physics
(`O` for physics settings, `step`, `dry`, `blot`, `applyResist`, `liftResist`), the brush (`createBrush`, `dip`, `stroke`, `thirsty`), the path
makers (`mopLanes`, `washPaths`, `brushedWashPaths`, `containPaths`), `thickness(sheet)` to read what the sheet holds,
`gaussian`, `components`, `dilate`, `erode`, `handAngle(k)`, `clock(key, fn)`, `snap()` to write a frame, `stage({...})` to
name the frame's step, `opt(name, default)` and `num(name, default)` to read flags, and `log`.

Read `src/paint/methods/masses.mjs` and `shapes.mjs` for a worked example of every call.
