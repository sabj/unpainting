# Hills — V5 try 1

Target: hills-crop, 306 x 242 source pixels. Painting: 1224 x 968 native cells on a 158.048 x 124.992 mm sheet. Fixed V096 painter, seed 0, 2026-10-09. Requested style: loose ink and wash.

## Reading and value thumbnail

The focal point is the bend of the pale path under the spreading tree at approximately (134,146) in source pixels. The path leads down into the foreground meadow; two further path fragments lead up the left and right slopes. The dark woodland travels diagonally between luminous slopes. There is no sky in this crop.

Five-value intention: warm paper/light path (about 90–96% lightness); sunlit yellow-green grass (70–83%); olive grass turns and lit crowns (48–65%); cool grey-green woodland (30–45%); the few deep blue-sepia hollows and stems (15–25%). These are visual intentions, not per-pixel targets. Keep the slopes connected and the woodland readable as several large interlocking shapes at thumbnail size. Detail concentrates at the central bend and the left foreground trees.

## Lights and geometry

The winding paths are negative-painted gaps and pale warm planes, not white ink. The painter's inferred near-paper light shapes preserve their irregular geometry. Remaining warm path edges receive the very pale ochre foundation. Tiny light gaps in woodland are reserved only where the inferred target-light mask supports them; do not make a hole for every leaf. Sunlit grass is painted yellow-green, never reserved as a large white rectangle. No explicit rectangular reserves or per-box style changes: the family bounds label the fitted color shapes and do not clip paint.

## Regions, moves, loads and resolution

All regions use the ink-and-wash profile. At 0.1291 mm per native cell, four cells span 0.5165 mm, or one source pixel. The painter retains target-fitted shape geometry. Broad bodies are wash questions; lines below four cells are drawing questions. The execution plan records actual support widths; the shaped brush adapts to each body rather than painting individual leaves.

| Region | Reference cue and resolution | First passage | Last paint and edges |
| --- | --- | --- | --- |
| Upper right slopes | Lemon-olive diagonal grass planes, roughly 10–35 mm wide (77–271 cells); wash question | Watery pigment, medium water (profile 0.55), broad belly contact on measured dry paper; connect each plane while its own wet edge is open | Preserve pale uphill path; muted olive turns, no blade marks or distant branch detail |
| Left sunlit slope | Narrow bright wedge between trees; 3–12 mm (23–93 cells), wash question | Pale yellow-green wet on dry; medium water, watery pigment | Crisp irregular forest boundary, soft/lost internal grass transitions; interrupted path edge in ink only |
| Central woodland belt | Blue-grey olive canopy bodies, 2–9 mm (15–70 cells); wash question | Connected pale cool-olive underwash on dry paper, medium water and watery pigment | Fully dry, then medium pigment with controlled water (profile 0.40), one shared shadow support across crowns. Crisp outer silhouettes, lost interior crown divisions. No stippled leaf disks |
| Foreground meadow | Broad triangular yellow-green plane, 20–60 mm (155–465 cells); wash question | One luminous local-color wash, medium water, watery pigment on dry paper | Only the target's olive turns and cast shadows darken. Leave the middle distance as a wash; paper tooth supplies grass texture. No blanket flicks |
| Left foreground/focal trees | Connected dark masses surrounding branching stems; canopy bodies 2–12 mm (15–93 cells); wash plus ink question | Pale mixed green-blue mass, connected wet edge within the passage | Dry cross-crown shadow glaze, medium pigment, water 0.40; deep hollows stay paint. Thin stems about 0.2–0.4 mm (1.5–3 cells) are sparse sepia ink. Hardest edge at the path bend |
| Upper left trees | Smaller muted crowns, 1–5 mm (8–39 cells); wash question | Pale grey-green underwash on dry paper | Restrained dry shadow mass; fewer ink gestures than foreground; avoid equally sharp individual crowns |
| Paths and thin branches | Paths about 1–6 mm (8–46 cells), wash/negative-space question; stems and edge fragments 1–3 cells, ink question | Keep paper/light path shapes out of dark washes; sparse opening gestures establish the bend and stems | Pale ochre tones path shoulders naturally in the foundation. Closing ink only on supported dark fragments; never outline both sides continuously |

Brush scale: canopy/grass bodies need several-cell support, with a typical fitted half-width of 8–30 cells in crowns and 30–150 cells on the broad slopes; body-width/radius is approximately 2 for broad contact. A thin 1.5–3-cell branch would have feature/radius below 0.4 for even an 8-cell brush radius, so it belongs to the pen. Ink widths are explicitly set to approximately 0.35–0.65 source pixels (1.4–2.6 native cells, 0.18–0.34 mm) with tapering ends. These are planning estimates; do not claim them as measured brush footprints.

## Sequence and material checks

1. Sparse sepia opening drawing: selected target-supported trunks plus broken path-edge gestures. Establish direction and the bend without outlining every crown.
2. Large light local-color washes, grouped by the painter's color shapes. Hansa/ochre keep the sunlit grass luminous; sap green, ultramarine and cerulean supply olive/cool woodland. Sepia neutralizes the deepest mixtures. The source's warm light paper remains visible in the paths.
3. Full dry measured across the next stroke footprint and its three-cell neighbours. The fixed executor observes this before every value stroke, waits/drys when needed, and permits only its own connected wet overlap. Do not turn off a gate or substitute a timer for the paper reading.
4. Connected dry shadow glaze through the central woodland and across the adjacent foreground crowns/stems. The shadow support crosses descriptive families and color regions; it must not fill each tree as a separate tile. Medium pigment with water 0.40. The grass largely stays at its foundation value.
5. Let dry, allow the fixed painter's sparse touch-ups, inspect before closing, then selective light-pressure closing sepia. Keep paths and lit grass free of line texture.

There is no deliberate wet-in-wet exception: the reference's small broken silhouettes and sharp trunks favour controlled wet-on-dry. The two-stage ink-and-wash profile intentionally omits a stack of middle glazes. Pigments execute as separate passes within these two stages; a single pigment pass is not judged as a completed color mixture.

## Changes from V096 and why

This is the first try; no earlier critique exists. Choose explicit ink-and-wash rather than an implicit subject style. Use a six-pigment landscape palette instead of the automatically selected box. Reduce dark gain from 1.3 to 1.2 and cool gain from 1.3 to 1.1 to retain separation among grey-green crowns. Reduce sepia absorption multiplier from 8 to 4 and drawing width gain from 2 to 1.1, then cap closing pressure at 0.55: the target's fine branch structure should sit within the paint, not dominate it. Opening pressure remains 0.30. The base middle-layer option is inherited, but this two-stage style has no middle-layer demand. Keep the fixed physical paper texture and contact model.

The closing drawing is a selected subset of target thin-dark-line traces, simplified slightly to remove pixel stair steps and narrowed to pen scale. Opening traces are fewer and lighter. A few manually reviewed connected gestures follow the visible central trunks and broken path margins; they are not a new painted texture field.

## Checkpoints and acceptance

Before GPU: run bench/check.sh; require ADMITTED, inspect value-plan phase/style/load/region decisions, lights and unsupported seam report. No separate crop physics is permitted by this task; the first available opening and wash stops serve as the material/gesture proof. Do not run another painting mechanism.

Opening: a sparse legible scaffold, plenty of paper, no leaf net. Foundation: connected luminous grass and lighter cool woodland, pale path continuous; the final darks should still be absent. Shadow checkpoint: woodland should anchor the composition without becoming a single black blob. Before closing: edges and values must already read; ink is not a repair for blurry paint.

Accept only against the watercolor-technique checklist: thumbnail value shapes; preserved and appropriately toned lights; chosen hard/soft/lost edges; central path bend and main trunk landmarks; connected purposeful marks without dots, stamps or stripes; believable light-to-dark progression; selective detail and surviving paper. Stop at the earliest visible failure. Any remaining revision affects only unpainted passages and must be recorded here. A technically admitted rendering is not itself an artistic success.

## Planning check record

The initial option admission returned `ok: true`. The local bench/check.sh could not acquire its /tmp slot in this execution environment and was interrupted; bench/paint.sh start submits the same full admission through the harness. An allowed CPU compile at 612 px completed with exit 0, no unsupported axis edges, six fitted color regions, and 21 pigment/region passes. All compiled passages use ink-and-wash, with water 0.55 for the light stage and 0.40 for shadows. There are 232 shadow shapes crossing region ownership boundaries. The marks-only preview selected 17 opening and 42 closing gestures and retained the winding path. This is a geometry proof, not a physical color or brush-texture proof.

The harness subsequently passed the full 1224 px admission and queued the GPU painting. Its value-region check has no unsupported axis edges, six color regions, 968 planned shapes across light and shadow phases, and 34,523 protected cells (about 2.9% of the sheet).

## Physical looks

Look 1, boundary 0: 18 executed pen lines, no wash strokes. The central tree fork is readable and the opening is sparse. Some selected trace gestures are angular; keep closing ink modest. No revision.

Look 2, after pass 4: 282 brush strokes. The ochre/hansa foundation has a connected foreground slope and the three winding path fragments remain light. Pale rectangular brush boundaries are visible inside some woodland areas; this is a concern for the completed foundation, though these pigment components alone do not yet describe its cool masses. Continue through pass 14 before deciding whether an unpainted-stage adjustment is warranted. No revision yet.

Look 3, after pass 14: 950 brush strokes. The path survives, but the foundation is too flat and muted across the large olive plane, with conspicuous square blue brush ends and some unpainted canopy gaps. This does not meet the edge/mark-character acceptance criteria. The earlier foundation cannot be removed. Before shadows, revise only their execution geometry while preserving the two-stage schedule and palette.

Revision 1 at boundary 14: add `_noslane` because the fixed base classified broad cool woodland as horizontal sky lanes, which is inappropriate to the irregular crown silhouettes in this no-sky crop. Add `_spl4_lad` for broad remaining shadow bodies: strokes follow their principal direction, use widths adapted to support between 2 and 4 mm (roughly 15–31 native cells across, radius 8–15.5 cells), and carry a planned average charge per stroke. This should improve value variation within connected masses and avoid one enormous flat contact. Narrow shapes retain their fitted single gesture. No wash reach is added; path and light boundaries remain clipped to the existing plan. Add `--splwet 0` so these shadows remain wet-on-dry glazes, with their own wet overlap allowed and the executor's dry-footprint/neighbour gate retained. This is a deliberate dry-edge choice for foliage, not a sky wash. Existing paint and opening ink stay unchanged. Continue to the completed shadow stage and reassess; do not claim this will repair the already flat grass foundation.

Revision 1 passed the full admission check. Of 385 compiled shadow shapes, 103 received planned strokes (1,585 planned strokes total, actual selected widths 2–2.96 mm). All retained wet-on-dry intent and water 0.40. Look 4 at boundary 21 has 3,026 executed brush strokes. The woodland value shapes are more legible but remain too pale and now show strong parallel diagonal bands. The prior blue square patches remain visible. Revision 1 therefore FAILS the mark-character criterion; the adaptation did not make a better watercolor. Keep that evidence for the next try, and do not use dry planned lanes as a default foliage fix.

Revision 2 at boundary 21: remove `_spl4_lad` and `--splwet 0` from the current recipe. Keep `_noslane`. Increase the unpainted touch-up glaze factor from 0.60 to 0.85, retaining the fixed two rounds. These are coherent whole-shape color-deficit glazes over dried paint, evaluated only through permitted shape-average target looks. The central and left woodland need more connected depth; this may also reduce the visual contrast of the bands, but cannot erase them. No added ink, opaque correction, target-cell feedback, or new feature geometry. The original flat grey-olive grass and existing hard brush marks are acknowledged limitations, not accepted outcomes. Inspect before the closing drawing.

Revision 2 passed the full admission check and was sent to the painter for continuation from the saved boundary 21.

Look 5, before closing: all 37 paint passes complete, 8,547 brush strokes and 18 opening pen lines. The corrective glazes restored considerable woodland depth, but produced isolated dark blue pools and yellow-ochre patches. Earlier diagonal bands and hard blue brush rectangles remain visible. The meadow is still grey-olive rather than the reference's luminous yellow-green, the upper-right slope has excessive blank gaps, and the path is too paper-white. The major winding path and central tree placement remain recognizable. Closing ink stays at the original sparse selection and pressure; it is not intended to repair the paint.

Checklist verdict before closing: composition/landmarks partially retained; major path lights retained but insufficiently toned; local color and value grouping below the reference; edges and mark character fail because of stamps, pools and ruled bands; light-to-dark progression is visible but overly uniform in its first wash. The second revision improved depth only, not every region, and is not an artistic acceptance. Complete this learning try with the planned closing drawing and stop.

Lessons for try 2: solve broad foundation color variation and coverage before any paint is laid; do not enable horizontal sky lanes for this no-sky subject; do not replace woodland with dry parallel planned lanes; avoid depending on stronger late touch-up glazes to rescue a flat initial wash. The execution and admission succeeded through the pre-closing checkpoint, but that is separate from the unsuccessful visual result.
