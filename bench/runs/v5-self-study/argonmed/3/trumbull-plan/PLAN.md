# Painting Plan — Trumbull (`Y1`, Round V5, Try 3 of 3)

## 1. Reference Cues & Subject Analysis
The target (`bench/plan/target.png`, `300 × 263` px rendered at `1200 × 1052` px on a `280` mm cold-press watercolor sheet) depicts a collegiate Gothic stone chapel (`Y1`, Trumbull) bathed in warm raking sunlight from the upper right, framed by lush sap-green and burnt-sienna foliage on both margins and a central shrub mass, with figures and cast shadow bands across the foreground lawn and path.

Key visual cues from the target:
1. **Continuous Warm Sunlit Masonry**: The central Gothic gable wall, twin chimneys, stepped left gable, and sunlit left bay read as coherent, continuous warm yellow-ochre and raw-sienna ashlar planes (`R - B > 40`, squinted `L* >= 86`), never fragmented into blotchy camouflage patches or cold grey holes.
2. **Graded Atmospheric Sky**: A soft cerulean and granulating sky-blue wash across the upper sheet (`y < 0.42`), preserving warm cream paper cloud reserves along the upper-left and right sky margins without hard contour rings.
3. **Crisp Gothic Fenestration & Deep Recesses**: Pointed lancet windows, the central traceried window and rose roundel, and the deep left and right portal archways carry the darkest values on the sheet (`valueBand 5`, `recessLayers = 2`, `recessShare = 0.75`, `recessClean = 1`) and require crisp sepia ink articulation on dry paper.
4. **Connected Cool-Violet Cast Shadows**: Shadowed wall planes on the right wing, eaves undercuts, and horizontal foreground lawn shadow bands share a connected French ultramarine + raw sienna (`55:45`, violet-lifted via `_vio_shs`) shadow glaze across region boundaries.

---

## 2. Region Techniques & Painting Order
All 14 descriptive families use the `precise-watercolor` profile, executed in strict 5-band light-to-dark painter order (`--order painter`):

1. **Preparatory Structural Drawing (`opening-lines.json`, `--drawing both`, `_ol120_opp36`, `--drawstroke 0.35`)**:
   - **120 continuous architectural contour lines** (`54` to `340` cells long at `1200` px wide, strictly outside `protectedCells` and filtered off foliage) drawn in `sepia-ink` at light-medium pressure (`0.36`) before the first wash.
   - Establishes the gable roofline, chimneys, vertical buttress corners, main window arch silhouettes, and ground horizon as continuous drawn lines rather than dotted trails.
2. **Band 1 — Pale Local-Color Foundations (`phase: light`, value cap `0.16`)**:
   - **Sky (`sky_upper`)**: Wet-on-wet (`baseMove: "wet on wet"`, `--skylanes 1 --skylanemm 6 --skylanestep 0.8`) with cerulean, ultramarine, and granulating sky blue (`_skyb`, `--skyfloc 0.5`).
   - **Sunlit Lawn (`lawn_lit`)**: Wet-on-wet pale hansa yellow, yellow ochre, and sap green foundation across the lower foreground.
   - **Sunlit Masonry (`gable_peak_lit`, `center_facade_lit`, `left_facade_lit`, `left_upper_gable`, `right_gable_lit`)**: Continuous pale yellow-ochre and raw-sienna wash (`_lit15_lw`), keeping all warm stone connected as a single hue family (`--stonesplit 0`).
   - **Foliage (`trees_left`, `trees_center`, `trees_right`)**: Pale hansa-yellow and sap-green foundation (`_leaf`, `_pgreen`).
3. **Band 2 — Two Broad Smoothed Midtone Wash Layers (`phase: mid`, `_lay2_ls30`, `_mg12`, value cap `0.32–0.50`)**:
   - Built in **2 broad midtone layers** (`L0` whole middle form, `L1` `q = 0.30` deeper middle form) smoothed at `3.0` mm (`_ls30`) with `1.2x` mid-gain (`_mg12`) and `1.5` load feathering (`_lf`), separated by hue family (`_sky3`: warm stone, cool sky/glass, green foliage).
   - Sunlit stone (`L* >= 86`) sheds 15% of mid-layer weight (`_lit15`) and redirects cool demand into yellow ochre (`_lw`) so the main gable remains warm and luminous.
4. **Band 3 — Subtle Clustered Ashlar Masonry Hints (`phase: mid`, `tag: B`, `_blk25_bka12_bcl3`, `--stoneirregular 0`)**:
   - **Regular horizontal rectangular ashlar courses** (`--stoneirregular 0`, `4.0` mm block height `_bmm40`) grouped into **3 loose clusters** (`_bcl3`) at low coverage (`0.25`, `_blk25`) and gentle glaze weight (`0.12`, `_bka12`).
   - Replaces the previous global warped-quad speckle dump with restrained, structured stone course accents on dry masonry.
5. **Bands 4 & 5 — Connected Shadow Glazes, Deep Accents & Architectural Recesses (`phase: shadow`, `_vio_shs_dk13_cg13_rg10_rec2x_rcl`)**:
   - Two connected shadow glazes (`French ultramarine` + `raw sienna` with violet lift `_vio` and `1.3x` dark gain `_dk13`) across the shaded right wing, left gable shadow, tree shadows, and foreground cast-shadow bands (`_rg10`).
   - Two clean recess passes (`_rec2x_rcl`) into the dark Gothic window openings and portal arches.
6. **Single Broad Touchpoint Verification (`_tp1`, `--touchfamilies 6 --touchmincells 0.025 --touchdmin 0.08`)**:
   - One corrective glaze round restricted to at most 6 broad planning shapes (`>= 2.5%` of sheet area, optical density deficit `>= 0.08`).
7. **Closing Architectural Ink (`closingink4-lines.json` & `closing-lines.json`, `_ink4_sep8_dwg200`)**:
   - **185 high-contrast architectural contour and detail lines** (`contrast / count >= 0.0695` at `1200 × 1052`, zero overlap with `protectedCells`) drawn on the fully dried sheet with per-point widths (`--drawwidthgain 2.0`) to crisply articulate the Gothic window arches, lancet mullions, rose roundel, stepped gable copings, chimneys, and foreground figures.

---

## 3. Moisture, Brush Load & Physical Discipline
- **Wet-on-Wet (`water: 0.88`, `wetMix: 0.85`)**: Restricted to Band 1 `sky_upper` and `lawn_lit` foundations.
- **Wet-on-Dry (`water: 0.62`, `wetMix: 0.55`)**: Used for all Band 1 masonry/foliage foundations, Band 2 midtone layers (`L0`, `L1`), and Band 3 horizontal ashlar courses (`B`). Each pass dries completely before the next layer begins.
- **Shadow Glazes (`water: 0.45`, `wetMix: 0.30`)**: Laid over fully dried middle layers so warm ochre stone glows through cool ultramarine-sienna shadows without muddying.
- **Pen Gate (`dryPenGate`)**: Both opening and closing sepia ink passes verify `water <= 0.001` and `pore <= 0.021` before nib contact.

---

## 4. Protected Lights & Reserves
- **Auto Paper & Relative Lights (`--paperrgb auto --paperlights 1 --paperrel 1`, `_ms240`)**:
  - Reserves connected cream-paper highlights (`>= 240` cells at `1200 × 1052`, ~5.5% of the sheet) in the upper sky clouds, sunlit gable trim, and foreground figure highlights using physical masking resist (`applyResist` before Band 1, `liftResist` after Band 5 dries).
- **Elimination of Pinhole Speckles (`--litreserve 99`, `_ms240`)**:
  - Raising `--litreserve` from `95` to `99` disables the 8-pixel `glint` pinhole cutouts inside `_lit15_lw` that previously peppered the sunlit stone walls with tiny white dots, while `_ms240` removes small isolated reserve fragments.

---

## 5. Edges & Value Hierarchy
- **Hard Architectural Boundaries**: Dry placement with physical clip masks on gable rooflines, chimneys, buttresses, and window apertures; reinforced by the 120 opening and 185 closing sepia ink lines.
- **Soft Atmospheric Transitions**: Clean damp brush softening (`softBoundaryPaths`) only on low-contrast (`< 0.14`), same-hue interior transitions away from hard architectural edges.
- **Five-Band Value Ladder**:
  - Band 0 (Reserved paper): `0.00` density (sky clouds, brightest trim glints).
  - Band 1 (Light foundation): `0.00–0.16` peak density (pale sky, sunlit ochre facade, sunlit lawn).
  - Band 2 (Mid-layers `L0`, `L1`): `0.16–0.50` peak density (warm stone body, sunlit foliage, foreground path).
  - Band 3 (Clustered ashlar courses `B`): subtle `0.12` local demand accents on warm stone walls.
  - Bands 4–5 (Connected shadows & recesses): `0.50–1.00` peak density (right wing shadow, deep foliage shadow, foreground shadow bands, near-black Gothic window and portal recesses).

---

## 6. Failure Signs to Watch For During `look` Checkpoints
1. **After Opening Drawing / Band 1**: Opening lines must read as continuous architectural contours (gable, chimneys, corners), and the sunlit central gable must carry a continuous, unbroken pale warm ochre wash with zero vertical seam down the middle and zero white pinhole dots.
2. **After Band 2 (`L0`, `L1`) & Band 3 (`B`)**: Midtone stone washes must stay smooth and unified; the 3 clustered horizontal ashlar course hints must read as subtle masonry courses, not heavy dark speckles.
3. **Before Closing Ink (`closing` boundary)**: Shadow glazes on the right wing, foliage, and foreground path must have full value depth (`darkGain 1.3`), and dark window recesses must be cleanly placed.

---

## 7. What Changed from Try 2 and Why
1. **Removed `_ssp55` (`--stonesplit 55` -> `0`)**:
   - *Why*: In `src/paint/tuned/stone-demand.mjs`, `--stonesplit 55` partitioned the warm stone facade at `R - B = 55` into two separate pigment fits. Because the left half of the sunlit main gable had `R - B >= 55` and the right half had `R - B < 55`, pigments present in only one fit had `G[i] = 0 -> mask[i] = 0`, slicing the flat sunlit main gable down the middle at 25% and shattering the left wall into blotchy camouflage patches. Removing `_ssp55` keeps the sunlit stone facade unified.
2. **Fixed Closing Ink Survival (`2 / 276` -> `185 / 185` in `closingink4-lines.json`)**:
   - *Why*: In Try 2, `closingink4-lines.json` had 276 lines traced at `300 × 263` without checking `selectValueInk` at `1200 × 1052`. Because `selectValueInk({ first: false })` drops any line with 4-neighbor `contrast / count < 0.06` at `1200 × 1052`, **274 of the 276 closing lines were silently dropped** in Try 2 (leaving only 2 closing lines drawn and causing `edges detail` to score `2.67 / 10`!). In Try 3, all 185 closing lines are snapped to high-contrast architectural edges (`contrast / count >= 0.0695` at `1200 × 1052`, zero points on `protectedCells`), achieving **185 / 185 (100%) survival**.
3. **Upgraded Opening Drawing (`_ol40_opp24` -> `_ol120_opp36`, `--drawstroke 0.35`)**:
   - *Why*: Try 2 had only 38 short interior segments at pressure `0.24`, which looked like faint dotted trails (`10%: 1/5`, `"speckle or dotted trails instead of drawn lines"`). Try 3 provides 120 continuous architectural structural lines (`54–340` cells long, filtered off foliage and `protectedCells`, `--drawstroke 0.35` so none are split into short fragments) at pressure `0.36`.
4. **Replaced `_lay4` with `_lay2_ls30` (`--midlayers 2 --layersmooth 3.0`)**:
   - *Why*: Four global quantile washes (`L0..L3`) over the whole sheet created a uniform `"dissolve/filter reveal"` and required 81 passes (causing Try 2 to hit the 85-minute timeout). Two 3mm-smoothed mid-layers build clean regional planes in fewer passes.
5. **Tamed Stone Blocks (`_blk60_bka20_birr` + `_bvar` -> `_blk25_bka12_bcl3` + `--stoneirregular 0`)**:
   - *Why*: Try 2's 60% coverage of warped irregular quads (`_birr`) dumped 267 speckled blotches across the walls at 50% (`marks texture: 2.33 / 10`). Try 3 uses regular horizontal rectangular courses (`--stoneirregular 0`) in 3 loose clusters (`_bcl3`) at `0.25` coverage and `0.12` amount.
6. **Eliminated White Pinhole Speckles (`--litreserve 99`, `_ms240`)**:
   - *Why*: Prevented `_lit15_lw` from cutting 8-pixel white `glint` pinholes into the sunlit stone walls.

---

## 8. Critique Points Accepted vs. Rejected
- **Accepted — Progression Judge (`10%: 1/5, 25%: 2/5, 50%: 2/5, 75%: 3/5`, `"speckle or dotted trails instead of drawn lines"`, `"whole sheet at one faint value"`, `"texture arriving as a dump"`)**: Fully accepted. Addressed by replacing the 38 faint ticks with 120 continuous architectural contour lines (`_ol120_opp36`, `--drawstroke 0.35`), cutting 4 global mid-layers to 2 smooth layers (`_lay2_ls30`), removing `_ssp55`, and taming warped stone blocks into 3 subtle horizontal clusters (`_blk25_bka12_bcl3`, `--stoneirregular 0`).
- **Accepted — Finished Judge on `edges detail` (`2.67 / 10`, muddy window arches/tracery)**: Fully accepted. Diagnosed the exact bug (`274 / 276` closing lines dropped by `selectValueInk` at `1200 × 1052`) and built a verified 185-line `closingink4-lines.json` with 100% survival (`185 / 185`).
- **Accepted — Finished Judge on `marks texture` (`2.33 / 10`, blotchy/speckled stone walls)**: Fully accepted. Removed `_ssp55`, `_bvar`, and `_birr` (`--stoneirregular 0`), and raised `--litreserve 99` and `_ms240`.
- **Rejected — Abandoning `_lit15_lw` or `_mg12` completely**: Rejected. While `_ssp55` and `litReserveL = 95` caused wall blotches and pinholes, keeping `_lit15_lw` (with `--litreserve 99`) and `_mg12` is essential to preserve the warm ochre-sienna luminosity of the sunlit gable against the cool shadow glazes.
