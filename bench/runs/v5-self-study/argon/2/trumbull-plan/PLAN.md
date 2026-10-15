# Architectural Watercolor Plan — `Y1` (`Trumbull`, Try 2 of 3)

## 1. Subject & Pictorial Intent
`Trumbull` (`Y1`, `bench/plan/target.png`, 300×263 px rendered at 1200×1052 px on a 280 mm cold-press watercolor sheet) depicts a Collegiate Gothic stone courtyard facade at Yale University:
- **Sky (`[0.00, 0.00, 1.00, 0.52]`)**: Cerulean and granulating French ultramarine upper sky graded wet-in-wet down into warm cream-white cloud reserves (`[252, 251, 248]`).
- **Building (`[0.02, 0.08, 0.98, 0.76]`)**: Sunlit ashlar limestone and warm brick/terracotta gables, flanking chimney stacks (`x ≈ 0.22–0.28` and `x ≈ 0.79–0.89`), pointed Gothic window arches with pale stone tracery, circular gable medallion (`x ≈ 0.52, y ≈ 0.31`), recessed ground-floor entrance arches, and a small blue-and-red Yale banner (`x ≈ 0.39–0.41, y ≈ 0.62–0.69`).
- **Foliage (`[0.00, 0.20, 1.00, 0.78]`)**: Framing deciduous trees on the far left (`x ≈ 0.00–0.19`), center-left courtyard (`x ≈ 0.32–0.38`), and right (`x ≈ 0.81–1.00`) painted in layered hansa yellow, yellow ochre, and French ultramarine greens.
- **Ground (`[0.00, 0.65, 1.00, 1.00]`)**: Sunlit yellow-green turf and pale courtyard walk crossed by coherent horizontal cast shadows from the trees and facade.

---

## 2. Palette & Material Assignment
- **Palette (`--paints ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia` + `--skyblue 1`)**:
  1. `yellow ochre` — sunlit limestone foundation and warm foliage/turf base.
  2. `raw sienna` — mid-warmth golden stone and sunlit ground warmth.
  3. `burnt sienna` (`sienna`) — terracotta/brick warmth on gables and chimneys, and the warm partner to French ultramarine in neutral-violet architectural cast shadows.
  4. `hansa yellow` — bright sunlit canopy highlights and spring lawn greens.
  5. `French ultramarine` — deep cool roof slates, foliage darks, and architectural cast shadows.
  6. `cerulean blue` — upper sky wash and cool slate mid-tones.
  7. `sepia` — deepest architectural apertures (Gothic window openings, recessed doorway arches, under-canopy accents).
  8. `sky blue` — granulating tube of French ultramarine dedicated to the sky segment.
- **Drawing Medium (`_dboth_isep_ink4_opp35`)**:
  - **Opening drawing (`bench/plan/opening-lines.json`)**: 175 structural architectural and landscape contours drawn in dilute sepia (`--opening 0.35`, `--openinglines 180`, `--openingpressure 0.42`) before Band 1 washes.
  - **Closing drawing (`bench/plan/closing-lines.json` & `bench/plan/closingink4-lines.json`)**: 250 high-contrast sepia ink lines (`--closinglines 260`, `--closingpressure 0.58`, `--closingedgemin 0.05`) applied over the dry sheet after Band 5 to articulate Gothic window arches, mullions, gable ridges, circular medallion, chimney pots, and entrance arches.

---

## 3. Five-Band Light-to-Dark Execution Schedule
1. **Stage 0 — Paper Reserve & Opening Drawing**:
   - Auto-detected paper white (`[252, 251, 248]`) and relative paper-light reserves (`--paperrel 1 --paperlights 1 --paperdelta 10 --litreserve 95`) protect cloud whites, sunlit window sills, and path glints without artificial rectangular holes.
   - 175 opening sepia construction lines establish the gable geometry, chimneys, rooflines, window bays, and courtyard horizon.
2. **Band 1 — Continuous Light Washes (~1,330 strokes, ~0–28% of stroke timeline)**:
   - Broad, connected wet-in-wet foundations across the sunlit stone facade (`yellow ochre`, `raw sienna`, `burnt sienna` lifted with `--litlift 0.15 --litwarm 1`), sunlit lawn (`hansa yellow` + `yellow ochre`), and upper sky (`cerulean blue` + `sky blue`).
   - Swept in 12 mm overlapping brush lanes (`_spl12_sml50_wre12`) so large planes deposit evenly without 576-bristle wide-brush striping.
3. **Band 2 — Mid-Tone Architectural Planes, Roof Slates & Foliage (~1,150 strokes, ~28–52% of stroke timeline)**:
   - 4 nested mid-tone layers (`_lay4_nest`) with per-layer hue shifts (`_lhue`) and warm stone split (`_swarm_ssp45_och35`) separating golden ochre ashlar from warm burnt-sienna brick/terracotta planes.
   - Subtle coursed stone block hints (`_blk40_bkm4_bka14_birr_bcrs_bcl4`) clustered around shadow edges rather than covering 60% of the wall.
4. **Band 3 — Dry-Brush Canopy & Turf Texture (~57 strokes, ~52–54% of stroke timeline)**:
   - Restrained directional dry-brush texture on the tree canopies and foreground turf.
5. **Band 4 — Connected Cast Shadows (~843 strokes, ~54–74% of stroke timeline)**:
   - Unbroken dry-paper shadow glazes (`_cg13_vsh_ggl1_sraw`) in `French ultramarine + burnt sienna` cutting across region boundaries to unify the vertical facade recess crease (`x ≈ 0.21–0.28`), roof eaves, tree cast shadows on the wall, and horizontal lawn shadows.
6. **Band 5 — Deep Architectural Recesses, Closing Ink & Macro Touch-up (~860 wash strokes + 250 pen strokes, ~74–100% of stroke timeline)**:
   - Two-layer clean recess darks (`_rec2_rsh75_rclean_dkg13`) in `sepia` and `French ultramarine` inside Gothic window openings, doorway arches, and deep canopy pockets.
   - Masking film lifted on dry paper, followed by 250 crisp closing sepia ink strokes and 1 macro touch-up check (`_tp1`, `--touchmincells 0.06`, `--touchfamilies 6`).

---

## 4. Changes vs. Try 1 and Why (Round V5 Revision Log)

### Change 1: Rebalanced Stroke Timeline & Eliminated Post-Pass-80 Micro-Fragment Flooding (`progression: 1.2 -> target 4+`)
- **Root Cause in Try 1**: The stage strip (`bench/feedback/stages.jpg`) samples at **10%, 25%, 50%, 75%, and 100% of total brush strokes**. In Try 1, all 80 `VALUE_PLAN` passes (Bands 1–5) used only 4,510 strokes (`31.8%` of 14,157 total strokes), while the 2 post-ladder touch-up rounds (`_tp2`, `--touchpoints 2`) generated **9,647 tiny unshaped `cutin` strokes** (`68.2%` of all strokes!) across ~200 k-means fragments (`minCells = 0.0008 * n`). As a result, the 25% snapshot was already at Pass 61/80 (nearly finished!), and the 50%, 75%, and 100% snapshots were all inside the microscopic touch-up phase (`"no change from the previous snapshot"`, `"fine detail already present in the first 25%"`).
- **What Changed**:
  1. Enabled `--strokeplan 1 --lanemm 12 --strokemm 50 --washreach 1.2` (`_spl12_sml50_wre12`), so Band 1–5 planes are painted in overlapping 12 mm human-scale wash lanes (~4,500 main-ladder strokes).
  2. Changed `_tp2` to `_tp1` and set `"--touchmincells", "0.06", "--touchfamilies", "6"` in `bench/plan/extra-args.json`, reducing touch-up shapes from ~200 micro-fragments (9,647 strokes) to 4 macro regions (~40–60 strokes).
  3. Now 10% = Band 1 warm stone first washes, 25% = end of Band 1 sky wash, 50% = Band 2 mid-tone building/foliage planes, 75% = Band 4 ultramarine/sienna cast shadows, and 100% = Band 5 window darks + closing ink.

### Change 2: Restored Architectural Opening & Closing Ink Articulation (`edges detail: 3` & `architecture: 6`)
- **Root Cause in Try 1**: Only **12 opening pen lines and 3 closing pen lines** were actually drawn on the sheet in Try 1 (`previous-checkpoints.jsonl` showed `penLines: 12` at boundary 0 and `penLines: 15` at finish!). Two cascaded filters caused this:
  1. `selectValueInk` (`src/paint/methods/light-to-dark.mjs` line 263) drops any closing line touching `protectedCells` or having 1-cell neighbor contrast `< 0.06` on the 4× upscaled `1200×1052` `values` grid. Because `trace-ink.mjs` placed points at `[x+0.5, y+0.5]` in `300×263` space, multiplying by 4 landed on `[4x+2, 4y+2]` — the flat bicubic center of each 4×4 block — dropping 142 of 146 closing lines!
  2. `prepareDrawing` (`src/paint/methods/material-profiles.mjs` lines 15–31) defaults to `--openinglines 12`, `--closinglines 24`, and `--closingedgemin 0.22` (which measures 2-cell luminance differences on the 4× upscaled image).
- **What Changed**:
  1. Rebuilt `bench/plan/opening-lines.json` (175 lines) and `bench/plan/closing-lines.json` / `bench/plan/closingink4-lines.json` (250 lines) from multi-scale `1200×1052` architectural contours, snapping each point within `±0.5` target px (`±2` cells at `1200×1052`) to the exact gradient ridge cell where `!protectedCells[i]`, `locContrast >= 0.064`, and `TARGET_DRAW_EDGE >= 0.055`.
  2. Added `"--openinglines", "180", "--closinglines", "260", "--openingpressure", "0.42", "--closingpressure", "0.58", "--closingedgemin", "0.05"` to `bench/plan/extra-args.json`.
  3. Verified that **175 of 175 opening lines** and **250 of 250 closing lines** survive both `selectValueInk` and `prepareDrawing`.

### Change 3: Eliminated Diagonal Bristle Striping on the Central Gable & Soft-Edge Rim Clipping
- **Root Cause in Try 1**: Without `--strokeplan`, `shapedPlanePaths` swept the entire central building facade in a single 600-px-wide stroke whose bristles were capped at 576 (`gpuHairCap`), leaving ~1 px gaps between bristle tracks (`"coarse diagonal brushwork on the building's facade"`). Additionally, `softBoundaryPaths` skipped any softening arc that touched a nearby hard edge.
- **What Changed**:
  1. `_spl12_sml50_wre12` restricts wash lanes to 12 mm (~51 px on a 1200 px sheet, well under the 576-bristle cap) with 1.2 mm wet-edge overlap.
  2. Added `_sep4` (`--softsplit 1 --softmm 0.35 --softarcs 3 --softarclen 28`) so turning edges are softened right up to adjacent hard architectural boundaries instead of being skipped.

### Change 4: Removed the Erroneous Right-Chimney Reserve Box (`composition: 7`, `"missing chimney details"`)
- **Root Cause in Try 1**: `config.json` contained `"reserves": [[0.78, 0.15, 0.83, 0.20]]`, which overlapped the blue sky and the left side of the right chimney stack (`x = 0.79–0.89, y = 0.09–0.27`), punching a sharp white rectangular cutout into the chimney and sky.
- **What Changed**: Set `"reserves": []` in `bench/plan/config.json`, relying on `--paperrel 1 --paperlights 1 --paperdelta 10 --litreserve 95` to reserve actual cloud whites and architectural glints organically.

### Change 5: Replaced `sapgreen` with `burnt sienna` & Tuned Stone Warmth/Blocks (`color: 6`, `washes: 5`)
- **Root Cause in Try 1**: Base token `_pgreen` omitted `burnt sienna` (`sienna`) and added `sapgreen`. Because `shapeStoneDemand` only zeroed `sapgreen` on sunlit stone (`r-b >= 18, g >= 90`), dark stone cast shadows (`x ≈ 0.21–0.28`) retained `sapgreen` from `unmix()`, turning the vertical facade recess muddy olive-green. Meanwhile, `_blk60_bka20` covered 60% of the stone walls with 0.20-density dark rectangles, creating a camo blotch pattern on the left wall.
- **What Changed**:
  1. Passed `"--paints", "ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia"` in `bench/plan/extra-args.json` (restoring `burnt sienna` and removing `sapgreen`, while foliage greens mix naturally from `hansa yellow + yellow ochre + French ultramarine`).
  2. Added `_lit15_lw_swarm_ssp45_och35` to keep sunlit stone luminous warm ochre while splitting warm brick/terracotta tones (`sienna`) cleanly.
  3. Reduced stone blocks from `_blk60_bka20_bcl6` to `_blk40_bka14_bcl4` so ashlar masonry reads as subtle clustered stone courses rather than heavy dark blotches.

---

## 5. Rejected Judge Critique Points and Why
1. **Rejected: "There is no visible line drawing or tonal wash foundation at 10% (`stage_10_pct = 1`)" as an underdrawing-absence claim**:
   - **Why Rejected**: In Try 1, the painter *did* execute an opening drawing (`--drawing both`), and `stages.jpg` at 10% actually showed Band 1 + early Band 2 washes already laid over the sheet. The judge mistook the 10% frame for lacking an underdrawing/wash sequence because (a) only 12 faint opening lines survived `--openinglines 12`, and (b) 68% of all strokes were dumped into post-Pass-80 touch-ups, compressing the entire main painting into 0–31% of the stroke count. We fixed the stroke-count timeline and raised opening lines to 175 rather than switching to a pure monochrome ink-only stage at 10%.
2. **Rejected: Any implication that foliage needs a dedicated `sapgreen` tube**:
   - **Why Rejected**: Adding `sapgreen` to the 7-pan palette forces `pickPalette`/`widePalette` to drop `burnt sienna` (`sienna`) and contaminates dark stone shadow unmixing with olive-green. In `shapeStoneDemand` (`src/paint/tuned/stone-demand.mjs`), foliage (`hue >= 48`) is explicitly designed to mix natural botanical greens from `hansa yellow + French ultramarine + yellow ochre`, while `burnt sienna` is essential for warm brick/terracotta gables and neutral-violet (`ultramarine + burnt sienna`) architectural shadows.
