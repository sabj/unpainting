# Changelog

Releases are plain semver, with a git tag per release. Each release names its painter version (the V number) and sim version ([docs/versions.md](docs/versions.md)).

## Unreleased — 0.3.0

Painter V101, sim 102, judges J1. `0.3.0` combines the pen-and-wash ink pipeline from `wip/0.2.3` with a full simulator, GPU synchronization, caching and memory optimization pass across `src/media`, `src/paint` and `tools/`.

On the three frozen reference workloads on an Apple M4 Mac mini (16 GiB, GPU/Dawn/Metal, `--mode fast`, seed 0), warm suite wall time drops from `725.69 s` to `244.85 s` (**`2.96x` faster**, or `66.3%` less time) while preserving `99.91%` to `99.9998%` SSIM against `0.2.1`, non-degraded deterministic scorer composites (`55.6`, `60.2`, `64.8`), and reducing peak RSS by up to `2.2 GiB`.

| Workload | Target & settings | `0.2.1` Control | `0.3.0` Cold | `0.3.0` Warm | Warm speedup | `0.2.1` RSS | `0.3.0` RSS | SSIM vs `0.2.1` |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `general-540` | Sargent *A Tramp*, `540 px`, `--recipe general` | `82.39 s` | `43.43 s` | `36.93 s` | **`2.23x`** | `2.12 GiB` | `2.02 GiB` | `99.997%` |
| `inkres-1200` | Yale (`h34-a`), `1200 px`, `--inkrecipe wash` (`--inkres 2`) | `179.90 s` | `116.61 s` | `67.44 s` | **`2.67x`** | `7.12 GiB` | `4.92 GiB` | `99.9998%` |
| `valueplan-1200` | Sargent *White Ships*, `1200 px`, V4/V5 `--valueplan` | `463.40 s` | `227.13 s` | `140.48 s` | **`3.30x`** | `9.06 GiB` | `7.99 GiB` | `99.91%` |
| **Three-workload suite** | Serial GPU total | **`725.69 s`** | **`387.17 s`** | **`244.85 s`** | **`2.96x`** | `9.06 GiB` max | `7.99 GiB` max | `99.97%` mean |

### Speed, GPU synchronization and memory

- **Zero-water, dry-fixed and wet-reach paper certificates (`src/media/paper-certificate.mjs`, `src/paint/methods/wetdry.mjs`):**
  - Full-sheet and footprint dry gates (`measurePaper`, `measurePaperDry`, pen gates) skip GPU readbacks and `waterP95` sorting when a valid zero-water or dry-fixed certificate holds, or when cells lie outside the active wet-reach mask (`wetMask` / `wetList`).
  - Queued GPU drys (`dryQueued`) certify zero-water completion without draining the async GPU queue, and `sheet._rawLayers` lets certificate and storage checks inspect dried layers without triggering a synchronous GPU flush.
  - GPU `step` and `dry` narrow their active flow and drying boxes to the exact wet-reach bounding box.
- **GPU link and regional tile freshness (`src/media/gpu/link.mjs`, `src/media/gpu/fresh.mjs`, `src/media/gpu/optical-gpu.mjs`):**
  - Non-blocking CPU-to-GPU uploads (`upSync`) replace blocking `call({ op: 'up' })` round-trips during CPU strokes and partial uploads.
  - Non-flow GPU strokes, splats and CPU strokes invalidate only their touched `64x64` tiles in `paperFresh` (`FreshMap.staleRect`) and preserve `paperVersion` across `'opts'` and `'act'` state updates, avoiding full-sheet `paperDown` readbacks between adjacent strokes.
  - `optical-gpu.mjs` caches the base-layer optical stack on the sheet so repeated renders and look checks only composite the active top layers.
- **Lossless lower-layer compaction and cached thickness (`src/media/layer-storage.mjs`, `src/media/sheet.mjs`):**
  - `sheet.thickness()` caches held pigment mass across unchanged layer versions, and `compactLowerLayers` losslessly compacts zero planes in older dried layers (`-84%` CPU layer-plane storage and `-2.0 GiB` peak RSS on `inkres-1200`).
- **Fine-ink (`--inkres`) and line-pipeline specialization (`src/paint/methods/ink-res.mjs`, `src/paint/methods/fine-material.mjs`, `src/paint/methods/ink-match.mjs`, `src/media/pen.mjs`):**
  - `makeInkRes` uses a 1-pigment `[INK]` fine sheet instead of duplicating the full palette on the `2160 px` fine sheet, memoizes `INKRES.compose` across unchanged frames, reuses calibration material and `pen.pin` per `(paper, patchy)`, and gathers 4-neighbor `renderCells` in `inkDarkMatch`.
  - `holdLineFile` and `traceLineModel` memoize line preparation, and `planPenInner` is skipped when `--drawingfile` replaces the opening drawing.
- **GPU step kernel fusion, brush-pigment specialization and adaptive dry chunks (`src/media/gpu/stepfull.wgsl`, `src/media/gpu/stepfull.mjs`, `src/media/gpu/fast-dry-chunk.mjs`):**
  - Fused `faces` and `pflux` into `faces_pflux` in the GPU step solver, deferred `finish_wet_scan` to checkpoint boundaries, and scaled sustained wet-frontier fast-dry chunks (`adaptiveFastDryChunk`), cutting GPU dispatches by up to `44%`.
  - Specialized `stroke_run`, `stroke_metered`, `feed_pigments` and `hair_cell` to active brush pigments (`brushPigmentCount`), parallelized `feed_pigments` across pigments (`4–18` barriers/step down to `1`), and skipped zero-load `D`/`G` read-modify-writes (`stroke_run` GPU time `-30.6%` on `inkres-1200`).
- **Wash sessions, pass-boundary drying, buffered JSONL logs and spatial hotloops (`tools/paint-plate.mjs`, `tools/stroke-composition.mjs`):**
  - `--dryboundaries 1` dries at value-plan pass boundaries and wet-contact overlaps (reducing `valueplan-1200` GPU dry solver iterations from `351,645` to `79,415` while maintaining `99.91%` SSIM vs `0.2.1`).
  - `stroke-composition.mjs` reuses `Int32Array` row-interval buffers in `footprint` instead of allocating/sorting per-row arrays on every stroke, and `paint-plate.mjs` memoizes CLI flag lookups (`optIdx`) and defers `FLOORMASK`/`SHAPE_LOAD` construction on warm cache hits.
  - Painter JSONL audit writers buffer up to `1 MiB` in memory (flushing on checks, pass boundaries and exits) and share stroke command IDs with `stroke-composition.mjs`.

### Step caching, passage checkpoints and native scoring

- **Fingerprinted run cache (`src/paint/run-cache.mjs`, `src/paint/run-cache-planes.mjs`, `src/paint/floor-paths-cache.mjs`):**
  - `--runcache 1` (and `--speedvaluecache 1` for value plans) caches deterministic setup stages (`palette`, `pigment-fit`, `separator`, `paper`, `fine-paper`, `calibration`, `pen-field`, `early-lines`, `value-plan`, `floor-paths` and `fine-drawing`) keyed by a persistent stat-manifest source hash, dependency closure hash, target bytes and options.
  - Typed-array cache planes use compact deflate compression (`run-cache-planes.mjs`) and `ObservedMask` skips untouched planes on partial GPU readbacks (`paper-readback.mjs`). Warm hits replay `TARGET_GUARD` look accounting and produce byte-identical `run-card.json` provenance and output PNGs.
- **Extended passage checkpoints (`tools/aware/state-io.mjs`):**
  - `--pausedir` and `--resumestate` now support `--inkres` (saving and restoring fine-sheet material, carry-down buffers and wet state) and `--prepfade` (`PREPF`), and validate `provenance.json` before loading arrays. Restored native `inkres-1200` runs finish byte-identical to uninterrupted runs.
- **Native-resolution scoring (`bench/scripts/score_painting.py`, `bench/scripts/classic.py`):**
  - `--resolution native` scores paintings at their rendered resolution (`1200 px`) with physical-millimetre filter widths (`--plate-mm`) and a content-addressed deterministic metric cache. Legacy target-size scoring remains the default.

### Harness, recipes and pen fixes

- `src/paint/recipe.mjs`: fixed `--recipe none` precedence so `config.json` `drawingFlags` are not overridden by template defaults, and made unknown `--recipe` names throw an explicit error.
- `bench/scripts/pipeline/plan-args.mjs` and `bench/scripts/pipeline/round45.mjs`: enforced an explicit `ALLOWED_EXTRA_ARGS` allowlist, updated `BASE` and `bench/v4v5/TASK.md` to v2/wash ink flags, and forwarded `--python` / `BENCH_SCORE_PYTHON` with SAM + scorer preflight checks before launching model sessions.
- `src/media/pen.mjs`: truncated recorded `mark.points` and `mark.d` when a pen walk breaks early on ink starvation, and attached a shared `gestureId` across refill splits.

### Ink on ink-heavy works

- `--inkrecipe wash` is ink for pen drawings and pen-and-wash sources ([docs/ink.md](docs/ink.md#pen-and-wash-ink)). The pen copies the source's own pen strokes, first and with no pencil. `tools/seg/copy-lines.py --kind stroke` finds each stroke with a black top-hat (a dark mark under 1 mm wide, which a wash mass or its edge is not) and traces its centre with its own width. A stroke is kept where the published lineart models' fused map (`tools/seg/sketch-map.py`, cached by the source's SHA-256) also sees a line, and where it has the ink's own colour (a coloured ink by hue, a black ink by being less coloured than the wash around it), which drops watercolour texture. Without torch, controlnet_aux or the weights the run logs a `!!!` line and traces the source's ink with the older tracer (`--linemodel strict` stops). `npm run doctor` warns about the models. Setup is in [tools/seg/README.md](tools/seg/README.md).
- The pen draws like a hand. Width follows the stroke's own, at 0.75 of it, so a thick stroke stays thick and a hairline stays fine. Each stroke lands light and lifts to a hairline, slows and swells in curves, swells when pulled down and to the right, and sets a short mark down in one motion. Strokes that continue one another through a junction or across a short straight gap are drawn as one. Long contours come first, detail after, lighter. A stroke's weight is its own darkness against the paper, so a black stroke over a dark wash stays black. A draughtsman's economy drops specks and near repeats and caps small marks at 9 mm per 4 mm square. Strokes are about 0.07 to 0.2 mm at contact, even along most of their length, and a stroke's widest point is about 1.6 times its narrowest.
- The pens draw on a sheet near 2160 px wide (`--inkres`, 2160 over the width, from 1 to 4) with no width floor, and the output is that wide. The fine ink carry syncs the GPU sheet, the fine sheet dries under the nib only, and `drawing-opening.png` is the fine ink.
- Ink or wash. Each candidate line is read across the source: a mass edge (a one-sided step between two tone masses) is left to the wash unless long and smooth. Leaves (green and busy), sky and water take no ink except long smooth strokes (branches). Region labels come from a simple classifier of colour and size; `--inklabeljudge codex` or `agy` has a vision model label them from an overlay, which uploads it and is opt-in. The decision is written to `ink-labels.json` next to the painting.
- Opt-in, off in the recipe: `--inkgeom` (straight runs and arcs), `--inksalience`, `--inkshadowmask 1`, `--inkdropfaint 1`, `--inkhatch 1` (cross-hatched shadows for pure ink) and `--linestroke 0` (the lineart map's own contours).
- Tools: `tools/judge/ink-legibility.mjs` (12 named crops judged blind, `--judge codex` or `agy`), `ink-prefer.mjs` (two versions side by side, the judge picks the better pen drawing), `ink-noise.mjs`, `ink-labels-view.mjs`, `ink-results-sheet.mjs`, `ink-features.mjs`, `ink-lines-report.mjs`. `bench/ink-heavy/` holds the eight-target ink set and `legibility.json`.
- Fix: the ink flags (`--linesupport`, `--linesmooth`, `--inkdarkcap`) now reach the line files that the linked drawing stages write.

Results on 12 crops of 4 sources at 540 px wide, seed 0, judged by codex three times (recognised, mean of 12): the rc.1 recipe's pen layer 1; lineart-map lines 11.3; the same with mass edges cut 11.7; source strokes with the hand 10; with the ink-colour test, paper-based weight, economy and even strokes (this release) 9.7. Pairwise, codex preferred this release's drawings to the first source-stroke version 10 to 2, that version to the cut map lines 11 to 1, and before that the cut map lines to the uncut ones 9 to 3, the source strokes to the map lines 11 to 1, and was split 6 to 6 between fine and full stroke widths. A whole Guardi at 540 px paints in 138 s with a peak of 9.2 GB. Limits: four images, one seed, one judge (agy's quota ran out), and the J1 A/B and full-size runs are not run for rc.2. The J1 means below were measured on the rc.1 recipe's older line source:

- Mean J1 at 720 px, fast mode, 2 seeds, 3 scorings each: the wash recipe 5.68, 0.2.1-rc.1 with `--inkrecipe v2` 5.28, 0.2.0 ink 5.12, and the default pencil 5.08.

## 0.2.1-rc.1

Painter V101-dev, sim 102, judges J1. Release candidate 1. Ink and colour changes are opt-in flags. Defaults match 0.2.0. On the published Opus 5.5 V5 plans, neither moved J1 beyond judge noise. Ink v2 scored +0.05 and colour v2 +0.06 against the same build.

### Ink

These are off by default. Ink still needs `--outlinemedium ink`.

- `--inkrecipe v2` turns on all of the following.
- `--linesupport 5` keeps only the line parts the target shows.
- `--linesmooth 1` smooths stepped traces.
- `--inkwidthfloor 1` sets a minimum line width.
- `--inkdarkcap 1` caps ink darkness at the target's own lines.
- `--inkdamp 0.3` feathers the pen.

### Colour

These are off by default.

- `--paintguard dE` checks a paint box forced with `--paints` or `washes.paints`. It acts when the box fits the target more than dE (CIEDE2000) worse than the painter's own pick. It then adds the own pick's paints, or takes the own pick and keeps the forced paints that still fit (`--paintguardmode add|merge|replace`). `run-card.json` records the decision.
- `--techcal 1` charges passages in value band 4 and darker for what their technique lays on the sheet. In 0.2.0 the graded shadow glazes lay about half of their booked pigment. The swatch calibration measures one wide brush on a small square, which the sheet does not match. On Hills and South France at 540 px, delivery in the darkest 5% of cells rises from 0.80 to 0.98 and from 0.83 to 0.90.
- `--deliveryreport 1` writes `delivery-by-band.json`: pigment delivered over booked, by how much paint each cell was booked.
- `npm run bench:run -- ... --no-base-palette` stops the harness forcing Trumbull's seven-paint box. A plan's own palette token or `--paints` still applies.

## 0.2.1 - 2026-10-22

Painter V101, sim 102, judges J1. Tag `v0.2.1`.

By default, 0.2.1 scores the same as 0.2.0 on the published Opus 5.5 V5 plans (J1 6.18 against 6.15, +0.5%) and 3.1% lower on the pen-and-wash set (5.40 against 5.58). Pen and wash is opt-in, and with it the set scores 6.3% above 0.2.0. See the [comparison](docs/release-performance-0.2.1.md).

| Target | 0.2.0 J1 | 0.2.1 J1 | Score change |
|---|---:|---:|---:|
| White Ships | 6.06 | 6.17 | +1.9% |
| Hills | 6.38 | 6.41 | +0.6% |
| Mittens | 6.66 | 6.68 | +0.3% |
| South France | 5.62 | 5.62 | 0.0% |
| Trumbull | 6.02 | 6.00 | -0.3% |
| All five | 6.15 | 6.18 | +0.5% |

### Drawing

- The drawing is pencil for every source. Ink is drawn only when asked for.
- The automatic stage choice adds ink stages only when ink is asked for. 0.2.0 could add ink on most pictures. This is why the pen-and-wash set scores lower by default: Guardi -8.5%, Yale gateway -5.3%, camel -5.1%, Rembrandt -4.5%, Fragonard +3.8%.

### Ink, opt-in

All of these are off by default. Ink still needs `--outlinemedium ink`, except where noted.

- `--inkrecipe wash` is the pen-and-wash recipe ([docs/ink.md](docs/ink.md#pen-and-wash-ink)). It draws the source's own pen lines whole, with no pencil, and follows the source's line width and darkness along each stroke. It matches the ink's darkness and hue to the source's lines and turns ink on by itself. On the pen-and-wash set it scores 5.94 against 5.40 for the default pencil (+9.9%) and 5.58 for 0.2.0 (+6.3%).
- `--inkrecipe auto` uses the wash recipe when the source shows at least 0.5% pen line (`--penfirst`), scaled to 1200 px wide, and no recipe otherwise. A run that sets `--drawing`, `--drawingfile`, `--drawinglast`, `--outlinemedium`, `--linesource`, `--drawingstages` or `--stages` keeps what it set. The log says what auto chose and why.
- `--inkrecipe v2` sets `--linesupport 5`, `--linesmooth 1`, `--inkwidthfloor 1`, `--inkdarkcap 1` and `--inkdamp 0.3`.
- New flags, each off unless a recipe sets it: `--linemeasure`, `--inkdarkmatch`, `--inkhue source`, `--inkbleed`, `--linegapmm`, `--lineminmm`, `--lineinkonly`, `--copylinesmin` and `--linecleanup 0`.
- The ink flags (`--linesupport`, `--linesmooth`, `--inkdarkcap`) reach the line files that the linked drawing stages write.
- `tools/judge/ink-lines-report.mjs` measures a painting's pen lines against its source's: placement, darkness at the source's lines, hue and crops.
- `bench/ink-heavy/` holds the eight-target ink set with sources, licences and the A/B commands.

### Colour, opt-in

These are off by default. None was positive beyond noise against 0.2.0.

- `--paintguard dE` checks a paint box forced with `--paints` or `washes.paints`. It acts when the box fits the target more than dE (CIEDE2000) worse than the painter's own pick, and then adds or swaps in the own pick's paints (`--paintguardmode add|merge|replace`). `run-card.json` records the decision. Mean J1 change over the five plan targets: 0.00. Trumbull: -2.8%.
- `--techcal 1` charges passages in value band 4 and darker for what their technique lays on the sheet. Mean J1 change over seven targets: +0.4%. Hills +3.3%, South France -3.8%.
- `--deliveryreport 1` writes `delivery-by-band.json`: pigment delivered over booked, by how much paint each cell was booked.
- `npm run bench:run -- ... --no-base-palette` stops the harness forcing Trumbull's seven-paint box. Trumbull scores 4.8% lower without it.

## 0.2.0 - 2026-10-20

Painter V100, sim 102, judges J1. Tag `v0.2.0`.

On the published Opus 5.5 V5 plans, 0.2.0 scores 7% higher than 0.1.1 (J1 6.36 against 5.93) and paints them in 46% less time. It is better on four of five targets, from +4% on White Ships to +18% on South France, and 4% lower on Trumbull. See the [comparison](docs/release-performance-0.2.0.md).

### Drawing

- Pencil by default, with no closing pen. Ink is off while it is reworked; ask for it with `--outlinemedium ink` and `--drawing both`. On a run with no prepared drawing, the automatic stage choice (`--drawingstages auto`) can still add ink stages; `--drawingstages off` turns it off. 0.2.1 fixes this. The bench harness no longer forces ink. Better ink is planned for 0.2.1.
- Opt-in universal linework stage (`--linework auto`) for every style, with one cleanup for specks, shadow outlines and repeated marks.
- A drawing made for another image must be registered first.

### Plans, washes and colour

- One plan sets the drawing, the washes and their order. Plans are resolution independent, and unread plan keys are reported.
- Every target is segmented with SAM before planning. Regions follow the picture's own edges.
- Clean-colour family washes, connected wet sessions and pale-plane washes are the default. `--recipe v096` turns them off.
- New pen and wash style (`--style penwash`) and opt-in subject ordering (`--subjectorder`).

### Simulation (sim 102)

- Brush water volume is consistent across resolution, and wet beds are prepared properly before wet-in-wet passages.
- Extra physics (hole rims, Marangoni flow, flocculation) runs on the GPU and stays off by default.

### Speed

- Exact GPU paths are on by default, and optics, palette fitting and clip masks share their work. The same plans paint 1.7x to 2.0x faster.

### Safety and checks

- A failed mid-painting check no longer discards the painting. A GPU device error stops the run, and a CPU fallback is recorded.
- The painter records its commit and refuses a dirty tree unless `--allowdirty 1` is given.
- `npm run doctor` checks the setup before a run.

### Removed

- Painter code fitted to single benchmark subjects (`--trumbullrules`, `--portraitrules`, per-subject presets) and dead Paint Lab files.

## 0.1.1 - 2026-10-15

Benchmark patch on painter V096, sim 100, judges J1. The painter is unchanged, so 0.1.0 and 0.1.1 scores compare directly. Tag `v0.1.1`.

0.1.1 is a quick fix to align scoring across models and add new ones. Many other improvements are planned; the release candidate for 0.2 is on the [`wip/0.2`](https://github.com/sabj/unpainting/tree/wip/0.2) branch. The benchmark is known to be partially incomplete: some tries are missing paintings, and the leaderboard lists each model's tries and paintings.

- Adds Gemini 4 Argon (high and medium) and Gemini 3.8 Flash through the Antigravity CLI (`agy`), and Muse Spark 1.3, Muse Wonder and Muse Wonder Full through Muse Code. Gemini 3.8 Flash ran V1 and V2, the Muse models V1 to V3, and Argon V1 to V5.
- V4 and V5 keep a finished painting when its plan chose settings the painter never read or had passages with no brush path; these are recorded as warnings in the run. A wet-on-wet stroke on uneven paper is logged (`--wetgate 0`) instead of stopping the painting. Tag `v0.1.0` keeps the 0.1.0 rules.
- The toolkit and the Together runner include Mittens, which they had left out.
- V3 compares every model on its three published targets, Hills, France and Ships, also when a try painted all five; `score.mjs --composite-only` recomputes a composite without judges.
- V4 and V5 cheat risk comes from the painter's own record, as for the published tries.
- Two 0.1.0 paintings that the 0.1.0 rules threw away for unread settings are repainted from their published plans and scored: Haiku 4.5 V4 try 2 South France and Codex Luna V5 try 2 Trumbull.
- V4 and V5 paintings are scored at the target's native size (Lanczos), as the published tries were. Before, `score.mjs` judged them at the painter's 1200 px, which lowered their scores.
- `JUDGE_ROUTE=openrouter` sends the J1 judges through OpenRouter to zero-data-retention providers, and each score records its route. V1-V3 are judged on Together and V4-V5 on OpenRouter, the routes of the published tries. `score.mjs --judges-only` moves a try to another route without rerunning progression. `fairness.test.mjs` checks that every painting in a round was judged the same way, unless `bench/scoring-exceptions.json` lists an approved difference.
- A model counts at the reasoning effort `models.json` sets for it: xhigh where offered, otherwise its own setting. Gemini models offer no xhigh.
- `--from-try` reruns one try, `--link-v4-try1` reuses V4 try 1 as V5 try 1 (off by default), and `npm run bench:add-target` adds a target; `bench/v2/crops.json` is the one list of targets.

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
