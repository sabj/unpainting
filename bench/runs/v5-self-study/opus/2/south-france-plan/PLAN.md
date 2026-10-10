# SF (South France hillside village): round V5, try 2 of 3

Requested style: urban sketch, pen plus light wash. Whole plate `urban-sketch` (the painter lifts it to the
ink-and-wash value floor: one light wash band, one shadow-glaze band), no per-region styles, so no style seams.

## What I changed from try 1, and why

| change | why (try 1 evidence) |
|---|---|
| `--palettewide 1 --paints ochre,sienna,sapgreen,hansa,ultramarine,cerulean` | Try 1 let the painter pick its box (cerulean, hansa, sap green, quinacridone rose). The rose went down as a full-sheet ground and left a pink margin, a pink stripe and pink gaps; the target has no pink. The new box is a landscape sketcher's: ochre for terraces and walls, burnt sienna for roofs, sap green and hansa for the greens, ultramarine for shadows and cypress darks, cerulean for the distant hills. Fit 6.0 dE against 7.2 for the seven-paint box I tried first; raw sienna added only another full-sheet pass. `--paints` is read only with `--palettewide 1` (paint-plate.mjs:330). |
| New hand-drawn opening pen (64 paths) at `--openingpressure 0.65` (default 0.3) | Try 1's opening was 0.1 mm hairlines nobody saw; the progress judge expected "pen-then-wash". Urban sketch is pen first. The drawing now holds every house (focal towers, upper village), eleven cypress flames, the pine trunk and an irregular crown, loose canopy contours, terrace edges, the path. |
| New closing pen (83 paths) | Restates the structure, then the focal details on dry paint: eave shadow lines, windows, the string course, hatching on the shadow side of the lower tower, cypress shadow sides, rising pine branches with twigs (try 1 had none of the branch structure). |
| `--minshapecells 600` (default about 180 at this width) | The camouflage patchwork: 1213 connected shapes, many tiny. Now 483. Bigger connected canopy shapes, fewer blotches. |
| `_noslane` | Template sky lanes (6 mm lanes) apply to big bluish passages; SF has no sky, and the judge named straight travelling fronts. |
| `_tp1` (base `_tp2`) | Touch-up rounds push shapes back toward the full target value; an urban sketch keeps light washes. One round only. |
| `_dk11` (base `_dk13`), at the start only | Try 1 put navy-black blots in the canopy. Removed at revision 3 (the ground came out flat and needed the shadow glaze at full strength). |
| `_lay2` (base `_lay4`) | Fewer mid layers; urban-sketch has no mid band, so this is mostly a safety cap. |
| `--vignette 0.05` (was 0.04) | The wash stops inside the sheet like a sketcher's; with no rose in the box the margin is white paper, not pink. |
| Dropped `--drytooth 1` and `_tp3` | They chased the stripe of try 1; the cause (lane geometry and the palette) is removed instead. |
| Reserves: two lit tower walls, one path glint | Lit walls stay paper in an urban sketch (style reserve list). Each kept small so no unsupported straight seam. |

Critique points I rejected: the 75% and 100% process scores (3 and 4) as evidence that the late stages were fine (I see
the same patchwork); the classic edge score (9.26) as a guide; "region arriving finished" as a priority.

## Reading the reference (value thumbnail)

- Lights (1): sunlit ochre terraces upper left, lit tower faces, the pale path and clearings (warm cream, not white).
- Mid lights (2): yellow-green pine crown, grey-green olives, terracotta roofs, blue-green distant hills.
- Mids (3): olive and oak masses, violet-grey shadow sides of the towers.
- Darks (4): cypresses, canopy hollows, recesses under eaves, pine trunk and branches.
- Focal point: the three stone tower houses right of centre (x 0.66 to 0.97, y 0.33 to 0.82). Secondary: the pine.

## Regions, technique and order

| family | cue | resolution question | move, layer |
|---|---|---|---|
| village-focal | towers, roofs, shadow sides | ink and wash: windows and eaves are 1 to 3 target px (1 to 3.7 mm, 4 to 16 cells); the pen carries them | opening pen; pale wash wet on dry; shadow glaze on dry; closing pen |
| village-upper | small houses, cypresses | ink and wash | opening pen; pale wash |
| distant-hills | blue-green hills | wash | one pale cerulean/green wash, no pen but one faint ridge |
| terraces | sunlit ochre | wash, nearly paper | pale ochre wash |
| olive-slope / left-slope / lower-right | grey-green masses | wash; canopy contours in pen | pale wash, then one shadow glaze across adjoining masses |
| pine-foreground | yellow-green crown, dark trunk | ink and wash: branches are 1 to 2 px lines | pale yellow-green wash; glaze; closing pen branches |

Order: opening pen (black ink, declared `pigment: black`; urban-sketch draws black, so the base `_sep8` sepia is
skipped) -> light wash band (one pass per paint, pale, wet on dry, watery load) -> dry -> shadow glaze band on dry
paper, crossing family bounds (tower shadow sides, canopy hollows, cypresses) -> one touch-up round -> closing pen on
dry paint. Edges: hard on dry paper at the buildings; canopy edges broken; no wet-in-wet over the focal detail.

## Stage intents

- After the opening: a legible black-ink sketch of the village, cypresses and pine on white paper.
- After the light washes: pale local colour, ochre ground, greens, warm roofs; white margin; pen still dominant.
- After the shadow glaze: tower shadow sides and canopy hollows darker; towers read as cubes.
- Closing: crisp pen details at the towers and the pine branches; no ink in the lights.

## What would show failure

- Any pink or blue-black blots; a full-sheet single-colour ground at the first stops.
- Canopy reading as camouflage confetti again; the towers lost in mid-value mush.
- Pen invisible under the washes; straight lane edges or stripes.
I look at each stop and revise later passes (lighter `--stylegain`, fewer shapes) if the washes go too dark or busy.

## Revisions during painting

Start variant `region_w13_lay2_noslane_tp1_dk11`; final files as delivered: `region_w13_lay2_noslane_tp1`.

- Look 1 (opening drawn): the pen is legible but thin and grey even at `--openingpressure 0.65`. The pass list showed
  that every paint's light pass still sweeps every unreserved cell (the light phase mask is the whole sheet, by design in
  light-to-dark.mjs; only the amount varies). That cannot be made local from the plan.
- Look 3 (after pass 6, ochre and sienna): the speckled diagonal stripe of try 1 reappeared inside the big wet-on-dry
  ground passage (a long sweep running dry), and the ground is peach. Revision 1: `_spl6` (lane stroke planner with
  reloads) for the remaining grounds.
- Look 4 (after pass 9, sap green): the stripe filled with green, but the 6 mm lanes of 30 mm strokes left a horizontal
  brick pattern. Revision 2: `_spl10_sml45` (wider lanes, longer strokes).
- Look 5 (after pass 15): still a tiled grid and a uniform khaki ground with no value structure. Revision 3: back to
  plane sweeps for the shadow band (smaller shapes, less risk of running dry), `_dk11` removed (base dark gain 1.3) so the
  shadow glaze builds form, closing pen widths x1.6 and weights +0.1.
- Look 6 (after pass 22): the ochre and sienna shadow passes laid brown blotches; left to the green and blue shadow
  passes, which turned them dark olive.
- Look 7 (before closing): no pink; olive/khaki sheet, dark pine and cypresses, terracotta roofs; the canopy still
  reads as patchwork and the two wall reserves show as stark white rectangles. Revision 4: the closing pen restates
  the whole opening drawing (pine crown, canopy contours, terrace edges, path added) boldly, plus the focal details.

## Outcome (my reading of the finished sheet)

Better than try 1 in palette (no pink, no rose ground), cypress and pine darks, and roof colour; still weak. The
canopy is camouflage patchwork, the lane tiling from passes 7 to 15 shows in the ground, and the closing pen came out as
thin grey hairlines that barely read: the ink layer is thin in the material model whatever the width and pressure, so
it cannot carry an urban sketch on this sheet. For try 3: four paints at most (fewer full-sheet light passes, which the
judges see as travelling bands), no lane planner, and test whether the drawing can read at all
(`--drawwidthmin`, `--drawwidthgain`) before relying on it. Also a lower `--stylegain` so the washes stay light enough
for the pen to show.
