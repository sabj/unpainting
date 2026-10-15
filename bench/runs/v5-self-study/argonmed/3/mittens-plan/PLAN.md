# Painting Plan — Mittens (`bench/plan/target.png`) — Round V5, Try 3

## 1. Visual Analysis & Artistic Strategy

`Mittens` (`300x259` upscaled 4x to `1200x1036` on a `280 mm` cold-press watercolor sheet) is an intimate, warm **watercolor portrait sketch with fine lines and light washes**: a curly-haired, bearded young man with glasses gently resting his cheek against the head of a tabby cat ("Mittens") with luminous pale-green eyes, pink nose, and white muzzle/bib.

The painting succeeds when it balances:
1. **Luminous, preserved paper whites (`protectedCells`)**: The upper-left and upper-right open background, the crisp catchlights in all four eyes, the highlight down the man's nose bridge and left cheek, the cat's white muzzle pads and chin, and the light shirt collar folds must stay clean bare paper.
2. **Smooth, cohesive light-to-middle watercolor washes (`_w13_lay3_softs`)**: Warm yellow ochre and burnt sienna skin/fur glazes, sap green on the cat's irises, and cool Payne's grey on the collar/sweater build gradually across three whole-form middle value layers (`_lay3`, quantiles `0, 0.30, 0.55`) with damp-brush edge softening (`_softs`) and feathered reloads (`_lf`), avoiding isolated colour-cluster islands or parallel mechanical hatch stripes.
3. **Coherent dark shadow glazes and focal accents (`_dk14_mg12_dp82_dg2_acc3_eye8_efade`)**: Warm burnt sienna and deep sepia/Payne's grey build the curly hair mass, beard/embrace shadow, tabby stripes, and facial features, while `_eye8` (`--eyering 0.008`) keeps the cat's iris bodies (`0.38r..0.78r` around each catchlight reserve) out of `deepMask` so the green middle planes remain luminous inside the dark pupil and limbal ring.
4. **Expressive opening graphite & closing sepia-sketch ink (`_ink4_sep4_opp22_dwg150`)**: Sparse opening graphite lines establish the major silhouette and structural contours, and crisp closing sepia-sketch pen strokes (`closingink4-lines.json`) define the eyelids, pupils, glasses rims, nostrils, cat ears, forehead "M" tabby markings, philtrum/mouth, whiskers over painted cheek fur, and curly hair locks.

---

## 2. What Changed in Try 3 and Why

### Change 1: Eliminated Diagonal Corduroy Striping & the Two Brown Diagonal Bars Across the Man's Left Eye/Cheek (`region_w15` + `_spl7_sml75_wre15` -> `region_w13`)
- **Why**: In Try 2, `region_w15` enabled `--brushchoice 1` (`choosePassageBrush`), which assigned `shape: 'mop'` / `'round'` (`flat: false`) to non-flat washes. Combined with `_spl7` (`--strokeplan 1 --lanemm 7`), `planLanes` spaced straight parallel 45° strokes `1.7 * R` apart (calibrated for a `flat: true` brush), while the `flat: false` brush's parabolic bristle falloff (`1 - 0.55 * rel^2`) deposited dark pigment down the center of each lane and left lighter valleys between lanes—creating the 45° corduroy striping across the hair and fur. Even worse, on branched shadow passages in Bands 4–5 with `supportMm < 7 mm`, `sh._strokePlan` was skipped and `passageBrushPaths` (`--brushchoice 1`) swept `lanes = 2` straight diagonal mop tracks across the bounding box of the mask, producing the two thick brown diagonal bars slashing across the man's left eye and cheek.
- **Fix**: Switched from `region_w15` to `region_w13` (`--water 1.3`, `--brushchoice 0`) and removed `_spl7`, `_sml75`, `_wre15`, and `"--splwet", "0"`. Every wash now uses `shapedPlanePaths` curved medial-axis sweeps with `flat: true` strictly clipped to `brushMask(sh)`, completely eliminating both the diagonal corduroy striping and the two diagonal bars across the man's face.

### Change 2: Eliminated Midtone Patchwork & Early 25% Facial Detail (`_lay2_lt_nest` -> `_lay3`)
- **Why**: In `src/paint/methods/light-to-dark.mjs`, Band 3 dry-brush texture is only enabled for `TRUMBULL_SUBJECT` and `PORTRAIT_SUBJECT`. On `subject: "mittens"`, `_lt` (`--layertexture 1`) did not produce dry-brush texture; instead, it kept Band 3 as a per-region wet-on-dry pass (`domains = region.regions.map(...)`), carving the man's face and the cat's coat into small posterized colour-cluster islands and laying dark small features before the 25% mark.
- **Fix**: Removed `_lt` and `_nest` and switched to `_lay3` (`--midlayers 3`). All middle value demand (`weights[1] + weights[2]`) is now carried by three smooth, whole-form value layers (`L0, L1, L2` at quantiles `0, 0.30, 0.55`) with damp-brush edge softening (`_softs`).

### Change 3: Fixed Opening & Closing Line Survival (`penLines: 1` in Try 2 -> Full Structural & Feature Linework in Try 3)
- **Why**: Two filters silently dropped almost all authored lines in Try 2:
  1. `selectValueInk` (`src/paint/methods/light-to-dark.mjs` line 263) drops any polyline with even a single vertex on `VALUE_PLAN.protectedCells` (`!protectedCount`), and several Try 2 closing lines had endpoints inside the catchlight or muzzle-white reserve boxes.
  2. `prepareDrawing` (`src/paint/methods/material-profiles.mjs` line 45) filters closing strokes by `meanEdge(g.points, TARGET_DRAW_EDGE, W2, H2) >= num('closingedgemin', 0.22)` and caps the count at `num('closinglines', 24)`. Because `TARGET_DRAW_EDGE` is a 2-pixel finite difference on the 4x-upscaled `1200x1036` grid, smooth edges have lower per-pixel gradient than `0.22`.
- **Fix**:
  - Tightened the explicit `reserves` in `bench/plan/config.json` to the true highlight cores and repositioned all 14 polylines in `bench/plan/opening-lines.json` and all 26 polylines in `bench/plan/closing-lines.json` / `bench/plan/closingink4-lines.json` so zero vertices touch `protectedCells` (`protectedCount === 0`) and every closing line lies on a genuine density edge (`contrast / count >= 0.06`).
  - Added `"--closingedgemin", "0.04"`, `"--closinglines", "36"`, and `"--openinglines", "16"` to `bench/plan/extra-args.json` so `prepareDrawing` admits the full set of closing sepia-sketch feature lines (eyelids, pupils, glasses rims, nostrils, cat ears, tabby forehead stripes, philtrum/mouth, whiskers over painted cheek fur, and hair curls).

---

## 3. Critique Points Rejected and Why

1. **Rejected: Adding dry-brush texture via `_lt` (`--layertexture 1`) for fur/hair**:
   - While VLM judges asked for finer fur/hair texture, enabling `_lt` on `subject: "mittens"` in `light-to-dark.mjs` does not trigger dry-brush texture (`texture` is `false` for non-portrait/non-Trumbull subjects); it instead creates a per-region Band 3 wash pass that fragments midtones into posterized islands. Instead, we achieve fine hair curls, ear tufts, tabby stripes, and whiskers through the surviving `sepia-sketch` closing pen pass (`_ink4_sep4_dwg150`) and edge wobble (`_ew4`) + edge fade (`_efade`).
2. **Rejected: Drawing dark sepia ink lines directly across the white paper reserve pads of the cat's muzzle**:
   - The target's whiskers over the white muzzle pad are white-on-light; drawing dark sepia ink across bare white paper reserves both violates `selectValueInk` (`!protectedCount`) and looks like dark scratches on white fur. Instead, our whisker arcs are placed over the adjacent painted warm cheek fur (`x = 72..108` on the left, `x = 164..201` on the right) where they read naturally and pass `selectValueInk`.
