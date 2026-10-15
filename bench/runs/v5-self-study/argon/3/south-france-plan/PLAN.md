# Painting Plan — France (Provençal Hillside Village, Round V5 Try 3 of 3)

## 1. Reference Cues & Visual Analysis (`bench/plan/target.png`)
The reference (`304×249` px, rendered at `1216×996` px on a `280 mm` sheet) depicts a sunlit Provençal hillside village in southern France rendered in an **urban sketch (pen plus light wash)** sensibility:
- **Upper-left terraced walls (`x: 0.00–0.40, y: 0.00–0.42`)**: High-key warm limestone retaining walls and sunlit dry-grass terraces (`L ≈ 0.78–0.90`) punctuated by narrow dark cypress spires and olive bushes along the terrace ledges.
- **Upper-center & upper-right village core (`x: 0.35–0.85, y: 0.00–0.32`)**: Clustered stone cottages with terracotta tile roofs (`r > g > b`), shaded violet-taupe north-facing facades (`x: 0.49–0.60, y: 0.05–0.19`), dark window apertures, and tall vertical cypress spires framing the buildings.
- **Top-right distant valley (`x: 0.80–1.00, y: 0.00–0.18`)**: Soft, high-value atmospheric blue-green valley receding into the distance, free of heavy ink outlines or dark blue saturation.
- **Middle-right village complex (`x: 0.65–0.96, y: 0.32–0.78`)**: Prominent three-story Provençal stone houses with warm golden-ochre facades, terracotta hipped roofs (`y: 0.33–0.45`, `0.50–0.60`), crisp dark eave shadows, and a sunlit stone retaining wall (`x: 0.80–0.95, y: 0.58–0.80`) casting a cool blue-grey shadow across the lower-right lane (`x: 0.86–0.96, y: 0.72–0.83`).
- **Central & left hillside olive/deciduous canopy (`x: 0.00–0.70, y: 0.20–0.90`)**: Rounded, soft-edged crowns of warm yellow-green and mid-olive trees overlapping across the slope, separated by deep olive-umber crevices between canopies.
- **Lower-left foreground tree (`x: 0.14–0.46, y: 0.50–1.00`)**: A bright yellow-green deciduous crown supported by an dark, branching calligraphic trunk and scaffold branches (`x: 0.19–0.39, y: 0.66–1.00`).

## 2. Regions & K-Means Family Mapping
To ensure zero `family region N does not match plan` warnings from `src/plan/validate.mjs`, the 6 `families` entries in `bench/plan/config.json` map 1-to-1 to the 6 K-means color clusters (`work/cache/south-france.regions.json`):
1. `olive_mid_canopy` (`[0, 0, 1, 1]`): Mid-value olive and hillside foliage bridging the terraced slopes and stone walls.
2. `sunlit_crown_greens` (`[0.3, 0.5, 0.5, 0.9]`): Bright sunlit yellow-green tree crowns and grassy terrace slope in the lower-center foreground.
3. `cypress_and_eave_darks` (`[0.5, 0, 1, 0.22]`): Dark vertical cypress spires, deep tree trunks, and dark architectural eaves and cast shadows.
4. `village_walls_and_roofs` (`[0.7, 0.3, 1, 0.6]`): Sunlit warm limestone house facades, stone terrace walls, and terracotta roofs clustered on the hillside.
5. `shaded_hillside_foliage` (`[0, 0, 1, 0.78]`): Deep olive-green and cool-umber shadow masses beneath the tree canopy and across the upper-left and central hillside.
6. `warm_terrace_slopes` (`[0, 0.22, 0.7, 1]`): Warm sunlit ochre-green foliage and terraced hillside slopes across the left and lower-left middle ground.

## 3. Techniques, Moisture, Load, and Pass Ordering
- **Top-level style**: `urban-sketch` (`drawing.order: "both"`, `openingMedium: "black-ink"`, `inkProfile: "black-ink"`).
- **Per-region style override**: `precise-watercolor` on all 6 regions so `lightToDarkPlan` builds the full light-to-dark wash structure and `planPassages` uses physical passage geometry (`brushMm = clamp(ceil(widthMm * 0.75), 3, 25)`) rather than `urban-sketch`'s collapsed 2-band wash and `spotBrushMm = 3`.
- **Single Regional Mid-Value Pass (`_lay0` instead of `_lay2`/`_lay4`)**:
  - In Try 2, `_lay2` replaced `band 2` and `band 3` with global sheet-wide blankets (`b2L0` covering 100% of the canvas at 50% middle weight and `b2L1` covering 70% at 50%), because `step.tag = 'L0'/'L1'` forced `groupMode = true` in `src/paint/methods/light-to-dark.mjs` (line 195). That caused the 50% and 75% stroke checkpoints to look like a uniform global fade-in (`2/5` on progression).
  - Switching to **`_lay0`** (`--midlayers 0`) removes `step.tag`, setting `groupMode = false` for `band 2` and `band 3`. Consequently, **`mid/b2` paints region-by-region (`r1` through `r6`) at 88% full middle weight**, building each anatomical family on the hillside sequentially like a human watercolorist!
- **Eliminating Redundant Clean-Water Prewetting (`--splwet 0`)**:
  - When `_spl9` (`--strokeplan 1`) is active, `tools/paint-plate.mjs` (line 2871) defaults `splwet` to `1`, which runs a full pass of clean-water strokes (`paint === false`) before every multi-lane passage, recording ~1,500 invisible water strokes on `MARKTAPE` and then immediately drying them out (`dry(target, 30000)`) on every `wet on dry` passage!
  - Setting `"--splwet", "0"` in `bench/plan/extra-args.json` eliminates those ~1,500 invisible water strokes from `MARKTAPE` (while keeping `T.intoWet` prewetting intact), cutting total brush strokes from 5,203 down to ~3,100 so the 10%, 25%, 50%, and 75% stroke checkpoints align with real visible stages of the painting.
- **Disabling False-Positive Road Shadow Glaze (`_rg0`) and Excess Cool Gain (`_cg9`)**:
  - Base token `_rg10` (`--groundglaze 1`) misclassified every low-chroma stone wall cell below `y = 0.62` with `b >= r - 4` as a "shadowed road", stripping the lower-right house facade (`x: 0.78–0.95, y: 0.58–0.78`) out of `mid/b2` and dumping it into `shadow/b4` as a dark violet-slate smudge. Replacing `_rg10` with **`_rg0`** restores warm limestone mid-values to the lower house wall.
  - Replacing `_cg13` (`--coolgain 1.3`) with **`_cg9`** (`--coolgain 0.9`) prevents the top-right distant valley (`x: 0.80–1.00, y: 0.00–0.18`) and lower-right cast shadow from turning overly dark blue.
- **Mid-Value & Dark Crispness (`_mg12`, `_dk12`, `_tp1`)**:
  - `_mg12` (`--midgain 1.2`) and `_dk12` (`--darkgain 1.2`) give rich terracotta roof warmths, saturated olive canopies, and crisp dark cypress spires, followed by a single targeted touchup pass (`_tp1`, `--touchdmin 0.08`, `--touchfamilies 10`).

## 4. Reserves (`bench/plan/config.json`)
Four small, high-luminance stone/gable reserves (`1%–4%` span) preserve bare-paper sparkle on sunlit masonry without triggering `unsupported reserve seam` warnings (`min interior-to-border luminance diff < -0.02`):
1. `[0.105, 0.255, 0.145, 0.295]`: Sunlit upper-left limestone terrace wall highlight.
2. `[0.315, 0.395, 0.350, 0.430]`: Sunlit central stone terrace wall and path highlight below the village.
3. `[0.440, 0.068, 0.464, 0.112]`: Sunlit upper village house gable and roof edge highlight.
4. `[0.892, 0.542, 0.928, 0.578]`: Sunlit lower-right stone terrace wall highlight.

## 5. V5 Try 3 Changes & Rejected Critique Points
- **Selective Architectural & Calligraphic Pen Lines (No Foliage Contour Loops)**:
  - In Try 2, general Sobel gradient ridges wrapped topological contour rings around soft green foliage canopies and distant hills (`edges detail` 4.67, `marks texture` 4.33).
  - For Try 3, `bench/plan/opening-lines.json` (119 lines, weight `0.24–0.38`) and `bench/plan/closing-lines.json` (143 lines, weight `0.62–0.78`) are extracted using a **thin dark-line valley detector** (`min(sideA, sideB) - center >= 0.085` across a `±2 px` normal) combined with architectural warm-stone/terracotta boundaries inside building regions, while strictly rejecting green-on-green foliage edges (`g >= r - 0.01 && g > b + 0.04`) and the top-right distant valley (`x > 0.80, y < 0.18`).
  - All 119 opening lines and 143 closing lines are verified to pass `selectValueInk` at **100% survival (`119/119` and `143/143`)**.
  - Pen width gain is reduced from `_dwg200` (`2.0`) to **`_dwg130`** (`1.3`) so ink lines read as delicate fountain-pen work rather than heavy marker outlines.
- **Rejected Critique Points**:
  - We reject using `style: "urban-sketch"` on the region overrides because `urban-sketch` collapses all washes into 2 bands and forces a 3 mm spot brush across a 280 mm sheet.
  - We reject overriding `--paints` in `extra-args.json`: testing 5 candidate palettes against `target.png` proved that the default 4-pigment + sky-blue set achieves the lowest unmix MAE (`4.63` vs `4.86–5.07`) and fewest pigment sub-passes (5 vs 7).
