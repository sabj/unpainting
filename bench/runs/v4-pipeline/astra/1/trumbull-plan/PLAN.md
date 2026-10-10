# Trumbull — V5, try 1

Prepared 2026-10-09 for the fixed V096 painter, 1200 × 1052 native cells,
280 × 245.47 mm sheet. Target is the supplied 300 × 263 crop. Requested style:
precise architectural watercolor. There is no previous-try feedback.

## Reference and value design

The focal point is the sunlit central gable with its two large pointed windows.
The left chimney, gable peak, paired arches, narrow upper lancets and right chimney
must remain correctly placed. Warm stone planes carry most of the image; drawing
carries fine structural divisions. The pale blue sky and irregular yellow-green
tree give the warm facade room to read.

Five-value thumbnail: cloud lights/pale trim; pale sky and sunlit stone; middle
ochre masonry and green canopy; cooler side walls, slate roofs and connected cast
shadows; deepest window/door recesses, banners and traffic signal. Dark accents
occupy little area. Do not darken the whole facade to obtain contrast.

## Lights

Cloud whites are bare paper selected by the painter's existing near-paper holdout.
The main corner quoins, window reveals, pale sills, annex coping and small street
lights are pale painted planes, not rectangles of white masking. Preserve their
target-shaped light values through the normal ladder. All stone highlights are
warm or grey tinted in the reference. No additional rectangular reserves: these
would whiten the stone and could cut unsupported edges. Small window mullions are
negative gaps between dark glass planes, clarified selectively with ink; do not
fill the whole window with ink. No opaque highlight repainting.

## Region techniques and order

Family bounds in config are descriptive matching areas. The painter's fitted
color/value shapes supply actual boundaries; the boxes are never painted as tiles.
Every family explicitly uses precise-watercolor and a wet-on-dry foundation.

| Region | Resolution and reference cue | Foundation / middle / final technique | State and load; edges |
| --- | --- | --- | --- |
| Sky | Wash question; large pale blue gaps around the roof, soft cloud transitions | Connected watery blue foundation in each sky opening; restrained fitted color build | Begin dry, join the same passage's own wet edge. Watery/light pigment, ordinary base water .62. Broad contact. Preserve cloud holes; firm roof silhouette and soft internal variation. No sky ink. |
| Central gable | Wash for broad stone; ink-and-wash for sub-cell architectural lines | Pale ochre/raw-sienna foundation; dry shaped middle planes; connected shadow glaze across wall, arches, sills and entry; recesses last | Watery pale base .62; medium pigment in three middle build steps; dry tooth texture only after the plane exists, water .22; shadow water .45 on a verified dry base. Crisp recesses, restrained softer stone joins. |
| Left wing and left chimney | Wash for the cooler side plane; ink for window divisions and chimney flues | Broad light local color, then coherent shaded side planes; glaze crossing wall/window/ledge boundaries | Dry base between stages, medium load for mids, controlled medium shadow glaze. Avoid filling lit chimney edge. Narrow flue marks on dry paper only. |
| Right wing/chimney and annex | Wash for receding architecture, selective ink for openings | Pale warm wash; slate roof and side-plane mids; connected cast shadow under coping and around windows | Same dry gates and water ladder. Quiet distant detail; keep annex roof light and its projecting shadow firm. |
| Foreground tree and small left foliage | Wash question for connected canopy; a few dry shaped edges | Light yellow-green irregular mass, dry, connected green shadow groups; darkest branches last where present in fitted shapes | Loaded wet-on-dry base, medium mid load; dry-paper shadow groups. Retain irregular gaps; no stippled leaves or outlining every leaf. |
| Street, banners, signal, people | Small value shapes; fine divisions below wash resolution are omitted or drawn only where supported | Pale ground, dry restrained local shapes, strongest small darks late | Controlled loads on dry paper. Signal and banners may be strong; people remain small gestures without invented faces or letters. |

The cropped sky is intentionally a connected wet-on-dry wash, rather than a
separately prewetted atmospheric region: its small openings abut many sharp roof
and chimney edges. Neighbouring strokes join while their own passage is open.
No other departure from light to dark is planned. Foliage shadows are dry layered
groups, rather than a wet dark charge, to retain this reference's defined canopy.

## Brush size, density and execution

Native cell width is 280/1200 = 0.2333 mm; one source pixel spans four native cells.
Four cells, about 0.93 mm, is the working minimum for a watercolor body. Window
openings are roughly 4–20 source pixels (16–80 cells, 3.7–18.7 mm) and are paint
questions. Mullions, coping edges and chimney divisions about 0.3–1 source pixel
(1.2–4 cells, 0.28–0.93 mm) are ink questions. Do not expand them into brush blobs.

W15 chooses physical brush size per fitted passage: rigger 1.2 mm, rounds 3/5/7 mm,
flat 25.4 mm, mop 38 mm. Native radii are respectively 2.57, 6.43, 10.71, 15,
54.43 and 81.43 cells. For example, a 4-source-pixel opening is 16 cells wide;
with a 5 mm round its feature-width/radius ratio is 1.49. A two-cell mullion is
below threshold even with the rigger (ratio .78), so drawing carries it. Inspect
the actual compiled per-passage support, chosen radius and ratio before painting;
the planner may select another brush for the connected support.

The fixed executor measures paper over every stroke footprint and its neighbour
halo. Dry foundations, mids, texture and glazes require measured dry paper, with
the existing allowance for a stroke's own connected wet passage. It dries and
rechecks when necessary. Retain these physical gates and finite instrument loads;
never infer moisture from elapsed time. Shadows cross target-color regions using
the painter's connected support. Do not fragment a cast shadow into family-box
fills. The fixed fitted mixture supplies recess color; other warm/cool mixes and
the V096 palette remain intact.

## Drawing and recipe changes

Opening: 33 sparse structural paths, neutral sepia ink, pressure cap .26.
Include both chimney spans, gable slopes, front corner, the two main arches,
entry arches, annex roof/cornice and banner pole. No masonry hatching, leaf
tracing or dark-surface ink fill. Review actual opening before first wash.

Closing: 62 selected paths, pressure cap .65, on fully dry paint. Nine structural
reinforcements and 53 selected traced spans chiefly describe windows and chimney
divisions. The tracer used contrast .10, minimum length 8 source pixels and max
luminance .64; short/wiggly spans and spans outside architectural details were
discarded, and selected spans simplified within .5 source pixel. Widths are
approximately .28–.65 source pixel, with lighter tapered endpoints. Closing
selection still follows the painter's value/style gate. Inspect what actually
survives rather than assuming every input line executes.

Recipe: `region_w15_lay3_sep4_dwg100`.

- W15 chooses a brush per passage, giving wall planes broad contact and narrow
  openings controlled small brushes.
- Three middle layers replace four to reduce repeated layering of masonry while
  retaining a gradual light-to-dark build. Pigment demand remains fitted.
- Sepia strength 4 replaces 8 and drawing width gain 1 replaces 2. Fine structure
  should support the painted architecture without becoming heavy brown outlines.
- Opening/closing pressure caps are .26/.65. All other V096 controls, including
  palette, separate sky color handling, recess passes, stone variation and shadow
  behavior, remain the tuned baseline.

## Checkpoints and acceptance

Run `bash bench/check.sh`; require ADMITTED and inspect the compiled passage
choices and unsupported-edge report. Start only through `bench/paint.sh start`.
The benchmark permits no separate crop physics run, so the actual opening and
first-wash stop supply the early physical proof; no claim of a separate fast test.

1. Opening should be a spare readable scaffold, not complete traced line art.
2. Light foundation should establish a luminous warm/cool composition while
   reserving the deepest contrasts for later. It is intentionally pale.
3. After middle values, the gable must be broad and connected, the side plane
   distinct, both arches readable and the tree one canopy rather than dots.
4. Before closing, inspect value shapes and native detail. Closing ink may restore
   divisions, but cannot rescue blurred paint or wrong architecture.
5. Final acceptance follows the technique guide: value hierarchy, preserved
   toned lights, hard/soft/lost edges, accurate landmarks, purposeful marks, and
   credible light-to-dark progress. Check material/execution separately from art.

Failure signs: white or grey islands in a disconnected facade; uniform brick
rings or contour bands; scratchy first wash; blurred mullions; equal leaf disks;
roofline or chimney omissions; heavy sepia over weak paint; sky wash crossing
architecture; early dark fill instead of a developing value ladder. Revisions
may affect only unpainted work and will be recorded below with their visible cause.

## Painting observations and revisions

Admission planning completed through `bench/paint.sh start`; the harness queued
the admitted job for a GPU. The standalone `bench/check.sh` passed its option
check but could not create its shared `/tmp` lock in this session, so it was
interrupted; the harness ran the same admission procedure. The resulting full
1200-pixel compile has zero unsupported axis-aligned seams, six fitted color
regions, 73 pigment/region passes and 3653 connected shape instructions. Their
brush choices are 97 mop, 932 flat, 682 round12, 1314 round8 and 628 round4.
1617 shadow instructions cross color regions. Median support-width/brush-radius
ratio is .616; inspect coverage and the narrow openings physically rather than
treating nominal brush selection as proof of crispness.

The color clusters take descriptions from sky, main gable, left wing and
foreground tree. The other family boxes do not create separate executable
regions; their shared precise-watercolor technique remains appropriate. The
opening path overlay was inspected against the target: the principal roof,
chimneys, arches and annex junctions align.

Look 1, before wash: 40 executed pen segments, zero brush strokes, 74 scheduled
passes including the painter's extra work. The actual sepia is a fine, restrained
scaffold with readable chimney divisions, gable, paired arches and annex. One
small darker deposit occurs at the right roof/chimney junction; it is local and
does not justify heavier or broader drawing. Keep the opening unchanged. The
angular arch construction will be subordinate to the fitted painted recesses.

Look 2, after pass 1: 26 brush strokes make a pale connected ochre foundation.
Window and roof spaces remain open and the ink is not overwhelming. Broad sweep
overlaps are visible, including diagonal light facets in the gable; inspect them
after the complete foundation before deciding whether they are persistent seams.
Continue to pass 16, the end of the light band, without revising at this early
single-pigment stage.

Look 3, after pass 16: 903 brush strokes. The completed foundation retains broad
faceted overlaps and leaves a large white triangle in the upper gable, plus
largely white chimney tops. These are not target highlights. The sky is pale and
the main facade foundation is connected, but W15's nominal broad contacts have
not covered the tapered ends of these irregular shapes adequately. This is an
early coverage failure, not something to repair with heavier ink.

Revision 1 at boundary 16: change only the prefix from W15 to W13, retaining
`lay3_sep4_dwg100` and the existing drawing pressures. Final current recipe is
`region_w13_lay3_sep4_dwg100`. The remaining washes now use the V096 shape-fitted
stroke widths instead of W15's fixed brush-size paths. The painted foundation
stays on the sheet. The value ladder and passage order remain the same, so the
first middle build can establish the missing warm gable/chimney planes. Inspect
again after pass 29, the end of the first middle build. The earlier W15 brush
table describes the initial plan and its compile, not the revised executor.

Revision 1 passed admission with zero unsupported straight edges. Look 4, after
pass 29: 1518 brush strokes. W13 has covered more of the chimneys and main gable,
but the large facade still has strong diagonal bands and a white upper tip. This
is a persistent stroke-footprint defect, not merely an intentionally light stage.
The window openings remain clear and the sky already has adequate blue.

Revision 2 at boundary 29: final current recipe becomes
`region_w13_lay3_sep4_dwg100_spl4_sml45`. On sufficiently broad connected wall
planes, use overlapping 4 mm lanes in roughly 45 mm strokes. Brush radius is
8.57 native cells; the lanes overlap by about 15 percent, and successive strokes
overlap along the path. Per-stroke pigment charge is planned from shape demand,
with total planned mass preserved. This replaces a shape-wide gesture whose
contact left triangular gaps. There is no added edge reach: retain the existing
precise footprint. Narrow windows, recesses, texture and large blue sky shapes
keep their existing fitted strokes. Large planes use the existing ordinary
connected-wash preparation; the executor still checks actual footprint and
neighbour moisture and enforces the declared dry-base/own-wet-edge admission.
Do not disable gates or boost pigment to conceal poor coverage. Continue to pass
42, the end of the next middle build, and judge the revised coverage there.

While revision 2 was waiting for admission, audited the existing W13 compiled
support widths. The originally requested 8 mm threshold would only affect the
already-painted light band and first middle build. Remaining main wall supports
are 5.58–5.63 mm in the second build and 4.41–4.59 mm in the third. Refined the
pending setting to 4 mm so the intended broad masonry passages actually receive
overlapping strokes. No assertion that 8 mm improved the physical painting.
The harness declined the stale 8 mm check because variant.txt had changed while
it ran; nothing from that candidate was applied. Submitted the corrected 4 mm
plan again at the unchanged boundary 29.

The corrected coverage revision remained pending for an extended admission wait.
Withdraw it and restore the last admitted executable recipe,
`region_w13_lay3_sep4_dwg100`, to complete this learning-round painting. Neither
overlapping-lane candidate is claimed as executed or visually validated. Continue
the admitted middle and shadow ladder, inspect before closing ink, and preserve
the coverage observations for the next try. The unresolved diagonal underwash
bands remain an artistic limitation, not an accepted improvement.

The pending check cleared with no revision applied. Continued the already
admitted W13 recipe through all paint and automatic corrections. Exactly one
revision was applied to the sheet: W15 to W13 after pass 16.

Look 5, before closing ink: 91 of 91 passes, 13149 brush strokes and the original
40 pen segments. Inspected both the target comparison and the native 1200-pixel
sheet. The automatic corrective glazes restored most of the large missing gable
and chimney coverage. The full building now reads clearly, with a pale central
facade, darker side plane, blue-black window recesses and firm roof silhouettes.

Technique-guide acceptance notes, separate from successful physical execution:

- Value shapes: the central light/dark hierarchy and architectural silhouette
  are recognizable. Side walls are somewhat too brown, and the reference's
  golden light is cleaner than this paint mixture.
- Lights: main lit planes survive. Small white breaks are too numerous in
  windows, roofs and cloud edges; the early gable gap is mostly corrected.
- Edges: major roof and opening boundaries are firm. Fine reveals and mullions
  remain less precise than the reference; ink must stay light and selective.
- Landmarks: both chimneys, paired pointed arches, entry openings, banner and
  annex are present. The circular gable ornament is not sufficiently described.
- Marks: central masonry is broad enough to read, but stone blocks are too
  regular/coarse in places, foliage is patchy and too ochre-brown, and faint
  diagonal underwash bands persist. This is not a clean artistic pass for
  precise architecture, despite successful execution and recognizable form.
- Progression: pale foundation to middle planes to dark recesses is visible.
  Much of the final coherence arrives in the automatic correction rounds; a
  stronger, evenly covered first wash would make the progression more natural.

Finish with the unchanged, admitted selective sepia closing paths and pressure
.65. No late ink thickening to conceal the paint's coverage/texture defects.
For the next try, investigate connected first-wash coverage before painting the
whole ladder, reduced coarse masonry repetition, and a fitted light drawing of
the gable ornament. The withdrawn 4 mm lane idea is an untested candidate, not a
demonstrated fix. Final executable variant: `region_w13_lay3_sep4_dwg100`.
