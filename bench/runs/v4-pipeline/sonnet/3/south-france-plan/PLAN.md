# Plan: South France crop, urban sketch, pen plus light wash (V4, try 3)

## Reading the reference
- Thumbnail values: lights are the sunlit ochre terrace walls and path (upper left), the pale stone faces of the focal
  houses (right) and the yellow-green sunlit pine crown (bottom left). Mid values are the olive and grey-green foliage
  masses. Darks are the cypress flames, the shaded undersides of the foliage, the pine trunk and branches, the window
  recesses. Distant blue-green hills sit at the top right.
- Focal point: the stone house group at the right (x 0.64 to 0.97, y 0.34 to 0.8), terracotta roofs against green.
  Second focus: the pine at the bottom left with its dark trunk and branch fan.
- Style: `urban-sketch` for the whole sheet (pen first, pale flat wash, paper white showing, selective closing pen). No
  per-region style overrides: they would cut the first wash along rectangles the target does not have.

## Technique per region (resolution decision: ink-and-wash for line features, wash for planes)
| family | cue | question | move | paper state |
|---|---|---|---|---|
| SF.terrace, SF.village | ochre walls, terracotta roofs, lilac-grey shade | wash plane, pen for edges | wet on dry, one pale flat wash | dry paper, medium load |
| SF.cluster (focal) | roofs, sunlit walls, shade planes, window recesses | wash plane + ink for roof edges, wall corners, windows | wet on dry, crisp edges | dry; nothing wet next to it |
| SF.hills | distant cool hills | wash, soft | wet in wet, pale and grey | damp, the only soft region |
| SF.pine, SF.forest, SF.olive, SF.slope | leaf masses | wash for the mass, ink for the leaf-clump contour | wet on dry masses, pen scallops last | dry before closing pen |
Leaves are below the cell scale at this sheet (a leaf is about 1 mm, the nib is 0.5 to 1 mm), so foliage is a value wash
plus a pen cloud-contour, not painted marks. The pine branches are pen, not paint.

## Order
1. Opening pen (72 strokes, sepia): focal house outlines first, then the cypress flames, the terrace and wall lines, the
   top houses, the pine trunk and gnarled branches, olive trunks. No foliage outlines yet: the first drawing stays
   structural and sparse.
2. Pale washes light to dark (`_lay2`, two mid layers instead of four: a light wash, not a full painting). Each pass is
   dried before the next. Passes I will watch: first ochre and yellow-green passes (walls, pine, lit foliage), then the
   olive-green masses, then the dark cypress and shade glazes that cross house, tree and wall.
3. Closing pen (58 strokes): window darks, a few roof-tile courses, shade-side strokes on the walls, inner ribbons on the
   cypresses, cloud-scalloped contours on the largest foliage masses (lit tops, shaded undersides), the pine trunk and
   branches pressed again over the wash.

## Protected lights (reserves, small so no long straight seam)
- sunlit wall of the tower (0.84 to 0.89, 0.40 to 0.445): bare paper, toned only if it blazes
- pale rock streak in the foreground (0.38 to 0.44, 0.88 to 0.915): bare paper
- lit stone corner of the lower house (0.80 to 0.835, 0.585 to 0.625): bare paper
The painter also keeps its own near-paper lights.

## Values and settings
- `_lay2` (base `_lay4`): fewer layers for a light wash, and fewer passes. Everything else is the V096 base (`dk13`,
  `ink4`, `sep8`, `dwg200`, `uncap`).
- `--paints ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sapgreen,sepia`: ochre and raw sienna for the stone,
  sienna for the roofs, hansa with ultramarine, cerulean and sap green for the green mixes, sepia for darks and ink.
- Pen nib 0.35 to 1.0 target px per stroke (about 0.4 to 1 mm after the base `dwg200` gain), tapered ends, trunk the
  heaviest.

## What would show failure
- The first wash blankets the paper in even green (not a light wash): lower the darkgain on revision.
- Wash blocks along the family rectangles, or a visible seam on a family boundary.
- Blurred roofs or walls in the focal cluster, or ink that has to rescue blur.
- Foliage contours reading as a stamp or a zigzag; pen lines doubled where the closing pen repeats the trunk.
- Cypresses as pale ovals instead of dark flames; cluster roofs not warmer than the walls.

## Changes since the previous tries
None seen (independent try). Decisions made here: hand-authored pen lines instead of the tracer (the tracer returned
fragments of foliage edges), `_lay2`, one style for the sheet.
