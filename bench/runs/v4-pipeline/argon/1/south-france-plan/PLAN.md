# Painting Plan — France (`south-france`)

## 1. Visual Analysis of the Target (`bench/plan/target.png`)
The target image (`304×249` px, painted at `1216×996` px on a `280 mm` cold-press sheet) depicts a sunlit Provençal hillside village in southern France rendered in an expressive **urban sketch (pen plus light wash)** idiom:
- **Warm sunlit paper foundation**: The brightest tenth of the target has a warm cream-ochre tone (`RGB [231, 207, 149]`), with no pure white border or `RGB >= 245` pixels. Using `_relonly` (`--paperrel 1` with `--paperbase source`) retains this warm sunlit cream-ochre sheet base (`[231, 207, 149]`) so bare paper reserves and light washes naturally match the sunlit limestone walls and terrace highlights.
- **Six color/value clusters (`target-color-1..6`)**:
  1. `olive_mid_canopy` (`target-color-1`, ~25.5%, `RGB [123, 123, 79]`): Mid-value olive and hillside foliage bridging the terraced slopes and stone walls.
  2. `sunlit_crown_greens` (`target-color-2`, ~9.3%, `RGB [177, 171, 78]`): Bright sunlit yellow-green tree crowns and grassy terrace slope in the lower-center foreground.
  3. `cypress_and_eave_darks` (`target-color-3`, ~5.7%, `RGB [69, 77, 77]`): Dark vertical cypress spires, deep tree trunks/branches, and dark architectural eaves and cast shadows in the upper-right village.
  4. `village_walls_and_roofs` (`target-color-4`, ~11.5%, `RGB [209, 178, 122]`): Sunlit warm limestone house facades, dry-stone terrace walls, and terracotta roofs clustered on the upper-middle and right hillside.
  5. `shaded_hillside_foliage` (`target-color-5`, ~23.5%, `RGB [82, 85, 62]`): Deep olive-green and cool-umber shadow masses beneath the tree canopy and across the upper-left and central hillside.
  6. `warm_terrace_slopes` (`target-color-6`, ~24.4%, `RGB [148, 146, 82]`): Warm sunlit ochre-green foliage and terraced hillside slopes across the left and lower-left middle ground.

## 2. Style, Palette, and Value Architecture
- **Style Selection**:
  - Primary style: `urban-sketch` (backed by `--valuefloor ink-and-wash`), which concentrates pigment into a luminous Band-1 foundation wash (`42%` in shadow cells, `100%` outside shadow cells) and a connected Band-4 shadow glaze (`58%` in shadow cells), keeping the washes fresh and un-muddy.
  - Regional overrides: `shaded_hillside_foliage` and `cypress_and_eave_darks` use `ink-and-wash` (`water: 0.40` in Band 4) so the deep canopy and cypress shadow glazes are laid with a slightly drier brush in their own shadow domain, holding crisp edges without backruns.
- **Stroke Plan, Touch-Up Glazes & Gains (`_spl16_sml50_sg11_dk14_tp2` and `--touchfamilies 40 --touchgain 0.90 --floorfrom 3`)**:
  - Inspecting the initial Band-1 wash (`look 2`) revealed that an un-laned 80%-sheet Band-1 shape uses a single full-sheet-width gesture whose bristle count hits `gpuHairCap` (`398` bristles across a ~`1000 px` footprint), emptying the brush reservoir mid-sweep. Enabling `_spl16_sml50` (`--strokeplan 1 --lanemm 16 --strokemm 50`) splits the broad foundation shapes into overlapping `16 mm` physical brush lanes (`50 mm` stroke length), each charged by its local footprint demand (`PF` in `[0.45, 1.8]`) while keeping single fitted gestures for smaller shapes.
  - `_sg11` (`--stylegain 1.1`), `_dk14` (`--darkgain 1.4`), and `_tp2` (`--touchpoints 2` with `--touchfamilies 40 --touchgain 0.90 --floorfrom 3`) perform two rounds of shape-level Kubelka-Munk optical-density comparisons over 40 color families using the floor wash brush (`--floorfrom 3`), ensuring full chroma and shadow depth across the terracotta roofs, violet-cast stone shadows, olive canopy, and cypress darks.
- **Palette**:
  - Wide palette fitting (`--palettewide 1`) selects `sap green`, `quinacridone rose`, `French ultramarine`, and `hansa yellow` (plus a granulating French ultramarine tube via `_skyb`), achieving a `2.11 dE00` box fit across the target's warm terracotta/ochre stone, sap/olive greens, and cool-dark shadows.
- **Explicit Paper Reserves**:
  - Four compact reserves (`[0.105, 0.255, 0.145, 0.295]`, `[0.315, 0.395, 0.350, 0.430]`, `[0.440, 0.068, 0.464, 0.112]`, `[0.892, 0.542, 0.928, 0.578]`) hold the brightest sunlit limestone terrace walls, central path/wall highlight, and upper village gable (`L >= 218`), with dimensions well above the `1 mm` minimum and well below the `78`-cell unsupported-seam threshold.

## 3. Two-Stage Drawing Plan (`opening-lines.json` & `closing-lines.json`)
- **Opening Drawing (`bench/plan/opening-lines.json`, 159 lines)**:
  - Drawn first (`_ol220_opp55`, `--openingminmm 3 --penfirst 1`) before the washes. Captures the primary structural contours of the village rooflines, stone terrace walls, cypress silhouettes, and main foreground tree trunks (`length >= 11 px` in target coords, avoiding all `paperRel` lights and reserve boxes so 100% of strokes pass `selectValueInk`).
- **Closing Ink (`bench/plan/closing-lines.json`, 261 lines)**:
  - Drawn after all washes dry (`_ink4`: `--closinglines 100000 --closingpressure 1 --closingedgemin 0 --drawwant 1`) in dark ink. Re-establishes both the crisp architectural lines (gables, eaves, windows, terrace courses) and the dark linear tree trunks, branches, and cypress spires (`meanLum <= 0.35`).

## 4. Interactive Execution & Inspection Strategy (`bench/paint.sh`)
1. Validate the plan with `bash bench/check.sh` (`ADMITTED`, 0 unsupported seams).
2. Start the painter (`bash bench/paint.sh start`) and inspect the opening drawing (`bench/looks/01-compare.jpg`).
3. After observing the mid-sweep reservoir depletion on the un-laned 80%-sheet wash in `bench/looks/02-compare.jpg`, revise with `_spl16_sml50_sg11_dk14` and advance through Band 4 (`run 23`, `bench/looks/03-compare.jpg`).
4. Before pass 24, revise with `_tp2` and `--touchfamilies 40 --touchgain 0.90 --floorfrom 3` (`revise then run closing`), inspect at the closing boundary (`bench/looks/04-compare.jpg`), and complete the closing ink drawing with `bash bench/paint.sh finish`.
