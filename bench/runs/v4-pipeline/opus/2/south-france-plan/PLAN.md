# South France hill village: urban sketch, pen plus light wash (V4 try 2)

## Reading the reference (value thumbnail)

- Five values. Lightest: the sunlit ochre terraced slope and stone wall (top left), the cream lit walls of the
  stone houses, pale path patches between trees. Light-mid: distant blue-green valley (top right), sage olive canopies,
  yellow-green lit crown of the foreground pine. Mid: terracotta roofs, mauve/violet shadow walls. Dark: deep green
  oak masses, cypress spires. Darkest accents: cypress shadow flanks, window holes, eave shadows, pine trunk and limbs.
- Focal point: the stone house cluster right of centre (three houses with hipped terracotta roofs, about x 200-292,
  y 84-200 of the 304 x 249 target). Secondary: the foreground pine (lower left) and the cypress group top centre.
- The target has almost no white paper (0.5% of pixels above L 0.9); its lights are pale ochre and cream. In an
  urban sketch these become paper with a thin warm wash, not bare white.

## Style balance

- Style `urban-sketch` for the whole sheet (no region overrides: a different region style would cut straight seams
  through the foliage, and the sketch should read as one manner). The executor gives urban-sketch cells the
  ink-and-wash value floor, so each area gets one light wash and one shadow glaze rather than a near-blank sheet.
- Ink carries the structure: house silhouettes, roof hips and eaves, cypress spires, the pine trunk and limbs,
  terrace walls, loose scalloped crowns of the main trees. Paint carries colour and value planes only.
- Ink: the style's black pen. Opening lines light (opening pressure), closing lines at full pressure but few.
- Palette (`--paints`): yellow ochre (terraces, lit walls), burnt sienna (roofs, and with ultramarine the mauve shadow
  walls), hansa yellow + sap green + cerulean/ultramarine (sage, yellow-green and deep greens), ultramarine (cypresses
  and violet shadows, with base `_vio`). The automatic pick had no earth colour (cerulean, hansa, sap green, rose), which
  would turn the terraces and roofs into mixed greens and pinks.

## Regions, technique and order (families in config.json are labels; all urban-sketch)

| region | cue | resolution question | move, load | edges | layer |
|---|---|---|---|---|---|
| distant valley (top right) | pale blue-green ridge | wash | wet on dry, watery | soft, one ridge line in pen | 1 |
| upper houses | ochre walls, terracotta roofs | ink-and-wash (walls 10-20 px, windows 2 px) | wet on dry, medium | hard, pen-defined | 1, then shadow glaze |
| terraced slope + wall (top left) | lightest warm plane | wash | wet on dry, watery ochre, paper glints kept | hard top of wall | 1 |
| focal houses | cream walls, mauve shadow sides, terracotta roofs | ink-and-wash; windows below 4 cells -> closing pen | wet on dry, medium | hard, irregular | 1, shadow glaze 2 |
| woods / olives / oaks | sage to deep green rounded crowns | wash with pen crown contours | wet on dry, medium | crisp silhouette on one side | 1, shadow glaze 2 |
| cypresses | dark blue-green spires | ink-and-wash | wet on dry, medium-thick | hard | 1, glaze 2, pen flank |
| foreground pine | yellow-green crown, dark limbs | ink-and-wash: limbs are 1-2 px in the target -> pen | wet on dry | crown soft-broken, limbs pen | 1, glaze 2 |
| low foliage / ground | mixed greens over pale ground | wash | wet on dry, medium | broken | 1, glaze 2 |

Smallest features: windows 2-3 target px = 8-12 cells at 1216 (one target px is 4 cells, 0.92 mm); limbs and cypress
flanks 1-2 target px. These are pen marks, not brush marks. Wall and roof planes are 10-40 target px: washes.

Order (light to dark, as an urban sketcher works):
1. Opening pen: 69 long connected gestures (buildings, roofs, cypresses one stroke up and down, pine trunk and
   limbs, terrace wall, scalloped crowns of the five main trees, distant ridge, path). Short window marks are left
   to the closing pen (opening lines under 8 mm are not drawn).
2. Light wash, wet on dry: ochre terraces and lit walls, pale sage foliage, sky-valley tint. Paper glints kept.
3. Dry.
4. Shadow glaze on dry paper (the ink-and-wash band 4): shadow sides of houses (one glaze across wall and eave
   shadow), deep greens of oaks and cypresses, the pine crown's shadow side. Crosses foliage/building boundaries.
5. Dry. Painter's own recess/accent passes (base `_rec2x`, `_tp2`) for window holes and the darkest valleys.
6. Closing pen (34 lines): eave shadow lines, shadow corners of the focal houses, windows and the round window,
   cypress shadow flanks, pine trunk and dark limbs, the right-hand tree trunk. Focal cluster only, none in lights.

## Protected lights

- Painter's own near-paper lights (target lights are pale, so few cells).
- Reserve 1: sunlit far-right wall (brightest wall in the target, 0.87 L), small.
- Reserve 2: sunlit top of the terrace wall, a thin paper glint.
Both are small (under 8% of the short side) so they cut no unsupported seam.

## Tokens and settings

- `region_w13`: the V096 base unchanged at first; the style choice (urban-sketch with the ink-and-wash floor) already
  sets one wash plus one glaze. Changes are decided at the stops by looking.
- `extra-args.json`: `--paints ochre,sienna,hansa,sapgreen,ultramarine,cerulean`.

## Stage intents and failure signs

- After the opening pen: a readable line sketch of the village alone (houses, cypresses, pine), light lines, no
  traced texture. Failure: lines in the wrong place, scribble, missing focal houses.
- After the light wash: warm ochre slope, cream walls, pale greens; lots of paper still light. Failure: greens
  everywhere at full strength (no "light wash"), terraces turning green or pink, hard rectangular wash edges.
- After the shadow glaze: dark cypresses and oak masses, mauve shadow walls, the focal cluster reads by value.
  Failure: muddy greens, patchwork of small islands, pen lines lost under heavy paint.
- Closing: crisp windows, eaves and trunks at the focal point only. Failure: heavy ink over blurry paint, ink in
  the lights.

## Revisions during painting

- Stop 0 (opening drawn): the 69 pen gestures registered on the houses, cypresses and pine, but drew as hairlines
  (opening pressure on the black ink's 0.1-0.4 mm nib). It reads as a pencil underdrawing, not a pen sketch.
  Decision: make the closing pen the real ink statement (pencil, wash, then pen: a normal urban-sketch order).
- Stop 9 / stop 20 (light band done): the 80%-of-sheet ground shape was laid as two broad diagonal flat-brush bands
  with a dry-brush stripe of paper between them and a bare bottom-right corner. No target edge supports these. Every
  light pigment reused that geometry, so by pass 20 the light band was one flat olive-grey wash, and the ochre
  terraces were greyed too. Not fixable by replanning the same shapes. Fix aimed at the remaining passes:
  - `_tp3` (3 touch-up rounds instead of 2): each round glazes every target shape still lighter than the target's
    shape average, which is what the stripe and the bare corners are.
  - `_dwg300` (pen width gain 3, was 2) and a new `closing-lines.json` (86 lines): the structure lines restated
    (houses, roofs, eaves, walls, cypresses, pine trunk and limbs, tree trunks) plus the accents (eave shadows,
    shadow corners, windows, cypress flanks). Lights stay clear: no terrace or slope edges, ridge, path or crowns.
