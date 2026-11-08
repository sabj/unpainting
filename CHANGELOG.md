# Changelog

Releases use semver. Each release records its painter and simulator versions ([version guide](docs/versions.md)).

## 0.3.0 — 2026-11-07

**More time painting, less time waiting.**

0.3.0 reduces the work between brushstrokes: checking dry paper, preparing another run, moving data off the GPU and storing layers that contain no paint. It also combines GPU steps to reduce dispatch overhead.

During development, the three-painting M4 reference suite fell from **12.1 minutes to 4.7 minutes with warm caches: about 2.6× faster**. With run caching disabled, it took **6.3 minutes: 1.91× faster**.

![The reference suite takes 12.09 minutes on the frozen control, 6.33 minutes at Stage 17 with run caching off, and 4.68 minutes with warm caches.](https://github.com/sabj/unpainting/releases/download/v0.3.0/speed.png)

### The largest painting saves the most time

The value-plan workload drops from **7.7 minutes to 2.9 minutes** in the measured warm run. The smaller paintings also improve.

![Wall times for the three reference paintings, before and after optimization.](https://github.com/sabj/unpainting/releases/download/v0.3.0/workloads.png)

| Reference workload | Frozen control | Stage 17 warm | Speedup |
|---|---:|---:|---:|
| General painting · 540 px | 82.39 s | 37.99 s | 2.17× |
| Ink and wash · 1200 px planning grid | 179.90 s | 68.83 s | 2.61× |
| Value-plan painting · 1200 px | 463.40 s | 173.75 s | 2.67× |
| **Suite** | **725.69 s** | **280.56 s** | **2.59×** |

These are single-run measurements on an Apple M4 Mac mini, with fixed workloads, fast mode and seed 0. The charts compare frozen control `41e6868` with Stage 17 `5e91484`; they do not mix the fastest runs from different stages. The control includes changes after the published `v0.2.1` tag (`1cc2c08`), so this is a development comparison, not a clean released-version A/B. The control and Stage 17 cache-off runs both use `--runcache 0`; warm uses `--runcache 1`. It is not an NVIDIA speed measurement.

A fresh run of the final engine (`efbf8b7`) with `--runcache 0` took **57.07 s, 118.32 s and 217.62 s**, respectively: **393.01 s total**, or about **1.85×** the control’s throughput. That is a single cold-run observation, not a final warm-cache measurement. The graphs above retain the historical Stage 17 measurements.

### The pictures stay close

The final engine (`efbf8b7`) reproduces the earlier candidate's three PNGs byte for byte. Against the frozen control, **local RGB SSIM ranges from 98.75% to 99.76%**. SSIM is an image-similarity measurement, not a new vision-judge score or a percentage of artistic quality.

The panel shows the least-similar workload. The right column amplifies absolute RGB differences by a fixed **8×**; black means an exact match. The crop shows the region with the largest average change. Small differences are visible around edges and washes; they are not assumed to be random noise.

![Frozen control and final-engine paintings, an 8× absolute-difference view, and the largest-change crop.](https://github.com/sabj/unpainting/releases/download/v0.3.0/valueplan-1200-comparison.png)

| Workload | Local RGB SSIM · 7 × 7 | Mean absolute channel difference · /255 |
|---|---:|---:|
| General painting | 99.76% | 0.202 |
| Ink and wash | 99.32% | 0.455 |
| Value-plan painting | 98.75% | 0.948 |

[Value-plan comparison](https://github.com/sabj/unpainting/releases/download/v0.3.0/valueplan-1200-comparison.png) · [General comparison](https://github.com/sabj/unpainting/releases/download/v0.3.0/general-540-comparison.png) · [Ink-and-wash comparison](https://github.com/sabj/unpainting/releases/download/v0.3.0/inkres-1200-comparison.png) · [Measurements and hashes](https://github.com/sabj/unpainting/releases/download/v0.3.0/visual-evidence.json)

Metrics use the original decoded RGB pixels at matching dimensions, with no registration, color correction or exclusions. The crop is selected by maximum mean absolute difference on a fixed 96-pixel grid, including the image edges. All three final M4 runs record zero target-guard violations. The ink run has an “early detail” heuristic flag; its risk level is low. [Validation records](https://github.com/sabj/unpainting/releases/download/v0.3.0/validation.json) preserve those results.

### Compatibility and validation

Apple M4 / Metal and NVIDIA L40S / Vulkan each pass **1,446 tests**, with **0 failures and 2 reported skips**, plus **83 benchmark tests**. The skips are a declared blur comparison and a private-reference fixture absent from the isolated checkout; neither is a GPU test. The NVIDIA regression set passes **11/11**, with zero fused/unfused field difference. Device-health checks pass **8/8** on both platforms with `GPU_REQUIRED=1` and `--expose-gc`.

Four native paint fixtures complete on L40S. The 11 targeted GPU regressions also pass on RTX 4090. Forty L40S worker close/reopen cycles pass, half following injected device errors. The release fixes a raw-Dawn test that failed to retain its native GPU owner; it now uses the same opener as the painter and retains the error assertions. Claude reviewed that fix and the release claims.

[Validation record](https://github.com/sabj/unpainting/releases/download/v0.3.0/validation.json) · [Test logs](https://github.com/sabj/unpainting/releases/download/v0.3.0/validation-logs.zip) · [Timing data](https://github.com/sabj/unpainting/releases/download/v0.3.0/performance-evidence.json)

Paint Lab paints, dries and saves pigment state on Chrome’s Apple Metal WebGPU and CPU paths. All **210 mushroom tests** pass, and Amanita, Morel and Coral complete real Chromium renders on the M4. These browser painters share media code with the CLI but have different execution paths; the CLI timing gains do not establish a browser speedup.

Painter **V102**, simulator **103**, judges **J1**. The published model leaderboard retains its original versions and scores. Quality work for 0.3.1 is separate.

### Implementation details

- **Check only paper that can have changed.** Zero-water, dry-fixed and wet-reach certificates avoid redundant readbacks. Regional freshness tracking preserves unrelated paper gates across strokes. Flow expands the tracked wet area conservatively. Queued drying certifies exact zero only when an analytic tail guarantees it; fine-ink carry invalidates the dry-fixed state.
- **Do more work per GPU dispatch.** Fused solver passes and packed scratch buffers fit Dawn/Metal's ten-storage-binding limit. A persistent 8 MiB staging buffer replaces per-stroke allocations. Active tiles and brush-pigment specialization avoid work on empty regions and unused pigment lanes.
- **Keep less duplicated state.** Lower-layer compaction removes zero planes without discarding pigment. Thickness and optical-stack caches avoid rescanning unchanged layers. The fine-ink sheet uses one pigment and a separable box filter with reusable buffers.
- **Reuse preparation across runs.** Fingerprinted caches cover palette fitting, paper, calibration, drawing and value-plan preparation. Keys include inputs, relevant code and options. Cache hits retain target-look accounting; tested cold/warm pairs produce identical final pixels. Typed arrays use compressed binary storage.
- **Dry at passage boundaries.** Fast value-plan runs default to `--washsession 1`, keeping shapes in a pass wet together. This changes the drying schedule and can change pixels. `--washsession 0` starts each shape dry. Stage PNG writes are queued, and audit logs are buffered.
- **Keep the audit evidence.** Fast strokes retain before/after brush measurements in `value-commands.jsonl`. Certificate regressions cover residual pore water, queued drying and fine-ink carry. Fusion tests assert that the fused pipelines actually compile before comparing them with the unfused path.
- **Resume more painting states.** Passage checkpoints support fine ink and preparatory fade, validate provenance before loading arrays and preserve the fine sheet's wet state.
- **Score at native resolution when requested.** `--resolution native` uses physical-millimetre filter widths and a deterministic metric cache. Legacy target-size scoring remains the default.
- **Tighten recipe and harness behavior.** `--recipe none` preserves a plan's drawing choices; unknown recipes fail explicitly. Benchmark extra arguments use an allowlist, and dependency checks run before model sessions. Starved pen recordings stop at the executed path, with refill segments linked by gesture ID.

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
