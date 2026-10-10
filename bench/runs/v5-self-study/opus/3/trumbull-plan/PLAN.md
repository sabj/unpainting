# Trumbull, V5 try 3: precise architectural watercolor

Self-review of try 2 and my reading of the judges: `bench/SELF-REVIEW.md`. Short version: colour and landmarks were
right and better than try 1 (no olive shadows, calmer sky); what one sees first is ruled black boxes round the window
groups (my own hand-drawn opening lines), mottled shadow sides made of many small glaze islands, and speckle.

## Reading the reference (value thumbnail)

- Five values. 1 lightest: the white cumulus top right (paper), the sunlit gable front and the lit tower faces (pale
  warm ochre, not paper). 2: blue sky, graded deeper top left; lit stone of the left and right ranges; pale roofs.
  3: warm stone in half-shade (left face of the main block, tower flanks), slate roofs, the green tree. 4: shadow sides
  and recesses (the strip right of the left tower, the inside corner right of the gable, under-eaves). 5 darkest:
  window glass (dark blue), the navy street signs, traffic lights, ground-floor openings.
- Focal point: the sunlit gable and its two arched windows, with the navy street sign on the corner below it.
- Light from the left/front: the gable front is the lit plane; shade falls on faces turned right and in inside corners.

## Regions, technique and order

| Region (family) | Cue | Question | Move / paper / load | Edges | Layers |
|---|---|---|---|---|---|
| Sky | graded blue, white cumulus top right | wash | one wet passage of overlapping lanes (base), watery-medium, granulating ultramarine | hard at the roofline, soft inside | light only |
| Gable front (focal) | sunlit pale ochre, sparse coursing | wash + sparse block hints | pale broad wash on dry paper, watery, run over the windows; sparse ochre block hints after the mid layers | hard at the corner | light, mid L0-L3, stone hints |
| Shade wing, tower flanks | same stone in half-shade | wash + glaze | local-colour wash, dry, then a warm-violet shadow glaze **in a few large connected shapes per face** | hard at the lit corner, soft into the recess | light, mid, shadow b4/b5 |
| Left and right ranges, towers | warm stone, mullioned windows | wash | broad pale wash over wall and windows together, mid planes on dry paper | crisp at window frames | light, mid, shadow |
| Roofs | blue-grey slate | wash | cool mid wash wet on dry, darker eave | hard at ridge and eave | mid, shadow |
| Windows, doors | dark blue glass, pale frames | paint (pane 16-24 cells, mullion ~8 cells at 0.233 mm/cell) + closing ink for mullions | dark glass in two dried recess layers over the wall wash | hard | recess accents last |
| Tree right | yellow-green canopy | wash | one irregular canopy mass wet on dry, shadow group on dry paper | soft lit side | light, mid, shadow |
| Shrubs left, street | muted olive; grey pavement | wash | one pale mass; cool violet ground glaze (base `_rg10 _vio`) | soft | light, mid / shadow |
| Signs, traffic lights | navy, near-black | ink and wash | darkest paint accents, closing ink on hard edges | hard | last |

Smallest features: mullions and lancet jambs about 2 mm (8 cells at 0.233 mm per cell); below a brush mark with a
body, so they are closing ink over the painted glass, not paint. Window panes 4-6 mm (16-24 cells) are paint.

Glazes: two cross-region shadow glazes (bands 4 and 5 on one shared shadow support) over stone, windows and eave
edges on each shadow side. Wet passages: only the sky lanes and the first stone wash are broad wet passages; windows,
signs and frames are on dry paper. Families (thirteen descriptive families, one style) and the single cloud reserve
are unchanged: they caused none of the faults I found.

## Protected lights

- Paper: the brightest cumulus top right (reserve 0.94-0.985 x 0.01-0.05) and the painter's own large near-paper
  lights (clouds, the brightest lit sills and the white shirts at the street). Lights under ~44 mm² are no longer kept
  as paper (see `--minshapecells`): small paper flecks across the stone were the speckle.
- Pale painted planes, not paper: the lit gable front and lit tower faces. The shadow glazes stop at the lit corner.

## Drawing

- Opening, **graphite 2B** (was sepia ink): the 85 structural lines traced from the target (roofline, gable slopes,
  lit corner, arches, jambs, tower edges). The 16 lines I added by hand in try 2 are removed: eight closed window boxes
  and the long tower verticals.
- Closing, sepia ink (unchanged, 158 spans, used by base `_ink4`): only spans the target shows as hard dark lines
  (window frames, mullions, the pole, signs); none in the lights.

## What I changed from try 2, and why

| Change | Setting | Why |
|---|---|---|
| Hand-drawn window boxes and tower verticals removed | `opening-lines.json`: 101 to 85 lines | They were the ruled rectangles and off-register verticals on the finished sheet. Nothing in the target shows a dark outline round the window groups. |
| Opening drawing in pencil, not ink | `--outlinemedium graphite-2B` | An ink lay-in stays dark under every wash, so each stage shows the final linework ("line work perfectly formed from the start", "fine detail already in the first 25%"), and off-register contours stay visible at the finish. A precise architectural watercolour starts from a light pencil lay-in that the washes partly cover; the ink comes once, at the end, where it explains form. |
| Larger minimum shape | `--minshapecells 800` (default ~190 cells at 1200 px) | The shadow glazes were cut into ~114 shapes per pigment, ~89 of them under 2000 cells: those small islands are the mottle. With 800 the planner merges plane fragments, drops glaze and layer islands under ~3200 / 1600 cells and small paper lights. Compile: 4705 passage shapes to 1645, shadow shapes 2052 to 825. |
| Base granulation | `--gran 0.3` removed (default 0.25) | The rust-orange dots over the lit gable read as spatter. Sky granulation (`--skygran 1.6`) kept. |
| Kept | `_dk16`, `_lw`, burnt sienna in the palette, `--recessclean 0`, `--layersmooth 3`, the reduced touch-up, families, reserve, closing ink | These fixed try-1 faults (olive shadows, window holes, the late touch-up dump) and did not cause the try-2 faults. |

Critique points I rejected:

- "Whole sheet at one faint value, as if faded in": partly real (each light-band pigment pass covers the whole sheet,
  an engine design), but I will not answer it by skipping the pale first wash or by painting darks first; a pale
  unifying wash is a normal first move. The pencil lay-in under it should make the first stage read as drawn then
  washed.
- "Fine detail already present in the first 25%": I answer this with the pencil opening, not by delaying the windows
  (glass is painted late already).
- "Texture arriving as a dump late": the touch-up is already small; I keep the reduced touch-up settings rather than
  cutting the closing ink, which carries the structure.

## Stage intents (what each stop should look like)

1. After the opening: light grey pencil structure, roofline, corner, arches, jambs; no fill, no boxes.
2. Light passes: pale warm stone over the buildings including the windows, graded granulating sky, cloud as paper.
3. Mid layers: roofs, half-shade stone, tree mass as large connected planes; window bodies begin.
4. Shadow glazes: a few large warm-violet shapes per shadow side crossing stone, windows and eaves; lit gable pale.
5. Recess accents (dark glass, signs), a short touch-up, then the closing ink.

## What would show failure (and what I will do at the stops)

- Opening still dark and inky at stop 0: graphite did not take effect (note it; it cannot be redone).
- Shadow sides still mottled after the shadow passes: raise `--minshapecells` further for the remaining passes.
- Shadow sides too pale against the target strip right of the left tower before the shadow bands: raise darkgain;
  lit gable darkening or going grey: lower it.
- Window glass or small features lost (the larger shape floor can drop them): lower `--minshapecells` for the recess
  and accent passes.
- Touch-up growing to dozens of passes of flecks: raise `--touchdmin`.

## Revisions while painting

No revisions. What I saw at each stop and why I left the plan alone (region values are mean luminance, sheet against
target, from `bench/looks/prev/vals.mjs`):

- **Stop 0, opening done:** the graphite 2B lay-in took effect: light grey structure, no window boxes, no long stray
  verticals. 85 passes planned.
- **After pass 18 (ground):** the first wash went down as three broad diagonal bands with paper gaps between them,
  the same lane fault as before. `--heading` does not control the lane direction, and the mid layers over ~66% of the
  sheet come next, so no change.
- **After pass 40 (mid layers):** connected warm planes, windows still pale. The stone is more peach than the target's
  gold. The shaded strip right of the left tower was still paper: its target colour is so dark (down to 29,15,3) that
  the planner treats it as a recess and paints it in the dark bands. No change.
- **After pass 66 (before the shadow glazes):** everything except the lit gable was still lighter than the target
  (left range 153 vs 106, windows 197 vs 85). Try 2's finish with `_dk16` matched the target, so I kept the dark gain.
- **After pass 75 (shadow band 4):** the shade wing turned blotchy again, though less than in try 2. The dark strip and
  some window glass went olive, because recess cells take every pigment in their colour fit, sap green included.
  Changing the palette or `--minshapecells` now would re-plan the whole ladder and could shift which pass comes next
  (repeating or skipping passes), so I left both for band 5.
- **Before the closing drawing:** values on target (left range 105/106, strip 83/85, arched windows 87/85, shade wing
  131/128, lit gable 190/196). The touch-up added 19 passes (85 to 104 in all; 4273 of the 6393 strokes came after pass
  75). Closing ink kept as planned.

Faults still on the finished sheet: blotchy shadow glaze on the shade wing, pale blue flecks in the shadows, orange
dots on the lit gable (not from `--gran`, which I had removed; their source is still unknown), a faint diagonal streak
across the upper gable, an olive cast in the dark strip, and a fragmented street edge.
