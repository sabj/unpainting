# What a plan is

A plan is the set of decisions written down before painting. A passage is a wash or group of marks with one job. The plan says which passages come first and which regions they cover. The plan names mixtures, brush sizes, water loads and techniques. It chooses ink, graphite or no drawing, and when to draw. It sets drying times or moisture checks before the next passage.

The usual order is drawing, drying, pale washes, deeper glazes (transparent washes over dried paint) and a few dark accents. Lights need space left for bare paper. Wet passages can join; separate glazes need time to dry. Brush water and paper moisture are separate choices. The plan records intent. The saved sheet and stroke records show what happened.

The default image painter uses one [combined plan and technique toolbox](combined-painter.md). Its `drawing`, `washes` and `order` sections select the process together; CLI options are overrides. Use `--recipe v096` for the historical fitted recipe.

## Three formats

[Stroke plans](plan-format.md) give ordered brush paths, loads and drying commands. Run one with `node tools/run-plan.mjs <file>`. The JSON files in [examples/plans/](../examples/plans/) include four stroke plans:

| Plan | Commands |
|---|---:|
| [graded-wash.json](../examples/plans/graded-wash.json) | 6 |
| [glazes.json](../examples/plans/glazes.json) | 6 |
| [drying-dry-between.json](../examples/plans/drying-dry-between.json) | 4 |
| [drying-too-wet.json](../examples/plans/drying-too-wet.json) | 7 |

Each count is the length of that file's `commands` array. It includes clean-water strokes and drying steps as well as paint strokes.

Value plans, which group areas by lightness, guide the image painter by naming families (groups) of regions. Each family has bounds, a reference cue and a base technique. [trumbull-values.json](../examples/plans/trumbull-values.json) has 7 entries in its `families` array. Use `--valueplan <file>` with `tools/paint-plate.mjs`, or run `npm run example:architecture` for Trumbull. The painter still builds the brush paths.

By default a value plan lays each band across the whole sheet at once. To work subject by subject, add `subjectOrder` to the value plan and paint with `--subjectorder s`:

```json
"subjectOrder": [{"id": "wall", "families": ["h36a.stoneLit"], "reason": "background first"},
                 {"id": "rest"},
                 {"id": "gate", "families": ["h36a.gate"], "reason": "focal subject last"}]
```

Each entry names plan families or its own `bounds` list. `{"id": "rest"}` places every cell no entry covers; without it those cells go last. With `s` from 0 to 1, each later subject is held back by `0.85 s` of the ladder: 0 keeps the whole-sheet bands, 0.5 overlaps neighbouring subjects, and 1 brings each subject mostly through its washes and glazes before the next starts. Light to dark still holds within a subject. The painter writes `subject-order.json` (the pass order) and `subject-order.png` (which subject each cell belongs to).

Area plans describe named areas and their ordered passes. They set values (lightness), brushes, loads, lights and dependencies. Passes can supply explicit brush paths. Use `--areaplan <file>`. The [area-plan contract](../tools/painter/semantic-areas.mjs) is printed by:

```sh
node tools/paint-plate.mjs --areahelp
```

No area plan example ships in `examples/plans/`.

## With no file

The [automatic planner](how-it-paints.md#plan) reads the target image. It groups regions and values, fits pigment mixtures, selects drawing contours and orders paint passages. It produces layers, shapes, brush paths and technique choices for the painter. These are computed instructions, rather than an authored JSON plan. `plan.jpg` previews the planned paint.

A recipe is a preset of painter settings. The default recipe puts its flags before the user's flags; `expandRecipe({ argv: [] })` in [src/paint/recipe.mjs](../src/paint/recipe.mjs) returns them. A value plan's `"presets"` add [fitted settings](overfitting.md) after the recipe. A user flag can override a recipe or preset flag. An area plan uses no default recipe unless one is named.

## In the benchmark

In benchmark versions [V4 and V5](../bench/README.md#rounds), the model writes plan files and command-line arguments for painter presets and settings. It writes no code. The existing pipeline executes those choices. An argument such as `--drawing first` sets drawing order. V4 starts each try fresh. V5 can use its earlier paintings and notes to revise the next plan. [The benchmark run format](../bench/docs/run-format.md) records the benchmark version, settings and notes.
