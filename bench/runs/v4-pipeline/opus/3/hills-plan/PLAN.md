# Hills, V4 try 3: loose ink and wash

## Reference read (value thumbnail)

Aerial view down a hillside of California oak woodland. Four values:

1. Lights: the pale tan dirt roads (left road falling from top left, centre road curving down from under the big oak,
   the top road and a fragment at the bottom right) and white speckles along their rims.
2. Light-mid: sunlit yellow-green meadows: the big upper-right slope, the green wedge falling from the left road, the
   broad lower-centre meadow.
3. Mid: olive and grey-green lit oak crowns.
4. Dark: deep indigo / blue-green shadow pockets inside the woods, darkest in the band right of centre and bottom left.

Focal point: the big oak at centre left, with the centre road curling out from under it into the lit meadow.
Paper is white. The target is fully painted (no vignette), so the sheet is covered, but the roads stay near paper.

## Style balance and why

- Global style `precise-watercolor` for the paint ladder, ink carried explicitly by the drawing files. I compiled both
  ladders at 612 px (marks-only previews): `ink-and-wash` gives two bands only (pale wash, then one shadow glaze), and
  the oaks went from pale olive straight to near-black with no mid crowns, with the meadows a flat olive. The target's
  oaks need the mid step (olive / blue-grey crowns) between wash and shadow. `precise-watercolor` gives pale wash,
  dry mid planes, then cross-region shadow glazes, which matches the reference's value structure.
- Looseness comes from fewer, larger shapes: `_lay2` (two mid layers, not four) and `_ms400` (minimum shape 400 cells
  instead of the automatic ~178), so small flecks merge into connected masses and the pass count drops towards
  the 25 to 45 a person would use.
- The ink-and-wash character comes from the pen: a sparse opening drawing in sepia, and a closing scribble in the
  darks. Ink pigment: sepia (base `_sep8`), declared and unchanged.
- No region style overrides: one style across the sheet avoids unsupported straight seams; families are labels that
  carry the reference cue per region.

## Regions, technique, order

| Region (family) | Cue | Question | Move / paper | Layers |
|---|---|---|---|---|
| Upper meadow | sunlit yellow-green slope | wash | wet on dry, watery pale wash, one mid glaze where the slope turns | 1 wash, 1 mid |
| Left wedge | light green wedge below left road | wash | wet on dry, pale | 1 wash, 1 mid |
| Centre meadow | broad lit meadow, olive at edges | wash | wet on dry, pale graded; mid patches only where the target darkens | 1 wash, 1 to 2 mid |
| Woods left / band / right | oak crowns, indigo pockets | ink and wash (crown edges and twigs are below a brush mark: ~1 to 3 cells of 0.13 mm) | pale wash, dry, mid crowns on dry paper (one hard edge), dry, shadow glaze crossing several crowns, then pen scribble by value | 1 wash, 2 mid, glazes |
| Roads | pale tan, near paper | wash / reserve | painter's own held lights (rim speckles) plus the palest band only; no rectangular reserves (roads are curved, a box would cut a straight seam) | paper + pale tint |

Order: opening pen; pale washes across the whole sheet (meadows and woods together, connected); dry; mid crowns and
meadow turns on dry paper; dry; shadow glazes across the woods (crossing crowns and the edges of the meadows where the
oaks cast shade); dry; closing pen in the darks.

## Protected lights

- Bare paper: the white speckles along the road rims (the painter's held lights, about 0.2% of the sheet).
- Pale painted plane: the roads themselves (band 1 only).
- No explicit reserves: every light in this picture is curved; rectangles would create unsupported seams.

## Drawing

- Opening (`opening-lines.json`, 24 pieces from 18 hand-placed gestures): both edges of the left and centre roads,
  the top road, the bottom-right road fragment, the meadow/woods boundaries (upper meadow, left wedge, centre meadow
  top and sides), the big oak's crown silhouette and the small oak on the upper meadow. Long Catmull-Rom gestures with
  pressure swelling mid-stroke and running drier to the end. The painter drops any line touching a held light, so the
  gestures were cut where they cross near-paper speckle and road lines moved about 2 target px out onto the grass.
- Closing (`closing-lines.json`, 81 lines): the target's own traced dark lines (q-trace-ink at .10 / 8 px), kept only
  where the 11 px neighbourhood mean luminance is under .38, so ink density follows value and stays out of the
  meadows and roads; plus three trunk accents (big oak, right clump, centre tree). Gestural scribble, never a fill.

## Stage intents (what each stop should look like)

1. After the opening: sparse sepia lines, roads and meadow edges readable, no hatch.
2. After the first washes: whole sheet pale; meadows yellow-green, woods a pale grey-green; roads nearly paper.
3. After the mid layers: crowns separate from meadows; meadows still clearly the lightest green.
4. After the shadow glazes: indigo pockets in the woods band and bottom left; the big oak's shadow side dark.
5. After closing ink: scribble only in the darks; roads and meadows clean.

## Failure signs

- Woods black or flat (dark gain too strong): lower dark gain at a stop if the first shadow pass is near-black.
- Meadows olive/khaki instead of yellow-green, or blotchy mid patches across them.
- Patchwork of small separate islands in the woods (shapes too small) or contour bands.
- Roads lost under green, or road edges reading as straight seams.
- Ink heavy over blurred paint, or ink in the lights.

## What happened while painting, and what I changed

- Stop 0 (opening): 30 pen strokes, sparse and thin; a few road-edge pieces dropped. Kept.
- After pass 10 (ground washes): the light band is one connected plane over 77% of the sheet (909,683 cells), laid as
  "one directional gesture per connected plane". The gesture covered only the left two thirds: a hard diagonal seam,
  a pale speckled right third, a straight-edged block at upper right and bare strips along the top and bottom.
- Pass 12 (first big hansa mid) repeated exactly the same footprint, so every remaining big pass would have
  reinforced the seam.
- Revision 1 (at boundary 12): variant `region_w13_lay2_ms400_spl12_lad`. `_spl12` turns on the stroke plan: each
  passage is laid as overlapping lanes of a real brush (12 mm for the big planes) along its long axis, cut into strokes
  of at most 30 mm, each charged from the plan's own mean under it; `_lad` narrows the lanes to fit narrow shapes (tree
  crowns, down to 2 mm). Pass 14 (cerulean mid over 68%) then covered the whole plane, right third and edges included.
  The early seam stays as an underlayer; the later sap green and hansa passes cover the right side evenly.
- After pass 30 (mids done): masses in place, but the meadows had gone a dull dark olive (the big mid passes cross
  them) and quinacridone-rose passes left rust flecks in the woods. Paint cannot be lifted; I kept the dark gain so
  the woods would carry the contrast that makes the meadows read light.
- After pass 35 (band 4): woods deep indigo, close to the target; meadows read lighter by contrast. Kept the plan.
- Before closing (52 passes with the painter's touch-ups): meadows brightened toward yellow-green, roads paper, woods
  indigo. Closing ink kept as planned (81 value-filtered scribbles in the darks, 3 trunk accents).
- Still wrong at the end: rust flecks in the woods (rose in the auto-picked palette; next time give `--paints`
  without rose, e.g. hansa, sap green, cerulean, ultramarine, burnt sienna for the roads), the faint early diagonal seam,
  meadows duller than the target. Next time start with `_spl12_lad` from the first wash.

## What I would change at a stop

- Shadow passes too dark: `--darkgain` down (e.g. 1.1) via `extra-args.json` and revise.
- Meadows muddy: fewer mid layers or a lower `--midgain`.
- Ink too heavy in the opening: thin the closing set before the closing stage.
