# Plan: Trumbull (V4, try 3), precise architectural watercolor

## Reference read as value shapes
- Lights: pale blue sky with white cloud wisps (top right, and between gable and right tower); the white lamp pole and the
  lower banner pole; cream string courses, copings and window surrounds; sunlit honey stone of the central gable and the
  right wing.
- Mid values: ochre/honey stone in light, blue-grey slate roofs, the yellow-green tree.
- Darks: the shaded left tower and left wing (cooler brown-grey), the vertical shadow strip beside the tower, navy window
  panes and arches, the navy banner, traffic signals, olive bushes at the lower left.
- Focal point: the central gable with its pointed lancets and the two large arched windows, against the sky.

## Regions, technique and order (light to dark)
1. Sky (family `Y1.sky`), wet on dry. One connected graded wash laid as the base recipe's overlapping sky lanes in a single
   passage. (A first draft asked for wet on wet; the painter refused it at full size because the overlapping lanes took the
   paper above the 0.15 water ceiling its wet-wash gate allows, so the sky is a wet-on-dry wash and the gate stays on.)
   The cloud lights are held as paper (the painter's own near-paper lights plus one explicit
   reserve on the brightest cloud, small enough to avoid a straight seam). Hard edge only where the sky meets roof and tower
   silhouettes, which come from the target's own colour edges.
2. Stone walls (family `Y1.stone-roofs-windows`), wet on dry. Broad pale connected planes first, one per wall, paper showing
   through. Then four mid layers on dry paper (base `_lay4`) carry the stone courses and the coursed block variation of the
   base stone tokens. Facade planes are washes, not dry brush.
3. Slate roofs: flat cool planes on dry paper in the mid passes, crisp upper edge against the sky.
4. Shade: one violet-ultramarine and sienna glaze across the left tower, the left wing and the tower-side shadow strip,
   crossing wall, window and roof edge (base `_vio`, `_shs`). It goes on dry paper after the mid layers.
5. Tree and bushes (family `Y1.tree`), wet on dry: pale yellow-green mass, then olive darks on the shadow side (sap green and
   hansa yellow in the base palette). Edges stay crisp against the stone.
6. Darkest accents last, dry: window panes, arches, banner, traffic signals, recesses (base `_dk13`).
7. Drawing. Opening pen: a sparse, hand-placed architectural skeleton, 57 lines in sepia: the gable and roof silhouettes,
   both towers and their cornices, the spire, the string courses, the pointed lancets and the two big arches, the main
   window frames, the lamp pole, the banner and its pole. Light pressure (weights 0.4 to 0.62) and a fine nib (widths 0.5 to
   0.62 px of the 300 px source), so it reads as a first pencil-and-pen drawing under the washes. Closing ink: the target's
   own dark thin lines only (94 spans: window panes and mullions, arch edges, roof and coping edges, pole edges), kept where
   they are dark and fairly straight; stone-joint squiggle and the foliage at the lower left are left out. Nib width 0.5 to
   1.3 px, so the closing pen is thin.

## Protected lights
- Bare paper: brightest cloud at upper right (explicit reserve), white lamp pole and lower banner pole (explicit reserves that
  follow real edges in the target), plus the painter's own near-paper target lights (stone highlights, cream copings, sky).
- Toned later: none of the reserved lights; the stone highlights stay pale painted planes.

## Moisture and load
- Sky first wash: watery, pale pigment, big brush, on dry paper. Stone washes: wet on dry, watery to medium. Mid planes: medium load
  on fully dry paper. Shadow glaze: medium-watery on fully dry paper. Accents: thick, dry paper, small contact.
- Paper state is checked by the executor before each stroke; the painter dries each pass before the next.

## Edges
- Hard where the picture has them: roof and tower silhouettes against the sky, window frames, string courses. The region
  edges follow the painter's own colour segmentation, so no straight region seam is invented. Slightly irregular, hand-cut
  edges on the mid planes (token `_ew5`, 0.5 mm wobble). Soft only where the sky grades and across the shade glaze.

## Values
- Value ladder of the base V096 recipe, dark gain 1.3 kept: the target has near-black navy windows and a strongly shaded left
  side. Expect the sky and lit stone pale, the shade side a clear step darker, windows the darkest.

## Choices and changes against the base recipe
- `subject` is `Y1` (the registry code of this picture's family) so that the painter's architecture shaping applies
  (violet shadow glaze, warm stone texture, recess handling), which V096 was tuned on. The style is `precise-watercolor` for
  all regions, with no region style overrides, because a region style on rectangles would cut the first wash with a straight
  seam. The sky stays soft through its graded lanes, not through a region style.
- No region is wet on wet. Sky, stone, roofs, windows and tree are all wet on dry. The sky was first planned wet on wet and
  changed after the painter's wet-wash gate refused it (water 0.67 against a 0.15 ceiling); I did not switch the gate off.
- Token added: `_ew5` (irregular plane edges, architecture is hard but not ruled). No other recipe tokens or painter
  settings were changed; the base was tuned on this picture and I could not test a change without painting.
- Closing lines are file `closing-lines.json` (used by `_ink4`).

## What would show failure
- Sky banding or a hard lane outline inside the sky; sky bleeding over the roof or tower edge; a lost cloud light.
- Facade patchwork (pale islands, visible region seams), or a flat, unbroken honey wall with no stone course variation.
- Shade glaze stopping at a wall edge instead of crossing wall, window and roof; windows no darker than the walls.
- Heavy ink: closing lines read as outlines rather than as dark window and edge accents; opening lines still visible as
  hard black outlines after the washes.
- White poles filled in by a wash; the tree a blur instead of a crisp-edged mass.

## Stage intents (what to look for at each stop)
- After the first light passes: sky pale and soft, stone a pale warm plane with paper still showing, drawing visible beneath.
- After the mid layers: stone courses, roofs and tree mass in place, all edges crisp, lit walls still light.
- After the shadow bands: left tower and wing clearly darker, windows dark, the form of the gable reads.
- Closing: thin dark ink on window panes and edges, nothing heavy.
