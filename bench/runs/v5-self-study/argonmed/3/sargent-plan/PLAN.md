# Painting Plan: Sargent's *White Ships* (Bow & Anchor Detail) — V5 Try 3

## 1. Reference Cues & Material Character
The target (`bench/plan/target.png`, 300×244 px rendered at 1200×976 px on a 280mm cold-pressed watercolor sheet) is a close-up study from John Singer Sargent's *White Ships* (1908).
- **Medium**: Pure transparent watercolor on warm cream paper (`--paperrgb 221,215,199`, matching the sunlit upper-left hull light at `L≈86`). **No ink lines** (`opening-lines.json` and `closing-lines.json` have `medium: "none"`, `lines: []`).
- **Palette (6 pigments, cool-first ordering)**:
  `--paints cerulean,ultramarine,sapgreen,ochre,sienna,rose`
  Adding `rose` (quinacridone rose) to our 5-pigment Try 2 palette cuts the sheet+local ΔE color error in half (from `5.24` down to `2.43`):
  1. **Cool/Neutral Marine Greys (`h 155–257`, `C 5–18`)**: Balanced triads of `ultramarine + sienna + rose` and `cerulean + ochre` achieve neutral slate and lavender-grey hull shadows (`ΔE 0.6`) instead of Try 2's muddy olive-green drift (`ΔE 4.0`).
  2. **Warm Orange Rust & Chain Highlights (`h 53–68`, `C 27–31`)**: `ochre + sienna + rose` reaches saturated warm orange-ochre (`ΔE 0.9` vs Try 2's `3.1`) for the anchor chain links and lower-right rust accents.
  3. **Ordering rationale**: Because `planLightToDark` iterates `pigment = 0..5` inside each value band, placing `cerulean, ultramarine, sapgreen` before `ochre, sienna, rose` ensures every value band lays its broad cool architectural and marine washes *before* its warm structural/rust/rigging accents.

---

## 2. Region-by-Region Technique & Order (`30 passes + 1 restrained touch-up`)

We use `--method light-to-dark` with `--midlayers 0 --nestedmid 1 --middomain 0 --layerhue 0` (`_lay0_nest_onedom` + `--layerhue 0` + `--skywide 1`) and `--strokeplan 1 --lanemm 5 --laneadapt 1 --washreach 1.0 --loadfeather 1.5` (`_spl5_lad_wre10_lf`). This eliminates whole-sheet quantile curtains and constructs the painting in **5 clear structural value bands** (6 pigments per band = 30 passes):

### Band 1 (Passes 1–6): Pale Sunlit Glazes (`v ∈ (0.04, 0.22]`, 12 broad shapes)
- **Regions**: Soft ambient cool water glaze across the lower wake (`cerulean`, `ultramarine`, `sapgreen`) and pale warm sunlight wash along the upper-left white hull and right-hand adjacent ship hull (`ochre`, `sienna`, `rose`).
- **Technique**: Wet-on-dry / damp broad 5mm lane strokes (`--washreach 1.0`) that establish the warm cream-to-ochre hull glow while leaving the brightest white rail, hawsepipe rim, and sunlit deck house roof untouched paper (`v <= 0.04`).

### Band 2 (Passes 7–12): Broad Mother Washes (`v > 0.16`, capped at `0.32` density via `--nestedmid 1`, 33 large shapes)
- **Regions**:
  - **Central Blue-Grey Ship Bow (`f1_bow_bluegrey_wash`)**: Painted first in Band 2 (Passes 7–9: `cerulean`, `ultramarine`, `sapgreen`) as a **single unified diagonal sweep** across the entire bow face (`--skywide 1`, `--middomain 0`, `--layerhue 0`). Because `--nestedmid 1` caps Band 2's share at `min(1, 0.32/v)`, this pass lays the continuous lighter-mid blue mother wash (`L≈58–65`) across both left and right halves of the bow *underneath* the darker anchor and fold details.
  - **Lower Marine Water & Hull Base (`f2_lower_dark_hull_water`, `f4_warm_ochre_rigging_hulls`)**: Broad cool green-slate water wash at the bottom and warm ochre/sienna base tones along the right-hand hull and left dark hull base (Passes 9–12).
- **Stage 10% / 25% Checkpoint Appearance**: By the end of Band 2 (Pass 12), the canvas shows big, sweeping, recognizable blocking washes—pale sunlit hulls, a unified blue-grey bow plane, and a broad marine base—with **no** pre-drawn dark outlines, rigging, or anchor cutouts.

### Band 3 (Passes 13–18): Nested Darker-Mid Modeling & Structural Planes (`v ∈ (0.32, 0.58]`, 249 shapes)
- **Regions**:
  - **Bow Vertical Folds & Weathering**: Layered wet-on-dry over the dried Band 2 mother wash (`cerulean`, `ultramarine`, `sapgreen` in Passes 13–15), carving the darker slate-blue vertical plating ribs and lower bow turn without splitting the underlying blue wash.
  - **Rigging, Bowsprit, and Right-Hand Hull Planes (`f4_warm_ochre_rigging_hulls`, `f5_crisp_rigging_spars`)**: Warm `ochre`, `sienna`, and `rose` strokes (Passes 16–18) establish the diagonal rigging spars at upper left, the warm brown recesses on the right hull, and the rusty orange glow around the hawsepipe and lower-right chain.

### Band 4 (Passes 19–24): Core Shadows — Anchor Stock, Hawsepipe, and Hull Crevices (`v ∈ (0.58, 0.80]`, 143 shapes)
- **Regions**:
  - **Anchor & Hawsepipe (`f3_anchor_and_hawse_darks`)**: Deep ultramarine + burnt sienna + rose shadow shapes establish the anchor flukes, stock, chain shadow, and elliptical hawsepipe opening right on top of the blue bow wash.
  - **Lower Hull Crevices & Dark Water Reflections (`f2_lower_dark_hull_water`)**: Rich dark green-brown and slate reflections along the bottom waterline and lower-left hull shadow.

### Band 5 (Passes 25–30) & Pass 31: Crisp Focal Accents (`v > 0.80`, 143 shapes + 1 restrained touch-up)
- **Regions**: Sharpest focal darks (`L≈15–22`) in the hawsepipe cavity, under the anchor fluke, in the lower-left hull crevice, and along the upper-left rigging intersections, followed by a single restrained touch-up pass (`_tp1` with `--touchfamilies 8 --touchmincells 0.015 --touchdmin 0.16`) limited to broad under-covered areas rather than tiny speckle dots.

---

## 3. Moisture, Load & Brushwork Physics
- **Wetness (`_w15` = `--wet 1.5`)**: High capillary mobility inside each shape mask so adjacent brush lanes fuse into soft watercolor gradients while granulation (`cerulean` + `ultramarine` via `--skywide 1`) settles naturally into paper tooth hollows.
- **Load & Feathering (`_spl5_lad_wre10_lf`)**:
  - `--strokeplan 1 --lanemm 5 --laneadapt 1 --washreach 1.0`: Replaces flat whole-mask floods with overlapping 5mm brush lanes oriented along each region's principal axis, grading stroke load (`0.45x..1.8x`) by the local target pigment density under each stroke's footprint.
  - `--loadfeather 1.5`: Feathers stroke entry and exit loads so overlapping washes blend without hard lap marks.
- **Moderate Gain Curve (`_rg0_cg11_mg11_dk11`)**:
  - `--recalgain 0 --coolgain 1.1 --midgain 1.1 --darkgain 1.1`: Gently compensates for kubelka-munk glazing subadditivity (`1.1x`) without over-blackening darks or crushing midtones.

---

## 4. Protected Lights
- **Paper Reserve (`--paperrgb 221,215,199`)**: No opaque white paint exists in the simulator; all highlights come from preserving the warm cream sheet (`v <= 0.04` in Band 1):
  1. **Upper-Left Hull Planking & Bulwark (`f0_hull_paper_reserve`)**: Preserved at 85–95% paper brightness (`L≈82–86`), framing the diagonal upper edge of the blue-grey bow.
  2. **Hawsepipe Lip & Anchor Highlight**: A crisp sliver of reserved cream-to-pale-ochre paper wraps the upper-left rim of the hawsepipe and the top edge of the anchor shaft, giving the anchor 3D relief against the blue bow.
  3. **Upper-Center Deckhouse & Right Hull Light**: Clean warm paper reserve separates the dark diagonal rigging lines from the adjacent hull.

---

## 5. Edge Control (`_softs_ew3`)
- **Soft Internal Transitions (`--softapple 1 --edgew 3`)**: Interior transitions within the blue-grey bow wash and across the sunlit cream hull use a 3px feathered edge profile (`--edgew 3`) so washes grade smoothly without contour rings.
- **Sharp Structural Boundaries**: Where high-contrast regions meet—the diagonal upper-left hull edge against the blue bow, the anchor stock against the bow wash, and the upper-left rigging spars against the sky/hull light—the nested Band 3–5 masks preserve crisp wet-on-dry boundaries.

---

## 6. Value Hierarchy
1. **Value 1 (Paper High Light, `L 82–86`)**: Upper-left sunlit hull, deckhouse highlight, hawsepipe rim sliver.
2. **Value 2 (Light Warm/Cool Glazes, `L 68–80`)**: Sunlit ochre-tinted right hull, pale blue-grey upper bow margin, pale green-blue lower-center wake.
3. **Value 3 (Mid-Tone Body Washes, `L 48–66`)**: Central blue-grey ship bow wash (`f1_bow_bluegrey_wash`), warm sienna/ochre midtones on the right hull and rigging spars.
4. **Value 4 (Dark Structural Shadows, `L 26–45`)**: Lower-left dark olive-brown hull base, lower-right rust/chain shadow recess, vertical bow shadow folds.
5. **Value 5 (Deep Focal Accents, `L 14–25`)**: Hawsepipe interior, underside of the anchor stock/flukes, deepest lower-left hull crevice.

---

## 7. Failure Signs & Inspection Checkpoints (`bench/paint.sh look`)
- **Checkpoint 1 — After Band 2 (Pass 12, ~40% of passes / ~15–25% of strokes)**:
  - *Expected*: Unified pale-to-mid washes covering the bow, hulls, and water base. The central bow must be a single cohesive blue-grey wash with **zero** vertical seam down its middle and **zero** circular pinhole cutouts.
  - *Failure Sign*: If the bow shows a left/right split or isolated dark specks appear before Band 3, stop and inspect.
- **Checkpoint 2 — After Band 4 (Pass 24, ~80% of passes)**:
  - *Expected*: Nested darker-mid bow modeling, warm orange-ochre rigging/rust accents, and dark anchor/hawsepipe shadows clearly articulated over the blue bow wash.
  - *Failure Sign*: Over-dark black blotches in the lower-left hull or muddy green-grey shadows.
- **Checkpoint 3 — Final Painting (Pass 31, `finish`)**:
  - *Expected*: Cohesive blue-grey bow with directional brush-lane texture, warm orange-rust chain highlights, balanced neutral-cool shadows, and clean cream hull lights.

---

## 8. V5 Changes from Try 2 & Rejected Critique Points

### What Changed from Try 2 and Why
1. **Eliminated the Central Blue Bow Split & Pinhole Cutouts (`--skywide 1`, `--middomain 0`, `--layerhue 0`, `--noskylane 1`)**:
   - *Root Cause in Try 2*: Three separate mechanisms sliced the central blue bow (`f1_bow_bluegrey_wash`) into disjoint masks:
     - Base `_skyb` (`--skyblue 1`) with default `--skywide 0` split blue pigment at the hard threshold `B - R > 8` (`tools/paint-plate.mjs` line 437), putting the right half of the bow (`B - R > 8`) into the granulating sky-blue pan `js` and the left half (`B - R <= 8`) into `jb`, with complementary circular pinholes at noise pockets. Setting `"--skywide", "1"` in `extra-args.json` makes `isSky(i)` true across the entire canvas so all blue uses a single unified pigment channel.
     - `_hue` (`--layerhue 1`) and default `--middomain 1` split the bow along the k-means boundary between Cluster 1 (`B < R`, `coolGroup = 3`) and Cluster 6 (`B > R`, `coolGroup = 2`). Adding `_onedom` (`--middomain 0`) in `variant.txt` and `"--layerhue", "0"` in `extra-args.json` (while keeping `_hue` in `variant.txt` to strip `--skysplit` from base `_sky3`) keeps the entire bow in one domain.
2. **Replaced Whole-Sheet Quantile Curtains (`_lay2`) with Nested Value Bands (`_lay0_nest_onedom`)**:
   - *Why*: Try 2's `_lay2` (`--midlayers 2`) generated whole-sheet quantile masks `L0` (100% of canvas) and `L1` (70% of canvas), causing every shape on the canvas to fade in simultaneously (scoring `1/5` at 10% and `2/5` at 25% progression). Switching to `_lay0_nest_onedom` (`--midlayers 0 --nestedmid 1 --middomain 0`) paints 33 broad lighter-mid mother washes in Band 2 (`share = min(1, 0.32/v)`) and nests the 249 darker-mid detail shapes inside Band 3 (`v > 0.32`).
3. **Replaced Flat `--shaperefit 3` Fills with Directional Brush Lanes (`_spl5_lad_wre10_lf`)**:
   - *Why*: Try 2 used `--shaperefit 3` without `--strokeplan`, painting each mask as a flat average fill with concentric contour rings (`marks texture: 3/10`). Removing `--shaperefit` and enabling `_spl5_lad_wre10_lf` (`--strokeplan 1 --lanemm 5 --laneadapt 1 --washreach 1.0 --loadfeather 1.5`) paints overlapping 5mm brush lanes along each region's major axis with spatially graded pigment loads.
4. **Added `rose` (`quinacridone rose`) and Re-Ordered `--paints` Cool-First**:
   - *Why*: Adding `rose` to `cerulean,ultramarine,sapgreen,ochre,sienna` cuts palette ΔE from `5.24` to `2.43`, neutralizing the olive-green shadow cast (`color palette: 6.33`) and restoring the warm orange-rust chain accents (`h 63 C 31`). Ordering cool pigments first ensures the blue bow wash precedes warm rigging/rust overlays in every band.
5. **Removed Accidental `_dp85_dg2` (`--deepaccent 85 --deepgrow 2`) and Lowered Gains (`_cg11_mg11_dk11`)**:
   - *Why*: In Try 2, `_dp85_dg2` was misread as darkpunch/darkgain when it actually set `--deepaccent 85 --deepgrow 2` on top of base `_dk13`, multiplying every pixel with `max(R,G,B) < 85` (+2px halo) by `1.95x` density in Bands 4 & 5 and bypassing `_ms1500` down to 12-cell fragments. Removing `_dp85_dg2` and using `_cg11_mg11_dk11` restores translucent darks (`values: 6.33`).
6. **Restrained Touchpoints (`--touchfamilies 8 --touchmincells 0.015 --touchdmin 0.16`)**:
   - *Why*: Try 2's Pass 51 (`_tp1` at default thresholds) dumped 820 tiny remedial strokes (30% of all strokes in the painting) at the end, skewing the 10%/25% progression checkpoints and adding stippled noise. High thresholds restrict `_tp1` to at most a few genuine broad under-covered regions.

### Rejected Critique Points
1. **Rejected: Reducing `config.json` to 3–4 super-coarse families**:
   - The progression judge suggested the 52 passes came from over-segmenting the target into too many regions. In fact, `tools/paint-plate.mjs` does not iterate over `config.json` families (`planLightToDark` depends only on `nBands × nPigments + midlayers`). Our 6 semantic families in `config.json` match the 6 distinct structural motifs of Sargent's composition while `_lay0_nest_onedom` reduces the pass count from 52 to 31.
2. **Rejected: Dropping `--wet` below `1.5` or disabling granulation (`--skyfloc`)**:
   - The finished-painting critique noted blotchy pooling inside the blue bow and darks. However, that pooling was caused by the `B - R > 8` sky-blue split (`--skywide 0`) and the `1.95x` `_dp85_dg2` accent multiplier—not by `--wet 1.5` or granulation. Keeping `_w15` and cerulean/ultramarine granulation across a unified `--skywide 1` wash preserves authentic Sargent watercolor bloom and paper-tooth texture.
