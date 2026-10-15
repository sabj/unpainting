# Trumbull (`Y1`) — Precise Architectural Watercolor Plan

## 1. Visual Reading of `bench/plan/target.png`
The reference (`300 × 263` px, rendered at `1200 × 1052` cells on a `280 mm` cold-press sheet) depicts the Collegiate Gothic stone architecture of Yale's Trumbull College:
- **Sky (`Y1.sky`, `[0.35, 0.00, 1.00, 0.22]`)**: Clear cerulean and French ultramarine upper-right sky wash broken by open paper-white cloud corridors above the gable and roofline.
- **Slate Roofs (`Y1.slate-roofs`, `[0.00, 0.02, 1.00, 0.38]`)**: Cool blue-grey slate roof slopes, dormers, and left chimney stacks bridging the sky and the warm masonry below.
- **Sunlit Main Gable (`Y1.sun-main-gable`, `[0.38, 0.14, 0.82, 0.92]`)**: High-chroma warm yellow ochre, hansa yellow, and raw sienna sunlit stone facade with pale limestone window trim and mullions.
- **Warm Stone Walls (`Y1.warm-stone-walls`, `[0.15, 0.18, 0.90, 0.90]`)**: Mid-value warm ochre and raw sienna masonry courses across the central gable and flanking wings, broken by irregular stone block accents and dry-brush tooth texture in Band 3.
- **Cool Left Return (`Y1.cool-main-return`, `[0.00, 0.12, 0.52, 0.94]`)**: Cooler shadowed left-facing return wall, buttresses, and roof-side shadow planes separating cleanly in value and temperature from the sunlit gable.
- **Shaded Stone, Foliage & Street (`Y1.shaded-stone-and-foliage`, `[0.05, 0.22, 0.92, 0.94]`)**: Deeper warm-brown lower masonry, the green courtyard tree (`sapgreen` + `hansa` + `ochre` refit via `_leaf`), dark Gothic window and archway recesses, and the cool-glazed foreground sidewalk and street with small pedestrian figures and blue lamppost banner.

## 2. Palette & Material Strategy (`subject: "Y1"`, `precise-watercolor`)
- **Subject Tuning (`"subject": "Y1"`)**: Activates `shapeStoneDemand` (`src/paint/tuned/stone-demand.mjs`) and the Trumbull architectural rules in `planLightToDark` (`src/paint/methods/light-to-dark.mjs`):
  - Per-shape stone mixture fitting (yellow ochre, raw sienna, hansa yellow, French ultramarine) with `--stonesplit 55` (`_ssp55`) so saturated golden-sienna stone (`r - b >= 55`) and paler limestone trim (`18 <= r - b < 55`) form separate connected shapes and are not averaged together, plus foliage refit (`_leaf` / `--foliagerefit 1`).
  - Dark architectural recesses (`isRecess`) held out of Band 1 (`_rcl` / `--recessclean 1`) and Bands 2–3, then restated in two dried dark passes (`_rec2x` / `--recesslayers 2 --recessshare 0.75`).
  - Irregular stone masonry courses (`_blk60_bmm40_bka20_birr_bvar`) laying subtle ochre, raw sienna, and ultramarine course variations with varied course heights (`--stonecourses 1`).
  - Connected shadow glazes (`55%` French ultramarine + `45%` raw sienna via `_shs`, lifted toward violet via `_vio` where blue leads red) and foreground pavement glaze (`_rg10`).
- **Linework (`opening-lines.json`, `closingink4-lines.json`, `closing-lines.json`)**:
  - Traced directly from `bench/plan/target.png` (`186` opening spans; `143` target-supported hard-dark closing spans) and drawn in warm sepia ink (`_sep8`, `_ink4`, `_dwg200`, `_uncap`).

## 3. Execution & Inspection Plan
1. Verify plan compilation and CPU preview with `bash bench/check.sh` (`ADMITTED`).
2. Start the painting with `bash bench/paint.sh start` and inspect the opening sepia linework before washes.
3. Step through the 5 light-to-dark value bands (`Band 1` light foundations, `Band 2` 4-layer nested middle washes + stone blocks, `Band 3` warm stone dry-brush texture, `Bands 4–5` connected shadow glazes and double-pass Gothic window recesses, and `touchpoint` corrective glazes), inspecting with `bash bench/paint.sh look` and revising if needed before `finish`.
