# Painting Plan: Sargent — *Ships* (`sargent`)

## 1. Reference Cues & Overall Strategy
- **Subject & Task Style**: John Singer Sargent's *Ships* (`bench/plan/target.png`, 300×244 target rendered on a 1200×976 execution grid across a 280 mm cold-press sheet), executed in **pure watercolor, no ink**.
- **Paper Tone & Luminosity**: The target's unpainted sheet is a warm antique cream (`RGB [221, 215, 199]`), most visible in the sunlit sky/sail gap on the upper right and the bright wedge along the right curve of the hull. Because Sargent's washes reach the outer crop border, automatic border-touch paper detection would otherwise default to stark white (`[252, 251, 248]`). We explicitly declare `--paperrgb 221,215,199` so bare reserved paper matches the reference's true warm cream sheet and optical unmixing measures density relative to the actual paper tone.
- **Palette & Optical Refit**: The wide-palette fit selects a transparent three-pigment primary triad—**cerulean blue**, **quinacridone rose**, and **hansa yellow**—supplemented by a granulating sky-blue tube (`--skyblue 1`). Together through Kubelka-Munk layering, this triad reaches the cool blue-grey hull (`[132, 147, 151]`), turquoise and olive harbor water (`[145, 151, 145]`), warm yellow-ochre and burnt-sienna masts/spars (`[181, 141, 97]`), and deep neutral-slate hull/waterline darks (`[42, 44, 42]`). We enable shape-level Kubelka-Munk refitting (`_srf` / `--shaperefit 3`) so each planning shape's pigment mix is optically corrected prior to band slicing.
- **No Ink (`taskStyle: "pure watercolor, no ink"`)**: All drawing line files (`opening-lines.json`, `closing-lines.json`, `closingink-lines.json`, `closingink4-lines.json`) carry empty `lines: []` with `"medium": "none"` (and `config.json` declares `"drawing": { "medium": "none" }`). All structural edges, rigging blocks, porthole rings, and waterline shadows are carried strictly by shaped watercolor washes and dark recess glazes.

## 2. Region Families, Technique, and Order
The composition is organized into six region families matching the target's six color/value clusters, painted strictly light-to-dark across five value bands (`[0.16, 0.32, 0.50, 0.75, 1.00]`):

1. **`sunlit_sky_sail` (`[0.48, 0.00, 1.00, 0.72]`, `baseMove: "wet in wet"`)**
   - **Reference cue**: Pale warm cream sunlit sky and sail opening on the upper right (`target-color-5`, ~25.6% of sheet), preserving bare cream paper highlights with soft atmospheric transitions into the surrounding rigging and hull.
   - **Technique & order**: Reserved in band 0 where bare paper holds the brightest cream notes; surrounding pale warm and cool washes enter in band 1 with soft boundary feathering.
2. **`ship_hull_body` (`[0.15, 0.08, 0.65, 0.78]`, `baseMove: "wet on dry"`)**
   - **Reference cue**: Broad curving cerulean and blue-grey ship hull and prow (`target-color-6`, ~24.1% of sheet) sweeping from top-center to bottom-center.
   - **Technique & order**: Established in band 1 with broad cool horizontal/curved lanes (`--skylanes 1`), then built through bands 2 and 3 (`--midlayers 4`) with shaped flat-brush planes on dry paper to hold the crisp sweeping right contour of the hull against the sunlit cream background.
3. **`hull_and_harbor_midtones` (`[0.10, 0.08, 0.88, 0.86]`, `baseMove: "wet on dry"`)**
   - **Reference cue**: Mid-value grey-green hull planks, lower-left shadow planes behind the anchor, and turquoise-green harbor water transitions (`target-color-1`, ~29.9% of sheet).
   - **Technique & order**: Light cerulean and hansa yellow-green washes lay the foundation in band 1, followed by wet-on-dry mid-value glazes in bands 2–3 that articulate the diagonal spar shadow and rippling harbor water on the lower right.
4. **`ochre_masts_and_anchor` (`[0.00, 0.10, 0.25, 0.95]`, `baseMove: "wet on dry"`)**
   - **Reference cue**: Warm yellow-ochre and buff vertical masts on the left, the sunlit anchor on the lower left, and olive-ochre harbor reflections (`target-color-4`, ~9.0% of sheet).
   - **Technique & order**: Warm hansa/rose pale washes enter in band 1 (`--skysplit 1` and `--layerhue 1` keep warm washes separate from cool sky/hull washes), with bands 2–3 defining the sunlit anchor flukes and vertical mast shafts against the cooler background.
5. **`warm_sienna_hull_and_spar_accents` (`[0.20, 0.40, 0.35, 0.55]`, `baseMove: "wet on dry"`)**
   - **Reference cue**: Richer burnt-sienna and orange-ochre hull porthole rings, warm mast accents on the left, and diagonal orange-ochre dabs along the lower-right spar (`target-color-2`, ~3.7% of sheet).
   - **Technique & order**: Built in bands 2–4 with compact shaped marks on a dry base so the warm orange-red accents stay crisp and unmuddied over the cool hull and water washes.
6. **`dark_hull_and_waterline_accents` (`[0.22, 0.22, 0.66, 0.92]`, `baseMove: "wet on dry"`)**
   - **Reference cue**: Deep slate-blue and dark sepia-black accents (`target-color-3`, ~7.6% of sheet) at the hull waterline shadow at bottom-center, the upper-mid hull porthole patch, the top-center prow cap, and the dark round rigging block at upper right.
   - **Technique & order**: Kept clean of pale underwashes (`_rcl` / `--recessclean 1`) and delivered late in bands 4 and 5 across two focused recess layers (`_rec2x` / `--recesslayers 2 --recessshare 0.75`), followed by two shape-level corrective touch-up rounds (`_tp2` / `--touchpoints 2`).

## 3. Moisture, Brush Load, and Physical Execution
- **Band 1 (Light Washes, cap `0.16`)**: High water load (`water: 0.62–0.88`) with wide flat brushes and overlapping lanes (`--skylanes 1 --skylanemm 6 --skylanestep 0.8`) across the broad cool planes, separating warm and cool hues (`--skysplit 1 --layerhue 1`).
- **Bands 2–3 (Middle Values, caps `0.32, 0.50`)**: Four dried middle-value sub-layers (`--midlayers 4`) executed wet-on-dry (`water: 0.62, wetMix: 0.55`) after full ordinary sheet drying (`levelMax: 140`) so each hull plane, mast, and water reflection holds its silhouette without backruns.
- **Bands 4–5 (Shadow Glazes & Deep Recesses, caps `0.75, 1.00`)**: Concentrated glazing loads (`water: 0.50, wetMix: 0.30, passes: 2`) on a verified dry base, with balanced 1.1× cool and dark gains (`_cg11`, `_dk11`) and neutral shadow hue (`--violetshadow 0 --groundglaze 0 --shadowraw 1`).

## 4. Protected Lights & Reserves
- Automatic paper-light detection (`--paperlights 1 --paperrel 1 --paperdelta 10`) reserves ~9.7% of the sheet along the organic contours of the sunlit sky/sail gap and water glints.
- Six compact explicit `reserves` in `bench/plan/config.json` anchor the essential bare-paper highlights without introducing long axis-aligned mask edges:
  1. `[0.68, 0.16, 0.72, 0.21]`: Bright sunlit sky and sail opening core behind the upper-right prow.
  2. `[0.68, 0.49, 0.72, 0.54]`: Sunlit cream paper wedge core alongside the curving mid-right hull edge.
  3. `[0.80, 0.56, 0.84, 0.61]`: Bright sunlit water and spar reflection highlight on the lower-middle right.
  4. `[0.82, 0.04, 0.86, 0.09]`: Upper-right cream sky highlight above the dark rigging block.
  5. `[0.70, 0.85, 0.716, 0.89]`: Crisp vertical water highlight glint in the lower-right turquoise harbor water.
  6. `[0.024, 0.09, 0.036, 0.14]`: Sunlit paper sliver along the upper-left vertical mast edge.

## 5. Edges & Value Structure
- **Hard Edges**: The sweeping right curve of the central ship hull against the cream sail gap, the sunlit anchor flukes on the lower left, the vertical masts on the left, and the dark waterline shadow at the base of the hull are held crisp by dry-paper contact gates and passage clipping.
- **Soft Edges**: Selected turning edges inside the hull and water transitions are softened with a damp clean brush (`--softsplit 1`, `_shs`) that stops short of hard silhouette boundaries.
- **Value Hierarchy**:
  - **Lightest (0.00–0.16)**: Bare cream paper (`[221, 215, 199]`) and pale warm buff washes in the upper-right sky/sail opening and anchor highlights.
  - **Light-Mid (0.16–0.32)**: Sunlit yellow-ochre masts, pale turquoise water reflections, and upper-left hull light planes.
  - **Mid (0.32–0.50)**: Main cerulean/blue-grey hull body and olive-turquoise harbor water.
  - **Dark-Mid (0.50–0.75)**: Deep blue-grey lower hull shadow, left mast shadow planes, and warm burnt-sienna porthole/spar accents.
  - **Darkest (0.75–1.00)**: Crisp charcoal/sepia-slate accents at the hull waterline, upper hull porthole patch, prow cap, and upper-right rigging block.

## 6. Failure Signs & Self-View Checkpoints
- **After Band 1 (Light Washes)**: Inspect with `bench/paint.sh look` to verify that the upper-right sunlit cream sky/sail opening and mid-right hull-side wedge remain clean bare cream paper, and that warm mast/anchor washes have not bled into the cool cerulean hull wash.
- **After Band 3 (Mid-Value Layers)**: Check that the sweeping central ship hull silhouette, the lower-left anchor shape, and the turquoise-green harbor water planes read clearly with distinct warm/cool separation and no hard axis-aligned seams.
- **After Band 5 & Touchpoints (Shadow Glazes / Before Finish)**: Verify that the dark waterline shadow at bottom-center, the upper-mid hull dark patch with warm porthole rings, and the upper-right rigging block reach full depth without over-darkening the mid-value cerulean hull. If darks read too pale or too heavy, revise `_dk11` / `_cg11` and re-run from the saved boundary via `bench/paint.sh revise`.
