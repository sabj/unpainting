# Plan: South France, V5 try 2 (urban sketch, pen plus light wash)

Read before planning: `.claude/skills/watercolor-technique/SKILL.md` (layering, resolution decision, ink layer, plan check),
`bench/SELF-REVIEW.md` (my own review of try 1, written before I opened the critique) and `bench/feedback/FEEDBACK.md`.

## Reference cues and value thumbnail
Hillside village seen from above, 304 x 249 px target on a 280 mm sheet (1 target px = 0.92 mm; 1 output px = 0.23 mm).
Five values: (1) paper-light: sunlit tan walls, pale path, roof lights; (2) the bright yellow-green pine crown (bottom
left) and the ochre terraces; (3) mid greens of the olive crowns, terracotta roofs; (4) lilac and purple shadow walls,
grey-green shaded olives; (5) darks: the cypress flames, the pine trunk and limbs, window openings and the deep shadow
between crowns. Focal point: the terracotta-roofed house group right of centre (x 195-295, y 80-205 px). Secondary: the
cypress pair top centre and the pine bottom left. The pine crown must stay LIGHT: in try 1 it came out dark olive.

## What I changed from try 1, and why
Try 1 scored 4.8 composite (vision 2.33 of 5, progression mean 2.9). My own review and the critique agree on the main
faults. Each change below names its cause.

1. **A visible pen, from the first stage.** Cause (found in the code, `src/paint/material-profiles.mjs`, `paint-plate.mjs`):
   the opening pen's pressure is capped at 0.3, which gives a nib of about 0.16 mm (under one output pixel), so lines were
   hairlines that broke into dots on cold-press paper. Change: `--openingpressure 0.9` in `extra-args.json`, so a line's
   weight (0.6 to 1) sets its width from about 0.2 to 0.4 mm (the black-ink nib ceiling). The closing pen already runs at
   pressure 1. This answers "no pen linework", "dotted trails" and marks-texture 1.33.
2. **More, and better placed, pen work.** The opening file is now 228 lines (try 1: 82):
   71 structure lines kept from try 1 (houses, roofs, windows, cypress, terrace walls; they fitted the target well when I
   overlaid them) with weights raised to 0.72 or more; a new pine (trunk as three strokes, edge, edge and core, plus 11
   limbs); and 143 broken contour segments (7 to 30 px long, gaps between) that follow the edges of the dark foliage
   clumps, generated from the target's own value structure with my own script (`bench/scratch/foliage-lines.mjs`; the
   painter does not read it, only the line files it wrote). They are broken on purpose: a sketcher's discontinuous line, not
   a closed outline round every blob. Weight follows the clump's darkness (0.62 to 0.90). I dropped try 1's two loose
   crown arcs. The closing file re-inks the structure and pine, plus the darker half of the foliage contours (159 lines).
3. **No reserves at all.** Cause: my four rectangular reserves in try 1 left hard square white holes that survived even
   after I deleted them (see SELF-REVIEW). The painter keeps its own near-paper lights, which follow real shapes.
4. **No sepia in the palette.** `--paints ochre,sienna,hansa,sapgreen,ultramarine,cerulean,rose`. I ran the planning step
   on five palettes: the colour fit error was 5.35 with sepia (try 1), 4.57 without it, 4.86 with raw sienna and phthalo
   green added, and 5.37 with umber instead. Sepia was greying the greens towards olive-khaki. Dark values now come from
   ultramarine, sienna and sap green, which is how a watercolourist mixes a green-black.
5. **Foliage on the champion's own five-band ladder.** In `config.json` the foliage families (`SF.foliage-centre`,
   `-left`, `-low`, `SF.pine`) take `precise-watercolor`; village, terraces, top village, cypress and hills stay
   `urban-sketch` (see "Refusal and restart" below: I first gave the hills `atmospheric-wet` and the painter refused it).
   Cause: with urban-sketch (plus the harness's ink-and-wash value floor) every
   cell outside the shadow mask gets all its paint in the first wash, which is the "whole sheet at one faint value, faded
   in" tell, and the mid values only came from touch-up rounds. precise-watercolor keeps the native ladder (light wash,
   mid layers, shadow glazes), so the planning step went from 35 passes / 691 shapes to 73 passes / 2332 shapes. I expect
   the build to be more gradual and the lit yellow-green of the pine to separate from the darker olives. `_lay3` (three
   mid layers; try 1 had two, which did nothing for urban-sketch cells because their mid band is zero).
6. **Touch-up rounds off (`--touchpoints 0`), with a plan to look first.** Cause: after the planned passes the painter
   glazes every shape that is lighter than the target's mean, over the whole shape. In try 1 that was about 12,800 of
   15,250 strokes, it flattened everything into a drab mosaic with blue-black blotches, and it made the stroke-percentage
   frames after 25% almost identical. With it off, the stroke count is dominated by the real passes, so the 10/25/50/75%
   frames should show real stages. Risk: the sheet may end too pale or off in colour. I will look at the sheet at the end of
   the planned passes and may revise to `--touchpoints 1` with a lower `--touchgain` if it is clearly too pale. Both the
   decision and the result are written under "Outcome" below.
7. **`_dk11` instead of the base `_dk13`.** The 1.3 darkgain made the shadow glazes heavy; the blue-black blotches in the
   centre of try 1 were glazes that did not match the target.

## Refusal and restart (what happened)
My first painting of this plan was admitted by the check, drew its opening pen (218 of 227 lines), and was then refused by
the painter while laying the first washes: `value-plan wet wash whole-footprint gate failed` for passage `light/b1/p0/r3/s1`
(moistShare 0.84, waterMax 0.68, 14,929 cells). The gate (`tools/paint-plate.mjs` line 1301) stops a wet-in-wet or
dry-on-wet stroke when the paper under it has standing water (waterMax over 0.15). That is the paper-state check before a
stroke working as designed, so I did not switch it off with `--wetgate 0`; I changed the plan. My best explanation, which I
could not confirm from the log, is that the `atmospheric-wet` style I had given the hills sets the wettest first wash of
any style (water 0.88 against 0.5 to 0.62), and that pushed the footprint past the limit. Try 1 had no region styles and did
not hit the gate. Changes for the restart on a clean sheet: removed the `atmospheric-wet` region style; re-staggered the
pine limbs (the first look at the opening drawing showed a symmetric fishbone, which a pine is not). Everything else is
unchanged. If the painter refuses again I cannot restart, so the outcome section says so.

Seeing the first opening drawing (before the refusal): the pen was visible and continuous at 1216 px, thin (about 1 to 1.5
px), with the houses, cypress, terrace lines and foliage contours legible as a sketch. So change 1 worked at the opening.

## Style balance
Urban sketch means the pen carries structure and the wash is light. I keep `urban-sketch` as the sheet style. The honest
trade-off: the foliage is most of the sheet and in my plan it gets the fuller watercolour ladder, so the wash on the
foliage will not be "light" in the sense of lots of bare paper. The painter's plan covers 100% of the sheet whatever
I choose (the harness lifts urban-sketch to an ink-and-wash value floor). The pen is what makes it read as urban sketch.

## Regions, technique, order (families in `config.json`)
| family | cue | question | move | paper state needed |
|---|---|---|---|---|
| SF.village | terracotta roofs, tan walls, lilac shadow sides | wash plane per wall and roof; pen for edges and windows | wet on dry, pale wash per plane, one lilac shadow glaze across wall and window | dry before the shadow glaze |
| SF.village-top | small pale houses | wash plane, paler than the focal group | wet on dry | dry |
| SF.terrace | ochre walls and path, hut | wash plane; hut opening dark last | wet on dry, one connected ochre wash | dry |
| SF.cypress | flame shapes, darkest darks | wash question, mixed green-black, pen outline | wet on dry, one mass per tree, darkest last | dry |
| SF.hills | distant blue-green | wash | wet in wet, pale, soft, no pen | damp |
| SF.foliage-centre / -left / -low | olive crowns, clumps | wash plane in graded layers, broken pen contour on top | wet on dry: pale base, three mid layers, shadow glaze across crowns | dry between layers |
| SF.pine | light yellow-green crown, dark trunk and limbs | crown is a wash question; trunk and limbs are an ink question | crown pale and light, trunk and limbs pen (three-stroke trunk) | dry |

Resolution check: a leaf is under one target px (0.9 mm), well below four cells, so leaves are not painted as marks; the
foliage is a value plane with an edge, and the pen's broken contour supplies the sketch texture. Pen nib 0.2 to 0.4 mm is
0.9 to 1.7 output px; a line of 3 or more cells is the minimum that survives cold-press tooth.

## Moisture and load
Wet on dry throughout except the hills (wet in wet). Washes watery and pale for the first layer, medium for the mid
layers, medium and thicker for the shadow glazes; those loads are the painter's own per-layer calibration, which I do not
set. The painter dries between passes (fast drying mode, fixed).

## Protected lights
None authored (see change 3). The painter's own near-paper lights (the sunlit tan walls and pale path) are the only lights
kept. At the planning step the painter held out 25 cells as white (0.0% of the sheet).

## Edges
Hard where the target is hard (roof ridges, wall corners, cypress edges, pine limbs) and these are drawn by the pen; soft
only on the distant hills. The painter's foliage blobs have hard stepped edges; I cannot change that and the broken pen
contour is partly meant to carry the edge instead.

## Values
Light to dark in this order: pen; pale washes; mid layers; shadow glazes (lilac on the walls, green-black under the
crowns and in the cypress); closing pen. The pine crown should stay the lightest large green in the lower half.

## What would show failure
- Pen still thin or dotted at 1216 px (check the opening drawing at the first stop; I cannot change it after that).
- Pen contours reading as closed "worm" outlines on the foliage, or the herringbone pine limbs looking ruled.
- The sheet too pale or too grey with touch-up off; the pine crown dark again; blue-black blotches.
- Hard straight seams or rectangles (there are no reserves, so any white box would be a new bug).
- Frames that still jump from empty to finished.

## Rejected from the critique
- Classic edge 9.13 is not evidence of good edges (see SELF-REVIEW); I did not tune to it.
- The 4.5 final-frame progression score is not evidence that the end state is good.
- A single-count tell (finished region beside untouched paper; fine detail early) is not a reason to remove the early pen:
  a visible pen first is how an urban sketch is made, and the critique's own note asked for pen linework.

## Outcome
The painter accepted the restarted plan (no second refusal), ran 66 passes and finished. I have not seen the judges' scores
for this try; what follows is my own reading of the looks. Looks taken at: opening (before the first wash), after pass 3,
23, 44, before the closing drawing, and the finished sheet. No revisions after the restart (time spent on the refusal and
on slow checks was better kept for a clean run).

What happened, stage by stage:
- **Opening pen:** visible, continuous, thin (about 1 to 1.5 px); the sheet reads as a pen sketch of the scene. Change 1
  worked. The pine limbs looked like a fishbone in the first drawing; the restart's staggered limbs are better but still
  sparse next to the target's pine.
- **Pass 3 (first wash):** pale ochre ground in patches, lots of paper showing, pen clearly on top. Human-looking start.
- **Pass 23 (end of ground washes):** a pale sage-grey wash laid in broad diagonal sweeps. Bland, and the sweeps leave
  straight parallel-edged bands. Reads as an underpainting.
- **Pass 44 (end of mid layers):** greens built in graded layers, lit patches and the pale path still paper, houses keep
  terracotta and lilac. This is the stage that is most improved over try 1 (the olive mosaic).
- **Pass 66 (end of planned passes):** darks in: cypresses, shadow under the crowns, lilac walls.
- **Touch-up decision:** I kept `--touchpoints 0`. The sheet was not too pale, and a touch-up round glazes every shape that is
  lighter than the target's mean, which would have filled the paper lights and the path (the thing that wrecked try 1).
- **Closing drawing:** it ran, but it changed only 0.11% of the pixels of the sheet (1,325 pixels, 985 of them darker) when I
  compared the look before and after it. The re-inked lines retrace the opening lines, so the finished pen is, in effect,
  the opening drawing. The closing file did not add the bolder, darker pen I intended.
- Stroke count: 4,479 brush strokes (try 1: 15,252), so the stroke-percentage frames are cut from real passes.

What is still wrong (my own scores, not the judges'): finished painting **5 / 10** (try 1: 3); plausibly painted **3.5 / 5**
(try 1: 2).
- The pine crown, the brightest and biggest mass in the target, is a dull olive. The lit yellow-green never separated.
- A straight-edged pale diagonal band runs down the centre path (the painter's own sweep and sky-blue cells; try 1 had the
  same), and a few blue-black blotches sit in the middle of the foliage.
- Foliage edges are still hard, cut-out blobs of similar size. The pen contours only partly carry them.
- The pen is thin everywhere, and the closing pen did not bolden it.
- If I had one more try: draw the closing file as doubled strokes (two parallel lines 0.3 target px apart) or add hatching so
  that the closing pen is not just a retrace; keep the pine's crown out of the mid layers' dark so it stays light (I did not
  find a plan-side lever for this); keep every region style that has a wet-in-wet first wash out of the plan.
