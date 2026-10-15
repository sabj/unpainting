# Painting Plan — `south-france` (Round V5, Try 3 of 3)

## 1. Visual Analysis of the Reference & Style Goal

The reference (`bench/plan/target.png`, `304×249` px rendered at `1216×996` px on a `280 mm` cold-press sheet) depicts a sunlit Provençal hillside village overlooking terraced olive and oak groves:
- **Requested Style (`urban sketch — pen plus light wash`)**:
  - **Pen & Ink Backbone**: Crisp, rectilinear sepia ink linework (`sepia-ink`) should define the architectural geometry—pitched terracotta roofs, horizontal eaves, vertical stone house walls and corners, rectangular dark windows, arched loggias, and horizontal retaining walls—plus the vertical spines of the dark cypress spires and the foreground tree trunk/branch V-forks. Critically, pen lines must **not** trace wiggly iso-luminance contour loops around green foliage masses.
  - **Light, Translucent Washes**: Broad, luminous washes should let the warm cream paper (`RGB ~ [246, 243, 236]`) breathe through the sunlit upper-left terrace road (`x = 0.02..0.26, y = 0.05..0.32`), the sunlit stone facades (`x = 0.65..0.96, y = 0.32..0.78`), and the diagonal lower-center path (`x = 0.32..0.52, y = 0.74..0.98`), while preserving rich local hue separation between warm terracotta roofs (`burnt sienna + yellow ochre`), sunlit yellow-green tree crowns (`hansa yellow + sap green + yellow ochre`), cool blue-green distant ridges (`cerulean blue + yellow ochre + sap green`), and deep olive/cypress shadows (`sap green + ultramarine + burnt sienna + sepia`).

---

## 2. What Changed from Try 2 (`6.88 / 10`) and Why

In Try 2 (`region_w13_cur_lay3_efade_ew3_cg12_dk12_opp85_tp2`), our composite score reached `6.88 / 10` (`classic measures: 8.44`), but VLM judges scored `5, 5, 6` (`edges detail: 4.00`, `marks texture: 5.33`, `composition values: 5.67`) and the progression judge scored `4, 3, 3, 3, 4` (`mean 3.4`). Our pre-feedback self-review (`bench/SELF-REVIEW.md`) and the external critique (`bench/feedback/FEEDBACK.md`) converged on four specific defects, each of which we traced to an exact code mechanism and fixed for Try 3:

### Fix 1: Eliminating the Bare-White Top/Bottom Strips (`y < 0.10`, `y > 0.90`) and the False Sky-Blue Patch (`x = 0.15, y = 0.02`) — `region_w13` $\rightarrow$ `region_w15` + `_spl24_sml300` + `_lf`
- **Critique Accepted**: Both our self-review and `FEEDBACK.md` flagged that the top ~10% and bottom ~10% of the canvas were left unpainted bare white (`91%` of all white pixels on the sheet!) and that a bright sky-blue spot appeared on the sunlit yellow wall at the top-left (`x = 0.15, y = 0.02`).
- **Root Cause**: Under `region_w13` (`--brushchoice 0`), `shapedPlanePaths` (`src/paint/techniques/shaped-marks.mjs`) generates **only a single centerline stroke** along the major axis of each shape, assuming `p.r` (`~115 mm`) will scale the brush width. Because `tools/paint-plate.mjs` caps the physical brush at the `38 mm` mop (`82.5 px` radius), every full-sheet wash painted only a single `38 mm` diagonal slash across the middle of the sheet, missing the top and bottom borders entirely and leaving an unmixed `cerulean blue` centerline track at `x = 0.15, y = 0.02`. Furthermore, `choosePassageBrush` (`region_w15`) alone computes its lane angle from `base[0]` to `base.at(-1)` (`37.5°`), compressing vertical offsets to `cos(37.5°) * 6/7 = 68%` on full-sheet shapes.
- **Change**: Combine **`region_w15`** (`--brushchoice 1`) with **`_spl24_sml300`** (`--strokeplan 1 --lanemm 24 --strokemm 300`, `src/paint/methods/stroke-plan.mjs`), **`_lf`** (`--loadfeather 1.5`), and **`"--splwet", "0"`**. The broad full-sheet/ground planes (`supportMm >= 24 mm`) use `planLanes` to sweep continuous full-width (`300 mm > 280 mm`, so `parts = 1` with zero mid-sheet overlap seam at `x = 0.50`) overlapping `24 mm` lanes from `uMin + R` (`y = 0.5`) to `uMax - R` (`y = 248.5` of `249`—100% full-height coverage!) with per-stroke local density modulation (`PATH_FACTOR`), while all regional and detail shapes (`supportMm < 24 mm`) use `choosePassageBrush` (`flat1in` / `round12` / `round8` / `round4` / `rigger`).

### Fix 2: Restoring Per-Region Local Colour Separation in Band 3 — `_lay3` $\rightarrow$ `_lay2_lt`
- **Critique Accepted**: Both reviews noted that mid-value foliage and building walls merged into an overly uniform, pale olive-brown middle tone (`composition values: 5.67`, progression tell: *"the whole sheet at one faint value, as if faded in"*).
- **Root Cause**: In `src/paint/methods/light-to-dark.mjs` line 195, `_lay3` (`--midlayers 3` without `_lt`) drops the standard Band 3 per-region pass and replaces it with 3 `groupMode` layers (`L0, L1, L2`) that group the entire sheet into just `coolGroup = 1, 2, 3` (warm vs. green vs. cool), averaging bright sunlit yellow-green trees with dark olive shadows and terracotta roofs with cream stone walls.
- **Change**: Replace `_lay3` with **`_lay2_lt`** (`--midlayers 2 --layertexture 1`). In `planLightToDark`, `_lay2_lt` lays 2 smooth connected mid-layers (`L0, L1`) in Band 2 (`weights[1]`) **and** keeps Band 3 (`tag: ''`, `weights[2]`), which partitions the mid-tones by the 6 `region.regions` colour/value clusters! Because `south-france` uses `precise-watercolor` where `texture` is `false` on Band 3 (line 216), Band 3 paints **per-region wet-on-dry local-colour washes** (warm terracotta sienna roofs, sunlit yellow-green foliage, shaded olive canopy, cool distant ridge) instead of dumping dry-brush speckles.

### Fix 3: Eliminating the 10,877-Stroke Late `_tp2` Rigger Dump That Froze the 50% and 75% Progression Snapshots — `_tp2` $\rightarrow$ `_tp1` + `--touchdmin 0.22`
- **Critique Accepted**: The progression judge scored `4, 3, 3, 3, 4` (`mean 3.4`), flagging *"no change from the previous snapshot (1); texture arriving as a dump, everything sharpening at once late (1)"*.
- **Root Cause**: In Try 2, Passes 1–67 (the entire 5-band light-to-dark plan!) took `4,192` strokes, and then `_tp2` (`touchCorrections`, `tools/paint-plate.mjs` lines 2492–2510) ran 2 rounds over 35 shapes using a `1.2 mm` rigger brush (`PB.detailR`), adding **10,877 tiny strokes** in Passes 68–104! Because `stages.jpg` samples at 10%, 25%, 50%, 75%, and 100% of total strokes (`15,069`), both the **50% (`stroke 7,535`)** and **75% (`stroke 11,302`)** snapshots fell inside the late `_tp2` micro-touchup phase after all main washes were already finished!
- **Change**: Switch `_tp2` to **`_tp1`** (`--touchpoints 1 --touchgain 0.6`) and set **`"--touchdmin", "0.22"`** in `bench/plan/extra-args.json`. Only shapes with a genuine density deficit $\ge 0.22$ receive a single corrective glaze, cutting late touchup strokes from `10,877` to `< 300` and ensuring the 10%, 25%, 50%, 75%, and 100% stroke checkpoints land squarely in **Band 1 (10%)**, **Band 2 `L0` (25%)**, **Band 2 `L1` + early Band 3 regions (50%)**, **late Band 3 regions + Band 4 shadows (75%)**, and **Band 5 accents + Closing Ink (100%)**.

### Fix 4: Rectilinear Architectural Pen Linework & Crisp Building Edges — Removing `_efade_ew3` and Rebuilding `opening-lines.json` & `closing-lines.json`
- **Critique Accepted (with Nuance on Line Placement)**: VLM judges scored `edges detail: 4.00 / 10`, noting that tree foliage was covered in wiggly contour-map loops while building roofs, walls, and windows lacked crisp rectilinear geometry. (We nuanced the critique's request for *"more lines everywhere"* by concentrating crisp rectilinear lines on the architecture, cypress spires, and foreground tree trunk while removing contour-blob loops from the green foliage canopy.)
- **Changes**:
  1. Remove `_efade` (`--edgefade 1.2`) and `_ew3` (`--edgewobble 0.3`) from `bench/variant.txt` so architectural washes keep crisp, un-wobbled walls and roof edges.
  2. Rebuild `bench/plan/opening-lines.json` (`74` rectilinear lines, 100% verified through `selectValueInk`) and `bench/plan/closing-lines.json` (`134` crisp dark architectural/structural lines, 100% verified through `selectValueInk` with `closingLines: 1` in `config.json` so `closingedgemin = 0` never fragments closing strokes).
  3. Every architectural line is simplified with Douglas-Peucker and filtered to `straightness >= 0.89`, capturing the upper village skyline (`y = 0.00..0.26`), the left stone retaining wall and gate (`x = 0.02..0.18, y = 0.12..0.22`), the mid-left stone outbuilding (`x = 0.135..0.19, y = 0.30..0.45`), the lower-right village houses, roofs, windows, and loggia arches (`x = 0.65..0.96, y = 0.32..0.78`), the tall vertical cypress spires, and the foreground tree trunk/branch V-forks (`x = 0.19..0.32, y = 0.66..0.99`), with **zero** wiggly foliage contour loops.

---

## 3. Pass Schedule & Execution Checkpoints

1. **Preflight (`bash bench/check.sh`)**:
   - Confirm `"ok": true`, zero unread model options, and `ADMITTED`.
2. **Opening Pen & Frisket (`bash bench/paint.sh start` $\rightarrow$ `look`)**:
   - Inspect the sepia ink opening drawing (`74` rectilinear architectural + structural strokes) to verify crisp village roofs, walls, terrace gate, and foreground trunk with clean un-looped foliage paper.
3. **Band 1 & Band 2 Connected Washes (`bash bench/paint.sh run 25` $\rightarrow$ `look`)**:
   - Verify that `region_w15` multi-lane mop sweeps cover the full height of the sheet (`y = 0.00..1.00`, eliminating the bare-white top/bottom strips and the false blue spot at `x = 0.15, y = 0.02`).
4. **Band 3 Per-Region Local-Colour Washes (`bash bench/paint.sh run 55` $\rightarrow$ `look`)**:
   - Verify distinct regional colour separation between the warm burnt-sienna/ochre village roofs, sunlit hansa/sap-green tree crowns, and shaded olive groves.
5. **Bands 4–5 Shadows, Bounded Touchup (`_tp1`), and Closing Ink (`bash bench/paint.sh finish` $\rightarrow$ `look`)**:
   - Verify deep ultramarine/sienna/sepia shadow glazes, dark architectural window/arch recesses, and the `134` closing sepia ink accents over the dried washes.
