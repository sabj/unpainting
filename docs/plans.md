# What a plan is

A plan is the set of decisions written down before painting. A passage is a wash or group of marks with one job. The plan says which passages come first and which regions they cover. The plan names mixtures, brush sizes, water loads and techniques. It chooses ink, graphite or no drawing, and when to draw. It sets drying times or moisture checks before the next passage.

The usual order is drawing, drying, pale washes, deeper glazes (transparent washes over dried paint) and a few dark accents. Lights need space left for bare paper. Wet passages can join; separate glazes need time to dry. Brush water and paper moisture are separate choices. The plan records intent. The saved sheet and stroke records show what happened.

The image painter reads one value plan. Its `drawing`, `washes` and `order` sections choose the process together ([plan format](plan-format.md#value-plan-input)). Command-line options override them. A planner should choose tools from the target, not turn everything on. The [technique toolbox](#technique-toolbox) below says when each tool fits.

## Three formats

[Stroke plans](plan-format.md) give ordered brush paths, loads and drying commands. Run one with `node tools/run-plan.mjs <file>`. [examples/plans/](../examples/plans/) has four: [graded-wash.json](../examples/plans/graded-wash.json), [glazes.json](../examples/plans/glazes.json), [drying-dry-between.json](../examples/plans/drying-dry-between.json) and [drying-too-wet.json](../examples/plans/drying-too-wet.json).

Value plans, which group areas by lightness, guide the image painter by naming families (groups) of regions. Each family has bounds, a reference cue and a base technique. [trumbull-values.json](../examples/plans/trumbull-values.json) has 7 entries in its `families` array. Use `--valueplan <file>` with `tools/paint-plate.mjs`, or run `npm run example:architecture` for Trumbull. The painter still builds the brush paths.

By default a value plan lays each band across the whole sheet at once. To work subject by subject, list subjects in the plan's `order` section:

```json
"order": {"strength": 0.5, "subjects": [{"id": "wall", "families": ["stoneLit"], "reason": "background first"},
                                        {"id": "rest"},
                                        {"id": "gate", "families": ["gate"], "reason": "focal subject last"}]}
```

Each entry names plan families or its own `bounds` list. `{"id": "rest"}` places every cell no entry covers; without it those cells go last. The strength `s` (0 to 1, also `--subjectorder s`) holds each later subject back by `0.85 s` of the ladder. 0 keeps the whole-sheet bands, and 0.5 overlaps neighbouring subjects. 1 brings each subject mostly through its washes and glazes before the next starts. Light to dark still holds within a subject. The painter writes `subject-order.json` (the pass order) and `subject-order.png` (which subject each cell belongs to).

Area plans describe named areas and their ordered passes. They set values (lightness), brushes, loads, lights and dependencies. Passes can supply explicit brush paths. Use `--areaplan <file>`. The [area-plan contract](../tools/painter/semantic-areas.mjs) is printed by:

```sh
node tools/paint-plate.mjs --areahelp
```

No area plan example ships in `examples/plans/`.

## With no file

The [automatic planner](how-it-paints.md#plan) reads the target image. It groups regions and values, fits pigment mixtures, selects drawing contours and orders paint passages. It produces layers, shapes, brush paths and technique choices for the painter. These are computed instructions, rather than an authored JSON plan. `plan.jpg` previews the planned paint.

A recipe is a preset of painter settings. The default recipe puts its flags before the user's flags; `expandRecipe({ argv: [] })` in [src/paint/recipe.mjs](../src/paint/recipe.mjs) returns them. A value plan's `"presets"` add [fitted settings](techniques.md#tuned-settings) after the recipe. A user flag can override a recipe or preset flag. An area plan uses no default recipe unless one is named.

## In the benchmark

In benchmark versions [V4 and V5](../bench/README.md#rounds), the model writes plan files and command-line arguments for painter presets and settings. It writes no code. The existing pipeline executes those choices. An argument such as `--drawing first` sets drawing order. V4 starts each try fresh. V5 can use its earlier paintings and notes to revise the next plan. [The benchmark run format](../bench/docs/run-format.md) records the benchmark version, settings and notes.

## Technique toolbox

Each tool has a use and a failure mode. None is mandatory. Paths are under `src/paint/` unless they start with `tools/` or `src/`.

| Tool | Plan access and code | When it fits | When it hurts |
|---|---|---|---|
| Pencil preparation | `drawing.stages.prep`; `methods/drawing-stages.mjs` | Hard placement, perspective, proportions, visible graphite | Dense pencil leaves a grey web under pale washes |
| Prep ink over pencil | `stages.prepInk.from: prep`, keep, add, deviate | Refine a placement drawing while some pencil stays | Inking every construction line makes a traced diagram |
| Sparse finish ink | `stages.finishInk`, restate, select | Restate a few lost junctions after the wash | A second full tracing doubles contours and makes loops |
| Waterproof ink | `drawing.ink.waterproof`; `src/media/pen.mjs` | Black pen and watercolour with set ink | It prevents the softening of soluble sepia studies |
| Source-ink copying | `drawing.source: source-ink`; `tools/seg/copy-lines.py` | Pen drawings and masters with real narrow ink | Wash texture or broad black paint read as line becomes blotches |
| Photo sketch | `drawing.source: photo-sketch`; `tools/seg/sketch-lines.py` | Architecture photos with sustained edges | Texture and foliage become tangled loops |
| Structure lines | `drawing.source: structure-lines`; `tools/seg/structure-lines.py` | Clear perspective, repeated arches, openings or columns | Over-regularizes irregular buildings and organic forms |
| Structure plus detail | `drawing.source: structure-combine`; `tools/seg/structure-combine.py` | A structural scaffold with facade details | A wrong scaffold stays wrong |
| Map smoothing | `drawing.source: line-map`, `mapSmoothing` | About 0.75 cells reduces noisy model-map loops | 1.5 cells loses character; never smooth observed widths |
| Contour and connected gestures | `prepInk.method` `contour` or `connected`; `methods/drawing-rank.mjs` | Contours for landmarks; long economical gestures | Long tracing looks cut out; connected walks wander |
| Scribble and lit-edge breaks | `method: scribble` or `finishInk.masses: scribble`; `methods/drawing-scribble.mjs` | Curly black fur or dark hair with open lit edges | Ink filling a dark surface; dense scribble loses form |
| Architecture closing pen | `finishInk.method: architecture` | Thin dark broken frames, arches, cornices and sills | Strong sepia overwhelms foliage and small figures |
| Staged growth and prep fade | `prep.frames`, `prep.fade`; `methods/pencil-stage.mjs` | Big shapes, then features, then graphite receding under paint | Too much fade removes useful structure |
| Flow-line hatching | `finishInk.hatch`; `src/crop/hatch.mjs` | Pen-heavy architectural shade and engraving | Mechanical fill in fur |
| Fur locks | `finishInk.fur`; `methods/finish-texture.mjs` | Oriented accents in a dark coat with bright gaps | It does not replace the paint mass under it |
| Fur light reserves | `washes.furReserves` | Sheen or glints kept open in a dark coat | Poor thresholds reserve speckles; use coarse bounds |
| Fine ink sheet | `drawing.resolution: 2`; `methods/ink-res.mjs` | Thin tapers on a small sheet | More memory and time |
| Colour-family washes | `washes.colour: family` | Saturated and muted families kept apart | Can weaken connected dark foliage; try `layered` |
| Connected wet sessions | `washes.sessions: connected`; `methods/wash-session.mjs` | Pigments mingle in one passage with one drying edge | Joining different glazes makes mud |
| Subject order | `order.subjects`, `strength`; `methods/subject-order.mjs` | Background first, then the focal subject | Coarse boxes make visible transitions |
| Hole rims | `washes.physics.holeRimMm`; `src/media/sheet.mjs` | Small dry pits inside a wet wash dry without false rims | Too broad a span removes real granulating edges |
| Marangoni flow | `washes.physics.marangoni` | Surface-tension movement inside wet passages | Strong values are unstable and disturb line edges |
| Slope flow | `washes.physics.slope` | A wash meant to run down the sheet | Drift damages aligned architecture and reserved lights |
| Ink diagnostics | `tools/ink-judge.mjs`, `src/eval/ink.mjs`, `tools/judge/line-study.py` | Precision, recall, loops and ink-wash separation after painting | Pixel metrics are not artistic judgments and never steer paint |
