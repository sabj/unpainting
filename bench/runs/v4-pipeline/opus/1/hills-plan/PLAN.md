# Hills, V5 try 1: loose ink and wash

## Reading the reference

An aerial view of oak hills. Lit yellow-green grass slopes cross the sheet on diagonals. Dense oak woodland fills the
gaps, in blue-green and indigo masses with lit grey-green crowns. Two pale cream dirt paths wind down through it: one on
the upper left and one S-curve in the centre. Two smaller path ends sit at the top and bottom right. The paper is white.

Value thumbnail (five steps; share of the target):
1. Near paper (9%): the dirt paths (cream-pink, L about .9) and the thin white seams where meadow meets wood.
2. Light (21%): the lit meadows (hansa yellow + sap green, L .68 to .8): the top slope, the right diagonal band, the
   upper-left strip and the big foreground meadow.
3. Light mid (19%): lit oak crowns (sage, grey-green) and shaded grass.
4. Dark mid (21%): canopy shadow, blue-green.
5. Dark (29%): deep indigo shadow in the ravine centre-right, the left woods and under the crowns. Mixed darks
   (ultramarine + sap green + burnt sienna), never ink black.

Focal point: the centre S-path with the big oak right above it, the dark oak to its right, and the lit lower meadow.

## Style balance

- Whole sheet: `ink-and-wash` (the requested style). It sets the ink share for the pen layer. Every family's washes
  use the `precise-watercolor` ladder (region overrides). The 612 px compile preview with woods on the two-band
  ink-and-wash ladder gave a khaki first wash, then near-black glazes with no mid values: camouflage, not oak crowns.
  The target's woods carry three steps (lit sage crowns, blue-green shadow, deep indigo), so the woods need the
  five-band ladder. The ink-and-wash character comes from the pen: open structure lines first, selective closing ink
  last.
- Meadows: `precise-watercolor` (region override). Grass is a wash question (skill section 5: blades are below cell
  scale). A connected pale field wash on dry paper, then a glaze where the slope turns and at the tree feet. No
  dry-brush scratching on the meadows (Cape failure).
- Ink: a sparse opening pen drawing plus light, selective closing ink at the focus. Ink pigment: sepia (base `_sep8`).
- Wet against dry: the woods canopy is wet on dry with crisp broken silhouettes against the grass (the target shows hard
  dark crown edges on the meadows). Nothing is wet-in-wet across a meadow/wood boundary, so the light grass edges stay
  sharp.

## Regions (families) and technique

| family | cue | style | move, paper | load | edges | layer |
|---|---|---|---|---|---|---|
| meadow-top [.47,0,.99,.17] | top lit slope, upper path end | precise-watercolor | wet on dry, dry paper | watery, pale | hard against trees, soft inside | 1 wash, 2 mid glaze |
| meadow-right [.78,.15,1,.46] | lit grass band down the right ridge | precise-watercolor | wet on dry | watery | hard at trees | 1, 2 |
| meadow-left [.19,.15,.47,.42] | lit strip right of the left path | precise-watercolor | wet on dry | watery | hard at woods | 1, 2 |
| meadow-low [.45,.58,.88,1] | foreground meadow, lower path | precise-watercolor | wet on dry | watery, then medium glaze at the tree feet | hard at path and trees | 1, 2, 4 |
| woods [whole sheet, fallback] | oak canopy masses | precise-watercolor (under the ink-and-wash pen) | wet on dry wash, dry, shadow glaze on dry, ink on dry | medium, then thick darks | broken silhouettes, crisp crown undersides | 1, 3, 4/5, ink |

Family boxes only label the painter's own colour/value shapes (assigned by overlap), so region edges follow the
target's shapes, not the boxes. There are no rectangular reserves, so no unsupported straight seams.

Resolution: 1224 px on 158 mm gives 0.129 mm per output pixel. The paths are about 5 mm wide (about 39 px), well above
threshold, so they are paper reserves. Oak crowns are 3 to 10 mm, so they are painted shapes. Grass blades and leaf
texture are below threshold: wash plus granulation and paper tooth.

## Protected lights

- The dirt paths: bare paper, kept by the painter's near-paper rule (the compile preview shows both main paths white).
  Toning: if they still blaze white at the end, the painter's light pass gives them a pale warm tint (raw sienna).
- The white seams along wood edges are below 1 mm. They are left to broken wash edges, not reserved.

## Palette

`--paintsadd ultramarine,rawsienna` on top of the painter's fitted box (hansa, cerulean, quinacridone rose, sap
green). I first tried `--paints hansa,sapgreen,ultramarine,cerulean,rawsienna,sienna`. Its local error was 6.7 ΔE,
and the dark neutral greys (22% of the target) and the blue-violet shadows were each off by 5 ΔE. Rose + sap green is
what reaches those neutral darks. Keeping the fitted four and adding pans gives 3.1 ΔE (every local colour within
2.2). Ultramarine becomes the granulating tube (`_skyb`) for the blue canopy cells (23.7%), so the woods granulate the
way ultramarine shadows do. Raw sienna warms the grass.

## Layer order (light to dark)

0. Opening pen (sepia, light): path edges split into open sides and broken into runs, the ridge and meadow edges, and
   the long wood silhouettes against the grass. 41 lines, all tapered. No interior squiggles.
1. Light wash: meadows pale yellow-green, crowns pale grey-green. Paths stay paper. Dry.
2. to 3. Mid values on dry paper: meadow turns, the lit crowns' local colour, the canopy body. Hard edges at the crowns. Dry.
4. to 5. Shadow glazes last on dry paint, crossing region boundaries: the deep ravine shadow runs across the woods and
   onto the meadow feet. The tree-foot shadows cross from woods into meadow-low and meadow-right.
6. Closing ink on dry paint, focal area only: the centre oak trunk and limbs, the dark oak right of the path, the wood
   shadow edges by the path, and a few dark canopy accents traced from the target's own hard dark lines. 27 lines.

## Variant and settings (what I changed and why)

- Variant: started as `region_w13_noslane`, revised to `region_w13` at boundary 18 (see Revisions). Without lanes the
  big woods plane became one straight-edged wedge.
- `extra-args.json`: `--paintsadd ultramarine,rawsienna` (the palette above).
- `config.json`: woods family on the precise-watercolor ladder (see the style balance).
- Darks: base `--darkgain 1.3` kept at the start. I will look before the dark bands and revise down if the woods turn to
  black masses (the 612 px marks preview hinted at this with the automatic palette).

## What would show failure

- The woods turning one flat black-green mass with no lit crowns (too much darkgain, or patchwork glazes).
- Meadows olive or khaki instead of yellow-green; meadows scratchy or speckled.
- Paths painted over, or outlined like a tracing.
- Parallel bands, straight seams or block outlines along the family boxes.
- Ink filling dark masses, or heavy ink over blurred paint.

## Revisions during painting

- Look 2 (opening done): the painter drew 26 of my 41 opening lines and dropped every path edge. Its selection
  (`selectValueInk`) refuses any line touching a protected light cell, and my path edges were traced on the path's own
  light pixels. The opening cannot change now. Fix for the closing ink: I rebuilt the protected-light rule at the 1224
  grid (cells within 9/9/12 of the lightest 10%, closed, shapes of at least 144 cells; 3.0% of the sheet) and traced
  loops 4 cells outside it. I split them into the two open banks of each path, broke them into tapered runs of about
  24 px and added them to `closing-lines.json` at light weight (.55). They sit on the real path edge, so they also pass
  the closing contrast test. Lesson for the next try: draw opening lines off the protected lights.
- Looks 3 and 4 (after passes 14 and 16): the woods passages (9 passages over 76% of the sheet, one per pigment) came
  out as one giant straight-edged block: a flat body, a ruled diagonal right edge, a straight bottom edge, and only
  granulated dabs to its right and below. Pass 16 painted hansa into exactly the same parallelogram, so every woods
  pass would repeat it. The likely cause is my whole-sheet woods family (bounds [0,0,1,1]): its shapes merge into
  sheet-sized passages, while the tight meadow boxes get about 78 shape-following passages each. Revision at boundary 16:
  the woods split into eight families along the masses the meadows divide them into (top-left, left column, centre
  oak, ravine, top-right, right, bottom-left, bottom-right), all still on the precise-watercolor ladder. Shapes are
  assigned whole by overlap, so passage edges still follow the target's shapes.
- Look 5 (after pass 18): the split changed nothing. The pass list was identical and pass 18 refilled the same block.
  The real cause is my own token `_noslane`. `shapedPlanePaths` (src/paint/experimental/shaped-marks.mjs) paints each
  plane as one flat-brush gesture along its fitted long axis unless lanes are on. Its own comment says that gesture
  "left wedges and streaks across subject-d/SF/Cape skies". On a sheet-sized woods plane the gesture's reach ended in a ruled
  diagonal. I had removed the lanes to avoid stripes in a picture with no sky, but the lanes are what lay big planes as
  overlapping wet bands. Revision 2 at boundary 18: `bench/variant.txt` back to `region_w13` (base lanes 6 mm, step
  .8). The block from passes 2 to 18 stays on the paper. Later passes should cover the bare right third and bottom
  strip with lane washes. Lesson for the next try: keep the base lanes.
- Look 6 (after pass 22): no change. In paint-plate `skyLaneRadius`, lanes only apply to bluish planes (mean b > r +
  10), so the green-khaki woods plane never gets them. `_noslane` was not the cause after all (the revert is harmless).
  The single fitted gesture is the default for every non-sky plane. Revision 3 at boundary 22: `region_w13_spl6`
  (`--strokeplan 1 --lanemm 6`). Every large non-texture passage is laid as lanes of strokes, each charged by the plan
  under its own footprint (light-to-dark.mjs, planLanes). Windows-sized passages keep their single gesture. The owner
  rejected V095 (`_spl6` + `_wre15`) on hair as noisy; here there is no hair, and I leave out `_wre15` (wash reach). Risk:
  lane streaks. Watch for parallel bands in the next woods passes.
- Looks 7 to 12: with lanes, the raw sienna pass (26) covered the bare right third, the bottom strip and the paths with
  a pale warm wash, so the paths now read cream, not blazing white. Mid passes 27 to 70 built lit olive crowns and
  blue-grey shadow shapes. The shadow bands 71 to 84 and the painter's touch-ups (to pass 100) gave deep indigo woods.
  The block edge from passes 2 to 18 is mostly buried; a trace of it shows on the lower right. Darkgain stayed at the
  base 1.3: the darks match the target's share without going black. Still off: the top-right slope and the bottom strip
  are paler than the target, and the meadows are more olive than the target's yellow-green.
- Revision 4, before the closing drawing: the paths already read by value, so full banks on both sides would look
  traced. The bank runs are thinned to two in three, at weight .45 and width .9. 51 closing lines: focal oak trunks and
  limbs, wood shadow edges by the centre path, dark canopy accents, broken path banks.

## Outcome (look 13, finished) and lessons for the next try

- The finished painting reads as the hillside. Deep indigo woods, lit olive and blue crowns, yellow-green meadows,
  cream paths, and the S-path and centre oak in place. Weak points: a faint trace of the early wedge edge on the lower
  right; the top-right slope and bottom strip are paler than the target; meadows more olive than yellow-green; the ink
  layer is nearly absent.
- Closing ink: a diff of looks 12 and 13 shows only one closing line drawn (the dark oak's trunk, 0.01% of the sheet).
  The other 50 were dropped by the closing selection (no protected cell, and mean edge contrast at least .06 at the
  painting's own grid). At 1224 px the target's gradients per cell are half those at the 612 px preview, where 26 of 27
  passed. Next try: check closing lines against the 1224 grid (the check runs at 1224, so a compile at 1224 shows the
  count), and put them only on the steepest dark edges: crown undersides, trunks, the dark rims of the paths.
- Opening: draw it off the protected lights (path edges dropped), and keep each line at least 3.5% of the width long.
- Big planes: use `_spl6` from the start. Without it, every large non-blue passage is one fitted gesture with straight
  sides, the wedge seen in passes 2 to 18.
- Palette: `--paintsadd ultramarine,rawsienna` over the fitted box worked. The meadows could use more hansa (or
  `cadyellow`) for the target's acid yellow-green.
