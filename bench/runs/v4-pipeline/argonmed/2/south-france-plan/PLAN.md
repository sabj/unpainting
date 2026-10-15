# Painting Plan — France (`south-france`, Urban Sketch: Pen Plus Light Wash)

## 1. Reference Cues & Visual Structure
- **Subject & Composition**: A sunlit Mediterranean hillside village in southern France (`bench/plan/target.png`, 304×249 px painted at 1216×996 px on a 280 mm wide cold-press sheet). The composition is organized along a sweeping upper-left to lower-right diagonal:
  - **Upper-left terrace (`[0.0, 0.0, 0.42, 0.38]`)**: Sunlit warm stone retaining walls with small dark arched openings, topped by olive scrub and punctuated by upright dark cypress spires (`x ≈ 0.25–0.42`).
  - **Upper-center village ridge (`[0.38, 0.0, 0.85, 0.30]`)**: Clustered stone cottages and terracotta roofs nestled into the upper slope with dark cypress accents.
  - **Upper-right distant valley (`[0.78, 0.0, 1.0, 0.20]`)**: Cool blue-green shaded hillside receding into the distance (`mean RGB ≈ 64, 72, 73`).
  - **Lower-right focal village cluster (`[0.65, 0.32, 0.96, 0.82]`)**: Three prominent stone buildings/towers with warm terracotta roofs, sunlit ochre-buff plaster walls, violet-brown cast eaves shadows, dark window punctures, and a foreground stone wall.
  - **Lower-left foreground deciduous tree (`[0.06, 0.44, 0.52, 0.98]`)**: Radiant hansa yellow-green sunlit crown supported by a dark calligraphic trunk and branching armature (`x ≈ 0.18–0.38, y ≈ 0.58–0.98`).
  - **Central diagonal slopes (`[0.0, 0.15, 1.0, 1.0]`)**: Layered olive and garrigue foliage transitioning from sunlit yellow-greens through mid olive-greens into deep umber-green crevices, threaded by warm stone paths.
- **Palette & Unmixing**: Transparent pans (`hansa yellow`, `yellow ochre`, `quinacridone rose`, `cerulean blue`, plus granulating sky cerulean) and `sepia-ink` (`_sep8`, `--inkk .396,.481,.619 --inkkscale 8`). Adding `yellow ochre` (`--paintsadd ochre`) to the primary triad lowers the global sheet + local colour unmixing error to `3.20` (`<= 1.1` across all 9 local colour clusters), providing natural warm stone buffs (`yellow ochre + quinacridone rose`), terracotta roofs, radiant yellow-green crowns (`hansa yellow + cerulean blue`), and muted olive-umber shadows (`yellow ochre + quinacridone rose + cerulean blue`).

## 2. Regional Technique & Painting Order
All six colour-value families (`mid-olive-foliage`, `bright-canopy-lights`, `shadow-foliage-masses`, `sunlit-stone-and-roofs`, `cypress-and-distant-valley`, `warm-olive-slopes`) use `styleSelection.style = "precise-watercolor"` (`regions: {}`) paired with `region_w15_lay2_tp2` (`--brushchoice 1`, `--shapedmarks 1`, `--midlayers 2`, `--touchpoints 2`) and `"--touchfamilies", "48"` so that passage-sized brushes (`choosePassageBrush`) sweep broad planes with full-width mop lanes without running dry or leaving short-stroke overlap grids:

1. **Protected Highlights & Opening Pen (`opening-lines.json`, Boundary 0)**:
   - Small masking reserves protect the brightest sunlit stone gable (`[0.765, 0.445, 0.795, 0.475]`) and upper terrace coping (`[0.105, 0.055, 0.145, 0.085]`), along with automatic target-white reserves (`protectedCells`).
   - Before any wash is laid, the opening pen (`sepia-ink`, `--openinglines 100000`, `--openingminmm 4`, `--openingpressure 0.42`) draws 112 traced structural spans (104 rendered pen gestures) across the dry sheet: roofline ridges, stone corners, terrace walls, window lintels, cypress stems, and the foreground deciduous trunk and branches. The sheet is dried completely (`dry 20000 steps`) so lines set cleanly.
2. **Band 1 — Wet-on-Wet Light Washes (`light-wash`, passes 1–14)**:
   - Broad, high-moisture pale washes establish the luminous undertones across all six regions: pale yellow-ochre and rose-buff over `sunlit-stone-and-roofs` (`Region 4`), vibrant hansa-cerulean yellow-green over `bright-canopy-lights` (`Region 2`), and pale olive-green undertones across `warm-olive-slopes` (`Region 6`) and `mid-olive-foliage` (`Region 1`).
   - 2× wash splitting (`_rec2x`, `_rcl`) and sky/foliage refitting (`_sky3`, `_leaf`) let adjacent warm stone and sunlit foliage passages merge softly.
3. **Band 2 — Dried Middle-Value Glazes (`layered-wash`, `_lay2`, passes 15–40)**:
   - Over dry paper after Band 1, two successive transparent middle-value layers (passes 15–27 and passes 28–40) model the rounded volume of the olive hillside (`mid-olive-foliage`, `warm-olive-slopes`), the terracotta roof planes, and the warm shaded stone facades in `sunlit-stone-and-roofs`.
   - Using `_w15` (`choosePassageBrush`) with `_lay2` sweeps large passages with continuous 38 mm mop lanes and smaller architectural/foliage shapes with appropriately sized round/detail brushes, avoiding dry-brush depletion or segmented lane grids.
4. **Band 4 — Crisp Shadow Glazes (`shadow-glaze`, `_vio`, `_rg10`, `_cg13`, passes 41–45)**:
   - Deeper olive-umber and cool blue-violet shadow glazes (`shadow-foliage-masses` and architectural cast shadows under eaves and terrace walls) lock in the three-dimensional lighting across `45.9%` of the sheet.
5. **Band 5 — Dark Accents, Touchpoints & Closing Ink (`dark-accent`, `_dk13`, `_tv8`, `_tp2`, `_ink4`, passes 46–62 + `closing-lines.json`)**:
   - Focused dark accents (`cypress-and-distant-valley`, passes 46–50) deepen the vertical cypress spires, deep foliage hollows, and cool upper-right valley.
   - Two rounds of shape-level corrective glazing (`_tp2`, `--touchpoints 2`, `--touchfamilies 48`, passes 51–62) compare 48 planning shapes against reference means and glaze any under-toned regions up to reference optical density.
   - Finally, the closing pen (`_ink4`, `closing-lines.json`, 63 traced high-contrast spans) restores sharp sepia-ink architectural edges, window darks, roof eaves, and foreground tree limbs over the dry washes.

## 3. Moisture, Brush Load & Edge Control
- **Band 1 (Light Wash)**: Damp prewetted/wet-in-wet surface, full fluid load, soft bleed at passage boundaries (`_skyb`) so warm buffs and pale greens fuse without hard watermarks.
- **Band 2 (Middle Layers)**: Dry substrate before each of the 2 layers (`_lay2`); passage-matched brushes (`_w15`, `choosePassageBrush`) with 1.3× cool/chroma balance (`_cg13`) producing clean overlapping glaze edges that separate sunlit crowns from shaded slopes.
- **Bands 4–5 (Shadow Glaze & Dark Accents)**: Dry paper, controlled load; perforated foliage shapes (`_leaf`) prevent flat heavy slabs of green, while architectural cast shadows keep crisp edges along eaves and walls (`_shs`, `--shadowraw 1`).
- **Closing Pen**: Bone-dry paper required before every pen stroke; crisp sepia-ink nib contact (`--closinglines 100000`, `--closingpressure 1`) for sharp graphic definition.

## 4. Protected Lights & Value Ladder
- **Protected Lights**: Only true high-luminance stone/plaster highlights (`lower-village-sunlit-gable` and `upper-terrace-parapet-light`, each `< 3.5%` of sheet dimensions so no long straight mask seam can form) plus `protectedCells` are reserved, keeping paper white scarce and intentional (`< 2%` of sheet).
- **Value Distribution**: Guided by `precise-watercolor` (`[0.25, 0.44, 0.12, 0.182, 0.098]`), keeping Band 1 genuinely light (`~25%` share) so the painting reads as pen plus light wash at every stage of the build rather than front-loading dark pigment into the opening wash.

## 5. Inspection Checkpoints & Revisions (`bench/paint.sh`)
- **Look 1 (`01-compare.jpg`, Boundary 0)**: Verified 104 sepia-ink opening lines across the village roofs, stone walls, upper terrace, cypresses, and lower-left deciduous tree trunk/branches.
- **Look 2 (`02-compare.jpg`, Boundary 14, after Band 1)**: Observed a vertical dry-brush white band (`x = 450..600`) caused by `shapedPlanePaths` stretching a single path across the 80% foliage plane without `choosePassageBrush`.
- **Look 3 & Look 4 (`03-compare.jpg`, `04-compare.jpg`, Boundary 27, after Band 2 Layer 1)**: Tested `_spl12_lad_sml24`, which filled the white gap from Band 1 but introduced a 12×24 mm segmented stroke grid. Revised to `region_w15_lay2` with `"style": "precise-watercolor"` to engage `choosePassageBrush` (continuous full-width mop lanes without segment chopping).
- **Look 5 (`05-compare.jpg`, Boundary 40, after Band 2 Layer 2)**: Confirmed smooth, grid-free middle-value glazes across the olive canopy, warm ochre walls, and terracotta roofs. Added `_tp2` (`region_w15_lay2_tp2`) and `"--touchfamilies", "48"` so two corrective glaze rounds fill remaining light spots.
- **Look 6 & Look 7 (`06-compare.jpg`, `07-compare.jpg`, Closing & Finished)**: Verified deep olive/cypress shadow glazes, two rounds of corrective glazing (passes 51–62), and crisp closing sepia-ink lines completing the urban sketch.
