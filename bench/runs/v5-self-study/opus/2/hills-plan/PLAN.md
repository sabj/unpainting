# Hills, V5 try 2: loose ink and wash

## Reading the reference

An aerial view of oak hills on white paper. Lit, acid yellow-green grass slopes cross the sheet on diagonals. Dense
oak woodland fills the gaps: rounded crowns with lit grey-green tops, teal/blue-green bodies and blue-black
undersides. Two tan dirt paths (warm, about 240/205/160, painted, not paper) wind down: one upper left, one S-curve in
the centre, plus path ends at the top and the bottom right.

Value thumbnail (five steps):
1. Near paper: thin white seams where meadow meets wood, the brightest spots on the paths. Under 0.1% of the sheet.
2. Light: the paths (pale tan) and the lit meadows (hansa + sap green, high chroma).
3. Light mid: lit oak crowns (grey-green), shaded grass.
4. Dark mid: canopy body, teal blue-green.
5. Dark: ravine shadow centre-right, the left woods, crown undersides. Mixed darks (phthalo blue + burnt sienna + sap
   green + rose), never ink black.

Focal point: the centre S-path with the big oak above it and the lit lower meadow.

## What I changed from try 1, and why

| change | why (evidence) |
|---|---|
| `_cur` + `--paperlights 0`: white paper, no paper-relative lights | Try 1's template took the lightest tenth of the target (paths + bright meadow, 227/221/150) as "paper", reserved 34.5k cells (the tan paths) and tinted the sheet pink-cream. The target is on white paper; paths are tan paint. The 612 plan now says "painting on white paper" and covers 99.7% of the sheet, so the paths get a pale tan wash, not a cut-out. |
| `_spl6` from the start (lanes of strokes for big planes) | Passes 2 to 18 of try 1 were one fitted gesture per sheet-sized plane: the straight-edged wedge the judges called "flat slabs" at 10% and 25%. Try 1 switched to `_spl6` at pass 22 and the wedge stopped. |
| `--paintsadd phthaloblue,sienna` (was `ultramarine,rawsienna`) | All palettes reach the target (about 3 ΔE). Raw sienna's lane wash veiled the meadows olive, and ultramarine made the woods navy. Phthalo blue gives the teal oak bodies, and burnt sienna gives the tan paths and neutralises phthalo into the darks. |
| `--violetshadow 0` (base `_vio` off) | Rose + ultramarine shadow glazes over yellow-green go grey (skill: complement over a warm base, mud after 2 glazes). The target's meadow shadows are green, not violet. |
| `_ms300` (min shape 300 cells, about 5 mm²) | The tiny value islands gave the speckle and pale holes ("speckle", "round holes" tells). Shapes under about 2.2 mm square merge into their neighbours. |
| New opening drawing (42 lines) | Try 1's opening lost every path edge because they were traced on the protected paths. With paths now unprotected, I drew the path banks and the woods' silhouettes against the meadows. They come from colour masks (meadow = saturated yellow-green, path = warm light), smoothed, split into tapered runs of 15 to 65 target px with gaps, all at least 9.8 mm long. Sparse: no squiggles inside the woods. |
| New closing ink (51 candidates) | Try 1 drew 1 of 51. The painter keeps a closing line only where the mean 4-neighbour value contrast along it is at least .06 on the 1224 grid. I emulated that test (same resize, same density formula, white paper). I put the lines on the wood/meadow rims, snapped onto the steepest edge and re-smoothed, plus the target's own dark lines nudged onto their flanks. 51 pass at .062 or better in my emulation. |

Kept: woods and meadows on the precise-watercolor ladder under the ink-and-wash pen (same reasoning as try 1: woods
need three value steps); base `_dk13` darkgain; base `_lay4`.

## Critique points I rejected

- "Texture arriving as a dump, late sharpening": light to dark with accents last is right. The fix is early
  structure (pen sketch plus a wash over the whole sheet), not earlier darks.
- Classic edge and marks scores as evidence of quality: they reward blur.
- "Speckle or dotted trails instead of drawn lines": taken as two fixes, not one. Longer pen gestures, and fewer tiny
  paint islands (`_ms300`).

## Style balance

- Whole sheet `ink-and-wash` (the request), so the pen carries the structure: an opening sketch, then crisp closing
  ink on the crown rims against the grass.
- Every family's washes on `precise-watercolor` (region overrides): connected pale washes, mids on dry paper, shadow
  glazes last. No dry-brush scratching on the meadows (Cape failure). Grass is a wash question; blades are below cell
  scale (0.129 mm per cell; a blade is under 1 cell).
- Ink: sepia (base `_sep8`), pressure .3 opening, closing on dry paint.

## Regions and technique

| region | cue | resolution | move / paper | load | edges | layer |
|---|---|---|---|---|---|---|
| meadows (top, right band, left strip, lower) | lit acid yellow-green | wash | wet on dry, one connected pale wash, lanes | watery, then a medium glaze where the slope turns | hard against trees, soft inside | 1, 2 |
| paths | tan earth | wash (paths are 5 mm, 39 cells across) | pale wet on dry | watery sienna + hansa | soft inside, pen bank | 1 |
| woods (8 families) | oak crowns, teal bodies, blue-black undersides | wash shapes (crowns 3 to 10 mm, 23 to 77 cells) | wet on dry crown masses; mids on dry; shadow glazes on dry | medium, then thick darks | broken crown silhouettes; crisp undersides | 1, 3, 4, 5 |

Family boxes only label the painter's own colour/value shapes, assigned by overlap; no reserves, so no straight seams.

## Protected lights

None declared. The painter's own near-white rule keeps the few pure-white seams. The paths are deliberately not
reserved: they are painted pale tan, as the target shows.

## Order

0. Opening sepia pen: path banks and wood silhouettes on the meadows (42 tapered lines).
1. Light washes over the whole sheet in lanes: pale yellow-green meadows, pale tan paths, pale blue-green woods. Dry.
2. to 3. Mids on dry paper: crown bodies, slope turns. Dry.
4. to 5. Shadow glazes crossing region boundaries: ravine shadow, crown undersides into the tree-foot shadows on the
   grass. Dry.
6. Closing sepia ink on dry paint: crown rims against the meadows, a few of the target's dark lines.

## Stage intents and what would show failure

- 10%: pen sketch visible plus a pale first wash over most of the sheet. Failure: bare right third, straight wedge edge.
- 25 to 50%: meadows bright yellow-green, woods mid teal. Failure: olive or khaki meadows, navy woods, paths still
  white or painted green.
- 75 to 100%: crown undersides dark, lit crowns kept. Failure: camouflage blotches, flecks, one flat black mass.
- Closing: rims drawn crisp on the meadow side. Failure: no ink drawn (selection drops them), or ink outlining every
  shape like a tracing.

## Revisions during painting

- Look 2 (opening done): 54 pen lines drawn on white paper, sparse and thin: path banks, meadow edges, the top
  slope. It reads as a first sketch, with no paper tint.
- Look 3 (after pass 2): a pale variegated hansa wash over the whole sheet. No wedge, no straight seam.
- Look 4 (after pass 14, end of the light band): a grid of printer streaks. Vertical seams every ~32 mm and
  rectangular tone blocks (the yellow meadow block in the lower centre has straight sides). Cause, read in
  `src/paint/experimental/stroke-plan.mjs` `planLanes`: each lane is cut into strokes of `--strokemm` (30 mm), the
  cuts sit at the same distance along every lane, and each stroke takes one charge (its mean demand, clamped .45 to
  1.8). So the demand is rendered as 6 x 30 mm blocks. The painter's segmentation puts 79% of the sheet into one
  region, so these lane washes cover meadows and woods alike. Revision 1 at boundary 14: `--strokemm 300`. Every lane
  is one stroke across the sheet (158 mm), so the aligned vertical cuts and the blocks go. Lanes still overlap one
  brush radius wet into wet. The light-band grid stays on the paper, and the mid passes should cover most of it.
  Lesson: with `_spl6` on a plate where one region covers most of the sheet, set `--strokemm` above the sheet width
  from the start.
- Look 6 (after pass 18): the new layers lie as long horizontal lanes. The block grid no longer grows; the band-1 seams
  show faintly underneath. Meadows turning yellow-green.
- Look 7 (after pass 30): the tan paths read clearly, painted, not cut out (the `_cur` + `--paperlights 0` change
  works). But the whole sheet is one olive-khaki body. The passes over 70 to 79% of the sheet are the continuous pale
  base under every non-white cell. One charge per lane stroke averages meadow and woods, so the base is their mean
  colour. The segmentation (`target-regions.mjs`, a fixed 6-cluster colour k-means) has no option, so this cannot be
  re-planned now. The meadow/wood split has to come from the later, smaller passes.
- Look 8 (after pass 50): woods forming as olive-green masses, meadows lighter, grey-blue lit-crown shapes.
- Look 9 (after pass 77, first dark band): blue-dark crown masses over olive bodies. The S-path, upper-left path and
  meadow slopes all read. No change; band 5 and the touch-ups go on.
- Look 10 (before closing, 100 passes incl. the painter's touch-ups, 10,648 strokes): teal-navy woods, yellow-olive
  meadows, tan paths. The closing set fits the painted edges, so no revision. Finished.

## Outcome (look 11) and lessons for try 3

Better than try 1:
- White paper. The paths are painted tan, not cut out. No pink bare paper.
- The ink layer is present at both ends. The opening sketch (54 pen lines) shows in the early frames. Closing ink
  lands as crisp sepia rims where woods meet meadow: the top slope's edge, the S-path meadow and the right band. Try 1
  drew one closing line.
- No wedge and no straight seam from the woods plane. The first wash covers the whole sheet at once.

Still wrong:
- Woods are still camouflage: flat navy and teal blotches with hard rims, plus burnt-sienna flecks scattered in them.
  The target's rounded oak crowns are not there.
- Meadows are yellow-olive, not acid yellow-green. The base passes covering 70 to 79% of the sheet put the
  meadow/wood mean colour everywhere.
- The band-1 lane grid (passes 3 to 14, before revision 1) shows faintly as vertical seams in the meadows.

Lessons:
- Set `--strokemm` above the sheet width (e.g. 300) together with `_spl6` from the start. Default 30 mm lanes render
  the demand as 6 x 30 mm blocks.
- Keep `_cur` + `--paperlights 0` on this white-paper target.
- Next levers for the olive and the camouflage: fewer mid layers (`_lay2`) so fewer stacked islands; drop burnt
  sienna from the box, since its flecks read as rust specks in the woods (the paths could take rose + hansa); and test
  `region_w15` (brush choice per passage) on a 612 compile.
