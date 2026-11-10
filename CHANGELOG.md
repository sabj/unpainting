# Changelog

Releases use semver. Each release records its painter and simulator versions ([version guide](docs/versions.md)).

## 0.3.2 — 2026-11-09

Painter **V105**, simulator **104**, judges **J1**. The changes run from the 0.3.0 release commit `70ceb7c3`.

0.3.1 was not released. Its candidate was commit `32b1bfa4` (painter V104, simulator 104), and everything it changed is part of 0.3.2 and is listed here. The sections from Simulator to Experimental describe changes up to `32b1bfa4`. The section after them describes the changes made since.

**0.3.2 repairs defects. It shows no gain in J1 score or speed.** The aim was a J1 score 10% above the five published benchmark winners. That was not shown.

### Measured on the 0.3.2 release commit

- `npm test`: 1,723 pass, 0 fail, 2 skipped. `npm run bench:test`: 144 pass, 0 fail. `npx knip` passes.
- No painting was rendered from the 0.3.2 release commit. The paired renders below come from its development commits `32b1bfa4` and `318b5a86`.
- Fresh model sessions at `318b5a86`, three J1 scorings each in one batch with the 300 px previews of the published winners: V5 Mittens scored 6.18 to 6.23 against the winner's 6.45. All three V5 Trumbull sessions failed (see the known defects). At `32b1bfa4`, V4 on Mittens and Trumbull scored a mean of 6.29 and 6.35 for two models against 6.14 for the winners. The five winner previews scored a mean of 6.09 in that batch, so the 10% line is 6.70.

### Measured at `32b1bfa4`

- `npm test`: 1,643 pass, 0 fail, 2 skipped. `npm run bench:test`: 107 pass, 0 fail.
- A matrix of 13 cases was painted at `f3ad8f96` and at `32b1bfa4`: nine stored V4 and V5 plans and four direct paintings. `f3ad8f96` is a 0.3.1 development commit, so the pairs show only the changes made after it. No matrix compares 0.3.0 with the candidate.
- 12 of the 13 cases complete at each commit. The stored Sargent plan fails at both, in wet-bed preparation, with no cells under the brush.
- Every completed render records the GPU with no fallback, SAM segments, the subject's full width, five different stage images, no target looks during painting and no guard violations. The run cards from `f3ad8f96` do not carry the fallback field. Its `backend.json` does.
- Three direct paintings (h36a, Rembrandt, Tramp) are byte-identical at the two commits.
- 11 of 12 pairs stay inside the two anti-copying limits: fine-detail correlation with the target (hfCorr) up by at most 0.02, and strokes up by at most 10%. One Mittens plan exceeds the first limit, at +0.032.
- J1 on four stored winner plans, `f3ad8f96` to `32b1bfa4`: mean change −0.10. One unchanged image scored 0.34 apart in two batches, so this shows no change.
- The published winners exist only as 300 px previews, so no full-size comparison with them was made.
- No timing was taken at `32b1bfa4` or later. No timing pair between 0.3.0 and this candidate shares a plan, host and settings.

### Simulator

- **Edge drying (sim 104).** The extra evaporation at a wet edge is now scaled by the share of dry paper around the cell and by the water depth. The disc is 2 to 8 cells, aimed at 2 mm. The effect fades as the film thins below 0.06 (`--physics edgeFlowDepth=x`). It never raises edge drying. It runs on the CPU and GPU sheets and in Paint Lab. A synthetic probe at 0.258 mm per cell gave slightly softer edges: pigment outside a 1 mm stroke rose from 8.6% to 10.1%, and edge contrast on a disc fell from 0.997 to 0.970. No painting isolates the change. (`56357b14`, `b95fc20e`)

### Washes and lights

- **Plan reserves.** A plan's reserve box now keeps the target's own light inside the box, not the whole box. Full-size review against `f3ad8f96` found the white rectangles gone on two Mittens plans and one Trumbull plan. A box with no paper light reserves nothing and the log says so. On one Mittens plan both catchlights in the man's eyes are lost this way. (`c3cd589f`)
- **White floor.** The default `--whitefloor 0.5` hold now reaches the value plan. On Mittens the planned bare paper grew by 29,197 cells, 2.4% of the sheet. On Trumbull, Hills, South France and Sargent the hold is under 1% of the sheet. (`6c6faa6c`)
- **Lane charge.** With `--strokeplan 1`, a passage keeps its planned mean charge when lanes reach the 0.45 floor or the 1.8 cap. In a probe of 18 synthetic passages, 0.3.0 lost up to 27% of the charge. The lighter lanes carry the difference, so contrast inside the passage falls. (`1110afc5`)
- **Wide shaped planes.** With `--shapedmarks 1` and no stroke plan, a plane wider than the 38 mm brush is laid in lanes that follow its smoothed outline and overlap by 3.5%. 0.3.0 overlapped them by 18%. A unit test holds the densest seam under 1.5 times the body of the wash (measured 1.44). Pale slits between lanes are still visible on Hills and South France plates. (`20676e99`, `6c6faa6c`, `ce79818f`, `7a039c32`, `df63bfe6`)

### Drawing and ink

- **Closing lines in V4 and V5 plans.** A plan with a closing line file now runs `--drawing both`. In 0.3.0 it ran `--drawing first` and the closing file was not drawn. (`86ac3901`)
- **Closing files are drawn whole.** A prepared closing file is no longer cut by the generic line filter. Before this fix, three development runs logged no closing gestures. Full-size review at `32b1bfa4` found closing contours on Mittens, Trumbull and South France. (`c3cd589f`)
- **One pen reading.** Every automatic ink choice reads the pen-line share at one width. The same picture had read 0.2% to 0.9% at different widths. The ink preparation gate uses the `--penfirst` threshold, and `--penprepmin` moves that gate alone. (`989f09d9`)
- **Line darkness in the v2 recipe.** `--inkrecipe v2` now sets `--inkdarkmatch 1` in place of `--inkdarkcap 1`. It can raise the ink load as well as lower it. With the cap, measured lines were 30% to 81% as dark as the source. (`989f09d9`)
- **Line smoothing keeps swells.** With `--linesmooth`, a point stays when dropping it would change the line's width by more than 0.15 px or its darkness by more than 0.1. On 2,851 stored plan lines the 90th-percentile darkness error fell from 0.130 to 0.085 and the width error from 0.427 to 0.207 px. The smoothed files keep 8.6% more points. (`b6db40a3`, `df18cd2b`)

### Playback

- A frame is kept when each value band has dried and when each touch-up round ends. Two test paintings were byte-identical before and after this change. (`f3ad8f96`)
- An experimental mixed wash is filmed at equal shares of its sweeps, so the 10% and 25% stages differ. (`32b1bfa4`)

### Checks

- **Unusable settings.** The painter prints `IGNORED OPTION` for a typed setting whose switch is off, a setting nothing reads, a number given a word, and a 0/1 switch given a word. The benchmark base recipe no longer sets such settings. Under `--calibratedplan 1`, `--darkgain`, `--coolgain` and `--midgain` are ignored with no message. (`c3cd589f`)
- **Subject scan.** A test fails when painting or harness code gains an unreviewed subject name, target hash or image-size branch. (`c3cd589f`)
- **Target guard.** During painting, a sealed target map now records a read made through an array method such as `map`, `slice` or `reduce`, not only a read by index. `keys`, `set` and `fill` are not recorded. (`7a039c32`)
- **Benchmark flags.** `npm run bench:run` exits with code 2 on an unknown flag or a flag with no value. 0.3.0 ignored them. (`6c6faa6c`) It also accepts `--judge` and `--notargetlooks 1`. (`4d615435`)
- **Doctor first.** `bench:run`, `bench:rerender` and `bench:suite` run the strict doctor before any real run. (`20676e99`)
- **Stored-plan repaints.** `npm run bench:rerender` repaints stored V4 and V5 plans on the current painter with no model session. It reads gzipped line files. A test finds all 60 stored V4 plans. (`468e3bd3`)
- **Resume.** A repaint is skipped only when code, arguments, target bytes and plan folder contents match and the output still passes its evidence checks. An input that changes during a job fails that job. The check does not tie existing output files to the record of what made them. (`c3cd589f`, `4d9ca697`, `af73685d`)
- **Comparison gate.** A benchmark render fails when its run card shows a backend other than the GPU, a width under the subject's width, segments not from SAM, a missing stage image or two identical stages in a row. A card with no fallback field passes. (`468e3bd3`, `8ba139a4`)
- **Run card sizes.** Each run card records source size, paint size and enlargement. The stored-plan targets are about 300 px wide and are painted at four times that size. (`468e3bd3`)
- **Scoring preparation.** Scoring a repaint refuses jobs from different commits and refuses missing or malformed guard evidence. (`c3cd589f`, `4d9ca697`)
- **Paint Lab.** Tests check that the Lab's media files are generated from the painter's, and that the Lab's GPU and CPU sheets dry a wet rim to the same water. (`c3cd589f`)

### Experimental, off by default

`--washsystem 1` joins mixed charges on dry paper, middle layers cut by brush size, graded lanes, selective soft edges, a paper rule and plan value estimates. `--calibratedplan 1`, `--paperrule 1`, `--mixedwash`, `--mixedshadows`, `--scalelayers`, `--gradedlanes` and `--softchoice` set the parts one at a time. (`a573ec2e` to `82c74b0e`)

The combination is worse than the default on this evidence:

- 8 of 12 pairs exceed the hfCorr limit. It uses 11% to 52% of the default's strokes.
- Two full-size reviews found flatter masses, harder edges, lost paper lights and regular stripes. Neither found a plate that was better overall.
- On the five winner plans it scored a mean J1 of 5.78. The 300 px previews of the published winners scored 6.04 in the same campaign.
- `--paperrule 1` changes the light reference only with `--paperrel 1`, `--paperlights 1` or `--washsystem 1`, and the sheet colour only with `--paperrgb auto`.
- The calibration reads the sheet alone only when `--notargetlooks 1` is also given.

Added after `32b1bfa4`, also off by default:

- **Plan values under `--calibratedplan 1`.** Values are planned by each cell's light through the sheet's optics, by value steps and by the mass tone of each wash (`--celllight`, `--nestedbands`, `--masstone`). On plan checks without a render, the planned dark share came close to the target's on Trumbull (0.123 against 0.135) and Hills (0.276 against 0.301). Rendered, it exceeds both anti-copying limits: strokes +64% on Mittens and +15% on Trumbull, hfCorr +0.09 and +0.13, with new white flecks on the Trumbull stone. (`811f7b3d`, `c8940164`)
- **Glaze charge under `--instrumentcal 1`.** A dry-paper passage whose brush water or pass count differs from its stock technique is charged from a scrap swatch laid its own way. The shadow glaze released 0.36 to 0.39 of its booked pigment before; a fixture rose from 0.382 to 0.926. With the switch on and the base recipe's dark and cool gains kept, paintings come out too dark (Mittens dark share 0.110 against the target's 0.055, Trumbull 0.262 against 0.191). (`eeeec3a6`, `20619a48`)
- **Palette mix solver.** `src/paint/methods/palette-mix.mjs` solves a mix from the box for a target colour on the pigment model. The painter does not call it. (`e32ab415`)
- **Physical pigment properties under `--boxphys 1`.** Each box paint takes its published granulation, staining, flocculation, scattering and density from one table that Paint Lab shares (`demos/lab/media/pigment-physical.js`). Picking is unchanged. An explicit `--gamma*` or `--floc*` flag still wins. It is off by default and no painting has been measured with it.

### After `32b1bfa4`

Each painting change below was painted from the same stored plans and commands before and after, at full size, unless it says otherwise.

- **Lane joins in wide washes.** A plane wider than the brush is laid in lanes. The brush lays solid paint only part of the way to its edge, so the old 3.5% overlap left a bare strip at each join, and every pigment coat reused the same lanes. That made pale slashes (Mittens hair, Trumbull facade, Rembrandt dress). Lanes are now spaced so neighbours meet where the paint fades to half, midway through the brush's ragged edge (`edgeHalfWidth` in `src/media/brush.mjs`). The slashes on Mittens, the white verticals on Tramp and most of the bluish lines on Trumbull are gone; one Trumbull seam and one Rembrandt streak remain. An earlier version that met in solid paint printed dark stripes on Tramp and was replaced. (`e40893ac`, `ee0b5a85`)
- **Specks of held white.** Cells held white because the plan gives them under half a glaze now obey the planner's size floor, like any other light. They were masked at any size and left white flecks on the Trumbull stone. Explicit holds such as fur reserves are kept at any size. On the dog-ink portrait the thinnest fur highlights come out a little greyer. (`e40893ac`)
- **Planned lines in masses.** A line from the plan's drawing files is drawn only where at least half of it lies within one source pixel of a planned passage boundary (`--lineedges`, default 1). On Mittens the lines across the cat's fur, down the face edge and in the nose are gone; the crease above the man's right eye and the cat's tear line are lost too. A source's own pen lines are unchanged. (`d4bd4f50`)
- **Catchlights.** A reserve box with no paper light keeps its lightest connected cells by the plan's target value, up to the smallest paint brush's footprint (21 cells at 1200 px). The man's eyes on Mittens get catchlights back. (`24511b26`)
- **Named paint boxes.** A plan's `--paints` box now gains up to two pans when a hue cluster holding at least 2% of the picture is out of its reach (hue off by more than 12 degrees, or chroma under 0.8 of the cluster's). The log gives the reason. `--paintsextend 0` keeps the box as named. This changes the palette of 53 of the 128 stored plans that name a box. On Mittens it adds a pan and 18% more strokes, which is over the 10% limit used for the other changes; J1 on the stored Mittens plan rose from 6.01 to 6.80 and on a fresh plan from 6.25 to 6.53, three scorings each. The Trumbull and Rembrandt palettes are unchanged. It was not part of the six-plate measurement below. (`0cf0dbfe`)
- **V5 with J1.** A V5 run with `--judge J1` under a benchmark profile failed to score try 1 for try 2's feedback. It now scores with J1. (`6124d06a`)
- **Private targets.** The leaderboard names distributed targets only. (`fa0a8632`)
- **Full-size judge.** `bench/scorer/fullsize.py` shows the J1 judges 1:1 tiles of a painting, 64 mm of paper each, with no target. Scans of real paintings score 7.5 to 7.9 and simulator plates 3.0 to 3.9. No pair of plates before and after a fix moved by more than the spread between passes (0.53), so it is not shown to rank plates. (`f97e7d6b`)
- **Plate gate.** `bench/scripts/plate-gate.mjs` checks one plate against its target: paper and dark share, edge energy, delivery, the anti-copying limits and lights before darks. (`4f3cc12b`)
- **Release comparison page.** `bench/scripts/compare-release-*.mjs` and `live.sh` build a page that sets one release's paintings beside another's. (`eea8163a`)

Measured at `318b5a86`, before the named-box change, on six plates (stored Mittens Opus/1 and Trumbull Argon/1, and held-out Rembrandt, Tramp, dog-paint and dog-ink), against `32b1bfa4`:

- Strokes rose 0.6% to 3.4%. hfCorr moved −0.011 to +0.013. No guard violations and no target looks.
- J1, three repeats each in one batch: the mean of the six subject means went from 5.55 to 5.60. Mittens rose 0.63 and dog-ink fell 0.36; the other four moved by 0.15 or less. One unchanged image can score 0.3 apart between batches.

Tried and not taken: a soft-edge clip opening (no visible change), clean-water edge rings (pale tidelines), three mixed-charge washes (hard islands and outlined patches on Trumbull and Mittens), a stroke-gesture prototype (worse than the default on Mittens, J1 5.62 against 5.90, and on the held-out dog-paint), and two automatic readings of how much pen linework a source has (neither told pen sources from the rest).

### Known defects in the default path

- The stored Sargent plan does not paint (see above).
- A V5 session can fail the comparison gate after the model pauses and resumes a painting: the resumed part saves no frame when a value band dries, so the 50% and 75% stage images are identical. All three V5 Trumbull sessions at `318b5a86` failed this way. The same plans painted without a pause pass.
- The shadow glaze releases about 0.39 of its booked pigment, and the value plan asks for more dark than the target has. The two errors partly cancel. The fix for each is off by default (see above), because neither passes alone and the pair has not passed together.
- Closing ink is drawn on Mittens, whose source has no pen lines. Lines from a plan's drawing files are now limited to passage edges, but the automatic choice still does not turn closing ink off.
- Closing lines add repeated dark crescents on Hills and stray dark marks on Trumbull stone.
- Large blank planes remain on the Mittens faces and chests.
- Strong colours are muted. On a fresh Mittens plan the 90th-percentile chroma is 17.6 against the target's 22.6. On a fresh Trumbull plan it is 31.0 against 36.8.

Changes in this range with no test or measurement are not listed.

## 0.3.0 — 2026-11-07

**Five benchmark paintings, 30% less total time.** Replaying the saved Opus V5 plans took **14:47 instead of 21:13** on Apple M4 (**1.44× overall**). One run per painting/version; gains vary by target. France falls below the 98% image-similarity floor. The earlier 1.85× claim, which mixed cache states, is withdrawn.

<a href="docs/img/release-0.3.0-painting.gif"><img src="docs/img/release-0.3.0-painting.gif" width="560" alt="Actual White Ships painting playback: 0.2.1 on left, 0.3.0 on right, synchronized at 24×."></a>

**White Ships playback, 24×:** actual frames on one shared clock. Full recordings took **264.9 s before / 200.2 s after**; both omit the first 36.3 s. Segmentation is warm and recording overhead is included; the table uses separate unrecorded runs with cold segmentation. Each final PNG exactly matches its clean run.

| Target | Before · 0.2.1 | After · 0.3.0 | Speedup | RGB SSIM |
|---|---:|---:|---:|---:|
| Hills | 5:54 | 3:07 | 1.89× | 98.81% |
| France | 2:10 | 1:51 | 1.18× | 97.47% |
| Ships | 4:31 | 3:27 | 1.31× | 98.53% |
| Mittens | 2:09 | 1:38 | 1.32× | 99.92% |
| Trumbull | 6:29 | 4:44 | 1.37× | 99.31% |

<a href="docs/img/release-0.3.0-before-after.png"><img src="docs/img/release-0.3.0-before-after.png" width="680" alt="All five benchmark paintings: BEFORE 0.2.1, AFTER 0.3.0, and differences brightened 8×. Black means unchanged. Each painting keeps its original aspect ratio."></a>

France remains a 0.3.1 investigation: disabling passage-level drying only raises its similarity to 97.79%. SSIM measures similarity between releases, not artistic quality.

### What changed

Fewer GPU dispatches, smaller readbacks, reused stroke buffers, faster ink filtering, cached preparation, queued image writes. Fast value-plan runs now dry by passage, a behavior change that affects pixels.

### Checked on real GPUs

M4/Metal and L40S/Vulkan each passed **1,446 tests + 83 benchmark tests**; two non-GPU skips. Paint Lab paints, dries and saves on Chrome Metal and CPU. **210 mushroom tests pass.** NVIDIA and browser speedups are unmeasured.

<details>
<summary>Measurement details</summary>

[Archived Opus V5 try-3 plans](https://github.com/sabj/unpainting/tree/v0.3.0/bench/runs/v5-self-study/opus/3), one per target, replayed with the frozen 0.2.1 argument builder: tags 1cc2c08 → 70ceb7c, seed 0, fast mode, 1200–1224 px. Full process time includes preparation and saving. Run cache off; segmentation cold on both; other preprocessing caches may remain. Ten Metal renders, zero target-read violations; same unused-option warnings. Overall ratio uses summed runtimes; SSIM compares original releases. The withdrawn 1.85× used three fixtures and mixed segmentation caches.

[GPU validation](https://github.com/sabj/unpainting/releases/download/v0.3.0/validation.json)

</details>

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
