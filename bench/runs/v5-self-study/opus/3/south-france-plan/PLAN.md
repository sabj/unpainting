# SF (South France hillside village): round V5, try 3 of 3

Requested style: urban sketch, pen plus light wash. Whole plate `urban-sketch` (the painter lifts it to the
ink-and-wash value floor: one light band, one shadow band). There are no per-region styles, so no style seams.

## Reading the reference (value thumbnail)

- Lights: the sunlit ochre terraces and walls (top left), the lit faces of the three tower houses, and the pale path
  (bottom centre). None are bare paper in the target; they're pale warm planes.
- Mid values: the olive and oak masses (grey-green, with yellow-green lit tops), the terracotta roofs and the
  blue-green distant hills.
- Darks: the cypress flames, the shadow sides of the tree masses (blue-green), the house shadow sides, eaves and
  windows, and the pine trunk and branches.
- Focal point: the three tower houses (right centre). The second focal mass is the foreground pine (left bottom).

## What I changed from try 2, and why

| change | why |
|---|---|
| Opening and closing pen get **per-point `weights`/`widths`**, and **`--openingpressure 1`** | Try 2's files put `"width"` on the line, which the painter never reads. In this engine the ink width comes from pressure through the material profile (black ink: 0.1 + 0.3·s^1.3 mm), with s the per-point weight capped by `--openingpressure` (default 0.3 → 0.16 mm hairlines) or `--closingpressure` (1 under `_ink4`). At pressure 1 the weights (0.72 to 1) give 0.29 to 0.40 mm lines: a fineliner, not a hairline. |
| `--inkkscale 12` (base `_sep8` = 8) | Try 2's lines came out about one cell wide and grey. More absorption per deposit makes the line read dark. |
| New crown contours | Try 2's tree masses were regular equal scallops (cartoon clouds). Each crown is now a loose, irregular, broken contour (2-3 strokes with gaps, varying bump size), over 11 masses: pine, centre canopy, left olives, mid trees, the upper right mass, bushes beside and below the houses. The houses, cypresses, terraces and pine trunk keep try 2's well-placed geometry. |
| Closing pen is **selective** (60 lines) | Try 2's last revision restated the whole opening drawing. Now the closing pen covers the focal houses (outlines, eaves, eave shadows, windows, side hatching), cypress shadow sides, pine trunk, branches and twigs, olive trunks, and one extra loose crown (the olive mass left of centre). I tried value-following loop-scribbles in the deepest shadows and rejected them: they read as mechanical chain-link trails. |
| **No reserves** (try 2: two wall rectangles, one path glint) | They came out as stark white sticker rectangles. The lit walls aren't paper in the target; the painter's own near-paper light detection is enough. |
| `--minshapecells 2500` (try 2: 600), `--layersmooth 3` (default 2) | The camouflage patchwork. The plan has 183 connected shapes (try 2: 483) and smoother wash layers. In an urban sketch the pen carries the texture and the wash stays in big calm shapes. |
| `--shadowthresh 0.48` (default 0.38) | A first run of this plan (stopped and lost to a harness refusal, see the log) showed the shadow glazes over 44% of the sheet in lacy, speckled masks: the target's foliage texture sits right at the threshold, which gave the camouflage again. At 0.48 the dark glazes cover about 24% (summed area 122% over the five pigments, against 220%), on the real darks: cypresses, deep valleys, house shadow sides. |
| `_cg10` (base `_cg13`) | In that first run the cool share in the light ground (ultramarine plus the granulating sky tube that base `_skyb` adds) turned the whole ground grey-olive where the target is yellow-green. |
| `--drytooth 1` | The first run's light passes each had 15 inferred dry-brush passages (speckle, scratchy facades). Light washes in an urban sketch are flat. |
| `--stylegain 0.85` | Lighter washes, so the pen shows through and the paper breathes. |
| Paints `hansa,ochre,sienna,sapgreen,ultramarine` (dropped cerulean) | One fewer whole-sheet light pass. The palette fit improved (5.34 dE against try 2's 6.0); ultramarine and sap green make the distant blue-green. |
| `_tp1` (base `_tp2`) | One corrective glaze round per shape at the end, not two. With the lighter shadows it ties each mass's fragments together. I wanted `_tp0`, but then the base token's `--touchgain` is read by nothing, and the painter refuses the plan. |
| `_lf` (`--loadfeather 1.5`), added at pass 12 | The single 85% ground passage ran dry in a broad diagonal band. Feathered load joins for the remaining passes; it didn't close the band. |
| `--touchgain 0.8`, added at pass 17 | Meant to push the grey ground toward yellow-green. In hindsight a mistake: it produced the late blotch dump (see Outcome). |
| `_lay2`, `_noslane` kept; no lane planner (`_spl`, `_sml`) | Two wash layers are enough for a light sketch. There's no sky, so no lanes. The lane planner made the brick tiling in try 2. |

## Critique points I rejected

- Classic edge (9.2) and marks (6.84) scores. These are pixel statistics that reward high-frequency blotch, so I'm
  willing to lose some of them for calmer, bigger shapes.
- "Pen-then-wash" read as a call to make the ink heavy. The pen must read, but it stays at most 0.4 mm and selective
  at the close. Heavy ink over a blurry wash is a known failure.
- GLM's 4.0 overall (spread 1.0). Noisy; I don't treat it as a sign try 2 was nearly right.

## Per-region technique and order

| region | question | move | order / layer |
|---|---|---|---|
| Focal tower houses | ink and wash (windows, eaves and courses are 2-3 mm, below brush scale) | pen outline first; pale ochre wall wash and sienna roofs wet on dry; violet-grey shadow sides as the shadow glaze; closing pen for eaves, windows, hatching | pen, light, shadow, closing |
| Upper village | ink and wash, paler | pen; pale ochre/sienna washes; two windows in closing pen | pen, light |
| Cypresses | wash plus pen | flame outlines in pen; dark sap green/ultramarine glaze on dry paper; closing shadow-side line | pen, light, shadow, closing |
| Olive/oak masses | wash question (big planes); pen gives the leaf-mass edge | loose crown contours in pen; one pale yellow-green wash; one blue-green shadow glaze on dry paper across the shadow sides (true darks only) | pen, light, shadow |
| Foreground pine | wash plus ink (branches are lines) | loose crown in pen; pale hansa/sap green wash; shadow glaze; trunk, branches and twigs in closing pen | pen, light, shadow, closing |
| Terraces, path | wash | pale ochre wash with paper left at the sheet edge (vignette 0.05) | light |
| Distant hills | wash | pale cool sap green + ultramarine | light |

Brush and pen against features: the pen line is 0.29-0.40 mm (1.3-1.7 cells at 1216 wide, 0.23 mm per cell). Windows
are about 2-3 mm, and eaves and string courses are lines, so all go to the pen. Tree masses are 20-80 mm, so they're wash
planes.

Moisture and load: all washes wet on dry, one connected passage per shape (the painter's own calibrated loads). Glazes
go over fully dried layers (the painter dries at every pass boundary). There's no planned wet-in-wet: no sky, and the
reference's tree masses have hard edges.

Glaze list: the shadow glazes cross the region boundaries (shadows are never split by region in the value plan), so the
tree shadow sides and house shadow sides are unified.

## Stage intents (what each stop should look like)

- Before the first wash: a readable black pen drawing on white paper: houses, cypresses, crown contours, pine trunk,
  terrace lines. If the lines are hairlines, the plan has failed.
- Light passes: pale yellow-green and ochre washes under the pen, paper showing between masses and at the edges. The
  ground should be yellow-green, not a grey slab.
- Shadow passes: cypresses, shadow valleys and house shadow sides as connected dark shapes, not lace.
- Touch-up round: one glaze per shape where the sheet is lighter than the reference; it shouldn't flatten the sheet to
  one olive.
- Closing: crisp focal ink on the houses, pine branches and cypress sides.

What would show failure: pen lines invisible at the first stop; a grey whole-sheet slab; lacy blotch patchwork
returning; white sticker holes; ink dominating with no wash value structure.

## Painting log

Run 1 (lost: the painter refused it at the end, "options the plan chose were read by nothing: --touchgain
--orderregions") used `_tp0`, `--orderregions 6`, `--minshapecells 1500` and the default shadow threshold. What it
taught me, all used in the final plan: `_tp0` leaves the base `--touchgain` unread; `--orderregions` goes unread after a
revision at the closing stop; the shadow band covered 44% of the sheet in lacy masks (camouflage); the light ground was
grey; and inferred dry brush made speckle.

Final run (`region_w13_lay2_noslane_tp1_cg10` plus the extra args above):

- Look 1 (before the first wash): a clear black fineliner drawing on white paper. The ladder: 23 passes. The ground is
  now one passage over 85% of the sheet per pigment (run 1 had two), and the shadows cover 24.6%, glazed. Pass 23 is one
  touch-up round.
- Look 2 (after pass 12): a khaki ground under the pen. A broad diagonal band of speckled paper runs from lower left to
  upper right, where the single huge passage's sweep runs dry. (Run 1 had a thin diagonal stripe in the same direction.)
  Revision 1: `_lf` (`--loadfeather 1.5`, read for every physical passage) to feather the load joins for the rest.
- Look 3 (after pass 17): the ultramarine ground passes tinted the band light blue but didn't close it. The ground is
  still grey-olive. Revision 2: `--touchgain 0.8` (token default 0.6), hoping the corrective round would push the ground
  toward the target's yellow-green and fill the band.
- Look 4 (after pass 22): the calmest state of this try. There are fewer, more grouped dark olive shadow masses
  (cypress band, pine, centre canopy), the house fronts are mostly light, and the pen holds the structure. The blue band
  is still visible.
- `finish` without stopping at the closing drawing (a revision there makes options unread). The touch-up round expanded
  to passes 23-29 and about 4,000 strokes of small corrective blotches (ochre, olive, some navy-black near the upper
  cypresses), then the closing pen.

## Outcome (my reading of the finished sheet, look 5)

- Better than try 2: the pen reads as a real fineliner drawing from the first frame (houses, cypresses, crowns, pine).
  There are no white sticker rectangles, and the roofs and house fronts stay warm and light.
- Worse than it should be: the touch-up round put back a fine camouflage of blotches all over the canopy, with navy-black
  spots. It is exactly the "texture arriving as a dump late" tell, and it buried the calmer look-4 state. The diagonal
  band from the huge ground passage is still visible. The ground is olive-grey rather than the target's yellow-green.
- My estimate: about 3 / 10 for the finish, and 2.5 / 5 for process (pen first, light to dark, but a late texture
  dump).

What I'd change next: keep the touch-up at its minimum (`_tp1` with a low `--touchgain`, e.g. 0.2; `_tp0` can't be
used because the base `--touchgain` would go unread), and judge whether look 4 is the finish. Break the 85% ground
into smaller passages so no single sweep runs dry across the sheet. Drop ultramarine from the light ground.
