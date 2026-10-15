# Painting Plan — Mittens (V5, Try 2 of 3)

## 1. Visual Analysis of Target (`bench/plan/target.png`, `300x259` -> `1200x1036`, `280 mm` sheet)
The target is a diagonal watercolor-and-ink double portrait of a warm tabby-and-white cat (`Mittens`) nestled against the top of a bearded man's head, framed by generous unpainted white paper in the upper-right and lower-left corners.
- **Paper & Reserves**: Unpainted cold-press paper (`~45%` of the sheet) in the upper-right and lower-left corners, on the cat's white muzzle/chest, on the man's forehead highlight, and at the four eye catchlights.
- **Palette & Local Color**:
  - **Yellow Ochre (`ochre`)** and **Burnt Sienna (`sienna`)**: Carry the luminous golden-amber and terracotta washes of the cat's ears, forehead, cheek stripes, and nose leather, plus the warm flesh tones of the man's forehead, nose bridge, and cheeks.
  - **Sap Green (`sapgreen`)**: Essential for the cat's vivid yellow-green irises and olive-ochre fur transitions (reducing `widePalette` colour-fit error on `target.png` from `7.91` in Try 1 down to `3.49`).
  - **Payne's Grey (`paynes`)** and **Sepia (`sepia`)**: Carry the neutral-cool dark mass of the man's hair, eyebrows, beard stubble, moustache, and the deepest shadow accents in the eyes, nostrils, and ear hollows without polluting the dark hair with yellow ochre or burnt sienna.

## 2. What Changed from Try 1 and Why

### A. Fixing the Two Catastrophic Reserve Bugs in `bench/plan/config.json`
1. **Removed the Clipping Rectangle Reserves (`background-upper-right-paper` and `background-lower-left-paper`) and Tightened Eye Catchlights**:
   - In Try 1, `background-upper-right-paper` (`[0.42, 0.0, 1.0, 0.42]`) covered **4,916 dark pixels and 1,548 midtone pixels** of the man's upper hair crown and the cat's right ear tip, masking them out with solid rectangular frisket and chopping off the top of the man's head. Similarly, `background-lower-left-paper` (`[0.0, 0.68, 0.44, 1.0]`) masked out **3,401 painted pixels** of the cat's lower chest and the man's shoulder, and `human-right-eye-catchlight` (`[0.805, 0.676, 0.819, 0.690]`) was placed directly over the dark pupil/iris of the man's right eye (`dark: 8 of 9 pixels`), punching a rectangular white hole through the eye.
   - **Fix**: Verified every reserve box in `bench/plan/config.json` against `target.png` so that **zero dark pixels (`dark = 0`)** fall inside any reserve box (`minLum >= 193–253`), while letting `--paperrel 1 --paperlights 1` organically reserve the background paper and fur highlights along true silhouette boundaries.
2. **Changed `human-dark-hair-crown` Style from `ink-and-wash` to `precise-watercolor`**:
   - In Try 1, setting `human-dark-hair-crown` to `ink-and-wash` triggered `src/paint/methods/light-to-dark.mjs` lines 139–148, which overwrote the 5-band weights to `[0.42, 0, 0, 0.58, 0]` inside `shadowMask` and `[1.0, 0, 0, 0, 0]` outside `shadowMask`. That dumped 42%–100% of the dark hair's pigment into Band 1 (making the dark hair appear in the 10% stage!), created the warm brown perimeter halo around the hair, and zeroed out Bands 2, 3, and 5 (`deepAccent`) on the hair.
   - **Fix**: Using `precise-watercolor` across all regions keeps the natural light-to-dark curve (`weights[0] = 0.085 / v`, nested middle planes in Bands 2–3, and cross-region shadow glazes + `deepAccent` in Bands 4–5).

### B. Fixing the Progression & Stroke Distribution (`10% = 1.0`, `25% = 1.5` in Try 1)
1. **Disabled `_tp2` (`"--touchpoints", "0"`)**:
   - In Try 1, `_tp2` (`touchCorrections`) appended ~3,500 tiny rigger/cut-in strokes (`76.5%` of all 4,899 strokes) at the end of the run, compressing all 44 planned value passes into the first 25% of strokes so that the 10% checkpoint was already at Pass 20. Disabling `touchpoints` ensures the 10%, 25%, 50%, 75%, and 100% checkpoints sample the true 5-band light-to-dark build.
2. **Reordered `--paints` Warm-First (`ochre,sienna,sapgreen,paynes,sepia`)**:
   - `planLightToDark` iterates pigments in `--paints` order within each band. Putting `ochre` and `sienna` first (instead of `sepia` first as in Try 1) ensures Band 1 opens with luminous warm yellow-ochre and burnt-sienna washes at 10% before cool greys and sepia enter.
3. **Used `_lay2_lt_nest` + `_spl7_sml75_wre15` + `"--splwet", "0"`**:
   - Replaces `_lay4` (which deleted Band 3 when `_lt` was absent) with 2 broad nested midtone layers in Band 2 (`_lay2_nest`) plus regional modeling planes in Band 3 (`_lt`).
   - Uses 7 mm brush lanes of 75 mm length (`_spl7_sml75_wre15`) with per-stroke local demand charging (`PF` in `0.45..1.8`) and 1.5 mm wash reach (`--washreach 1.5`) so broad planes grade smoothly and feather at their ends instead of drying as flat posterized contour islands.
4. **Removed All Whiskers & Fine Eye Details from `opening-lines.json`**:
   - Reduced `opening-lines.json` to 5 light structural contour guides (`_opp18`, `--openingpressure 0.18`) for the outer ears, cheek sweep, brow axis, and nose bridge, moving all whiskers, eye rims, pupils, and nostril/mouth creases exclusively to `closing-lines.json` (`_ink3_sep2_dwg140`).
5. **Removed Unused Plan Tokens (`_leaf`, etc.) from `bench/variant.txt`**:
   - Left architecture/Trumbull tokens in `BASE` rather than repeating them in `bench/variant.txt`, eliminating the `--foliagerefit` unused-option warning.

## 3. Critique Points Accepted vs. Rejected
- **Accepted**:
  - Eliminate early whole-sheet sepia wash and early fine details/whiskers at 10% and 25%.
  - Eliminate posterized concentric contour islands on the cat's fur and man's forehead/cheeks.
  - Eliminate warm brown/orange perimeter halos around the man's dark hair and introduce `sapgreen` + `paynes` for the cat's green eyes and the man's cool-dark hair.
  - Remove `--foliagerefit` (`_leaf`) from `variant.txt`.
- **Rejected**:
  - Rejected the suggestion to leave the man's head completely blank at 10%–25%; instead, both subjects receive their pale warm `ochre`/`sienna` foundation washes in Band 1 while holding back dark `paynes`/`sepia` hair masses and focal accents until Bands 2–5.
  - Rejected the suggestion to eliminate opening lines completely (`--drawing last`); instead, `opening-lines.json` is restricted to 5 pale structural placement contours (`--openingpressure 0.18`) with zero whiskers or fine eye details.
