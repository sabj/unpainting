# Painting Plan: Trumbull College (`Y1`)

## 1. Subject & Composition Analysis
The target image (`bench/plan/target.png`, 300×263 px, rendered at 1200×1052 px on a 280 mm cold-press sheet) depicts the sunlit Collegiate Gothic stone architecture of Trumbull College:
- **Sky & Cloud Bank (`Y1.sky`, `[0.00, 0.00, 1.00, 0.42]`)**: Clear cobalt/French ultramarine sky across the upper frame (`--skyblue 1 --skyfloc 0.5 --skylanes 1 --skylanemm 6 --skylanestep 0.8`), grading into bright paper-white cumulus clouds behind the right gable (`[0.78, 0.15, 0.83, 0.20]`) and above the left roof slope.
- **Central Sunlit Gable (`Y1.sun-main-gable`, `[0.18, 0.14, 0.62, 0.88]`)**: Warm yellow-ochre and raw-sienna ashlar masonry facade catching direct sunlight, punctuated by pointed Gothic window openings, carved stone stringcourses, and a small sunlit medallion under the gable peak.
- **Left Return Wall & Chimney (`Y1.cool-main-return`, `[0.00, 0.14, 0.24, 0.85]`)**: Oblique stone return plane and tall left chimney stack in cooler neutral-warm stone values.
- **Slate Roofs & Dormers (`Y1.slate-roofs`, `[0.12, 0.10, 0.96, 0.52]`)**: Steep blue-grey slate roof planes and chimney caps bridging the left chimney, central gable, and right wing.
- **Right Wing & Chimney (`Y1.right-wing-and-chimney`, `[0.58, 0.20, 1.00, 0.88]`)**: Sunlit warm masonry wing and right chimney stack on the right third of the composition.
- **Sunlit Deciduous Tree (`Y1.foliage-trees`, `[0.50, 0.60, 0.86, 0.90]`)**: Bright hansa-yellow / sap-green tree crown in front of the lower connecting wall, refitted per connected foliage mass (`--foliagerefit 1`).
- **Left Foliage & Street Furniture (`Y1.left-foliage-and-sign`, `[0.00, 0.48, 0.26, 0.92]`)**: Deep shadowed green foliage at left with the blue street sign, traffic light, and dark blue lamp-post banner.
- **Foreground Sidewalk (`Y1.opening-sidewalk`, `[0.00, 0.84, 1.00, 1.00]`)**: Pale sunlit pavement at the base of the frame with cast shadow and small pedestrian figures.

## 2. Style, Palette, and Recipe (`region_w13`)
- **Primary Style**: `precise-watercolor` across the entire plate (`regions: {}`) so that architectural edges remain crisp, the 4-layer midtone masonry progression runs cleanly, and no artificial region-style boundary seams are introduced into band 1.
- **Subject Configuration**: `"subject": "Y1"` activates per-component stone mixture fitting (`shapeStoneDemand`), automatic recess detection (`isRecess`) with clean holdouts (`_rcl`, `_rec2x`), and the 55% French ultramarine + 45% raw sienna violet shadow glaze (`_vio`, `_shs`).
- **Palette (`_pgreen` + `_sep8`)**: Yellow ochre, raw sienna, hansa yellow, French ultramarine, cerulean blue, sap green, and strong sepia ink (`--inkk .396,.481,.619 --inkkscale 8`).
- **Stone Course Modulation**: Irregular ashlar block modulation (`_blk60_bmm40_bka20_birr`) gives the Gothic masonry courses subtle block-to-block value variation without hard outlining every stone.

## 3. Paper Reserves
- Automatic paper-relative light detection (`--paperrel 1 --paperlights 1 --paperrgb auto`) preserves the organic silhouettes of the upper-right and upper-left white clouds, sunlit sidewalk highlights, and bright architectural trim.
- An explicit reserve (`Y1.cloud-bright-core`, `[0.78, 0.15, 0.83, 0.20]`) guarantees untouched paper white in the brightest cumulus cloud core above the right gable.

## 4. Light-to-Dark Pass Order
1. **Opening Ink (`bench/plan/opening-lines.json`)**: Light sepia structural pen lines traced from `target.png` (`trace-ink.mjs`, 186 spans) to register roof pitches, gable edges, stringcourses, and window arches before wetting the sheet.
2. **Band 1 — First Light Washes**:
   - Sky wash (`_sky3`, `_skyb`) laid in horizontal lanes across the upper dome while holding out the cloud reserves and building silhouette.
   - Pale warm ochre/raw-sienna ground washes across the sunlit masonry planes and foreground sidewalk, holding out deep window recesses (`_rcl`).
3. **Band 2 (×4 Mid-layers, `_lay4`) — Progressive Masonry, Roof, and Foliage Massing**:
   - Four progressive wet-on-dry midtone passes building the warm stone facade, cooler slate roofs, and hansa/ultramarine/ochre foliage masses (`_leaf`), with irregular ashlar block modulation (`_blk60_bmm40_bka20_birr`).
4. **Band 3 — Dry-Brush & Masonry Texture**:
   - Controlled cold-press paper-tooth texture (`_cpp`, `_tv8`, `_tp2`) across stone and foliage mid-darks.
5. **Band 4 — Cast Shadows & First Recess Pass**:
   - Transparent ultramarine + raw sienna violet shadow glaze (`_vio`, `_shs`) across eaves, dormers, and cast shadow planes.
   - First pass of deep architectural recesses (`_rec2x`, 75% share) into Gothic arched windows and doorways.
6. **Band 5 — Deepest Accents & Second Recess Pass**:
   - Final dark accents (`_dk13`) and second recess pass inside the darkest window openings, banner, and lower-left foliage shadow cores.
7. **Closing Ink (`bench/plan/closingink4-lines.json` & `bench/plan/closing-lines.json`)**:
   - Filtered crisp sepia ink accents (`closing-ink.mjs`, 143 high-contrast structural spans, `_ink4`, `_dwg200`) to restore Mullions, cornice edges, gable profiles, and street-level verticals over the dried washes.
