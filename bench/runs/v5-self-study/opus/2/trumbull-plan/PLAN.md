# Trumbull, V5 try 2: precise architectural watercolor

Self-review of try 1 and my reading of the judges: `bench/SELF-REVIEW.md`. Short version: the drawing, landmarks and
average values were right; the stone was a mottled camouflage of small patches, the shadows went olive green, windows
sat in pale rims, the sky was torn into hard fragments, and more than half of all strokes were a late corrective dump.

## Reading the reference (value thumbnail)

- Five values. 1 lightest: the white cumulus top right (paper), the sunlit gable front and the lit faces of both towers
  (pale warm ochre, not paper). 2: blue sky (graded, deeper top left), lit stone of the left and right ranges, pale
  roofs. 3: warm stone in half-shade (left face of the main block, tower flanks), slate roofs, the green tree. 4: shadow
  sides and recesses (the strip right of the left tower, the inside corner right of the gable, under-eaves). 5 darkest:
  window glass (dark blue), the navy street signs, traffic lights, ground-floor openings.
- Focal point: the sunlit gable and its two arched windows, with the navy street sign on the corner below it.
- Light from the left/front: the gable front is the lit plane; shade falls on faces turned right and in inside corners.

## Regions, technique and order

| Region (family) | Cue | Question | Move / paper / load | Edges | Layers |
|---|---|---|---|---|---|
| Sky | graded blue, white cumulus top right | wash | one wet passage of overlapping lanes (base), watery-medium, granulating ultramarine | hard at the roofline, soft inside | light only |
| Gable front (focal) | sunlit pale ochre, sparse coursing | wash + sparse block hints | pale broad wash on dry paper, watery, **run over the windows**; ochre block hints after the mid layers | hard at the corner | light, mid L0-L3, stone hints |
| Shade wing, tower flanks | same stone in half-shade | wash + glaze | local-colour wash, dry, one warm-violet shadow glaze across stone, windows and eaves | hard at the lit corner, soft into the recess | light, mid, shadow b4/b5 |
| Left and right ranges, towers | warm stone, mullioned windows | wash | broad pale wash over wall and windows together, mid planes on dry paper | crisp at window frames | light, mid, shadow |
| Roofs | blue-grey slate | wash | cool mid wash wet on dry, darker eave | hard at ridge and eave | mid, shadow |
| Windows, doors | dark blue glass, pale frames | painted (pane 16-24 cells, mullion ~8 cells at 0.233 mm/cell) | dark glass in two dried recess layers **over the wall wash** | hard | recess accents last |
| Tree right | yellow-green canopy | wash | one irregular canopy mass wet on dry, shadow group on dry paper | soft lit side | light, mid, shadow |
| Trees/shrubs left, street | muted olive; grey pavement | wash | one pale mass; cool violet ground glaze (base `_rg10 _vio`) | soft | light, mid / shadow |
| Signs, traffic lights | navy, near-black | ink and wash | darkest paint accents, closing ink on hard edges | hard | last |

Glazes: two cross-region shadow glazes (bands 4 and 5, one shared shadow support, never split by region) running over
stone, windows and roof edges on each shadow side. Wet passages: only the sky lanes and the first stone wash are broad
wet passages; windows, signs and frames are on dry paper. Families and reserves are unchanged from try 1 (thirteen
descriptive families, one style, one small cloud reserve), because they caused none of the faults I found.

## Protected lights

- Paper: the brightest cumulus top right (reserve 0.94-0.985 x 0.01-0.05); the painter's own near-paper lights
  (lit sills, sign lettering, white shirts).
- Pale painted planes, not paper: the lit gable front and lit tower faces. The shadow glazes stop at the lit corner.
- Windows are **no longer** held out of the first wash (see changes).

## Drawing

- Opening (sepia ink, 101 lines): last try's 85 structural edges traced from the target (roofline, gable slopes, lit
  corner, arches, jambs) plus 16 lines I read by hand from 8x gridded crops of the target, for structure the trace
  missed: both tower outlines and cornices, the shade-wing corner, and eight window boxes on the left and right ranges.
  Kept in ink rather than graphite on purpose: a visible pen drawing under the first wash is what makes the early stage
  read "drawn, then washed" instead of "faded in".
- Closing (unchanged, 158 spans, used by base `_ink4`): only spans the target shows as hard dark lines (window frames,
  mullions, the pole, signs); none in the lights.

## What I changed from try 1, and why

| Change | Setting | Why |
|---|---|---|
| Windows washed over, not cut out | `--recessclean 0` (base `_rcl` set 1) | `recessClean` zeroes the first wash on every recess cell, so the first stage showed the facade wash with window-shaped holes (judges: "cut edges, round holes") and the finish showed pale rims round every window. A painter washes the wall, then paints the glass on top. |
| Touch-up reworked as few, large glazes | `--touchfamilies 12 --touchmincells 0.004 --touchsmoothmm 3 --touchdmin 0.06` (defaults 24, 0.0008, 1, 0.04) | The corrective glazes were cut per small planning shape (minimum ~1000 cells), which laid ~8000 strokes of patches: the mottle and the late "texture dump". Now only shapes over ~0.4% of the sheet, smoother, and only real deficits get a glaze. |
| Darker main ladder from the start | `_dk16` (base `_dk13`) | Try 1 left the shadows far too light until pass 72 (strip right of the tower 145 against 97), and the touch-up then had too much to fix. The planned cross-region glazes should carry the value. |
| Burnt sienna back in the palette | `--paints ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia,sapgreen` | Shadows went olive green from sap green alone. With sienna the darks can be sienna/ultramarine/sepia browns; sap green stays for the tree. (`_pbs` as a token replaces `_pgreen` in the palette slot and the check refused it, so the documented `_pgreen`+`_pbs` list is set directly.) |
| Smoother mid-layer shapes | `--layersmooth 3` (default 2 mm) | The mid layers are cut on a smoothed value field; more smoothing gives larger connected planes and fewer small islands (the "Y1 pale islands" failure). |
| Kept | `_lw`, `--skygran 1.6`, `--gran 0.3`, families, reserve, closing ink | The lit gable colour and the sky granulation were the parts that worked. |

Critique points I rejected: dropping the pale first wash or painting darks first to avoid a "faded in" look (breaks
light-to-dark); adding more ink for "edges/detail" (the faults are halos and mottle, not missing line); and the
"region arrives finished while its neighbour is untouched" note, which I do not see in the strip.

## Stage intents (what each stop should look like)

1. After the opening: thin sepia structure, towers, roofline, corner, arches and window boxes; no fill.
2. Light passes: pale warm stone over the buildings **including the windows**, graded granulating sky, cloud left as
   paper. A tinted drawing.
3. Mid layers: roofs, half-shade stone, tree mass as large connected planes; window bodies begin.
4. Shadow glazes: one warm-violet glaze per shadow side crossing stone, windows and eaves; lit gable stays pale.
5. Recess accents (dark glass, signs), a short touch-up of a few large glazes, then closing ink.

## What would show failure (and what I will do at the stops)

- Window holes or rims in the first wash: `--recessclean 0` did not take effect.
- Shadow sides still pale at the end of the main ladder (compare with the target strip right of the left tower):
  raise darkgain for the remaining shadow bands.
- Shadow sides going olive again: change the palette for the remaining passes.
- Touch-up still dozens of passes / thousands of strokes of patches: raise `--touchdmin` or cut to one round.
- Lit gable darkening or going grey: lower darkgain for the remaining passes.

## Revisions while painting

(filled in at the stops)
