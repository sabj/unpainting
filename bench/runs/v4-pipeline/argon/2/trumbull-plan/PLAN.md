# Painting Plan — Trumbull College (`Y1`, Precise Architectural Watercolor)

## Reference Cues & Visual Structure
The target (`bench/plan/target.png`, 300×263 px, rendered at 1200×1052 on a 280 mm cold-press sheet) is an architectural pen-and-wash rendering of Trumbull College at Yale:
- **Sky and Cloud Corridors (`Y1.sky`, upper sheet `y = 0..0.38`)**: Pale granulating French ultramarine sky at the upper left and upper right, separated by a diagonal corridor of untouched warm paper white (`rgb(245, 244, 240)`) sweeping from the upper-left clouds across the central gable crest.
- **Sunlit Main Gable & Chimney (`Y1.main_gable`, right-center `x = 0.40..1.0, y = 0.08..0.93`)**: Warm yellow ochre, raw sienna, and Hansa yellow masonry planes catching direct raking light from the right, broken into horizontal ashlar stone courses with luminous paper-relatived highlights on stone trim, quoins, and coping.
- **Cooler Shadowed Return Wall, Slate Roofs & Tower (`Y1.left_wall`, left-center `x = 0..0.48, y = 0.18..0.95`)**: Cooler ochre/raw-sienna/ultramarine stone planes in open shade, blue-grey steep slate roof slopes behind the parapet, and tall vertical Gothic bay recesses.
- **Foreground Street, Foliage, Banner & Figures (`Y1.ground`, lower half `y = 0.55..1.0`)**: Mid-green deciduous tree canopy at right-center (`x = 0.56..0.82, y = 0.50..0.76`) and left shrub foliage (`x = 0.02..0.28, y = 0.72..0.92`) refitted to Hansa yellow + French ultramarine + raw sienna; a vivid ultramarine Yale banner (`x = 0.44..0.52, y = 0.65..0.80`); dark architectural window/arch recesses held out of early wall washes; and a cool shadowed sidewalk/street base with small pedestrian figures and traffic-post accents.

## Region-by-Region Technique, Palette, and Light-to-Dark Order
The painting executes in 5 strict light-to-dark value bands (`valueCaps = [0.16, 0.32, 0.50, 0.75, 1.00]`) plus opening/closing sepia ink line and a final 2 mm round touch-up pass:
1. **Opening Structural Drawing (`opening-lines.json`)**:
   - Light sepia ink (`sepia-ink`, pressure capped at `0.30`, minimum span `8 mm`) lays in the long architectural rooflines, gable coping, chimney verticals, and window bay frames before any wash touches the paper.
2. **Band 1 (`<= 0.16` density) — Pale First Washes**:
   - **Sky Split (`_sky3`, `_skyb`)**: The granulating French ultramarine sky wash (`--skyfloc 0.5`) is separated from the warm architectural ground (`--skysplit 1`, `--layerhue 1`) so no blue contaminates the warm stone underwash and no ochre enters the sky.
   - **Warm Architectural Foundation**: A dilute yellow ochre + raw sienna + Hansa yellow wash establishes the lit stone mass across the facade while leaving paper-light cloud corridors, window tracery glints, and bright stone coping untouched (`--paperrel 1 --paperlights 1`).
3. **Band 2 (`0.16..0.32` density) — Four Hue-Split Dry Middle Layers (`_lay4`)**:
   - Built in 4 sub-layers (`--midlayers 4`) on dry paper (`wet on dry`) with a #8/#12 flat wash brush, separating warm sunlit masonry (ochre/raw sienna), cool shadowed wall planes (`--coolgain 1.3`), and foliage greens (`--foliagerefit 1`).
   - Dark window and doorway recesses (`isRecess`) are explicitly held out of Band 2 and Band 3 wall washes (`--recessclean 1`) so their surrounding masonry stays crisp and unmuddied.
4. **Band 3 (`0.32..0.50` density) — Ashlar Stone Courses & Mid-Dark Foliage (`_blk60_bmm40_bka20_birr_tv8`)**:
   - Masonry walls split into irregular horizontal ashlar stone blocks (`--stoneblocks 1 --stoneshare 0.6 --blockminmm 4 --blockaspect 1.4 --blockalt 0.2 --blockirreg 1`) painted with shaped plane strokes and varied texture (`--texvariety 0.8`).
   - Tree canopy and left shrubbery receive mid-value sap green / Hansa / ultramarine leaf modeling.
5. **Bands 4 & 5 (`0.50..0.75` and `0.75..1.00` density) — Warm Recess Collars, Cross-Region Shadow Glazes & Deep Recesses (`_rec2x_vio_rg10_dk13_shs`)**:
   - **Warm Stone Collar (`_rg10`)**: A warm ochre/raw-sienna ground glaze frames the masonry around deep window openings before the darks go in.
   - **Cross-Region Shadow Glazes (`_shs`, `_vio`)**: Cool cast shadows across the left return wall, eaves, and street use a transparent 55:45 French ultramarine + raw sienna glaze (`--shadowraw 1`) with violet shadow lift (`--violetshadow 1`) over the dried warm stone underwash.
   - **Architectural Recesses (`_rec2x`, `_dk13`)**: Deep Gothic windows, arched entries, and shadow accents are laid last in two dark layers (`--recesslayers 2 --recessshare 0.75 --darkgain 1.3`) with small #2/#4 round brushes.
6. **Late Pointed Touch-Up & Closing Ink (`_tp2`, `_ink4`, `_sep8`, `_dwg200`)**:
   - A 2 mm pointed round pass (`--touchpoints 2 --touchgain 0.6`) sharpens high-deficit dark accents (window mullions, banner, street figures).
   - Over the completely dry sheet, the closing sepia pen (`closing-lines.json`, `--inkkscale 8 --drawwidthgain 2 --drawwant 0.85 --drawinglastmin 0.5`) re-establishes crisp dark architectural contours and window tracery where supported by mid-to-dark values (`density >= 0.45`) or silhouette boundaries.

## Moisture, Brush Load, and Drying Discipline
- Every value band waits for a full physical dry before the next band begins, preventing backruns or muddy upward bleeding from dark windows into pale stone.
- All regional families use `wet on dry` (`--loadedcontact 1`) so brush footprints hold crisp architectural registration along gables, chimneys, and cornices.

## Protected Lights, Edges, and Value Hierarchy
- **Protected Lights**: Paper-relative threshold (`--paperrel 1 --paperlights 1 --paperrgb auto`) preserves the diagonal white cloud bank, sunlit gable trim, banner lettering glints, and sidewalk highlights without artificial axis-aligned box seams.
- **Edges**: Crisp wet-on-dry boundaries define the sky-to-roof silhouette, chimney stacks, and window openings; broken ashlar block courses (`_blk60_birr`) create textured masonry edges inside the walls.
- **Failure Modes to Watch in `look`**:
  1. Sky blue bleeding into the sunlit ochre gable or cloud corridor losing its paper-white diagonal.
  2. Window recesses bleeding into the pale stone wall or looking washed-out instead of crisp dark Gothic openings.
  3. Over-heavy or misaligned ink lines obscuring the delicate wash planes.
