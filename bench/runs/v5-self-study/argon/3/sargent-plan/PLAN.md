# Painting Plan — Round V5, Try 3 of 3 (`Ships` — John Singer Sargent, *White Ships*)

## 1. Reference Cues & Visual Analysis (`bench/plan/target.png`)

The reference (`bench/plan/target.png`, `300 × 244` px, painted at `1200 × 976` px on a `280 mm` wide cold-press watercolor sheet, `0.233 mm/cell`) is John Singer Sargent's 1908 watercolor *White Ships*. Its structure and luminosity depend on five visual cues:

1. **Luminous Sunlit Paper & Warm Cream Timber (`warm_hull_light`)**:
   - The sunlit curves of the central and right white hulls (`x = 0.28..0.85, y = 0.25..0.55`), the diagonal bowsprit and jibboom (`x = 0.34..0.52, y = 0.14..0.38`), and sunlit spar edges are carried by the warm cream watercolor paper (`RGB(221, 215, 199)` / `#ddd7c7`) and delicate pale yellow-ochre foundation washes (`#cec29e`).
2. **Smoothly Graded Cerulean & Lavender-Grey Turning Hull Planes (`cool_hull_plane`)**:
   - The curving shaded belly of the central white hull (`x = 0.28..0.75, y = 0.32..0.72`), the secondary bow (`x = 0.14..0.34, y = 0.35..0.68`), and upper-right rigging shadow planes turn away from the sun in continuous, wet-merged cerulean and ultramarine-lavender washes (`#8fa2af` to `#6c8396`) without hard contour steps or brush-track streaks.
3. **Turquoise-Slate & Sea-Green Harbor Water (`turquoise_water_wash`)**:
   - The lower harbor zone (`y = 0.68..1.00`) interweaves broad horizontal turquoise-slate reflection planes (`#648186`) with warm reflected hull lights.
4. **Saturated Golden-Ochre Timber, Bow Scroll, & Amber Ripples (`golden_ochre_timber`)**:
   - Masts, yards, deckhouse structures, the golden bow scroll garland (`x = 0.36..0.52, y = 0.42..0.55`), and sunlit water ripples (`y = 0.72..0.98`) glow with rich yellow ochre and raw sienna (`#aa8646`).
5. **Transparent Burnt-Sienna & Deep Marine Accents (`sienna_rigging_rust`, `deep_marine_accents`)**:
   - The far-left hull shadow (`x = 0.00..0.16, y = 0.38..0.76`), anchor chains, twin hawseholes (`x = 0.31..0.35` and `x = 0.62..0.74`), stempost cleft (`x = 0.33..0.37, y = 0.36..0.72`), and lower waterline crevices are stated with rich, transparent burnt sienna (`#754d32`) and ultramarine-sepia darks (`#33393e`)—never opaque coal-black blotches with red halos.

---

## 2. Regions, Painting Order, and Technique (`bench/plan/config.json`)

- **Style & Medium**: `precise-watercolor`, pure watercolor (`linework: "none"` in `config.json`, `"medium": "none"` and `"lines": []` in `opening-lines.json` and `closing-lines.json`).
- **Six Value-and-Temperature Families (Ordered Light-to-Dark)**:

| Order | Family ID | Swatch / Hex | Base Move | Detail | Role & Technique |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `warm_hull_light` | `#cec29e` `[206, 194, 158]` | `wet on wet` | `none` | Broad wet-in-wet pale yellow-ochre foundation wash across sunlit hull planking, masts, and bowsprit |
| **2** | `cool_hull_plane` | `#8fa2af` `[143, 162, 175]` | `wet on wet` | `light` | Broad turning cerulean/ultramarine shadow washes across the white hulls and upper-right rigging |
| **3** | `turquoise_water_wash` | `#648186` `[100, 129, 134]` | `wet on wet` | `light` | Cool blue-green harbor water washes and reflected light under the bows |
| **4** | `golden_ochre_timber` | `#aa8646` `[170, 134, 70]` | `wet on wet` | `medium` | Saturated yellow-ochre and raw-sienna deck structures, spars, bow scroll ornament, and amber ripples |
| **5** | `sienna_rigging_rust` | `#754d32` `[117, 77, 50]` | `wet on wet` | `high` | Burnt-sienna and mahogany shaded left hull, rust streaks, rigging blocks, and lower waterline |
| **6** | `deep_marine_accents` | `#33393e` `[51, 57, 62]` | `wet on wet` | `high` | Crisp deepest transparent accents for hawseholes, anchors, stempost cleft, and dark water reflections |

- **Why All 6 Families Set `"baseMove": "wet on wet"`**:
  - In `src/paint/methods/light-to-dark.mjs` line 218, `baseMove` is checked **exclusively** for `phase === 'light'` (Band 1) via `const wet = phase === 'light' && touched.every(r => r.baseMove === 'wet on wet')`. In Try 2, because families 4–6 had `"baseMove": "wet on dry"`, any Band 1 foundation shape touching a region assigned to families 4–6 failed `touched.every(...)` and downgraded Band 1 from `wet on wet` (`water: 0.88, wetMix: 0.85, intoWet: true`) to `wet on dry` (`water: 0.62, wetMix: 0.30`). Setting `"baseMove": "wet on wet"` across all 6 families ensures every Band 1 foundation wash genuinely executes wet-in-wet, while Bands 2–3 (`phase === 'mid'`) and Bands 4–5 (`phase === 'shadow'`) automatically execute `wet on dry` / `glazed` per line 221.

---

## 3. Moisture, Brush Load, and Stroke Mechanics

To eliminate the diagonal rows of 8–15 px pale oval dots / corduroy brush tracks that hurt `marks texture` (`3.33/10`) in Try 2, we coordinate brush geometry, moisture, and bristle physics:

1. **Overlapping 6 mm Wet Sky Lanes on Large Cool Planes (Removed `_noslane`)**:
   - In `light-to-dark.mjs` line 244, large cool planes (`> 1.5%` of canvas with `blue > red + 10`) are intentionally deferred by `planLanes` to `skyLanes` (`--skylanes 1 --skylanemm 6 --skylanestep .8` in the base template). In Try 2, `_noslane` disabled `skyLanes`, forcing `shapedPlanePaths` to sweep 400-px-wide blue hull and water washes with a single `r ≈ 200` px flat brush along one diagonal axis. Removing `_noslane` restores overlapping 6 mm horizontal wet lanes (`step = 0.8 * r`) across large cool planes.
2. **8 mm Pre-Wetted Lane Planning on Broad Planes (`_spl8_lf`)**:
   - Adding `_spl8` (`--strokeplan 1 --lanemm 8`) and `_lf` (`--loadfeather 1.5`) decomposes broad passages (`supportMm >= 8 mm`, `area >= 528` cells) into pre-wetted (`--splwet 1`), feathered 8 mm brush lanes with per-stroke target-graded charge factors (`[0.45, 1.80]`), while allowing narrower spars, rigging, and ripples (`< 8 mm` wide) to retain a single clean fitted gesture.
3. **Full-Cadence Wet Contact Without Clump-Wander Holes (`--washfree 0.28`, `--washstreak 0.06`, `--fastbodycadence 0`, `_shw55`)**:
   - In `src/media/gpu/stepfull.wgsl` lines 1212–1225 and `src/media/brush.mjs` line 623, each bristle clump `c` oscillates its `wander` every `14` pixels (`streakLength = 14`) by `±brush.streak` (`0.35` default). When `sat < free` (`0.40` default, triggered by Try 2's `_shw40` where `shadowWater = 0.40`), `empty > 0` gates paper contact by `wander`, punching periodic 14-px-spaced pale oval dots along parallel clump tracks.
   - Setting `_shw55` (`--shadowwater 0.55`), `--washfree 0.28`, `--washstreak 0.06`, and `--fastbodycadence 0` keeps `sat` well above `free` (`empty === 0`), reduces clump oscillation from 35% to 6%, and restores `0.7 px` stamp spacing instead of `3.11 px` fast-mode skipping.

---

## 4. Protected Lights & Paper Reservation

- **Organic Pixel-Level Reservation (`"reserves": []`, `--paperlights 1 --paperrel 1 --paperdelta 6`)**:
  - We keep `"reserves": []` in `config.json` so no axis-aligned bounding-box cutouts (`reserveBoxes`) clip straight edges into washes.
  - Adding `"--paperdelta", "6"` in `extra-args.json` tightens the paper-white tolerance around `--paperrgb 221,215,199` from `10` to `6`, holding the true brightest sunlit hull strakes and bowsprit glints as clean paper while allowing warm cream-ochre light washes to cover pale timber planes (`Try 2` was slightly too bright overall at `157.9` mean RGB vs target `152.7`).
  - `_efade` (`--edgefade 1.2`) ramps shadow weight smoothly over `1.2 mm` near light boundaries.

---

## 5. Edges & Form Transitions

To eliminate the posterized / stepped contour rings on the central white hull (`edges detail: 4.00/10` in Try 2):

1. **Remove `--shaperefit 3` and Restrict Late `touchCorrections` (`--touchdmin 0.18 --touchgain 0.20 --touchsmoothmm 3`)**:
   - Per-shape Kubelka-Munk pigment refitting (`--shaperefit 3`) pulled each discrete wash shape toward its own isolated mean RGB, creating visible chromatic steps at layer boundaries. Removing it lets overlapping transparent glazes mix optically on the sheet.
   - Crucially, `previous-checkpoints.jsonl` revealed that in Try 2, `_tp1` (`touchCorrections`, `paint-plate.mjs` lines 2268 & 2492–2508) added **1,122 strokes** (`3,548 -> 4,670`, 24% of all strokes!) at Passes 46–49 over 24-family color-quantized `planningShapes` (`smooth = 1 mm`) with `touchgain = 0.6` and **zero edge softening** (`sh._valuePlan` is `undefined` on `TP_SHAPES`, so `softBoundaryPaths` is bypassed!). That late pass stamped unsoftened posterized patches over the central white hull AND compressed Bands 1–5 into the first 75% of strokes.
   - By adding `"--touchdmin", "0.18", "--touchgain", "0.20", "--touchsmoothmm", "3"`, only genuine deep-deficit shapes (`optical density deficit >= 0.18`, smoothed at `3 mm`) receive a gentle `20%` corrective glaze, leaving the delicate white-hull midtone transitions untouched.
2. **Three Smooth Value-Quantile Midtone Layers (`_onedom_lay3_ls30`)**:
   - `_onedom` (`--middomain 0`) prevents midtone washes from splitting along k-means region cluster seams.
   - `_lay3` (`--midlayers 3`) builds midtones in three progressive value quantiles (`0%, 30%, 55%`) instead of two (`0%, 30%`).
   - `_ls30` (`--layersmooth 3.0`) smooths the quantile field over a `3.0 mm` (`~13 px`) box filter instead of `1.0 mm` (`_ls10`), eliminating jagged nested contour islands.
3. **Extended Physical Turning-Edge Softening (`_softs`, `--softarcs 16 --softarclen 120 --softmm 1.1`)**:
   - In Try 2, default `softarcs = 1, softarclen = 16, softmm = 0.35` only softened a single 16-px arc per passage and skipped any arc touching a hard edge.
   - Enabling `_softs` (`--softsplit 1`) splits soft turning-edge chains around hard boundaries so they are never skipped, while `--softarcs 16 --softarclen 120 --softmm 1.1` runs a `1.1 mm` clean damp brush along up to 16 soft turning edges (up to 120 cells each) per shape.

---

## 6. Values, Palette, and Dark Accents

- **Remove `_dp60_dg2` and Balance Gains (`_dk11_mg11_st32_cg12`)**:
  - In Try 2, `_dp60_dg2` (`--deepaccent 60 --deepgrow 2`) zeroed `weights[1]` and `weights[2]` on dark cells (`max(rgb) < 60` grown by 2 px) and set `weights[3] = weights[4] = 0.75`, which multiplied by `_dk14` (`1.4`) gave `2.1×` pigment demand. Separate per-pigment connected components on those small islands caused warm sienna/rose to halo 2 px outside the ultramarine core while crushing the interior to `[18, 22, 20]` coal-black (`overworked or muddied darks (2)`).
  - Removing `_dp60_dg2` and setting `_dk11` (`--darkgain 1.1`), `_mg11` (`--midgain 1.1`), `_st32` (`--shadowthresh 0.32`), and `_cg12` (`--coolgain 1.2`) keeps hawseholes, anchors, and hull shadows luminous, transparent, and chromatically registered while bringing overall canvas value into agreement with the target (`~152.7` mean RGB).

---

## 7. Progression Plan & Inspection Stops (`bench/paint.sh`)

- **Why Progression (`2.3/5` in Try 2) Improves**:
  - In Try 2, `_tp1` (`touchdmin = 0.04, touchgain = 0.60`) dumped `1,122` strokes (`24%` of all `4,670` strokes) in Passes 46–49 after Band 5 was already complete at Pass 44 (`3,548 / 4,670 = 76%`), making the `75%` and `100%` progression frames nearly identical, while single-stroke broad washes in Band 1 compressed `10%`.
  - With `_spl8`, `--skylanes 1`, `_lay3`, and `--touchdmin 0.18 --touchgain 0.20`, broad early washes in Band 1 and Band 2 `L0/L1/L2` execute as multi-lane brush passages across warm, cool, and turquoise-green hue groups (`_sky3`), and the `10%, 25%, 50%, 75%, 100%` checkpoints sample Band 1 (`10%`), Band 2 `L0` (`25%`), Band 2 `L1` (`50%`), Band 2 `L2` (`75%`), and Bands 4–5 (`100%`) in true light-to-dark order.
- **Planned Inspection Stops & Failure Signs**:
  - Stop 1 (after Band 1, Pass 12): Verify warm cream-ochre lights and first cool washes are wet-merged and free of parallel dot tracks, and that sunlit hull highlights remain clean paper.
  - Stop 2 (after Band 2 `L2` midtones, Pass 48): Verify smooth turning gradations across the central white hull (`x = 0.35..0.65, y = 0.35..0.68`) with no posterized contour steps.
  - Stop 3 (after Bands 4–5 shadows and finish, Pass 56+): Verify hawseholes, left hull shadow, and lower water darks are rich and transparent without coal-black crush or red halos.

---

## 8. Summary of Changes from Try 2 to Try 3

| Try 2 Defect & Judge Feedback | Root Cause in Try 2 | Exact Fix in Try 3 |
| :--- | :--- | :--- |
| **Diagonal rows of 8–15 px pale oval dots in blue washes** (`marks texture: 3.33`, `spots, blotches, or clumps (2)`) | `_noslane` disabled `skyLanes` on large cool planes; no `_spl8` lane planning; `_shw40` (`0.40 == brush.free`) triggered `empty > 0` periodic 14-px `wander` gating (`washstreak = 0.35`) at `3.11 px` fast-mode spacing. | Removed `_noslane`; added `_spl8` (`8 mm` lanes on broad shapes); changed `_shw40` to `_shw55`; added `--washfree 0.28`, `--washstreak 0.06`, `--fastbodycadence 0`. |
| **Posterized / stepped central hull transition** (`edges detail: 4.00`, `posterized or stepped value transitions (2)`) | `--shaperefit 3` isolated per-shape color; `_tp1` (`touchdmin=0.04, touchgain=0.6`) glazed 1,122 unsoftened strokes over 24-family color-quantized `planningShapes`; 2-layer mid split (`_lay2_ls10`); default `softarcs=1, softarclen=16, softmm=0.35`. | Removed `--shaperefit 3`; added `_onedom_lay3_ls30_softs`, `--softarcs 16 --softarclen 120 --softmm 1.1`, and `--touchdmin 0.18 --touchgain 0.20 --touchsmoothmm 3`. |
| **Coal-black crushed blotches with red fringes** (`composition values: 6.33`, `overworked or muddied darks (2)`) | `_dp60_dg2` zeroed midtones on `max(rgb)<60` (+2 px dilation) and forced `1.5× * 1.4 = 2.1×` shadow demand with mismatched per-pigment island silhouettes. | Removed `_dp60_dg2`; lowered `_dk14` to `_dk11`; set `_st32`. |
| **Band 1 downgraded to wet-on-dry & uneven progression (`2.3/5`)** | Families 4–6 had `baseMove: "wet on dry"`, causing `touched.every(...)` in `light-to-dark.mjs:218` to fail on Band 1; `_tp1` took 24% of all strokes at the very end (`76% -> 100%`). | Set `baseMove: "wet on wet"` on all 6 families in `config.json`; `_spl8` + `skyLanes` + `_lay3` + `--touchdmin 0.18` balance strokes across all 5 bands; `--paperdelta 6`. |

---

## 9. Critique Points Disagreed With and Rejected

1. **Rejected: "pencil or pen outlines where none belong (1)"**:
   - Both the reference and our plan use strictly zero ink or pencil lines (`linework: "none"`, empty `opening-lines.json` and `closing-lines.json`). What one judge read as outlines were the sharp unsoftened boundaries of `--shaperefit 3` midtone shapes and the red-fringed `_dp60_dg2` dark islands. Fixing edge softening (`_softs`, `--softmm 1.1`) and removing `--shaperefit 3` and `_dp60_dg2` resolves this without changing our pure-watercolor medium choice.
2. **Rejected: Switching away from `precise-watercolor` (`region_w13`)**:
   - `precise-watercolor` is the identity profile in `light-to-dark.mjs`, allowing our explicit 3-layer smoothed midtones (`_lay3_ls30`), 6 mm adaptive stroke planning (`_spl6_lad`), and wet foundation washes (`baseMove: "wet on wet"`) to operate directly without a style profile overwriting band weights (`chosen.weights[band] * chosen.paintStrength`) or zeroing non-shadow glazes.
