# Trumbull V5, try 2 — complete washes, subordinate masonry

Fixed V096 painter; 1200 × 1052 native cells, 280 × 245.47 mm paper; supplied
300 × 263 target. Prepared 2026-10-09. Requested style: precise architectural
watercolor. Follow the watercolor-technique and painting-planner references.

## Reference, values and protected lights

The focal point is the golden central gable and its two large pointed windows.
Five values: cloud lights and pale trim; pale blue sky and sunlit golden stone;
ochre middle masonry and yellow-green tree; cooler shaded side planes and slate
roof; small deepest window/door recesses, banners and signal. Preserve the two
chimneys, roof apex, paired arches, lancet rhythm and round gable ornament.

The photograph contains pale painted sky and pale stone, not large areas of
blank paper. Disable relative-to-estimated-paper light masks; retain the fixed
planner's absolute near-white connected reserves. Cloud whites and tiny true
white street glints are bare paper. Most cloud edges, quoins, coping, sills and
window reveals are pale painted planes, toned from the foundation. Fine mullions
are negative gaps between recesses plus selective shadow-side ink. No rectangular
reserves: all natural light geometry is fitted by the painter. No opaque repaint.

## Decisions from try 1

Independent review and critique comparison are in SELF-REVIEW.md. Keep the good
composition, fitted silhouettes, dry detail and restrained sepia. Change:

- Start W13 with planned overlapping 4 mm lanes, maximum stroke length 45 mm,
  on sufficiently broad connected shapes. The W15 foundation in try 1 left
  triangular voids. W13 alone recovered some coverage but retained facets. Lanes
  are a test of coverage from the first wash; do not claim success before looking.
  Retain zero edge reach so no soft wash crosses a window or roof silhouette.
- Two middle builds replace three; stone-block coverage .25 replaces .60 and
  added block pigment .10 replaces .20. Main planes and cast shadows must carry
  the building; blocks are sparse subordinate hints on dry paint, not a grid.
- Sky has only its first middle build, avoiding a later hard quantile island.
  Cool gain is 1.0 instead of 1.3. Fewer inferred paper holes allow pale blue to
  cover the sky rather than making large white map-like fragments.
- Opening is 22 major structural paths, pressure .23. Small chimney ribs, sills,
  banner pole and ornament belong to the closing pass. Closing has 57 selected
  paths, pressure .65; remove the most wandering traced fragments and add the
  fitted ornament and a few focal mullion/sill shadows. Fine width gain remains
  1.0 and neutral sepia strength 4. Dark surfaces remain paint.

Accept the critique of coarse texture, weak detail and premature small features.
Reject its implication that a pale foundation is intrinsically a fade-in, and
reject the high classic edge score as a substitute for visual architectural
accuracy. Do not paint dark first to game the stage assessment.

Final executable recipe from boundary 30:
`region_w13_lay2_sep4_dwg100_blk25_bka10_sk1_cg10`.
The initial recipe additionally used `_spl4_sml45` through pass 30 for coverage.
Extra settings are opening/closing pressures and the two disabled relative light
inference options. The material experiment at passes 17–30 is superseded by the
second revision below. All remaining V096 settings, palette and physical effects stay
at the fixed baseline. Sap green remains available for the yellow-green foliage.

## Region and layer techniques

Family boxes describe shapes; fitted target color/value regions define the
actual paint boundaries. Shared precise-watercolor style avoids artificial box
seams. Final BaseMove requests wet-on-dry in every family, including the sky
after its failed physical wet-state proof below. Adjacent strokes join their own
wet edge. The compile must show which color regions adopt each cue.

| Region | Resolution and reference cue | Ordered technique | Paper, load and edge roles |
| --- | --- | --- | --- |
| Sky around chimneys/roof | Wash: pale blue, soft cloud transitions, large areas over 40 cells wide | Connected light wet-on-dry wash; first middle color build only; no ink | Fully dry base, watery/light pigment (.62 water), join own wet edge. Preserve pale cloud values. Dry barrier at roof; broad interior variation stays subordinate. The initial wet-on-wet candidate failed its physical water gate and is superseded. |
| Sunlit gable and broad front walls | Wash for planes; ink-and-wash for divisions under 4 cells | Complete pale ochre/raw-sienna base; dry; two shaped middle builds; dry; sparse stone hints; connected shadow glazes; recesses last | Fully dry foundation, watery/light .62 water; broad lanes join their own wet edge. Medium pigment on dry paper for middle planes. Blocks are pale local glazes, not dry-brush dots. Firm roof and opening edges; stone joins quiet. |
| Left wing and tall chimney | Wash for coherent cooler shaded plane; ink for flue ribs and window divisions | Pale local base; dry mid side planes/eaves; shadow glaze crossing wall, openings and ledges; late divisions | Dry before each new layer; controlled watery to medium load. Shaded plane cooler and darker than gable but not an opaque brown mass. Lit chimney edge remains pale. |
| Right wing/chimney and annex | Wash; fine openings and coping use selective drawing | Pale base; dry roof/side mids; connected coping and side shadow; recess accents | Same dry gates and loads. Quiet receding masonry. Crisp annex coping with pale upper surface, shaded underside. Roof paint stays outside sky. |
| Foreground tree and left foliage | Wash for connected canopy; leaves below four cells are grouped | Yellow-green local mass; dry connected green shadow groups; last branch/dark accents | Loaded wet-on-dry, light then medium pigment. Crisp selected outer leaf groups, lost edges inside canopy. No uniform leaf disks and no ink leaf tracing. Reduction of stone hints also avoids ochre blocks overwhelming this warm foliage. |
| Street, banners, people and signal | Small value masses; no invented tiny lettering/faces | Pale ground; dry restrained shapes; compact darkest accents late | Controlled load on dry paper. Keep people gestural and banner/traffic signal dark without outlining every fragment. |

Two shadow glazes share the fitted connected shadow support across wall color
regions, windows, sills and doorway/ground junctions; .45 water, medium pigment,
fully dry base before each. Mixed ultramarine and raw sienna for architectural
shadows; recesses retain their fitted dark mixture. Do not shade one family box
at a time. Final plan has no departure from light-to-dark. The pale sky is
connected on dry paper because the attempted prewet exceeded the physical water
limit; no broad wet move spills into dry architectural detail.

## Native scale and paper-state checks

One native cell = .2333 mm; one source pixel = four cells. A watercolor body
needs roughly four cells (.93 mm). Windows 4–20 source pixels wide are 16–80
cells (3.7–18.7 mm): paint planes. Mullions, ornament carving and flue divisions
.3–1 source pixel wide are 1.2–4 cells (.28–.93 mm): ink-and-wash questions.
The ornament outer form is about 9 × 14 source pixels; its thin rim is drawing.

Planned 4 mm wash lanes have radius 8.57 cells. A 40-cell broad support has a
support-width/radius ratio 4.67. The planner limits lanes to supports at least
4 mm wide and at least three minimum shapes in area, excluding narrow recesses,
texture and large blue sky passages. Sky retains its fitted broad lane route.
Narrow architectural shapes retain shape-fitted brushes; do not force a broad
lane across a 2-cell mullion. Short strokes overlap along and across the passage,
with planned per-stroke pigment charge and total demand retained.

The unchanged executor measures moisture across the footprint and neighbour halo
before each stroke. New layers and glazes require dry paper; own-passage wet-edge
continuation is allowed. Broad multi-lane passages use the existing connected
wash preparation and real clean-water strokes; inspect for stripes or blurred
edges. Wait/dry/rewet according to measured state, not elapsed time. These are
requirements of execution, not claimed observations before the run.

## Drawing, checks and stop criteria

Opening sepia ink: roof slopes, chimney spans and corners, broad wall junctions,
paired arches and annex. No block hatch, signs, flue texture or foliage outlines.
Closing sepia ink on dry paint: selected chimney ribs, arch/mullion shadow edges,
coping junctions, broken ornament rim and sparse carving. Fine lines taper at
ends. The executor's contrast/light gates still select which lines actually run.
Inspect the physical opening and closing; file presence is not execution proof.

Before physics, run `bash bench/check.sh` and require ADMITTED. Inspect the
native compile for no unsupported straight seams, purposeful lane support,
light-to-dark bands, real cross-region shadow glazes and declared paper states.
The benchmark fixes physics access to paint.sh, so the first actual wash is the
fast technique proof; no separate crop render or code change is permitted.

Checkpoints: opening scaffold; first broad wall wash; completed light foundation;
first/second middle build; before closing. A foundation may be pale, but must
cover its broad planes without large diagonal holes. Middle builds must keep
the gable luminous, side wall coherent, sky pale blue and tree green. Before ink,
windows must already read as crisp dark recesses. If the lanes leave stripes,
fix unpainted technique rather than adding dark ink. If masonry competes with
windows, reduce remaining block work. Final acceptance follows the technique
guide in order: value shapes, toned lights, edge hierarchy, landmark geometry,
purposeful marks, credible progression. Record artistic limitations separately
from successful physical execution.

## Run observations

The local `bench/check.sh` passed its option check (`ok: true`) but could not
create its shared /tmp semaphore. Interrupted that blocked local invocation;
no painter code or lock implementation was altered. The identical admission
procedure run by `bench/paint.sh start` subsequently completed and started the
cloud painter. Admission was delayed about 27 minutes by the shared service.

While waiting, ran the explicitly permitted CPU-only 600 px compile and stopped
its optional board generation after the value-plan step passed. It had zero
unsupported straight seams. The later full 1200 px admission compile also has
zero unsupported seams, 61 pigment/region passes and 3010 connected instructions.
The six color regions adopt left-wing, tree, gable and sky descriptions; both
cool groups adopt the sky cue. No absolute-white connected reserve survives the
size filter on this photograph: its lights are pale painted planes, rather than
large blank-paper islands. This is an observed compile result, not a promise of
physical coverage.

Full-size band boundaries: foundation through pass 16; first middle build through
30; second through 43; two stone-hint passes 44–45; shadow/recess layers through
61, followed by the baseline corrective rounds. The plan has 3328 lane strokes
in the foundation, 1359/1456 in the middle builds, and 511 in the two shadow
bands. Narrow shapes and sky use their separate fitted paths. There are 1552
cross-region shadow instructions. Inspect the physical first wash for coverage
and possible striping before proceeding through the foundation.

Look 1, before the first wash: 28 executed pen segments, zero brush strokes.
The fine sepia scaffold keeps the chimney spans, main gable, paired arches and
annex in place without flue ribs, masonry or window tracery. Lines are restrained
against the paper; retain them unchanged. The angular arches are the initial
scaffold and will sit beneath fitted painted recesses. Proceed to pass 1.

Look 2, after pass 1: 832 physical brush strokes. The broad pale ochre wash now
covers the gable tip and chimney tops. The large triangular coverage holes from
try 1 are absent. Faint regular lane/tooth marks are visible, so this is a
coverage improvement, not final mark-quality acceptance. Keep the admitted plan
through the complete foundation (pass 16); judge whether those marks integrate
before considering a change to later work. The open windows are intended late
recesses at this stage.

Physical refusal at the start of pass 2: the sky's requested wet-on-wet passage
`light/b1/p0/r4/s1` measured moistShare .8299 but waterMax .8713, above the .15
maximum. The executor correctly stopped rather than painting into flooded paper.
This sheet is discarded by the harness and will not be judged. Use the one
permitted clean restart. Change only sky BaseMove from wet-on-wet to wet-on-dry
and its reference explanation; retain .62 water, connected own-wet-edge working,
sky lanes and the one-middle-build plan. Keep the measured gate fully enabled.
The first ochre wash demonstrated coverage, but must be repainted on the clean
sheet. This is a physics-driven correction, not an accepted wet technique.

The corrected clean restart passed the harness's full-resolution admission and
queued for a GPU. Retain the same drawing and inspect the new completed light
foundation at pass 16. The discarded sheet's first-pass look is a technique
observation only, not part of the final painting's progression.

The restarted cloud run spent a prolonged time in setup, then reached its opening
stop. Requested finish while waiting, then scheduled a stop at pass 16 once the
renderer was progressing normally. The new sky pass 2 passed its measured dry
gate. No further clean restart and no disabled physical gate.

Look 3, after pass 16 on the final sheet: 7656 physical brush strokes, 28 pen
segments. The gable and chimney tips are covered and the pale sky is continuous;
the former diagonal voids and large white sky islands are absent. The local-color
foundation is intentionally pale and recesses remain open. Regular fine bands
across the wall planes are still a visible failure of mark character.

Revision at boundary 16: keep all geometry, lane spacing, pigment demands, layer
order, water (.62 for the ordinary wash) and dry gates. For the remaining washes,
reduce physical brush hair-clump streak strength from .35 to .20 and increase
the brush's liquid/tooth bridge multiplier from 1 to 1.10 (ordinary wash bridge
.82 to .902). This is a more continuous loaded wash contact for wall planes and
connected foliage/shadow groups; fitted clips retain hard recess and roof edges.
Paper texture, pigment behavior and all physical effects remain active. Existing
foundation marks stay on the paper; a connected middle wash should subordinate
them. This is a candidate material correction, not an accepted improvement until
the first middle build is inspected. Continue to pass 30 after admission.

Revision 1 passed admission and executed through pass 30. Look 4: 11043 brush
strokes and 28 pen segments. The sky has a continuous pale blue value and the
architecture is covered, but the parallel bands across its planes remain plainly
visible. Do not accept the material adjustment as a banding fix. Window/recess
whites are still intentional at this pre-shadow stage; they are not the former
missing gable coverage.

Revision 2 at boundary 30: remove `_spl4_sml45` from the remaining plan and
restore standard wash streak/bridge by removing those two extra options. The
fixed lane planner has 1.7-radius spacing and offers no adjustable overlap for
these paths. Repeating its uniform spacing in later layers reinforces the
regularity. Use W13's fitted broad gestures for the remaining second middle
build and shadow glazes, retaining its separate sky route. This is a deliberate
change of stroke scale over an already connected foundation: the large light
coverage that W15 lacked in try 1 already exists, so later shaped strokes can
develop value without adding another sheet-wide pattern of narrow lanes.

No region-geometry, pigment-demand, value-order, palette, light-mask or drawing change.
Standard .62/.45 dry-gated wash/glaze loads remain. Existing banding cannot be
removed; accept only a visible reduction of its dominance by the remaining
connected planes. Do not add ink to conceal it. Continue through the remaining
paint and corrective glazes, stopping before closing ink to judge all six
technique criteria. Final material and value recipe is the one printed above.

Revision 2 passed admission and executed from pass 31. The first fitted middle
wash used 38 strokes, compared with the much denser lane passages. Requested an
inspection near the end of planned paint, but the renderer had already begun
corrections; it stopped at boundary 66. Look 5 is therefore after four corrective
pigment passes, not a pure pre-correction comparison. 16224 brush strokes and
28 opening pen segments. Inspected both comparison and native 1200 px sheet.

The principal value hierarchy, chimneys, paired arches, roof and banner read
clearly. Foundation coverage is retained and the blue sky is substantially more
continuous than try 1. Bands in the underlying wall washes remain visible,
although the later value structure makes them less dominant. This is not proof
that the material experiment fixed them: it did not. Coarse contour-like value
patches remain around some openings and the upper gable; sparse stone-block
settings alone cannot cure all fitted-plane patchwork. Fine mullions are still
weak before their planned drawing, and the gable ornament awaits closing ink.
The walls are browner/less golden than the reference and the tree is still very
yellow at this checkpoint. Its green correction, further cool pigments and the
second shape-average correction round are still unpainted. Retain those and
continue to the closing stop without further paint-setting changes. Do not
darken or thicken the ink to conceal these wash limitations.

Look 6, before closing: all 79 paint passes complete, 21457 brush strokes and
28 opening pen segments. Retain the planned closing drawing and .65 pressure.
No further paint or drawing-setting revision.

Acceptance review in technique-guide order:

- Values: the light focal gable, darker side wall, roofs and deepest recesses are
  readable. Stone is still too brown/peach compared with the reference's golden
  sunlight. The foreground tree remains too yellow and insufficiently green.
- Lights: broad gable and chimney coverage is sound; sky is more continuous than
  try 1. Some excessive small white chips remain in roofs and windows. Pale
  masonry lights are tinted rather than represented by large white rectangles.
- Edges: main silhouettes and openings are firm. Fine reveals and tracery remain
  coarser than the requested precise architectural style. Closing stays light.
- Landmarks: two chimneys, gable, paired arches, window rhythm, banner, annex and
  signal are present. The round gable ornament and selected fine divisions are
  supplied in the final drawing, subject to the executor's contrast selection.
- Marks: later broad strokes reduce the dominance of the lane pattern but do
  not remove it. Coarse fitted value patches also remain. Coverage improved;
  mark character is still an artistic limitation. The failed brush-material
  experiment is not counted as an improvement and is absent from final settings.
- Progress: the final sheet established its complete pale foundation before
  the middle and shadow layers. Dark openings arrived late. The process still
  uses many repeated narrow strokes early and substantial corrective work late;
  do not describe it as an unqualified natural-hand progression.

All submitted revisions passed the harness's admission. The one physical refusal
was corrected with the permitted clean restart and an actual dry-paper technique;
the final sheet completed its full paint ladder without that wet-gate failure.
Execution success and the artistic limitations above are separate judgments.
