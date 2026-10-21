# Changelog

Releases are plain semver, with a git tag per release. Each release names its painter version (the V number) and sim version ([docs/versions.md](docs/versions.md)).

## 0.2.0 - 2026-10-20

Painter V100, sim 102, judges J1. Tag `v0.2.0`.

### Drawing: pencil by default

- The drawing is pencil (graphite) by default and there is no closing pen. Ink is off unless asked for with `--outlinemedium ink` (and `--drawing both` for the closing pen). The 0.2.0 ink draws too thin, too dark and too even, and is being reworked. The bench harness no longer forces ink on every plan.
- The benchmark scores below were measured on the V099 build with ink. The pencil default was checked by eye on the same five published plans; its J1 scores are not yet measured. The painter and sim versions both change, so 0.2.0 paintings and scores do not share a mean with 0.1.x results ([docs/versions.md](docs/versions.md)). Benchmark rounds V1 to V5 keep their published 0.1.x scores.

### Painting plans and styles

- One painting plan now sets the drawing, the washes and their order. A plan's style comes only from its `styleSelection`, never from a subject id.
- New pen and wash style (`--style penwash`): line weight follows structure and light, passages flood wet in wet, and one connected shadow wash keeps the lights inside it. About 60% of the picture stays light.
- Opt-in subject ordering (`--subjectorder`, plan `subjectOrder`). Zero keeps whole-sheet ordering.
- Every target is segmented with SAM before planning. SAM regions become general regions, and `--subjectwash 1` cuts washes by subject as well as by colour and value. Region boundaries settle onto the picture's own edges.
- Plans are resolution independent. The plan's sheet settings are read and `widthMm` is checked against `--sheetmm`. Plan keys the painter never reads are reported.
- Per-image drawing stages, a lit-edge erase during preparation, and lights-first stages for pen and wash.
- `--recipe v096` keeps the V096 compatibility recipe. Use the `v0.1.0` tag for the exact historical simulation.

### Linework and ink

- An opt-in universal linework stage (`--linework auto`, plan `drawing.linework`) that every style uses. It takes an image-model sketch, the sketch planner or the target's own lines. One cleanup removes specks, shadow outlines and repeated marks, and a per-image gate checks drawing, medium and amount.
- A pen source is drawn from its own lines first and keeps its own widths and weights. Broken contours are joined before pruning, but only pieces of the same drawing part. Collinear reversals and small closed contours survive cleanup.
- Late closing-pen lines can be chosen from a dense traced drawing, and a structure filter keeps its structural lines by rule.
- Drawing dynamics are preserved: pen speed, pauses, pressure calibrated to the nib, and one dip across split hand continuations. Drawing paper is estimated inside scanned sheet borders.
- A drawing made for another image must be registered, and unregistered drawings are refused. A first pen that selects no lines fails the run.
- Automatic source-line extraction and the final-dark pass stay opt-in planner choices.

### Washes and colour

- Clean-colour family washes, median charges with carried demand, pale-plane washes and connected wet sessions. The default recipe uses these general washes through the plan's `washes` section. `--recipe v096` turns them off.
- Layered washes split at Lab chroma 20 and keep colour families apart in shadow glazes. Key target hues survive palette fitting.
- New plan fields: `washes.paints` names the box palette, `washes.charge` sets the charge quantile, `washes.darkGain` sets the shadow glaze gain, and `washes.deepAccent` restates darks inside named families.
- Sunlit light washes are separated without erasing authored highlights. Wide wash planes are covered with mop lanes measured in millimetres.
- Dry brush is used only where a passage's bare paper is strongly broken.
- `--washinkfile` names target ink to remove from wash demand. `--notargetlooks 1` replays frozen passage charges with no looks at the target. `--locallights` now reaches the frisket on value-plan paintings.

### Simulation (sim 102)

- Brush water volume stays physically consistent across resolution.
- Wet beds are prepared properly: dry cells are prewet first, a smooth thirsty brush picks up, and clean preparation strokes leave no lift-off bead. Wet-in-wet passage moves are normalized, and wet passage contact holds across overlapping lanes.
- Hole rims, Marangoni flow and slope run on the GPU. These physics options stay off by default.
- Pigment experiments stay opt-in. Flocculation overrides cover blue, grey, violet, earth and yellow families. Unset options keep each pigment's properties, and an explicit zero turns flocculation off.
- Optional crosshatching, and an optional paper-colour stage that selects the substrate colour without depositing paint.

### Checks and run safety

- A failed mid-painting check no longer throws the painting away. One module decides whether a check continues or stops, and the run card records each continued check. Wet-on-wet strokes on wet paper are laid instead of stopping the painting, and `dry()` can finish past its step limit.
- A GPU device error stops the run instead of painting from a broken device. A CPU fallback is loud and recorded, and cross-backend comparisons are refused.
- The painter records its code state and refuses a dirty tree unless `--allowdirty 1` is given.
- Frame capture no longer changes the painting.
- The stroke gate measures every run, including broad washes inside detailed plans, and flags back-and-forth filling of broad washes. An unverified stroke gate is never reported as passing. Tiny-dab plans and runs get a warning.
- `npm run doctor` runs a preflight check. A run-card recorder documents each stage.

### Performance

- Same plans, both releases: the published Opus 5.5 V5 winning plans (try 1, all five targets), replayed at their published width, sheet and seed on the same GPU type. Mean J1 is 6.36 on 0.2.0 against 5.93 on 0.1.1. 0.2.0 scores higher on Mittens (+0.72), South France (+0.99) and Hills (+0.50), level on Ships (+0.22, within judge noise) and lower on Trumbull (-0.27). It renders the same plans 1.7x to 2.0x faster. Fixed-plan suites over ten subjects agree: 0.2.0 is higher on average by about 0.25 J1. See [docs/release-performance-0.2.0.md](docs/release-performance-0.2.0.md).
- One full-resolution South France replay took 328.57 s on 0.2.0 versus 824.10 s on 0.1.1 on the same M4 Mac mini (2.51x faster). Hills is the exception in the fixed-plan speed pairs: 0.2.0 was 1.18x slower there and peaked at 27.8 GB against 15.8 GB.
- Exact GPU paths and speed switches are on by default without changing the Full solver physics. Optics, palette fitting and clip masks share or cache their work, and the wet frontier scan is fused with cell finalization on capable GPUs.
- Passage checkpoints for still renders, compact timing artifacts, and on-demand profiling of the GPU, the main thread and plan setup.
- Mark tapes and command logs are streamed instead of being held as one large JSON string.
- An adaptive pore drying timestep was tried and rejected after image review.

### Benchmark and judging

- Judge version J2 for internal gates. It uses the J1 panel, rubric and images, but every judge needs all five calls valid. Explicit J2 sampling profiles are available. No published score is J2.
- A bounded lite suite and comparison records that keep provider provenance.
- V4 and V5 keep finished paintings that ignored plan settings, and drop plan tokens whose painter flags were removed.
- An incomplete planning run now fails the CLI.

### Removed

- Painter code fitted to single benchmark subjects: `--trumbullrules`, `--portraitrules`, `--drawsubject`, the per-subject presets and their automatic use, the subject-id style lookup (`tuned/subjects.json`), the hash-bound reviewed portrait drawing, the single-photograph architecture passage, and the Trumbull-only stroke budget stop.
- Dead Paint Lab files and unused exports. `knip` now checks for them.

### Tools and tests

- `npm test` runs the Python line-tool tests. GPU parity tests skip visibly when there is no GPU.
- The preview page has a synchronized loupe and stage playback. `tools/canary/build.mjs` reads commit and stage captions from each render's own record.
- `--canarystop N` stops a candidate painting after pass N.
- The painter finds the line-tools Python by itself.

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
