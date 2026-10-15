# Painting Plan — Hills (Loose Ink and Wash)

## 1. Visual Analysis of Target (`bench/plan/target.png`, 306×242 px)
The subject is a loose ink-and-wash landscape of sunlit rolling grassy hills, billowy oak tree groves, and a winding dirt trail:
- **No sky margin**: The frame is filled entirely by hillsides, foliage masses, and the winding path.
- **Essential bare-paper lights**: The brightest notes in the painting belong to the sunlit dirt trail (`RGB ~ 247, 231, 198`), which enters at the top-right crest (`[0.715, 0.055, 0.740, 0.085]`), bends to the upper left (`[0.194, 0.202, 0.214, 0.228]`), switches back beneath the central oak canopy (`[0.236, 0.460, 0.258, 0.486]`), and winds down the lower center (`[0.476, 0.700, 0.502, 0.732]` and `[0.505, 0.884, 0.531, 0.916]`). These paper lights are held both through automatic interior cream-sheet reserve (`_shs` / `--paperlights 1 --paperdelta 12`) and five small explicit reserves placed strictly inside the trail core so no axis-aligned seams cross painted washes.
- **Local colour families**:
  1. **Sunlit grassy slopes** (`upper-right-grass-slope`, `upper-left-grass-meadow`, `lower-center-grass-slope`): Luminous yellow-green washes (`hansa yellow` + `phthalo green`) grading from pale warm yellow at the hill crests into richer green midtones.
  2. **Oak tree canopies and wooded ravines** (`top-left-oak-wood`, `central-overarching-oaks`, `diagonal-wooded-ravine`, `left-foreground-woods`, `lower-right-tree-cluster`): Layered olive-green, warm brown-grey, and cool slate-blue (`French ultramarine` + `quinacridone rose` + `phthalo green`) masses.
  3. **Winding dirt trail** (`sunlit-winding-trail`): Bare paper core bordered by warm yellow-ochre / hansa-rose earth washes and broken contour ink lines.

## 2. Palette & Material Choices
- **Paper colour (`--paperrgb 248,240,215`)**: Declared to match the warm cream sunlit dirt trail core (`mean RGB ~ 248, 240, 215` in the brightest 2% of pixels).
- **Wide box palette (`--palettewide 1`)**: Fits 4 transparent watercolour pans (`phthalo green`, `hansa yellow`, `French ultramarine`, `quinacridone rose`, plus the granulating French ultramarine tube) that span the high-chroma yellow-green meadows, warm ochre-rose trail verges, and cool blue-slate tree shadows.
- **Ink profile (`--inkk 3.8,3.9,4.0`)**: The target's ink work is deep neutral charcoal-black (`mean RGB ~ 13, 15, 18` in the darkest 2% of pixels) rather than pale brown sepia. Overriding `--inkk` to `3.8,3.9,4.0` matches the target's dark ink lines.
- **No horizontal sky lanes & adaptive brush lanes (`bench/variant.txt` = `region_w13_noslane_spl16_lad_sml60_mg12_dk14`)**: Because Hills has no sky and its cool blue-grey regions are rounded oak shadows, `_noslane` disables horizontal sky-lane sweeps, while `_spl16_lad_sml60` lays wide passages in overlapping adaptive 16 mm brush lanes.

## 3. Pass Order & Value Architecture
1. **Opening Ink (`bench/plan/opening-lines.json`, `--openingminmm 5.5`, `--drawmax 240`, `--openinglines 160`)**:
   - 220 candidate structural contour strokes (`>= 5.8 mm`, strictly avoiding all `protectedCells` light/trail reserves) from which the top 160 strokes establish the winding path edges, hillside crests, and billowy oak crown silhouettes before the first wash.
2. **Band 1 — Light Washes (Passes 1–10)**:
   - Continuous pale local-colour foundation across the grassy slopes and foliage masses while holding the winding trail's bare paper reserves.
3. **Band 2 — Four Graded Middle Wash Layers (`_lay4`, `_mg12`, Passes 11–50)**:
   - Progressive wet-on-dry middle layers (`L0` through `L3`) separated by hue family (`--layerhue 1`) that build the rounded volume of the grassy hills and the olive-green midtones of the oak canopies.
4. **Bands 4 & 5 — Connected Shadow Glazes & Touchpoint Rounds (`_dk14`, `_cg13`, `_rg10`, `--touchpoints 3`, `--touchgain 0.85`, `--touchfamilies 32`, Passes 51–78)**:
   - Connected dark glazes and deep recess accents across the wooded ravine, under-canopy hollows, and left-side woods, followed by three shape-level touchpoint deficit rounds over 32 planning families.
5. **Closing Ink (`bench/plan/closing-lines.json`, `--closingedgemin 0.07`, `--drawmax 240`, `--closinglines 240`)**:
   - 240 crisp dark ink strokes (`meanContrast >= 0.061`, `meanEdge >= 0.075`) laid on the dried sheet to restate tree trunks, branch structures, deep canopy crevices, and trail-edge accents.

## 4. Interactive Looks & Revisions During Painting
- **Look 1 (Boundary 0, after opening ink)**: Verified that all 160 opening ink lines registered cleanly on the warm cream sheet (`248, 240, 215`) while leaving the winding dirt trail reserves untouched.
- **Look 2 (Boundary 10, after Band 1 light washes) & Look 3 (Boundary 30, after middle wash layers `L0` and `L1`)**: Observed that single-gesture `shapedPlanePaths` on very wide hillside passages left the far-right margin under-covered and that middle-value saturation on the grassy slopes and olive canopies needed stronger coverage.
- **Revision 1 (at Boundary 30)**: Updated `bench/variant.txt` to `region_w13_noslane_spl16_lad_sml60_mg12_dk14` (enabling overlapping 16 mm adaptive brush lanes `_spl16_lad_sml60` with `--splwet 0`, boosting middle wash gain `_mg12` and shadow glaze gain `_dk14`) and strengthened the late shape-level deficit correction (`--touchpoints 3`, `--touchgain 0.85`, `--touchfamilies 32`).
- **Look 4 (Boundary 50), Look 5 (Boundary 60), & Look 6 (Closing boundary after pass 78)**: Confirmed that the laned `L2`/`L3` middle washes, Band 4/5 shadow glazes, and 3 touch-up rounds (passes 61–78) built rich olive and slate-blue oak shadows and warm yellow-green hillsides while preserving the bare-paper trail.
- **Revision 2 (at Closing boundary)**: Raised `--drawmax` and `--closinglines` to `240` so all 240 curated closing ink accents in `bench/plan/closing-lines.json` are drawn over the dried washes.
