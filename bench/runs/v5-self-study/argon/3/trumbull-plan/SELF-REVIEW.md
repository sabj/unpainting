# Self-Review of Try 2 (`Trumbull`, Round V5, Try 3 of 3)

## Part 1: Pre-Feedback Self-Review (Before Opening `bench/feedback/FEEDBACK.md`)

### 1. Inspection of `bench/feedback/` Artifacts
Before reading `bench/feedback/FEEDBACK.md`, I inspected `bench/feedback/` alongside `bench/plan/target.png`, `bench/feedback/previous-checkpoints.jsonl`, and `bench/feedback/previous-plan/`:
- **Missing Render Outputs**: `bench/feedback/previous-painting.png`, `bench/feedback/compare.png`, and `bench/feedback/stages.jpg` are completely absent from `bench/feedback/`.
- **Checkpoint Trajectory (`previous-checkpoints.jsonl`)**:
  - `start` at `modelMinutes: 33.13` with variant `region_w13_lay4_nest_spl12_sml50_wre12_lit15_lw_swarm_ssp45_och35_blk40_bka14_bcl4_sep4_opp35_tp1`.
  - `look` #1 at `boundary: "0"`: `strokes: 0`, `penLines: 175`, `passesDone: 0`, `passesPlanned: 83`.
  - `look` #2 at `boundary: "16"`: `strokes: 3017`, `penLines: 175`, `passesDone: 16`, `passesPlanned: 83` (`modelMinutes: 34.51`).
  - `look` #3 at `boundary: "64"`: `strokes: 5383`, `penLines: 175`, `passesDone: 64`, `passesPlanned: 83` (`modelMinutes: 35.68`).
  - `look` #4 at `boundary: "74"`: `strokes: 6784`, `penLines: 175`, `passesDone: 74`, `passesPlanned: 83` (`modelMinutes: 39.35`).
  - `continue` at `23:06:10Z` (`modelMinutes: 39.5`) from `boundary: "74"` with `stopAt: "closing"`.
  - `session-end` at `00:19:09Z` (`modelMinutes: 85.03`, 73 wall-clock minutes later) with `"why": "85 minutes of your own time are up"`, `looks: 4`, `revisions: 0`.

### 2. What Worked in Try 2's Plan
- **Opening and Closing Line Survival**: Snapping the multi-scale architectural contours in `opening-lines.json` (175 lines) and `closing-lines.json` / `closingink4-lines.json` (250 lines) to valid gradient ridges (`!protectedCells[i]`, local contrast `>= 0.064`, `TARGET_DRAW_EDGE >= 0.055`) together with `--openinglines 180` and `--closinglines 260` succeeded in delivering all 175 opening lines at `boundary 0` (up from only 12 in Try 1).
- **Eliminating the Erroneous Right-Chimney Reserve Box**: Setting `"reserves": []` in `config.json` removed the artificial white cutout over the right chimney stack and sky.
- **Restoring `burnt sienna` (`sienna`) to the Palette**: Specifying `"--paints", "ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia"` avoided `sapgreen` contamination in the dark stone cast shadows.

### 3. What Went Wrong & At Which Stage It Went Wrong
- **Stage Where It Went Wrong**: Between **Pass 74 and the `closing` boundary** (after `23:06:10Z`), and already structurally during **Band 1 (Passes 1–16)**.
- **Problem 1 — Run Failure / Timeout After Boundary 74 (No Finished Painting Scored)**:
  - After `continue` from `boundary 74` to `closing`, 73 minutes elapsed until the 85-minute budget expired, and the finished painting was either never completed or failed post-painting validation (e.g., passages yielding no brush path (`dropped > 0`) in Band 5 recesses/details under `--strokeplan 1`, an unread option, or process timeout during heavy stroke execution + drying).
- **Problem 2 — Excessive Stroke Count in Band 1 From `_spl12_sml50_wre12` (`3,017` strokes in Passes 1–16)**:
  - Adding `_spl12_sml50_wre12` (`--strokeplan 1 --lanemm 12 --strokemm 50 --washreach 1.2`) caused the first 16 passes (Band 1 light washes) to explode to **3,017 brush strokes** (out of ~7,000+ total strokes). That meant ~43% of all strokes occurred in Band 1 alone, skewing the 10% and 25% stage snapshots both into Band 1 and making each pass much slower to simulate.
- **Problem 3 — `config.json` Family Schema Mismatch**:
  - `previous-plan/config.json` used `"name"` and `"reason"` inside `families` entries instead of the schema documented in `TASK.md` (`{id, bounds:[x0,y0,x1,y1], baseMove, referenceCue}` matching keys in `styleSelection.regions`).

### 4. My Own Pre-Feedback Scores for Try 2
- **Finished Painting Score (0 to 10)**: **0 / 10** (because the run failed to deliver a valid finished `previous-painting.png` in `bench/feedback/`, or if judged by the state at pass 74 before closing ink, roughly **6.0 / 10** since closing architectural ink and final darks were not yet completed when the run stalled/failed).
- **Plausibility of Painting Process (1 to 5)**: **1.0 / 5** (because the run did not complete cleanly, and `_spl12_sml50` front-loaded 3,017 strokes into the first 16 passes).

---

## Part 2: Post-Feedback Analysis (`bench/feedback/FEEDBACK.md`) — Where I Agree and Disagree

### 1. Summary of `bench/feedback/FEEDBACK.md`
`bench/feedback/FEEDBACK.md` reports:
- **Outcome**: *"The plan was admitted but the painting failed, so there is no finished painting. What failed, and why: paint process was killed by a signal; no finished painting."*
- **Render Record**:
  - Base recipe tokens applied: `ink4, rec2x, rcl, sky3, leaf, cg13, vio, rg10, bmm40, birr, skyb, cpp, dk13, tv8, uncap, pgreen, dwg200, shs`
  - Base recipe tokens skipped: `lay4, sep8, blk60, bka20, tp2`
  - Settings read by nothing: `from your plan none; from the base none.`
  - Passages dropped for having no brush path: `0`
  - Painter: `exit null, 1 segment(s), ? brush strokes.`

### 2. Where I Agree with `FEEDBACK.md` and Why
1. **Agree: The run failed because the painter process was killed by a signal before producing a finished painting (`exit null`, `no finished painting`)**:
   - This matches my pre-feedback diagnosis from `previous-checkpoints.jsonl`: the run was admitted and reached `boundary: "74"` (`passesDone: 74` of `83`, `strokes: 6784`), then issued `continue` with `stopAt: "closing"` at `23:06:10Z` (`modelMinutes: 39.5`). Over the next 73 wall-clock minutes (`23:06:10Z` to `00:19:09Z`), the run never completed and consumed the remaining `modelMinutes` (`39.5 -> 85.03`), after which the painter process was killed by a signal.
2. **Agree: Zero unread settings and zero dropped passages up to that point**:
   - All custom options in `extra-args.json` and `variant.txt` were valid and read by the painter, and the admission check passed cleanly.

### 3. Technical Diagnosis of Why Try 2 Was Killed by a Signal & How We Fix It in Try 3
1. **Stroke Explosion from `_spl12_sml50_wre12` (`--strokeplan 1 --lanemm 12 --strokemm 50 --washreach 1.2`)**:
   - Breaking every `VALUE_PLAN` passage into 12 mm × 50 mm lane sub-strokes (plus automatic `--splwet 1` pre-wetting strokes for every multi-lane passage at line 2871 of `tools/paint-plate.mjs`!) doubled every multi-lane wash into a full pre-wetting brush pass plus a pigment pass, inflating Passes 1–74 to **6,784 brush strokes** (3,017 strokes in Passes 1–16 alone!) and causing GPU/CPU memory (`MARKTAPE`, dried `sheet.layers`, and physical stroke simulation) to balloon across 28+ minutes of runtime before even reaching Pass 75.
   - Removing `_spl12_sml50_wre12` restores the fast, clean `shapedPlanePaths` sweep execution (~3,500–4,500 strokes total for the entire painting, completing in ~6–10 minutes total wall time instead of >90 minutes).
2. **Post-Ladder Touch-Up Pass Overhead**:
   - When `TP_ROUNDS >= 1`, `touchCorrections` adds un-shaped (`!sh._valuePlan`) passes that run `brushedWashPaths` + `containPaths` + `distanceToZero` + `traceOutlines` + `cutin` at full `1200×1052` resolution. By setting `--touchdmin 0.22` (or keeping touch-up selective with `--touchmincells 0.025 --touchfamilies 10 --touchgain 0.45`), only genuinely under-dense macro areas receive a quick corrective glaze without flooding the stroke timeline or stalling after Band 5.
3. **Properly Waiting on `bench/paint.sh` Until `finish` Completes**:
   - In Try 2, after `continue` to `closing`, `modelMinutes` ticked from `39.5` to `85.03` because time outside an active `bench/paint.sh` request counts against the 85-minute budget. In Try 3, we will keep the painting lean (~8–12 minutes total runtime), call `bash bench/paint.sh wait` immediately whenever `paint.sh` reports it is still working, and ensure `bash bench/paint.sh finish` completes cleanly well within the time limit.
