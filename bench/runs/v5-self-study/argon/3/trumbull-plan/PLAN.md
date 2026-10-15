# Architectural Watercolor Plan — `Y1` (`Trumbull`, Round V5, Try 3 of 3)

## 1. Subject & Reference Cues (`bench/plan/target.png`)
`Trumbull` (`Y1`, 300×263 px rendered at 1200×1052 px on a 280 mm cold-press sheet) depicts the Collegiate Gothic stone facade of Trumbull College at Yale University:
- **`Y1.sky` (`[0.04, 0.00, 1.00, 0.32]`)**: Cerulean and granulating French ultramarine upper sky graded into warm cream-white cloud corridors (`[252, 251, 248]`).
- **`Y1.slate-roofs` (`[0.26, 0.01, 1.00, 0.34]`)**: Cool grey-blue slate roof slopes on the central gable (`x ≈ 0.28–0.54, y ≈ 0.01–0.20`) and right wing (`x ≈ 0.89–1.00, y ≈ 0.19–0.30`).
- **`Y1.sunlit-gable` (`[0.27, 0.05, 0.74, 0.98]`)**: Sunlit golden-ochre and raw-sienna ashlar limestone central gable, circular gable medallion (`x ≈ 0.52–0.57, y ≈ 0.09–0.17`), four upper lancet windows, two pointed Gothic mullioned windows (`x ≈ 0.45–0.63`), two ground-floor entrance arches with sunlit stone steps, and the dark blue Yale banner (`x ≈ 0.37–0.44, y ≈ 0.57–0.73`).
- **`Y1.shaded-wings` (`[0.00, 0.00, 0.32, 0.96]`)**: Left stone wing with three tiers of mullioned windows, tall left chimney stack (`x ≈ 0.14–0.28, y ≈ 0.00–0.16`), and the deep vertical cast-shadow recess crease (`x ≈ 0.25–0.30`).
- **`Y1.courtyard-foliage` (`[0.60, 0.58, 0.78, 0.99]`)**: Bright sunlit deciduous tree in the lower-right courtyard (`x ≈ 0.62–0.76, y ≈ 0.61–0.98`) and framing left foliage edge (`x ≈ 0.00–0.06, y ≈ 0.50–0.78`).

---

## 2. Palette, Regions, Technique Order, Moisture & Load
- **Palette (Base `_pgreen` + `_skyb` + `_shs`)**:
  - `yellow ochre` & `raw sienna`: sunlit ashlar limestone foundation, warm mid-tone masonry planes, and the warm partner (`--shadowraw 1`) to French ultramarine in golden-neutral stone shadows.
  - `hansa yellow` & `sap green` (`sapgreen`): bright sunlit courtyard canopy highlights and deeper botanical greens (`_leaf`, `--foliagerefit 1`).
  - `cerulean blue`, `French ultramarine`, and `sky blue` (`--skyblue 1 --skyfloc 0.5`): upper sky horizontal wet lanes, cool slate roofs, and connected architectural cast shadows (`_cg13_vio_dk13`).
  - `sepia`: deepest architectural apertures (pointed Gothic windows, entrance portals, traffic/signage darks) and sepia pen-and-ink drawing (`_sep4`).
- **Five-Band Light-to-Dark Execution Order, Moisture & Load**:
  1. **Stage 0 — Protected Paper Lights & Opening Drawing**:
     - Auto-detected cream paper white (`[252, 251, 248]`) via `--paperrel 1 --paperlights 1` and `--litreserve 95` (`_lit10_lw`) reserves cloud whites, sunlit limestone sills/trim, and front step glints without artificial rectangular reserve cutouts (`"reserves": []`).
     - **Opening drawing (`bench/plan/opening-lines.json`)**: 175 structural sepia ink contours drawn at light pressure (`_opp38`, `--openingpressure 0.38`, `_sep4`, `--inkkscale 4`) before Band 1 washes.
  2. **Band 1 — Continuous Light Foundations (~0–13% of stroke timeline)**:
     - Sky laid in overlapping 6 mm horizontal wet lanes (`--skylanes 1 --skylanemm 6 --skylanestep 0.8`, `water = 0.88`, `wet on wet`).
     - Broad pale warm ochre and raw sienna foundation washes across the sunlit gable, chimneys, and wings (`_lit10_lw`, `--litlift 0.10 --litwarm 1`), separated by color family (`_sky3`).
  3. **Band 2 — Four Nested Mid-Tone Architectural & Foliage Layers (`L0–L3`, ~13–54% of stroke timeline)**:
     - 4 nested dry-paper (`wet on dry`, `water = 0.62`) mid-tone layers (`_lay4_nest_mg11_ssp70`, `--midlayers 4 --nestedmid 1 --midgain 1.1 --stonesplit 70`) building ashlar stone variations, cool slate roofs, and layered green foliage masses from broad light-mid planes (`L0`) down to selective deeper mid-tones (`L3`), while `_ssp70` separates high-chroma golden sunlit stone (`r - b >= 70`) from cooler shaded stone so sunlit walls stay luminous (`50% ochre, 20% raw sienna, 20% hansa yellow, 10% ultramarine`).
  4. **Band 3 — Coursed Ashlar Stone Block Hints (~54–56% of stroke timeline)**:
     - Restrained, irregular 4 mm stone block glazes (`_blk45_bmm40_bka15_birr_bcl4`, `--stoneblocks 0.45 --stoneblockmm 4 --stoneblockamt 0.15 --stoneirregular 1 --stoneclusters 4`) clustered naturally on the masonry walls (`wet on dry`) before the shadow glazes.
  5. **Band 4 — Connected Cross-Region Cast Shadows (~56–76% of stroke timeline)**:
     - Unbroken dry-paper shadow glazes (`glazed`, `water = 0.45`, `_cg13_vio_rg10_dk13_shs`) in `French ultramarine + raw sienna` sweeping across region boundaries to unify the left facade recess crease, roof eaves, chimney shadows, and lower courtyard shadow planes.
  6. **Band 5 — Two-Layer Clean Architectural Recesses, Selective Macro Touch-Up & Closing Ink (~76–100% of stroke timeline)**:
     - Two-layer clean darks (`_rec2x_rcl`, `--recesslayers 2 --recessshare 0.75 --recessclean 1`) in `sepia` and `French ultramarine` inside the pointed Gothic windows, lancet openings, and doorway arches.
     - 1 macro touch-up round (`_tp1`, `--touchmincells 0.05 --touchfamilies 6`) over 3 broad planning shapes to restate any under-dense mass.
     - Masking film lifted on dry paper, followed by **250 crisp closing sepia ink lines** (`bench/plan/closingink4-lines.json` & `closing-lines.json`, `--closingpressure 0.65`) articulating window mullions, pointed arches, gable ridges, medallion, and chimney details.

---

## 3. Edges, Values & What Would Show Failure
- **Edges**: Hard dry-paper boundaries on architectural stone corners, roof ridges, chimneys, and window openings; clean damp brush softening only on turning internal stone/cloud transitions; horizontal wet-lane blending in the sky.
- **Values**: Five-step light-to-dark ladder (`[0.16, 0.32, 0.50, 0.75, 1.00]`) from bare cream paper highlights (`0.0`) through luminous sunlit ochre stone (`Band 1–2`), mid-tone shaded masonry and slate (`Band 2–3`), connected ultramarine/sienna cast shadows (`Band 4`), to deep sepia/ultramarine window apertures (`Band 5`).
- **What Would Show Failure**:
  - Process killed by signal or failing to complete before the 85-minute session limit.
  - Front-loading >40% of strokes into Band 1 (as `_spl12_sml50` did in Try 2) or dumping >50% of strokes into post-ladder micro-fragment touch-ups (as `_tp2` with `touchmincells 0.0008` did in Try 1).
  - Missing opening or closing architectural ink lines (dropping below 150 opening or 200 closing lines).
  - Unnatural rectangular white reserve holes on chimneys or walls, or unread options / dropped passages.

---

## 4. What Changed in Try 3 and Why (V5 Revision Log vs. Try 2)

### Change 1: Removed `_spl12_sml50_wre12` to Fix the Signal-Kill Timeout and Restore a Balanced 5-Band Stroke Timeline
- **What Failed in Try 2 (`FEEDBACK.md`)**: Try 2 was admitted and painted through Pass 74 (`6,784` strokes), then ran out of time and was **killed by a signal** (`paint process was killed by a signal; no finished painting`) between Pass 74 and `closing`.
- **Root Cause**: Adding `_spl12_sml50_wre12` (`--strokeplan 1 --lanemm 12 --strokemm 50 --washreach 1.2`) split every large plane into dozens of 50 mm lane strokes *and* triggered automatic `--splwet 1` pre-wetting strokes across every multi-lane passage. That caused Band 1 alone (Passes 1–16) to explode from 472 strokes to **3,017 strokes**, bloated Passes 1–74 to **6,784 strokes**, and slowed physical GPU drying/simulation enough to exceed the session budget.
- **Fix in Try 3**: Removed `_spl12_sml50_wre12`, returning to `region_w13`'s native `shapedPlanePaths` while keeping `_tp1` with `"--touchmincells", "0.05", "--touchfamilies", "6"`. At `1200×1052`, the 5 value bands now execute in **~3,576 main-ladder strokes** (`[472, 1532, 96, 734, 742]` across Bands 1–5) plus ~600 macro touch-up strokes, completing in ~8–10 minutes and placing the 10%, 25%, 50%, 75%, and 100% progress snapshots cleanly into Bands 1, 2 (early), 2–3 (late), 4, and 5+closing ink.

### Change 2: Restored Base `_pgreen` + `_shs` Palette (`ochre,rawsienna,hansa,ultramarine,cerulean,sepia,sapgreen`) and Removed `_swarm_ssp45`
- **Root Cause in Try 2**: Overriding `--paints` in `extra-args.json` to include `burnt sienna` (`sienna`) and enabling `_swarm_ssp45` disabled `--shadowraw 1` (`_shs`), replacing `raw sienna` with reddish `burnt sienna` across all non-recess Band 4/5 shadows (including shaded foliage and golden limestone walls) and increasing pass count from 73 to 83.
- **Fix in Try 3**: Kept the base Trumbull palette (`_pgreen` + `_shs`), which pairs `French ultramarine + raw sienna` for natural golden-grey limestone shadows, preserves `sapgreen` for deep courtyard foliage, reduces pass count by 10 passes, and lowers whole-sheet CIEDE2000 error (`14.418` vs `14.514`).

### Change 3: Fixed `config.json` Family Schema (`id`, `bounds`, `baseMove`, `referenceCue`) to Match the Actual `target.png` Crop
- **Root Cause in Try 2**: `previous-plan/config.json` used `"name"` and `"reason"` inside `families` instead of `"id"`, `"baseMove"`, and `"referenceCue"`, so `targetRegions` assigned `descriptiveFamily: null` and `baseMove: "wet on dry"` to every cluster.
- **Fix in Try 3**: Updated `config.json` to use `"id"`, `"bounds"`, `"baseMove"`, and `"referenceCue"` aligned to the actual `300×263` `target.png` facade crop (`Y1.sky`, `Y1.slate-roofs`, `Y1.sunlit-gable`, `Y1.shaded-wings`, `Y1.courtyard-foliage`), with `"baseMove": "wet on wet"` on `Y1.sky`.

### Change 4: Kept Verified Multi-Scale Snapped `opening-lines.json` (175 lines) and `closingink4-lines.json` (250 lines) with Balanced Sepia Ink Weight (`_sep4_opp38` + `--closingpressure 0.65`)
- **Why Kept**: Try 2's checkpoint log (`previous-checkpoints.jsonl`) confirmed that `penLines: 175` was delivered cleanly at `boundary 0`. Using `_sep4_opp38` with `--closingpressure 0.65` gives a delicate opening sepia construction drawing (`0.38` pressure) and crisp closing architectural ink (`0.65` pressure) without redundant `--openinglines`/`--closinglines` flags (already uncapped by base `_uncap` and `_ink4`).

---

## 5. Critique Points Accepted vs. Rejected
- **Accepted from Try 2 `FEEDBACK.md`**: The sole failure in Try 2 was that the paint process was killed by a signal before finishing (`exit null, no finished painting`). We fixed both the stroke/runtime bloat (`_spl12_sml50_wre12`) and our `bench/paint.sh` wait loop so the painting finishes completely within the session.
- **Rejected from Try 1 Judge Critique**:
  - Rejected any claim that opening drawing should replace Band 1 washes at the 10% stroke mark: in watercolor, 175 opening sepia lines followed by Band 1 pale washes at 10% is the authentic architectural watercolor sequence once post-Pass-80 touch-up flooding is eliminated.
