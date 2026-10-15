# Trumbull College Architectural Watercolor Plan (`Y1`)

## 1. Reference Analysis & Visual Cues
The target (`bench/plan/target.png`, 300×263 px rendered at 1200×1052 cells on a 280 mm rough sheet) depicts the central courtyard facade and entrance of Yale's Trumbull College in a crisp, sunlit architectural line-and-wash style (`precise-watercolor`):

- **`Y1.sky` (`[0.0, 0.0, 1.0, 0.32]`)**: Cerulean and French ultramarine sky washes broken by diagonal cream-white cloud corridors above the roof ridges and between the main gable and right wing.
- **`Y1.slate-roofs` (`[0.25, 0.01, 1.0, 0.36]`)**: Cool blue-grey slate roof planes over the central gable and right wing, reading as crisp angled planes lighter than the window recesses but cooler than the stone walls.
- **`Y1.main-chimney` (`[0.13, 0.0, 0.29, 0.25]`)**: Tall ashlar chimney stack rising between the left shaded return and central gable, catching warm ochre light on its right face and cool violet-grey shadow on its left.
- **`Y1.cool-main-return` (`[0.0, 0.12, 0.29, 0.96]`)**: The receding left bay and buttressed stone wall in cool shadow, pierced by tall mullioned gothic windows with dark sepia/ultramarine glass recesses and pale stone tracery.
- **`Y1.sun-main-gable` (`[0.29, 0.02, 0.72, 0.98]`)**: The focal sunlit gothic gable and polygonal turret in warm yellow ochre, raw sienna, and hansa yellow stone courses, with recessed gothic windows, central arched doorway, and deep blue collegiate banner.
- **`Y1.right-wing` (`[0.68, 0.08, 1.0, 0.98]`)**: Secondary sunlit stone wing with stepped chimney, recessed upper casements, and lower stone arcade meeting the foreground tree.
- **`Y1.foliage` (`[0.62, 0.58, 0.78, 0.98]`)**: Sunlit sap-green and hansa-yellow deciduous tree crown in front of the right-wing wall, plus a small green foliage mass at the lower left edge, casting dappled cool shadow onto the adjacent masonry.
- **`Y1.opening-sidewalk` (`[0.0, 0.80, 1.0, 1.0]`)**: Sunlit foreground pavement, entrance steps, iron lamp/street signs, and small pedestrian figures anchoring the base of the facade.

## 2. Painting Sequence, Regions & Technique (`precise-watercolor`)
The painting proceeds strictly light-to-dark across five value bands (`lay4` = 3 middle bands between opening wash and closing darks), bookended by fountain-pen ink line work:

1. **Stage 0 — Opening Structural Line (`opening-lines.json`, `pen-025` with `sepia-ink`)**:
   - Light, selective fountain-pen under-drawing (`openingpressure = 0.28`, `openingminmm = 2`) lays down the primary gable ridges, chimney verticals, buttress corners, and arch outlines (> 3.5% sheet width) on dry paper while skipping window mullions and ground shadows (`FIRST_INK_SKIP`) and staying strictly off reserved paper lights.
2. **Stage 1 — Band 1 Pale Foundation Washes (`phase = light`)**:
   - **Sky (`Y1.sky`)**: Wet-on-dry (`water = 0.62`, overlapping 6 mm sky lanes with `skylanes = 1`, `skylanestep = 0.8`) cerulean and granulating French ultramarine pale wash laid across the upper sky, stopping cleanly around the reserved cloud corridors (`[0.123, 0.080, 0.140, 0.099]`, `[0.630, 0.141, 0.647, 0.160]`, `[0.950, 0.110, 0.967, 0.129]`) and roof silhouettes while soft cloud margins are feathered with `softBoundaryPaths`.
   - **Sunlit & Shaded Masonry Foundations (`Y1.sun-main-gable`, `Y1.main-chimney`, `Y1.right-wing`, `Y1.cool-main-return`, `Y1.opening-sidewalk`)**: Continuous wet-on-dry (`water = 0.62`) pale yellow ochre and raw sienna wash (`warmwash`) carried right across the stone walls, turrets, and sidewalk planes to establish warm sunlit limestone unity before any block or shadow subdivision. Window recesses (`isRecess`) are cleaned out of bands 1–3 (`recessclean = 1`) so dark pigment never muddies the surrounding stone.
   - **Full dry stop (`dryAfter = true`)** after Band 1 so subsequent stone courses and middle washes keep crisp boundaries.
3. **Stage 2 — Bands 2–4 Middle Value Planes, Stone Courses & Foliage (`phase = middle`)**:
   - **Shape-Fitted Stone Demand (`shapeStoneDemand`)**: Connected stone planes in `Y1.sun-main-gable`, `Y1.main-chimney`, and `Y1.right-wing` receive single-pigment and fitted ochre/raw-sienna/sepia washes wet-on-dry (`water = 0.62`, flat/round physical brushes sized to support width).
   - **Irregular Ashlar Courses (`blk60_bmm40_bka20_birr`)**: Sparse irregular stone blocks (~4 mm course height, 60% coverage, 0.20 density) are laid wet-on-dry across the sunlit masonry in alternating ochre, raw sienna, and light sepia so the facade reads as coursed collegiate stone rather than flat poster paint.
   - **Slate Roofs (`Y1.slate-roofs`)**: Cool ultramarine + sepia washes establish the pitched roof planes with hard ridge edges against the sky.
   - **Foliage Crown (`Y1.foliage`, `foliagerefit = 1`)**: Hansa yellow and sap green washes establish the sunlit upper leaf clusters, followed by dry-brush (`water = 0.22`, pressure `0.35`, broken tooth contact) and deeper sap-green/ultramarine lower crown turns.
   - **Full dry stops** between bands keep overlapping masonry and foliage planes clean and transparent.
4. **Stage 3 — Band 5 Connected Architectural Shadows & Deep Recesses (`phase = shadow`)**:
   - **Cast & Form Shadows (`vio`, `shs`, `dk13`)**: A transparent violet-earth shadow glaze (`55% French ultramarine + 45% raw sienna`, boosted with `violetshadow` and `darkgain = 1.3`, `water = 0.45`) unifies the shaded left return (`Y1.cool-main-return`), buttress undersides, eaves drop-shadows, chimney shadow face, and sidewalk cast shadows in one connected value statement over dry local stone color.
   - **Window & Doorway Recesses (`rec2x`, `recesslayers = 2`, `recessshare = 0.75`)**: Deep gothic window openings, entrance arch shadow, and the blue collegiate banner are painted last on the dried wall in two concentrated passes (`band 4` and `band 5`) using fitted dark sepia and ultramarine mixtures with small round brushes so their edges stay razor-sharp.
5. **Stage 4 — Closing Structural & Detail Ink (`closingink4-lines.json` / `closing-lines.json`)**:
   - After all washes are dry, `pen-025` with `sepia-ink` (`ink4` = 4× ink concentration, `closingpressure = 0.35`) restores crisp gothic window tracery, mullions, roofline ridges, cornice moldings, lamp posts, and foreground pedestrian accents.

## 3. Moisture, Load & Brush Control
- **Sky First Wash**: Paper pre-damped (`moist, not glossy`), loaded at `water = 0.88` so cerulean/ultramarine diffuses softly into cloud margins without hard watermarks.
- **Middle Architectural Planes**: Paper `fully dry` before each band; brush loaded at `water = 0.62` (medium-wet belly, point on corners) so washes flow flat within each stone or roof shape and stop cleanly at dry boundaries.
- **Dry-Brush Texture**: Paper `fully dry`, low water load (`water = 0.22`), light grazing pressure (`0.35`) so pigment catches only the rough paper tooth across foliage and weathered stone texture zones.
- **Shadow Glazes & Recesses**: Concentrated load (`water = 0.45`, `darkgain = 1.3`, `coolgain = 1.3`, `sepiamax = 0.8`) placed cleanly in single directional strokes without scrubbing, preserving the dry warm ochre under-wash beneath.

## 4. Protected Bare-Paper Lights
- **Explicit Reserves**:
  1. `[0.123, 0.080, 0.140, 0.099]` — upper-left bright cloud core above the shaded return.
  2. `[0.630, 0.141, 0.647, 0.160]` — bright cloud corridor between the main gable peak and right wing.
  3. `[0.950, 0.110, 0.967, 0.129]` — upper-right sky highlight.
- **Target-Derived Paper Lights (`paperlights = 1`, `paperrel = 1`)**: Connected paper-white highlights in the diagonal cloud bands, sunlit stone window sills/tracery, entrance steps, and pedestrian shirt highlights are automatically held in `protectedCells` across all five bands and never crossed by opening or closing ink strokes.

## 5. Edge Policy (Hard vs. Softened While Damp)
- **Soft Edges**: Cloud-to-sky transitions inside `Y1.sky` and internal foliage crown gradations in `Y1.foliage` are softened while damp (`softBoundaryPaths` feathered with a clean damp brush).
- **Hard Edges**: All architectural silhouettes (gable ridges against sky, chimney corners, buttress steps, window reveals, arch soffits, and cast shadow boundaries across sunlit masonry) remain crisp dry-on-dry placements (`edgePolicy = dry placement`).

## 6. Failure Signs & Inspection Checkpoints
- **After Opening Ink**: Mislocated lines cutting across white cloud cores or heavy dark scribbling inside window glass. (Fix: filter out any stroke touching `protectedCells` or window interiors).
- **After Band 1 (Pale Bases)**: Straight axis-aligned reserve seams in the sky or stone wash, or lost paper whites in the clouds and sunlit steps.
- **After Bands 2–4 (Middle Values & Stone Courses)**: Muddy grey stone where warm ochre/raw sienna should dominate, pale unpainted gaps inside the gable wall, or dull olive foliage lacking yellow-green crown brightness.
- **After Band 5 & Closing Ink**: Weak, milky window recesses that fail to anchor the gothic facade, or heavy closing ink that overwhelms the transparent washes.
