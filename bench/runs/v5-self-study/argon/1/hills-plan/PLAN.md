# Painting Plan — Hills (Loose Ink and Wash)

## Subject & Visual Analysis
The target (`bench/plan/target.png`, 306×242 px, rendered at 1224×968 cells on a 158 mm cold-press sheet) depicts rolling sunlit yellow-green hills bisected by a winding warm ochre dirt path that climbs from the lower left toward the upper center with a narrower branch veering right. Dense clusters of dark olive, blue-grey, and deep charcoal-green trees flank the trail on the left bank, across the central diagonal ridge, and in the lower-right foreground. Expressive, crisp dark ink contour lines and trunk/branch strokes anchor the tree canopies, foliage edges, and winding trail margins.

## Palette & Optical Strategy
- **Box palette** (`--paints hansa,sapgreen,cerulean,ultramarine,rose` plus the granulating sky/cool blue tube from `_skyb`):
  - **Hansa Yellow** + **Sap Green**: carry the luminous sunlit yellow-green turf across the lower and upper hill slopes.
  - **Quinacridone Rose** + **Hansa Yellow** + **Sap Green**: mix warm yellow-ochre and sienna-buff tones along the winding dirt path and dry grass banks while keeping unmix convergence tight (local colour error ≤ 0.5 dE00 across all 9 colour clusters).
  - **Cerulean Blue** + **French Ultramarine** + **Sap Green** + **Quinacridone Rose**: build the cool blue-grey and deep indigo-olive tree canopy shadows and deepest foliage recesses.
- **Ink profile** (`--inkk 0.52,0.55,0.56 --inkkscale 6`): matches the neutral-cool charcoal-black pen lines measured on the target (`mean RGB [35, 40, 39]`) rather than warm reddish sepia.

## Paper Reserves & Light-to-Dark Schedule
1. **Paper Reserves**: The brightest sunlit cream-white center and rims of the winding dirt trail (~2.9% of the sheet) are held out organically via target-derived paper-light protection (`--paperrel 1 --paperlights 1`), avoiding artificial rectangular reserve seams.
2. **Opening Ink (`bench/plan/opening-lines.json`)**: 305 long structural contour strokes establishing the major tree silhouettes and trail edges before the first wash.
3. **Band 1 — Light Washes**: Continuous wet-on-dry pale foundation washes establishing the warm yellow-green hill slopes and pale ochre trail margins around the reserved paper highlights.
4. **Band 2 — Four Graded Mid-Tone Layers (`_lay4`, `_spl4_lad_wre6`)**: Built across 4 progressive value thresholds using 4 mm adaptive stroke lanes (`--strokeplan 1 --lanemm 4 --laneadapt 1 --washreach 0.6`) and subtle 0.3 mm organic edge wobble (`_ew3`), shaping the rolling hill gradients, olive turf transitions, and mid-tone tree foliage.
5. **Bands 4 & 5 — Connected Shadow Glazes & Deep Canopy Accents (`_dp55_dg2`)**: Cross-region shadow glazes unify the cool blue-green and dark olive tree masses, followed by two-layer deep accents (`--deepaccent 55 --deepgrow 2`) restating the darkest interior canopy recesses and shaded bank undercuts.
6. **Touchpoints (`_tp2`) & Closing Ink (`bench/plan/closing-lines.json`)**: Two corrective glaze rounds followed by 640 directional closing ink strokes over the dry sheet to restore crisp foliage contours, trunks, branches, and path edges.
