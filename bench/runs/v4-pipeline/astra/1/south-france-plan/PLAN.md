# South France — V5 try 1

Target: bench/targets/sf-crop.png, 304 × 249 source pixels. Urban sketch, pen plus light wash. Output: 1216 × 996 native cells on a 280 × 229.34 mm cold-press sheet. Seed 0 and the frozen V096 painter. Date: 2026-10-09.

## Reading and value thumbnail

The focal point is the stepped ochre house group at the right (x 202–288, y 86–202 in the source). Its roof junctions and tiny dark openings must remain legible against connected olive-green foliage. The large branching tree in the lower left balances that group. The smaller village above recedes. There is no open sky: the blue area in the top right is a distant wooded slope.

Four values: (1) paper and pale warm paths / lit wall planes; (2) light ochre, terracotta and yellow-green local colour; (3) muted olive canopy undersides and violet-brown wall sides; (4) selective dark cypress cores, window recesses and branch junctions. Most of the sheet remains visibly luminous. The target is a dense painted landscape, so the requested sketch treatment deliberately compresses its darks and replaces tiny architectural paint detail with fine pen.

## Drawing and colour

Opening: 101 manually selected connected gestures, ordered focal house structure, distant village, cypress tapers, branching trunks, then a few broken canopy contours. Coordinates are in the original 304 × 249 target frame. Roof pitches, eaves, wall turns and branches were checked in an enlarged inspection of the supplied reference. The trial automatic tracer was inspected but its noisy leaf chains and thick widths were discarded; the delivered paths are the reviewed sparse construction.

Closing: 39 selective lines, mainly window jambs, focal eaves and a few shadow-side branch junctions. No hatching or ink fills. No outlines around every leaf group. Window and closing detail intentionally wait for dry paint.

Black ink is explicit via --inkprofile black-ink; the urban-sketch profile also declares black, and the runner therefore omits the incompatible base sepia tokens. Source nib widths are mostly 0.22–0.36 px (about 0.20–0.33 mm on the sheet), 0.48 px on the principal trunk. Per-point width and pressure taper at the ends; --drawwidthgain 1 replaces the base gain 2. Opening pressure .5, closing .65, drawing demand .85. Check actual opening stage and the run's drawing/material log before accepting this weight.

Paint box: yellow ochre, raw sienna, burnt sienna, hansa yellow, ultramarine, cerulean, sepia and sap green. Ochre and siennas carry stone and paths; sap green, yellow and blues carry the connected trees; ultramarine with warm earths carries shadow. Sepia is a paint for deep mixed recesses, distinct from the black drawing material.

## Regions, techniques and resolution

All six descriptive families share urban-sketch, so no rectangular style transitions are introduced. Their boxes name the reference cues; the painter retains its target-derived irregular colour/value shapes, and boxes are not painted as fills.

At 1216 native cells, one cell is 0.2303 mm; one reference pixel spans four native cells or 0.921 mm. A credible wash body needs at least four cells, about 0.92 mm. Typical fine pen features are 0.22–0.48 source pixels / 0.88–1.92 cells / 0.20–0.44 mm. They are explicitly an ink-and-wash question. Window openings about 1–3 reference pixels wide (4–12 cells) may have painted recesses, but their jambs remain ink. No density changes or upscaled inspection is offered as extra source detail.

| Region | Reference cue and resolution choice | Ordered technique, state and load | Edges and lights |
| --- | --- | --- | --- |
| Distant village | Small warm roofs, walls and dark cypress verticals. Wall bodies 4–12 mm / 17–52 cells are wash planes; sub-mm edges are pen. | Opening sparse fine pen on dry paper. Layer 1: watery, weak ochre/earth wash on dry paper. Dry. Layer 4: restrained connected shadow over dry base. Closing only a few openings. | Quiet distant edges, sharp necessary junctions; broad pale lit walls. |
| Far blue hill | Cool wooded ridge at top right, no sky. Broad 8–25 mm / 35–109-cell masses: wash question. | Layer 1: weak watery blue-green wash on dry paper, connected through own wet edge. Fully dry before its restrained shadow share. No wet-in-wet charge required: this is a distant sketch wash. | Low contrast, little pen, pale gaps survive. |
| Olive slope | Olive and yellow-green canopy masses around winding ochre paths. Crown groups 3–12 mm / 13–52 cells: wash; individual leaves below four cells are omitted. | Layer 1: broad weak loaded wet-on-dry wash, merge adjacent strokes while their own wet edge is open. Dry. Layer 4: connected muted olive shadow groups with medium pigment and controlled water. | Alternating crisp/lost crown edges; preserve warm paths as pale painted planes and selected tiny light gaps. |
| Focal houses | Terracotta roofs, pale ochre faces, violet-brown shaded sides. Planes 5–25 mm / 22–109 cells: wash; thin junctions and jambs: ink. | Opening pen on dry sheet. Layer 1: watery weak ochre and sienna plane washes. Dry. Layer 4: one coherent shadow glaze crossing contiguous side walls, eaves and adjoining recesses; controlled medium pigment on fully dry paint. Last paint accents in dark openings; dry, then selective closing pen. | Crisp roof intersections and wall turns; lit wall interiors remain broad and light. No brick or stone stippling. |
| Foreground tree | Yellow-green lit crown, dark branching trunk, heavier underside. Crown groups 5–20 mm / 22–87 cells: wash; trunk branches 1–2 cells: pen. | Opening connected trunk and branch gestures. Layer 1: watery pale warm green, not individual leaf dabs. Dry. Layer 4: connected cool-green lower groups. Sparse closing reinforcement only at dark branch junctions. | Broken crown silhouette, internal warm light gaps, tapered branches. No dotted leaves or uniformly outlined crown. |
| Lower garden | Broken paths between olive shrubs beneath the houses. Broad 3–15 mm / 13–65-cell shapes: wash. | Layer 1: weak warm path and green canopy washes on dry paper. Dry. Layer 4: connected shadows across neighbouring crowns and ground turns. Selective dark branch accents. | White and pale warm gaps keep the slope open; fore-edge detail restrained, not equal all-over texture. |

Brushes retain the fitted W13 physical geometry. Broad planes call for side/belly contact, narrow recesses for the point. Expected broad contact width is several mm, well over four cells; a 4 mm contact has radius 8.7 native cells, and a 4–12 mm canopy/wall body has width-to-radius ratio 2–6. These are planning estimates, not measured executor radii. Check the compiled support-width estimates and the actual contact log. Do not force a broad brush into the pen-width features.

## Order, moisture and connected glazes

1. Reserve paper lights; lay opening black pen on dry sheet.
2. Paint the large pale local-colour foundations, working through pigments within the same visual light stage. Brush water and pigment strength are separate: watery load, weak pigment. The urban-sketch profile's numeric water load is .5; the ordinary finite-load calibration remains active.
3. Dry fully before later value work. The profile's ink-and-wash value floor supplies a base plus shadow ladder; it prevents a near-empty sketch while retaining the requested pen structure. --stylegain .82 reduces its overall paint strength. Two mid layers replace four in the recipe but this style chiefly uses its light and shadow bands.
4. Paint the connected dry shadow shapes. Across the right houses, they cross contiguous wall sides, eaves and recesses. Across the trees, they link canopy undersides and dark ground turns. Keep their fitted connected support across descriptive family boundaries. --darkgain 1.0 replaces the base 1.3 to avoid covering light planes. This is one visual shadow glaze, though separate pigment passes implement the mixture.
5. Last paint accents and dry. Inspect before closing ink. Closing lines clarify focal junctions without filling dark masses.

Before EVERY paint mark, the fixed executor measures the actual footprint and neighbouring paper. Non-wet techniques require measured dry paper, apart from a verified own same-passage wet overlap; when necessary the executor physically dries and measures again. No wet gate is disabled and no timer is substituted for a reading. All families request wet on dry. There is no unsupported wet-in-wet exception in this plan. Each passage carries its inherited explicit move, paper state, reference cue, load and edge policy; logs must show executed contacts.

## Protected lights

Four small explicit bare-paper glints: one in the left sunlit terrace, one on the foremost roof ridge, one on the central path, one in the lower garden gap. Each is smaller than a long seam and follows an observed light. The painter also preserves inferred near-paper lights. Most other target lights are pale painted planes, not rectangular white reserves: lit facades, terracotta ridges, the winding paths and canopy tops. No eyes or catchlights are present. No planned lifting or opaque repair.

## Checkpoints and failure criteria

Opening: a legible but incomplete village/tree construction, slender lines, denser at right houses and foreground branches; a largely empty sheet is correct here.

After light passes: connected pale green masses and warm building planes; paper must still shine through. Do not judge this stage as under-finished because deep greens have not arrived.

After shadow: house faces and sides separate, cypresses read as vertical darks, and the main tree grows out of one connected canopy. Look first at thumbnail value shapes, then protected lights, then roof and branch landmarks. Reject large rectangular seams, tiled patches, lost wall lights, orange dashes in trees, leaf stipple, uniform blur or ink that swamps the washes.

Before closing: assess whether the planned 39 accents remain selective. Only revise future work; the opening and painted passages cannot be repaired by rewriting files.

Finished: evaluate shape hierarchy, lights, edge roles, roof alignment, purposeful mark character and believable light-to-dark progress. Do not use pixel error as artistic evidence. Material execution and artistic result are separate conclusions. No calibrated numeric art score is claimed in this first learning try.

Run bench/check.sh and require ADMITTED. Standalone physics/crop proofs are prohibited by this task; the admitted planning check and actual opening/first-wash stops are the available first-failure checks. Start and complete painting exclusively with bench/paint.sh. Inspect actual output at full native width where useful.

## Changes and why (initial preparation)

No prior-try critique exists. Relative to V096: choose urban-sketch explicitly; supply the six target-specific region cues and four modest reserves; replace automatic thick traced texture with 101 sparse authored opening gestures and 39 closing accents; explicitly use black ink; halve base drawing-width gain; use a controlled opening/closing pressure; select an eight-pigment Mediterranean palette; reduce style strength to .82 and dark gain from 1.3 to 1.0; reduce nominal mid layers from four to two. These choices prioritise a pen sketch with light connected washes and legible sunlit buildings.

Self-view observations and any later revisions will be recorded here before the painting finishes.

## Preparation checks and self-view log

- The direct bench/check.sh invocation passed option/plan validation, then could not enter its shared /tmp lock directory in this shell. It was stopped. The start command ran the same admission check through the harness and advanced to the cloud GPU queue.
- A permitted 608-cell planning compile reached the successful target-values line: 35 pigment/region passes, 675 connected shapes; no unsupported axis edges. The compiled light masks total 12,024 of 302,784 cells (3.97%). All planned passage moves are wet on dry with measured dry-paper requirements, and shadow support can cross colour regions. The actual drawing profile is black ink.
- The CPU opening preview selects 82 of the supplied 101 paths and retains the main house construction, cypress verticals and branching tree. This preview establishes geometry only, not physical pen weight.
- After planning succeeded, the optional preview-board writer failed because it sought work/w4/SF-region/provenance.json rather than the benchmark region path. The task explicitly distinguishes this post-planning preview failure from admission. No painter code or provenance file was changed.
- Before any physical checkpoint was returned, the harness reported a GPU-machine failure and automatically restarted from the current plan. No artistic revision was made on the basis of that infrastructure failure.
- Look 1, before the first wash: 85 physical pen lines, no paint strokes, 36 scheduled passes. The actual opening has light slender roof/wall construction, cypress gestures and a legible main branching tree. A few nib starts are darker. The geometry is retained; the fine pen weight will be reassessed after the washes before choosing closing accents. The pass-list technique counts describe source inference; the frozen executor replaces those with each value-plan passage's chosen technique before physical execution (paint-plate.mjs valueTechnique binding).
- Look 2, after pass 9: 741 brush strokes, 85 pen lines. The warm foundation remains pale, and roof planes and light gaps survive, but the enormous connected foliage wash has a broad diagonal coverage gap with a visibly combed edge through the central slope. This fails the intended connected-wash mark character even at this early stage. The pale colour alone is not a defect: yellow, blue and green foundation pigments have not yet been painted.

## Revision 1 — after pass 9, before remaining foundation pigments

Change only future broad-wash geometry: add _spl8_sml50_wre5, with --splwet 0. This selects planned overlapping 8 mm brush strokes up to about 50 mm long instead of a single shape-wide fitted sweep; at 1216, the brush radius is 17.37 cells. Each stroke takes its fixed planned mean mixture, and its load remains finite. An 8–24 mm supporting plane is 35–104 cells across, width-to-radius ratio 2–6. The small 0.5 mm reach allows modest natural edge variation while keeping protected lights. Narrow roofs, windows and small shapes retain their fitted gestures. The selected 8 mm contact and longer strokes are deliberately broader and less fragmented than the historical _spl6/_wre15 hair experiment; this subject's large wall and foliage planes justify the technique.

All six families still choose wet on dry, and every stroke must pass the same measured footprint/neighbour dryness gate. Explicit --splwet 0 prevents the lane planner's default preliminary wetting from conflicting with that dry-paper technique. Same-passage verified wet-edge overlap remains allowed. Broad olive-slope, foreground-canopy and lower-garden foundations, plus the larger future wall and cross-region shadow glazes, use the overlapping brush passage. No pigment increase, opacity repair, target-pixel feedback or new render is requested. Already painted warm strokes remain on the sheet. Resume with pass 10 and inspect after the whole local-colour foundation (pass 26).

Revision 1 was admitted and physically executed for passes 10–26. The earlier half-width planning document estimated the dominant connected light support at 21.69 mm wide, well above the 8 mm threshold, so the changed stroke layout applied to the intended broad passage.

## Revision 2 — after pass 26, before shadows

Look 3: 3,159 brush strokes and 85 pen lines. The diagonal gap has acquired colour, but the finite overlapping strokes have produced conspicuous rectangular bands and dark parallel joins across the whole canopy. This is an artistic failure against the skill's no tiled patches / no uniform bands criterion. Pale ochre roof planes and reserved lights survive; the light layer remains too flat in value to describe individual crowns, as expected before shadows. The banding is not accepted as watercolor texture, and cannot be removed from already-painted passages.

Remove _spl8/_sml50/_wre5 and --splwet 0 for the remaining shadow and corrective passes. Return to the original fitted W13 paths. Unlike the single huge light support, the shadow stage contains about 41 smaller, connected components per main pigment and therefore can establish target canopy groups and building side planes without spreading more rectangular strokes over the sheet. Keep the dry-paper technique, .82 style strength and dark gain 1.0. No layer is painted over to pretend that earlier marks never happened.

The actual opening ink is finer and paler than needed for the requested urban sketch. Closing now has 64 selected paths: the original 39 window/eave/branch accents plus 25 existing structural gestures at roof and wall turns, a few distant junctions, cypress edges and main-tree branches. Increase closing nib widths modestly (original .3 px accents to .405 px), and closing pressure from .65 to .9. Fine black ink remains below about .4 mm on the sheet. This is a line-structure decision, not a fill or an attempted disguise of the wash bands. No uniform hatch or new texture field is added. Opening drawing is unchanged. Resume through the shadow and corrective passages, stopping before the closing drawing to judge the result.

Revision 2 passed the harness check and was sent with closing-lines.json, extra-args.json and variant.txt. The original fitted paths were used for subsequent shadows and correction. Native-size inspection of Look 3 confirmed that the earlier bands were physical paint marks, not a resized-preview artifact.

## Look 4 — final paint stage, before closing ink

All 55 paint passes are complete, including the painter's two corrective rounds: 18,917 brush strokes and the same 85 opening pen lines. The planned value ladder ended at pass 35 with 3,815 brush strokes; most of the additional stroke calls belong to the automatic corrective rounds. Execution reached the closing boundary without a reported material refusal. No numeric paper-state readings are invented here.

The right-hand houses, dark cypress verticals and main branching tree are recognizable. Warm roofs separate from cool shaded sides, and paper lights survive. The dark stage improves the overall value hierarchy substantially compared with Look 3. However, it does not cure the broad foundation bands. The finished paint stage has too many separate foliage marks and dark islands, insufficient connected crown planes, and perforated bright wall/ground lights. This remains an artistic failure against the intended few connected light washes, despite successful execution and recognizable landmarks. It is not claimed as a new best or given an uncalibrated score.

| Region | Observation against the reference and requested sketch technique |
| --- | --- |
| Distant village | Roof placement and cypresses survive; wall lights and cool shadows are fragmented. |
| Far blue hill | Cool recession remains readable, but parallel bands are still visible. |
| Olive slope | Dark groups recover depth; disconnected marks and residual wash bands dominate too much. |
| Focal houses | Ochre roofs and shaded sides read; bright faces are too perforated. Selective closing junctions and windows remain useful. |
| Foreground tree | Main trunk and directional branching read, but its canopy lacks a single coherent lit mass. |
| Lower garden | Warm paths remain between shrubs; excessive isolated marks weaken the connected ground plane. |

Decision at the last checkpoint: retain the prepared 64-path closing drawing and finish this learning try. Do not add ink texture or further paint to conceal the failed foundation. The final action is bench/paint.sh finish; no more plan revisions are intended. The important lesson for the next try is to establish a connected broad wash before colour accumulation: the original shape-wide sweep left a diagonal gap, while the attempted finite dry strokes replaced that with rectangular overlap bands. Corrective late paint restored value and likeness but did not restore the planned economical mark character.
