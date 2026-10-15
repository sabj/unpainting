# Painting Plan — `France` (`south-france`, Round V5, Try 2)

## 1. Visual Analysis & Style Strategy (`urban-sketch` with Full 5-Band Light-to-Dark Progression)

The reference image ([target.png](file:///private/tmp/unpaint-bench-81eCJl/ws/bench/plan/target.png), `304×249` px rendered at `1216×996` px on a `280 mm` sheet, `0.2303 mm/cell`) depicts a sunlit Provençal hillside village in southern France:
- **Ground & Light Key**: A warm sunlit cream/ivory limestone ground (`paperRGB ≈ [252, 244, 198]`), with bright unwashed/pale-washed stone terrace paths (`x: 0.03–0.38, y: 0.05–0.46`), sunlit house gables (`x: 0.44–0.47, y: 0.06–0.12`), and sunlit lower-right stone terrace walls (`x: 0.88–0.94, y: 0.53–0.59`).
- **Architecture & Verticals**: On the right hillside (`x: 0.62–0.97, y: 0.30–0.82`) and upper ridge (`x: 0.34–0.92, y: 0.01–0.30`), clustered limestone houses, a square stone tower, pitched terracotta roofs, dark eaves, and small rectangular window openings sit among tall dark cypress spires (`x: 0.23–0.88, y: 0.01–0.38`).
- **Foliage & Foreground**: Layered olive-green, sunlit yellow-green, and cool-umber foliage canopies step down the hillside terraces, anchored in the lower-left foreground (`x: 0.12–0.45, y: 0.55–0.99`) by an expressive branching tree trunk and limb armature.

### Style Configuration (`config.json`)
- Top-level `styleSelection.style` is `"urban-sketch"`, which sets the sheet's drawing material profile to waterproof **`black-ink`** (`K = [0.62, 0.62, 0.62]`, `widthMm = [0.10, 0.40]`, `concentration = 4`) with `VALUE_PLAN.style.ink = 0.9`.
- All six region families (`olive_mid_canopy`, `sunlit_crown_greens`, `cypress_and_eave_darks`, `village_walls_and_roofs`, `shaded_hillside_foliage`, `warm_terrace_slopes`) set `style: "precise-watercolor"`. In [`light-to-dark.mjs`](file:///private/tmp/unpaint-bench-81eCJl/ws/src/paint/methods/light-to-dark.mjs#L215-L246), this makes `identity === true` and `styleNames.length === 1` (`['precise-watercolor']`), which simultaneously:
  1. Unlocks the full 5-band light-to-dark wash progression (`light/b1`, `mid/b2L0`, `mid/b2L1`, `shadow/b4`, `shadow/b5`) instead of collapsing midtones to zero as the raw `urban-sketch` profile (`light: 0.42, mid: [0, 0], shadow: [0.58, 0]`) did in Try 1.
  2. Activates `choosePassageBrush` (`region_w15` / `--brushchoice 1`, [`passage-brush.mjs`](file:///private/tmp/unpaint-bench-81eCJl/ws/src/paint/methods/passage-brush.mjs)) on every shape, replacing the `p.r = 500 px` single-gesture mop flood that caused reservoir starvation in Try 1.
  3. Keeps `shadow/b4` and `shadow/b5` unified across the entire sheet (`domains = [0]`), so shadow glazes are never split along region boundaries.

---

## 2. Palette & Pigments

The painter's wash palette fitted from `target.png` (`--palettewide 1 --skyblue 1 --skyfloc 0.5`) on the warm source paper (`[252, 244, 198]`), plus the separate drawing ink channels:
1. **`sap green`**: Primary olive-green and sunlit hillside foliage across the canopy and middle terraces.
2. **`quinacridone rose`**: Warm terracotta roof tiles, sunlit limestone masonry warmth, and mixed earth/shadow glazes (combining with `hansa yellow` and `French ultramarine`).
3. **`French ultramarine`**: Cool atmospheric distance on the upper-right horizon, cool stone shadows, and deep blue-green/umber shadow glazes when mixed with `sap green` and `quinacridone rose`.
4. **`hansa yellow`**: Bright sunlit yellow-green tree crowns, warm limestone facades, and sunlit terrace grass.
5. **`French ultramarine, granulating, for the sky`** (`--skyblue 1 --skyfloc 0.5`): Granulating cool blue accent tube for upper-horizon sky/distance passages.
6. **`black ink`** (`K = [0.62, 0.62, 0.62]`, waterproof) & **`graphite HB`**: Structural opening pen sketch (`385` lines) and crisp closing dark accents (`460` lines) over the dried washes.

---

## 3. Reserved Lights (`protectedCells`)

- **Relative Paper Lights (`_relonly` / `--paperrel 1 --paperbase source --paperlights 0`)**: Reads the top 10% brightest cells of the warm cream sheet (`PAP ≈ [252, 244, 198]`) and reserves connected highlights within `9/9/12` RGB channels of paper (`>= 450` cells via `_ms450`), preserving the sunlit upper-left terrace meadows and stone paths (`~7.4%` of the sheet) without hard rectangular holes.
- **Explicit Reserves (`config.json` `reserves`)**: Four small, high-value architectural and terrace glints:
  1. `[0.105, 0.255, 0.145, 0.295]`: Sunlit upper-left limestone terrace wall highlight.
  2. `[0.315, 0.395, 0.350, 0.430]`: Sunlit central stone terrace wall and path highlight below the village.
  3. `[0.440, 0.068, 0.464, 0.112]`: Sunlit upper village house gable and roof edge highlight.
  4. `[0.892, 0.542, 0.928, 0.578]`: Sunlit lower-right stone terrace wall highlight.

---

## 4. Pass Order, Brushes & Techniques

Variant: `region_w15_relonly_lay2_ls50_ms450_spl9_sml220_lf_dk11_opp95_tp1`
Extra args: `["--drawstroke", "0.35", "--openingminmm", "2.5", "--closingpressure", "0.95", "--closingedgemin", "0.02", "--touchdmin", "0.08", "--touchfamilies", "12"]`

1. **Stage 0 — Masking & Opening Pen Drawing (`opening-lines.json`, 385 lines, `black-ink`)**:
   - Masking fluid seals `protectedCells`.
   - The opening pen draws **385 structural lines** (`100%` survival through `selectValueInk` and `prepareDrawing`) at `--openingpressure 0.95` (`_opp95`) and `--openingminmm 2.5`: village roofs, eaves, tower corners, facade walls, windows, terrace walls, cypress spires, upper ridge contours, and the foreground branching tree trunk.
   - Paper is dried completely before washes begin.
2. **Band 1 — Foundation Light Washes (`light/b1`, Passes 1–14, 314 shapes, 544 strokes)**:
   - Wet-on-dry pale foundation washes (`yellow ochre`, `viridian`, `raw umber`, `burnt sienna`) across the 6 regions.
   - Coherent broad passages (`supportMm >= 9 mm`) use `planLanes` (`_spl9_sml220`: `9 mm` overlapping lanes, max `220 mm` stroke length, per-stroke graded `factors`), while smaller/narrower passages use `choosePassageBrush` (`mop`, `flat1in`, `round12`, `round8`, `round4` with `p.r <= 82.5 px`) and feathered reloads (`_lf` / `--loadfeather 1.5`).
3. **Band 2 Layer 0 — Broad Middle Planes (`mid/b2L0`, Passes 15–28, 284 shapes, 443 strokes)**:
   - First nested middle layer (`_lay2`, `--layersmooth 5.0` via `_ls50`), establishing the mid-value olive canopy masses, warm ochre-sienna village facades/roofs, and shaded terrace slopes on dry paper.
4. **Band 2 Layer 1 — Deeper Middle Planes (`mid/b2L1`, Passes 29–42, 187 shapes, 452 strokes)**:
   - Second nested middle layer (`_lay2`) over the darker core of the middle values (`v > 0.32`), modeling tree crown volume, hillside folds, and architectural shadow sides without jumping straight from pale wash to black shadow.
5. **Band 4 & Band 5 — Unified Shadow Glazes (`shadow/b4` Passes 43–46, 174 shapes, 201 strokes; `shadow/b5` Passes 47–50, 174 shapes, 201 strokes)**:
   - Two dried shadow glaze bands (`--darkgain 1.1` via `_dk11`, down from `1.4` in Try 1) across the unified shadow mask (`shadowThresh = 0.38`), laying transparent deep olive-umber-sienna darks into cypress spires, under-canopy shadows, eave overhangs, and foreground tree limbs.
   - Masking film is lifted after the last dry shadow pass.
6. **Touchpoints (`_tp1`, `--touchdmin 0.08 --touchfamilies 12`)**:
   - A single restrained touch-up pass (at most 12 shapes with density deficit `>= 0.08`) to reinforce any under-delivered dark or mid-tone passage without late stroke bloat.
7. **Closing Pen Drawing (`closing-lines.json`, 460 lines, `black-ink`)**:
   - Drawn over the dry finished washes at `--closingpressure 0.95` and `--closingedgemin 0.02`.
   - Every single line (`460 / 460`, `100%` survival) is snapped to unprotected `1216×996` contrast ridges where mean 4-neighbor value contrast `>= 0.064`, restoring crisp architectural eaves, roof ridges, window openings, cypress spire darks, and foreground branch/trunk crevices.

---

## 5. V5 Changes from Try 1 & Critique Resolution

### What Changed from Try 1 and Why
1. **Eliminated the Diagonal Unpainted Strip (`y ≈ 460 - 0.56*(x - 200)`) and Reservoir Starvation**:
   - *Root cause in Try 1*: Try 1 used `region_w13` without `_spl` or `region_w15` (`choosePassageBrush`), and left region styles as `urban-sketch`. Every large wash shape (`882×965 px`) was emitted as a **single 11-vertex polyline** with a virtual brush radius `p.r = 500 px` (`230 mm` wide!), while the physical brush was capped at `BRUSH = 76 px`. The single brush dip (`waterMass = 1756`) depleted to `0` after vertex 5 (`55%` of the sweep), leaving a diagonal bare-paper trough right across the upper-center hillside (`x: 200–650, y: 150–450`).
   - *Fix in Try 2*: Mapped all 6 region styles to `"precise-watercolor"` under top-level `"urban-sketch"`, enabled `region_w15` (`--brushchoice 1`), and added `_spl9_sml220_lf` (`9 mm` lanes, `220 mm` max stroke length, `1.5×r` feathered reload overlap). Every wash stroke now uses a physical brush (`p.r <= 82.5 px`) and its own dip (`1,841` strokes across `1,133` shapes), completely eliminating reservoir starvation.
2. **Restored Missing Mid-Value Foliage and Architectural Planes (`mid/b2L0` and `mid/b2L1`)**:
   - *Root cause in Try 1*: Because `styles.json` defines `urban-sketch` with `mid: [0, 0]` and `shadow: [0.58, 0]`, Try 1 had **zero middle-band passes** (`mid/b2L0 = 0`, `mid/b2L1 = 0`, `shadow/b5 = 0`), jumping directly from a sparse `0.42`-weight foundation wash to a `1.4×` dark shadow glaze.
   - *Fix in Try 2*: Setting `regions[*].style = "precise-watercolor"` with `_lay2_ls50_ms450` restores **28 mid-value passes** (`471` shapes, `895` strokes across `mid/b2L0` and `mid/b2L1`), bridging the sunlit ground and the deep shadows with rich olive, yellow-green, ochre, and terracotta middle planes.
3. **Fixed the 98.8% Drop Rate on `closing-lines.json` (`3 / 261` -> `460 / 460` Survival) and Weak `0.30` Opening Ink**:
   - *Root cause in Try 1*: `selectValueInk(first=false)` in `light-to-dark.mjs` filters closing lines at the `4×` upscaled `1216×996` resolution using `contrast / count >= 0.06` (mean 4-neighbor difference of `values`), and drops any line touching `protectedCells`. Because `304×249` upscaled `4×` divides 1-pixel gradients by `~4`, `258` of `261` closing lines in Try 1 were silently discarded! Furthermore, `prepareDrawing` capped opening pressure at `0.30` and closing pressure at `0.40` while clipping closing vertices with `TARGET_DRAW_EDGE < 0.22`.
   - *Fix in Try 2*: Generated `opening-lines.json` (`385` lines) and `closing-lines.json` (`460` lines) directly against the exact `1216×996` `values`, `protectedCells`, and `mean4` contrast grids so `100%` (`385/385` and `460/460`) pass `selectValueInk` and `prepareDrawing`. Added `_opp95` (`--openingpressure 0.95`) and `--closingpressure 0.95`, `--closingedgemin 0.02`, `--drawstroke 0.35`, `--openingminmm 2.5`.
4. **Reduced Over-Concentrated Shadow Pooling and Late Touch-Up Bloat**:
   - Replaced `_dk14` (`1.4×`) with `_dk11` (`1.1×`) now that `mid/b2L0..L1` carry the middle tonal mass, and reduced `_tp2` (`40` families, `1,578` strokes) to `_tp1` with `--touchfamilies 12 --touchdmin 0.08`.

### Critique Points Rejected / Modified
- **Rejected `_lad` (`--laneadapt 1`)**: `bench/FEEDBACK.md` suggested `_spl6_lad_sml220` (`--laneadapt 1`). When we inspected `src/paint/methods/stroke-plan.mjs` and tested `_lad` via `bench/check.sh`, we found that `--laneadapt 1` sets `laneHere = min(laneMm, max(2, supportMm * 0.9))`. On porous olive foliage masks where `supportMm = 2.5–4.5 mm`, `_lad` shrinks the lane width to `2 mm` (`8.6 px`) across `600 px` shapes, exploding the plan to **10,164–13,663 tiny raster strokes**! Omitting `_lad` and instead combining `_spl9_sml220_lf` with `region_w15` (`choosePassageBrush`) keeps the plan at a clean, painterly **1,841 wash strokes** where broad planes are swept in `9 mm` lanes and narrower shapes are painted with matched physical brushes (`mop`, `flat1in`, `round12`, `round8`, `round4`).
