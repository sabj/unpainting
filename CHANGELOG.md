# Changelog

Releases are plain semver, with a git tag per release. Each release names its painter version (the V number) and sim version ([docs/versions.md](docs/versions.md)).

## 0.2.1 - unreleased

Painter V101, sim 102, judges J1. Tag `v0.2.1`.

By default, 0.2.1 scores 6% higher than 0.2.0 on pen-and-wash works (J1 5.94 against 5.58 over eight targets) and the same within judge noise on the published Opus 5.5 V5 plans (6.37 against 6.32 with ink, 6.18 against 6.15 with pencil). See the [comparison](docs/release-performance-0.2.1.md).

| Target | 0.2.0 J1 | 0.2.1 J1 | Score change |
|---|---:|---:|---:|
| Yale gateway (h36-a) | 5.91 | 6.71 | +13.6% |
| Yale (h34-a) | 5.99 | 6.64 | +10.9% |
| Tiepolo, Punchinello on a camel | 5.67 | 6.18 | +9.0% |
| Tiepolo, Bacchus and Ariadne | 5.19 | 5.56 | +7.2% |
| Tiepolo, Burial of Punchinello | 5.35 | 5.71 | +6.6% |
| Guardi, A Colonnade | 6.01 | 6.27 | +4.4% |
| Fragonard, Rinaldo (brush only) | 4.76 | 4.92 | +3.4% |
| Rembrandt, Woman Reading | 5.79 | 5.53 | -4.5% |
| All eight | 5.58 | 5.94 | +6.3% |

### Ink

- `--inkrecipe auto` is the default. It reads how much of the source is pen line, scaled to 1200 px wide. At 0.5% or more (`--penfirst`) it uses the pen-and-wash recipe below. Otherwise it uses no recipe, and the drawing is pencil only. A run that sets `--drawing`, `--drawingfile`, `--drawinglast`, `--outlinemedium`, `--linesource`, `--drawingstages` or `--stages` keeps what it set, so a plan's drawing is never replaced. The log says what auto chose and why. `--inkrecipe none` turns it off.
- `--inkrecipe wash` is the pen-and-wash recipe ([docs/ink.md](docs/ink.md#pen-and-wash-ink)). It draws the source's own pen lines whole, with no pencil, and follows the source's line width and darkness along each stroke. It matches the ink's darkness and hue to the source's lines and turns ink on by itself. Against 0.2.1's own pencil drawing it scores +9.9% over the eight-target set.
- The automatic stage choice adds ink stages only when ink is asked for. 0.2.0 could add ink on most pictures. The default drawing is pencil only.
- `--inkrecipe v2` is an opt-in set of ink flags: `--linesupport 5`, `--linesmooth 1`, `--inkwidthfloor 1`, `--inkdarkcap 1` and `--inkdamp 0.3`. It scored below the pen-and-wash recipe on every pen target. It still needs `--outlinemedium ink`.
- New flags, each off unless a recipe sets it: `--linemeasure`, `--inkdarkmatch`, `--inkhue source`, `--inkbleed`, `--linegapmm`, `--lineminmm`, `--lineinkonly`, `--copylinesmin` and `--linecleanup 0`.
- The ink flags (`--linesupport`, `--linesmooth`, `--inkdarkcap`) reach the line files that the linked drawing stages write.
- `tools/judge/ink-lines-report.mjs` measures a painting's pen lines against its source's: placement, darkness at the source's lines, hue and crops.
- `bench/ink-heavy/` holds the eight-target ink set with sources, licences and the A/B commands.

### Colour

These are off by default. None was positive beyond noise against 0.2.0, so none is on.

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
