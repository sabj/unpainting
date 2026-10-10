# Techniques

These are the brush, wash, pen and pencil techniques the simulator has, with the code that does each one. The default image painter uses `src/paint/methods/light-to-dark.mjs` to choose settings per value passage (a wash or group of marks in one light-to-dark range). Per-subject presets in `src/paint/styles/` supply water, mixing and edge settings. Separate passage modules use `chooseTechnique` in `src/crop/technique.mjs`. The wash table below cites `TECHNIQUES` in `src/paint/methods/lay.mjs`, which is used by the standalone painter; its settings do not cover every passage chosen by a value plan. A stroke plan for `tools/run-plan.mjs` can call the same brush and drying steps by hand (see [plan-format.md](../plan-format.md)).

## Washes

| technique | what it does | code |
|---|---|---|
| Flat wash, wet on dry | A loaded mop, a broad flat brush, makes parallel sweeps across a passage on dry paper and stops at its edge, so the edge dries hard. | `TECHNIQUES['wet on dry']`, `brushedWashPaths` and `washPaths` in `src/media/wash.mjs` |
| First wash | The same mop carried fuller, so the first light wash reaches the bottom of the paper's tooth (surface texture). | `TECHNIQUES['first wash']` |
| Wet on wet | Clean water goes on first, then a full mop goes into it, so the paint spreads and its edges fade. | `TECHNIQUES['wet on wet']`, `prewetArea` in `src/media/wash.mjs`; plan commands with `"role": "clean-water"` |
| Graded wash | One wet passage with the brush reloaded at intervals along a sweep from dark to light, so the tone fades without bands. | `--gradedwash` in `tools/paint-plate.mjs`, `gradientSweepAngle` in `src/media/wash.mjs`; [examples/plans/graded-wash.json](../../examples/plans/graded-wash.json) |
| Glaze | A wash laid over paint that has dried and set as its own layer, so the colors stack optically. | `TECHNIQUES.glazed`, `dry` and `fix` in `src/media/sheet.mjs`; plan command `"operation": "dry"`; [examples/plans/glazes.json](../../examples/plans/glazes.json) |
| Dry brush | A brush with about a fifth of a load drags over the paper texture and leaves broken marks. | `TECHNIQUES['dry brush']`; low `water` in `dip` in `src/media/brush.mjs` |
| Softened edge | A damp brush drawn along a wet edge takes a little paint back, so the edge fades into the paper. | `softenEdge`, `soften` and `softArcs` in `src/media/wash.mjs` |

## Lights and lifting

| technique | what it does | code |
|---|---|---|
| Masking fluid | Masking fluid protects areas of bare paper from washes. Removing it reveals white paper. | `applyResist` and `liftResist` in `src/media/sheet.mjs`; `--resistmin` in `tools/paint-plate.mjs` |
| Lifting with a thirsty brush | A brush dipped in little water and no paint absorbs water and pigment from wetter paper. | `thirsty` in `src/media/brush.mjs` |
| Blotting | A tissue pressed on a wet wash takes up the standing water and some of its pigment. | `blot` in `src/media/sheet.mjs` |

## Line

| technique | what it does | code |
|---|---|---|
| Dip pen | A nib, the pen's metal tip, draws lines that thin and skip as its reservoir empties, and feather on damp paper. | `createPen`, `dipPen` and `penStroke` in `src/media/pen.mjs`; `drawGestures` in `src/media/draw.mjs` |
| Pencil API | Graphite is laid on the paper texture; a later wash can lift and move it. | `createPencil`, `pencilStroke` and `wetGraphite` in `src/media/pencil.mjs` |
| CLI graphite | Fixed graphite under the washes, without the low-level wear and dust model. | `pencilDraw` in `src/paint/methods/pencil-line.mjs`; `--outlinemedium graphite`. `--pencilerase` applies only to the guide enabled by `--penpencil`. |

## Drying

Water and pigment move only while the simulation advances (`step` in `src/media/sheet.mjs`). Strokes on a wet sheet run together, and strokes on a dry sheet keep their edges. `dry` dries the sheet and sets the current wash as a layer. [examples/plans/drying-dry-between.json](../../examples/plans/drying-dry-between.json) and [drying-too-wet.json](../../examples/plans/drying-too-wet.json) show the same two strokes with and without drying between them.
