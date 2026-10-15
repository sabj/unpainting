# Changelog

Releases are plain semver, with a git tag per release. Each release names its painter version (the V number) and sim version ([docs/versions.md](docs/versions.md)).

## 0.2.0-rc.6 - unreleased

Review candidate: painter V099-dev, sim 102, judges J1. Integrates `integration/0.3` and the selective RC5 harvest. Historical comparisons retain the commit that produced each image.

- Keep the integration protections: authored styles and reserves, finished paintings retained with diagnostics, whole-footprint wet checks, physical brush volumes, and neutral transport.
- Retain source-line cleanup, source pen paths, Python environment resolution and painted-cell cluster initialization. Preserve collinear pen reversals and clean line sets even when few paths remain.
- Separate sunlit light-wash domains without erasing authored highlights or inventing minimum pigment demand; cover wide wash planes with mop lanes measured in millimeters.
- Keep pigment experiments opt-in. Flocculation overrides now cover blue, grey, violet, earth and yellow families; unset options preserve each pigment's properties, and explicit zero disables its flocculation. Hue grouping is a fallback heuristic, not chemical pigment identification.
- Preserve optional crosshatching and an optional paper-colour selection stage. The paper stage changes the substrate colour; it is not a painted wash or drying operation.
- Retain the preview with synchronized loupe and stage playback. `tools/canary/build.mjs` adds a candidate to the archived controls and derives commit and drawing captions from render records. Saved-stage progress is labeled as such.

## 0.2.0-rc.1 - unreleased

Local review candidate: painter V097-dev, sim 101, judges J1. No tag or publication.

- Port consolidated linework, linked pencil/opening/finish stages, structural planning and ink/wash consistency tools onto the squashed public history. Preserve long-line ink delivery and replay order.
- Isolate fitted settings in named presets and add explicit source-line routing. `--recipe v096` retains the V096 compatibility recipe; use the v0.1.0 tag for exact historical simulation.
- Add clean-colour family washes, median charges with carried demand, pale-plane washes and connected wet sessions. The release comparison found lost connected dark foliage on Hills and wash-balance shifts on Guardi with them. The combined painter then made them the default through the painting plan's `washes` section; `--recipe v096` turns them off.
- Add opt-in subject ordering (`--subjectorder`, plan `subjectOrder`); zero retains whole-sheet ordering.
- Support hole rims, Marangoni flow and slope on the GPU. Physics options remain off by default.
- Keep the final-dark pass and automatic source-line extraction opt-in after excessive accents and figure blotting in held-out Guardi output. Photo-map smoothing and linked pencil/finish ink remain deliberate planner choices.
- Preserve small closed contours across Python thinning backends.
- Add an opt-in universal linework stage (`--linework auto`, plan `drawing.linework`) that every style uses: a geometry-checked image-model sketch, the sketch planner or the target's own lines, one cleanup (specks, shadow outlines, repeated marks) and a per-image gate on drawing, medium and amount.
- Remove painter code fitted to single benchmark subjects: `--trumbullrules`, `--portraitrules`, `--drawsubject`, the per-subject presets and their subject-id application under `--recipe v096`, the subject-id style lookup (`tuned/subjects.json`), the hash-bound reviewed 3T drawing and the single-photograph architecture passage. A plan's style now comes only from its `styleSelection`.

## 0.1.0 - 2026-10-10

Release 0.1.0: painter V096, sim 100. All published benchmark rounds V1-V5 use it. Tag `v0.1.0`. Sim 100 is an estimate of past simulation revisions.

- Every painting records `release`, `painterVersion`, `simVersion` and `commit` in `frames.json` and `backend.json`, and prints them at the start of a run.
- Every benchmark run.json records the same fields. results.json groups each round's tries by painter and sim version, labelled with the release, and the leaderboard and gallery show all three. To benchmark a newer painter or sim, rerun V4 or V5 with it.
- `bench/scripts/run.mjs` imports the version stamp it writes; before, a live run stopped on an undefined `PAINTER_VERSION`.
- `--pausedir` stops the painter at passage boundaries, and `--resumestate` lets a fresh process take over a painting saved at one ([tools/aware/](tools/aware/pause.mjs)). A painting saved and taken over ends identical to one painted without a break.
- `npm run bench:run` runs V3, V4 and V5 on your own machine, with dry runs of each in `npm run bench:test` ([bench/README.md](bench/README.md#reproduce)).
- The painter runs one default recipe, a preset of painter settings, unless `--recipe none` is given. It sets planning from light to dark with shaped brush marks, four intermediate layers, parallel sky sweeps and raw sienna in the shadow glaze. It also sets stone blocks on buildings, two touch-up passes, and a drawing first and last on cold-press paper. A plan based on Trumbull groups regions by lightness and picks a fixed palette of seven paints. Other subjects use `--palettewide 1`.
- `--recipe v096` selects the default recipe.
- Paint modules are sorted into `src/paint/methods` (generic methods), `src/paint/techniques` (techniques for a kind of problem) and `src/paint/tuned` (settings fitted to benchmark images). Image-specific constants live in `src/paint/tuned`, and the default recipe lists its method, technique and tuned flags apart. [docs/techniques.md](docs/techniques.md) lists each part.
- Added `--valueplan`, the drawing material profiles, `--paperrgb`, `--shaperefit`, `--touchpoints` and the raw sienna paint. `examples/plans/trumbull-values.json` is Trumbull's value plan.
- The default recipe leaves the drawing medium to the plan. A value plan's `drawing` section chooses whether to draw, in what medium and ink, how much, which lines, how heavily and how many closing pen strokes ([docs/plan-format.md](docs/plan-format.md#value-plans-the-drawing-section)). Without one, the painter picks graphite or ink from the target, with its default stroke-count limits. Trumbull's plan specifies heavy sepia ink. Command-line flags still override the plan.
- Only typed options count toward the unused-option exit, so unused recipe settings do not fail a run.

- Rewrote How it paints in painting order: paper, ink, paint, then the pipeline. The ink drawing goes down and dries before any wash.
- Docs state the default sheet as a postcard, 6 x 4 in, and name the South France subject in full.
- Folded the status, benchmark-pointer and cloud pages into shorter pages, and removed stale diagrams and unused images.
- Removed personal references outside the license and credit files.
- Removed 26 source files nothing imports: the first painter in `src/*.js`, the old wash, pen and hatch planners in `src/crop`, the browser keyframe players and `sheet-v1.mjs`. They remain in git history.

## 0.1.0 - 2026-10-07

- Watercolor, paper, brush, dip-pen and pencil simulation, with CPU and WebGPU backends.
- Command-line image painter, JSON stroke plans and browser Paint Lab.
- Target-read guard, stage records and painting measurements.
- Guarded Trumbull and Luce examples, material studies and model benchmark galleries.
- Three benchmark rounds, run records, scoring tools and reproducible result tables.
