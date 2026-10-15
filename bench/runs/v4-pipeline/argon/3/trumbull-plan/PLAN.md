# Trumbull College (`Y1`) — Watercolor Plan

## 1. Visual Analysis of `bench/plan/target.png`
The target image (`300×263` px, rendered at `1200×1052` on a `280 mm` cold-press sheet in `precise architectural watercolor`) depicts the Gothic stone facade of Trumbull College under clear daylight:
- **Sky & Clouds (`Y1.sky`)**: A luminous cerulean and granulating French ultramarine upper sky (`y < 0.38`) with open paper-white cloud corridors at the upper right (`[0.935, 0.030, 0.958, 0.054]`), immediately right of the central gable peak (`[0.642, 0.148, 0.686, 0.178]`), and upper left (`[0.107, 0.099, 0.127, 0.122]`).
- **Warm Stone Architecture (`Y1.sun-main-gable`, `Y1.cool-main-return`, `Y1.right-stone-wing`, `Y1.slate-roofs`)**: A sunlit central stepped gable (`x: 0.24..0.65`) flanked by a left stone chimney and shaded return wall (`x: 0.0..0.28`), cool slate roof slopes (`y: 0.24..0.48`), and a right stone wing with chimney (`x: 0.74..1.0`). Individual stone courses vary between pale yellow ochre, warm raw sienna, and cool violet-blue shadow glazes.
- **Foliage (`Y1.tree-foliage`)**: A sunlit deciduous tree (`x: 0.54..0.85, y: 0.34..0.84`) in front of the right wing, shifting from warm sunlit crowns to deeper cool-green lower shadow clusters.
- **Deep Recesses & Foreground Accents (`Y1.dark-banner`, `Y1.opening-sidewalk`)**: Pointed gothic windows, leaded mullions, the deep central entrance arches, and the dark blue-black banner (`x: 0.49..0.60, y: 0.55..0.95`) provide the darkest value anchors (`max RGB < 105`), sitting above a sunlit sidewalk with crisp highlight glints (`[0.476, 0.935, 0.504, 0.951]`).

## 2. Layer & Value Strategy (`light-to-dark`, `subject: "Y1"`, `region_w13`)
1. **Paper Reserves & Opening Ink (`opening-lines.json`)**:
   - Paper-white highlights (`0.6%` pure white + `2.7%` total reserved paper across `17` organic light shapes) are protected via relative paper-light detection (`--paperrel 1 --paperlights 1`) and 5 targeted reserve boxes (`Y1.cloud-upper-right`, `Y1.cloud-gable-right`, `Y1.cloud-upper-left`, `Y1.gable-window-trim`, `Y1.sidewalk-glint`).
   - Traced thin dark architectural lines (`bench/tools/trace-ink.mjs`, 186 spans, 176 drawn opening pen lines in sepia ink) establish the gable roof slopes, chimneys, window arches, vertical piers, and street standard before the first wash.
2. **Band 1 — Connected First Washes (Passes 1–16, 919 brush strokes)**:
   - Large connected light-value washes (`_w13`, `_sky3`, `_skyb`) establish the cerulean and granulating French ultramarine sky across the upper third, the pale yellow-ochre and raw-sienna stone light plane across `80.8%` of the sheet, and the hansa-yellow / sap-green sunlit foliage underpainting with zero unsupported axis-aligned seams.
3. **Bands 2–3 — Mid-Tone Modeling & Per-Stone/Leaf Refitting (Passes 17–64, 3,728 cumulative brush strokes)**:
   - Four sub-band value steps (`_lay4`) build the secondary stone courses, slate roof planes, and foliage massing.
   - `shapeStoneDemand` (`subject: "Y1"`) refits `88` stone shapes (`685,497` cells) and `55` foliage shapes (`42,195` cells) to their target chromatic means using the 7 box paints (`yellow ochre, raw sienna, hansa yellow, French ultramarine, cerulean blue, sepia, sap green`) plus granulating sky ultramarine, modulated across `385` irregular stone blocks (`_blk60_bmm40_bka20_birr`).
4. **Bands 4–5 & Corrective Touch-Up Rounds (Passes 65–98, 14,209 cumulative brush strokes)**:
   - Violet-tinted cool shadow glazes (`_vio`, `_cg13`, `_shs`) model the cast shadows across the left wall return, eaves, and lower tree canopy.
   - Architectural recesses (gothic windows, deep entrance arches, traffic signal, and the dark blue-black banner with reserved white emblems) are held out of early stone washes (`_rcl`) and painted in two dried dark layers (`_rec2x`, `_dk13`), followed by two corrective shape-refit touch-up rounds (`_tp2`).
5. **Closing Sepia Ink (`closingink4-lines.json` / `closing-lines.json`, `_ink4`, `_sep8`)**:
   - Contrast-verified hard dark lines (`bench/tools/closing-ink.mjs`, 143 spans, 1,112 points) are applied at the end in sepia ink to crisp the gothic window tracery, roof ridges, banner standard, and archway contours.
