# Trumbull V5 try 2 — precise architectural watercolor

## Reference and value map

The central sunlit gable is the focal plane. The left tower frames it; the right wing steps back; the two tall arches, window rows, roof edges and street sign give the small crop its landmarks. The tree and street details stay subordinate. At thumbnail size the scene should read in five values: (1) reserved paper in the cloud gaps and strongest stone glints; (2) pale blue sky and warm lit stone; (3) ochre wall planes, green foliage and blue-grey roofs; (4) the turned facades, roof shadows, tree underside and pavement; (5) the darkest window recesses, arches, sign and signal.

Keep value 2 broad and transparent. Let value 3 describe the building planes, not a grid of stones. Value 4 is a connected shadow family, and value 5 is confined to a few openings and street accents.

## Region techniques and detail scale

All regions use **precise-watercolor**. Their families describe target cues for segmentation; they do not create painted rectangular panels or style boundaries.

- **Sky:** wash question. Lay the pale blue as one connected wet-on-dry passage over dry paper. Preserve the irregular near-paper cloud openings from the target mask; do not add rectangular reserves or paint over the roof edge. Watery load, broad brush, broken hard edge against the architecture and a softer turn only within the sky. No dry-brush sky texture.
- **Left tower and central gable:** wash question for the broad, lit ochre planes. Put the light raw-sienna/ochre foundation on dry paper with a watery-to-medium load, let it dry, then place the fitted middle planes on dry paper with a medium load. Keep the gable face luminous and continuous; use firm irregular roof and arch edges and soften only a selected turning edge. The explicit stone-block overlay is reduced to sparse, low-strength hints so the plane remains dominant.
- **Right wing and roofs:** wash question. Lay the cool blue-grey roof and receding wall planes on dry paper after the light base, medium load, with crisp ridge and eave edges. Keep them a value step darker/cooler than the front gable. No family-boundary edge is painted.
- **Foliage:** wash question for the connected crown, not individual disks. Use a pale yellow-green connected mass on dry paper, dry, then a medium shadow shape along the lower and right side. Keep a few source-shaped paper gaps and a broken silhouette against the wall; do not stipple or send a wet passage across the window detail.
- **Street and ground:** wash question for two or three broad pavement values on dry paper, with a medium load and no scratchy facade-like texture. Dark post, signal and sign shapes are paint accents late in the value ladder; their few straight edges follow the target.
- **Arches and windows:** paint the recess value after the wall planes dry. Fine mullions and the narrowest arch lines are ink-and-wash because they are line features rather than wash bodies. Opening drawing carries only the longer target-supported structure. Closing sepia ink restores the selected window divisions, arch edges and street details after the paint is dry.

At 1200 px on the 280 mm sheet, one output cell is 0.233 mm. The 300 px source is enlarged 4x, so a one-source-pixel mullion is about 4 cells (0.93 mm): at the wash resolution threshold, use the pen rather than a narrow wash. The opening and closing trace widths are scaled to 35% before the painter scales their coordinates; with `_dwg100`, the resulting nib contact is about 2–5 cells wide (radius 1–2.5 cells), giving roughly 1.6–4 cells of feature width per contact radius for a 4-cell mullion. Broad wash brushes remain much larger and carry only planes.

## Lights, edges and order

Reserve the target's cloud holes and small near-paper stone glints as **bare paper** through its near-paper light mask. There are no added rectangular reserves. The lit gable is a pale painted plane, not a white reserve. Do not tone cloud whites at the finish; if a stone glint is too sharp, tone only that small local plane with a watery pale glaze.

1. **Opening drawing on dry paper:** 17 longer target-traced lines establish selected roof/tower breaks, major arches, and the sign/post silhouette. Their target widths are reduced before scaling; pressure is set to 0.8. This should read as sparse structural guidance, not a drawing of every window or stone. The line set also separates broad regions for the first light passages.
2. **Light washes:** begin with the sky and the top/background light bands, then let the drawing-bounded subject regions receive their pale local color one at a time. The first progress frames should show only part of the building in faint connected washes. If the whole scene appears at one faint value, that layer has failed the stage intent. All passages start on dry paper; wait if the footprint or its neighbours are not dry.
3. **Middle values:** after each wash dries, add connected facade, roof, window-surround and foliage planes on dry paper. Apply four middle steps from pale to stronger ochre/cool grey. A passage's edges are hard where a roof, arch, or wall junction turns; elsewhere keep one chosen soft edge, not a halo around every shape.
4. **Wall texture:** after the connected wall planes, sparse irregular ashlar hints use `_blk15_bka12` (15% coverage at 12% of fitted demand; 4 mm block height). These low-strength accents must remain subordinate to the continuous ochre. Stop if the wall reads as separate tiles, pale chips or evenly repeated marks.
5. **Shadow glazes and recesses:** let the middle values dry. Lay the final shadow glazes on dry paper as connected shapes that cross the gable, tower/return, roof edge, right wing, tree and pavement where the target's shadow supports them. This joins adjacent families without a rectangular seam. Darken only the target's true recesses at the last paint values; preserve the lit gable and cloud paper.
6. **Closing drawing:** on dry paint, use target-supported sepia ink at reduced nib width and pressure. The 115 retained lines keep the main window divisions, arch shapes, roof junctions and street details while dropping tiny fragments. No stone outlines, hatch fields or ink repair of soft paint.

The executor checks measured paper state over each whole stroke footprint and its neighbours before every mark. Pale washes are watery; middle planes and the final shadow glazes are medium; small recess accents are controlled and stronger. Each layer waits for a measured dry state before the next. The sky remains wet-on-dry because the prior wet-in-wet sky plan was refused at its actual moisture/load; this is a deliberate dry-start choice, not an assumed wet passage.

## Changes from try 1 and critique decisions

My first review rated the finished try 5/10 and its process 2.5/5. I agree with the judges that the wall texture is too fragmented, small marks compete with the architecture, and the 10–25% stages read as a faint full-scene reveal with speckle and scalloped gaps. I reject their “filter/opacity reveal” wording only as a factual account of how the executor worked: the image supports that impression, but does not establish the mechanism. The judge scores are noisy; the repeated early-stage observations and the visible wall breakup are the evidence I am using.

Changes: reduce the stone-block overlay from 60% to 15% coverage and from 20% to 12% strength; thin the opening trace set from 63 to 17 long structural lines and the closing set from 178 to 115 target-supported lines; reduce the scaled line widths to 35%, ink width gain to 1.0 and drawing pressure to 0.8. Order the first subject washes by the opening drawing's large regions and divide background ground into six bands so the early frames build area by area. Keep the four-step value ladder, warm/cool palette, broad facade wash, target-shaped light mask and selective dry closing ink. I reject the judges' implicit claim that every broken mark is itself a digital filter artifact; the painter's stone overlay and too-dense traced detail explain the visible pattern and are the parts this plan changes.

## Stage intents and failure signs

- **Before the first wash:** a light, sparse drawing should identify the gable/tower silhouette and a few architectural junctions. If the page looks fully inked, the opening lines are too dense.
- **Early light frames:** only the sky/top band and then a few broad wall regions should be tinted; paper remains visible. A complete pale scene in the first tenth, window detail in the first quarter, or scalloped white holes through a wall is a failure.
- **Middle ladder:** the central gable stays the broadest light plane and reads against the cooler right wing. If the facade becomes a grid of equally strong chips, reduce the texture layer at the next available revision.
- **After shadow glazes:** one connected shadow family should turn the stone and roof across region descriptions. Box-shaped edges, dark rims, muddy grey front walls, or lost cloud and gable lights indicate a failed glaze.
- **Finish:** the central arches, gable ridge, left tower, window groups, tree silhouette and sign read at thumbnail size. Ink stays subordinate to painted value; no uniform outlines or tiled stone pattern.
