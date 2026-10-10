# Trumbull, V4 try 3: precise architectural watercolor

## Reading the reference (value thumbnail)
- Lights: white cumulus core at the top right (bare paper, reserved); pale blue sky (lightest painted value); sunlit
  ochre stone of the central gable and right wing (pale plane, never bare paper); pale pavement at the foot.
- Mid values: warm stone facades, blue-grey slate roofs, the yellow-green young tree, the glass block at the far left.
- Darks: shadowed buttress between gable and right wing, the left tower's shaded right face, window recesses
  (blue-black), the navy street sign, traffic signals.
- Focal point: the central gable with its two big arched windows and the street sign in front of it.

## Style balance
- precise-watercolor for the whole sheet (registry code Y1, so the tuned warm-stone texture rule applies). No region
  style overrides: a different region style would cut the first wash with straight seams, and the sky is handled by
  the base sky tokens with its own wet move.
- Wet share low: only the painter's graded sky washes and wet-edge joins go in wet. Stone, roofs, trees and street furniture are wet on dry with hard,
  irregular edges. At most two glazes per region (mid plane, then the shared shadow glaze).
- Ink carries structure only: mullions, arches, copings and junctions that a brush cannot hold at this scale
  (mullions are about 1 target px = 4 output cells = 0.9 mm; ink-and-wash question). Base sepia ink (_sep8), declared.

## Regions, technique and order (config.json families)
| region | cue | question | move / paper | load | edges |
|---|---|---|---|---|---|
| sky right + left | pale graded blue, white cumulus | wash | wet on dry family move; the painter folds its soft sky passages into graded washes (granulating ultramarine), cloud core reserved | watery, pale | soft inside, hard against the roofline |
| glass block | cool distant grey | wash | wet on dry, one pale flat wash | watery | soft, no detail |
| left tower, gable, central facade, right tower, wings | warm sandstone planes | wash (+ stone texture band 3) | wet on dry, broad connected plane per facade | medium | hard irregular at silhouettes |
| buttress shadow, tower shade faces | cool shaded stone | wash + glaze | mid plane on dry, then shadow glaze crossing wall/windows | medium, glaze watery | one hard edge at the corner |
| roofs (main, right, low) | blue-grey slate | wash | wet on dry, one wash, darker eave glaze | medium | crisp ridge/eave |
| tree right, tree left, edge foliage | yellow-green canopy | wash | one irregular canopy mass wet on dry, darker groups on the shadow side | medium | broken outer edge |
| sign, street furniture | navy sign, signals, posts | density/ink | small dark shapes on dry paper, last accents | thick | crisp |
| ground | pale pavement, figures | wash | mostly paper, light warm touches | watery | soft |

Order (light to dark, default, no breaks except the sky): reserve the cloud core -> graphite opening drawing ->
sky graded wet passage + pale stone/roof/canopy washes -> dry -> mid planes (stone courses, roofs, tree groups) on dry
paper -> dry -> cross-region shadow glazes (left tower shade side into the wing; buttress shadow across wall and
windows; roof eaves) -> dry -> window recesses and the sign as the last paint accents -> selective sepia closing ink.
No breaks from light to dark. The sky softness comes from the painter's own graded-wash folding, not from a family wet-in-wet move (see Revisions).

## Protected lights
- Reserve: cloud core [0.94,0.02,0.985,0.07], bare paper, its edge softened by the surrounding sky wash.
- The painter's own near-paper lights (pavement glints, sign lettering) are kept automatically (0.6% of the sheet).
- Lit stone is a pale painted plane, not paper.

## Drawing
- Opening (graphite, under the paint): 19 hand-placed structural lines (gable copings to the apex, roof ridge, left
  tower edges and setback, central block corner, right tower, right wing eave, low roof, left wing gable, the two
  arched windows, the sign board and the two posts) plus 79 traced target lines at contrast .16, min length 16 px
  (mullions and openings). Sparse, long connected gestures; no ground line or ruled lineart.
- Closing (sepia ink, `closing-lines.json`, used by the base _ink4): 117 lines traced from the target's own dark lines
  at contrast .14, min length 14 px, max lum .58: mullions, arches and junctions on dry paint, never in the lights.

## Recipe
- `region_w13`: the V096 base as tuned on Trumbull, unchanged. No extra-args. Reason: the base already carries the
  architecture tokens (stone blocks, recess layers, sky blue granulation, sap green palette); my changes are in the
  plan (families with explicit moves, the cloud reserve, the drawing layers).

## Stage intents (what each stop should look like)
- After the opening: a light graphite skeleton of the buildings, readable silhouette, no heavy lines.
- After the first passes: pale sky graded, cloud core white; pale ochre stone planes; no dark yet.
- Middle: roofs and stone courses, tree canopy, shaded faces separating from lit faces.
- Late: shadow glazes crossing the tower/buttress, window darks, the sign; closing ink last.

## What would show failure
- Sky banding or contour rims, a hard white rectangle at the cloud reserve.
- Facades as pale islands or cell rings instead of connected planes; stripes along stroke chords.
- Windows lost or blurred into the stone; ink heavy over blurred paint; ink in the lit sky or on lit stone.
- Darks arriving first (non light-to-dark progression).

## Revisions while painting
- First start: sky families had baseMove "wet on wet". The painter refused at the first light pass: "value-plan wet wash
  whole-footprint gate failed" (light/b1/p0/r4/s1, moistShare 0.76, waterMax 0.68: the rewet sky was still glossy, not
  moist). In the planner, the family wet-on-wet light move is the only source of a gated wet move. Fix: sky families
  to "wet on dry"; everything else unchanged; re-checked (ADMITTED) and restarted from a clean sheet.
- Stops looked at: after the opening (sparse graphite skeleton, as intended), pass 16 (pale ground wash, cloud core
  white, slight diagonal lane streaks in the facade), pass 29 and 42 (stone planes warming, sky blue with white cloud
  kept, windows held light), pass 62 (stone sienna-warm and a little brown; windows, roofs, sign and tree still waiting
  for their dark glazes). No revision: the remaining value 4-5 glazes cover those masks, and a revision that the
  painter refused now could not be restarted.
- Before the closing drawing (98 of 98 passes, 14287 strokes): windows dark navy with crisp edges, sign navy, slate
  roofs blue-grey, shadow glazes across the left tower and buttress, stone courses visible at native size. Closing
  ink kept as planned (traced target lines only on dark pixels) and finished. Weak points: stone a little more
  orange-brown than the target's gold, olive tint in the shadow glazes, a few diagonal lane streaks on the lit gable,
  pale broken pavement at the foot.
