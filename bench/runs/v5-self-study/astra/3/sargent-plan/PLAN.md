# White Ships — V5 try 3

Target: Sargent, White Ships crop, 300 × 244 source pixels. Output 1200 × 976 on 280 × 227.733 mm cream cold-press paper. Native cell size 0.2333 mm; one source pixel spans four cells. Date 2026-10-09. Pure watercolor, zero ink or graphite paths. This plan applies the watercolor-technique and painting-planner references; the executor retains its measured paper-state gates and physical drying.

## Value design and learning

Five values: warm cream lights; pale cool hull tint; middle blue bow and turquoise water; deep blue-grey rim and lower reflection; small dark fittings and anchor junctions. The focus is the curve of the central blue bow against the broad cream right ship. The curve must read at thumbnail size before the hardware is judged.

I independently reviewed the previous painting before opening the external feedback; see SELF-REVIEW.md. Retain its composition, six-pigment box (ochre, sienna, ultramarine, cerulean, sepia watercolor, sap green), warm physical paper, no ink, and target-fitted boundaries. Change the earliest failed coverage rather than adding detail:

- W13 with planned 8 mm strokes, adapted down to the support width, for eligible warm/neutral planes. The preceding W15 run used a few broad fixed brush sweeps; its long unpainted slit and dark adjacent strip suggest incomplete contact and excessive overlap. Distributed strokes should reach the irregular forms from the outset. A restrained 0.4 mm reach gives planned warm/neutral stroke ends a slight natural runout. This is justified for connected ship planes, unlike the noisy hair experiment that used 1.5 mm reach.
- Large blue planes use the existing overlapping sky-wash geometry: radius 6 mm, step 0.8 radius. The reference has no sky here; this is explicitly the broad cool hull/water wash move. Narrow bodies retain fitted, connected physical gestures. Do not use W15's fixed brush radius over these planned lanes.
- `--cover 1` accounts for the average overlap of these strokes in their pigment load. More overlapping contacts must not automatically mean a darker plane. Paper, pigment, drying and diffusion remain physical.
- Keep one middle wash (`lay1`), restore normal light–middle–shadow order by removing `dkf`, retain unit cool gain and remove architectural ground deferral (`rg0`). The prior early dark scaffold made a heavy anchor before the hull was formed and did not improve progression.
- Reduce shadow gain from 1.0 to 0.8 and touch-up gain from 0.6 to 0.35. Two transparent final shadow applications express one connected shading intention; they should not form a near-black slab or repeatedly restate every contour.
- Keep cream sheet RGB 235/229/214. Disable the top-decile relative light expansion and narrow the estimated-paper tolerance to 4 channel levels. Inferred connected true paper lights stay reserved; surrounding pale strakes are painted planes. No hand-made rectangular reserves.
- Keep small selective clean-damp edge softening, excluding hard boundaries. No artificial grain, extra texture passes or ink recovery.

Accepted critique: flat early slabs, fragmented broad values, premature anchor emphasis, excessive hard rims and late accumulation. Rejected: high automatic edge/marks scores as artistic verdicts; the literal opacity-reveal accusation; and the suggestion that the visible defects are only minor. Change technique and emphasis, not the target or renderer.

## Regions, lights and resolution

Family rectangles describe overlapping subjects; the painter's fitted shapes define actual boundaries. All families use the same precise-watercolor profile so no style rectangle creates a seam.

| Region | Reference cue and resolution | Technique, load, edges and order |
| --- | --- | --- |
| Central bow | Luminous blue curved plane, oblique pale strakes, dark upper rim. Wash question. Main forms 32–160 cells (7.5–37 mm); fittings 32–64 cells. | Watery pale blue foundation on dry paper, own wet overlap allowed. Dry. One medium transparent blue passage with broad overlapping 12 mm contacts. Dry. Restrained shadow glaze across lower bow into reflection; upper rim and fitting darks last. Firm outer silhouette, selectively softened internal turns. |
| Cream right ship | Cream paper lights, pale painted blue turning planes, dark oval fittings. Negative painting and wash question. Planes 48–200 cells; fittings 24–64 cells. | Brightest connected areas bare warm paper from the start; adjacent pale areas get watery wash. Dry, then shaped middle blue shadows on dry paper. Dry before final fitting accents. Light boundaries often lost; structural diagonal and fitting edge firm. |
| Left anchor and rigging | Warm anchor arms and narrow brown/cool supports, clear holes. Narrow wash question, bodies typically 8–20 cells (1.9–4.7 mm). | Pale warm load, dry; connected middle ochre/sienna body, dry; dark joints last. Adaptive 2–8 mm strokes for eligible planes, fitted gestures for small shapes. Medium flowing load without flooding. Preserve golden light flank and open gaps. |
| Right diagonal rope | Narrow rusty band across pale ship and green water, target-supported interruptions. Wash question, 8–28 cells (1.9–6.5 mm). | Controlled warm light and middle passages on dry paper; firm light flank and tapered body. Fully dry before restrained dark joints. No line tracing or stipple. |
| Water and reflection | Fresh turquoise/yellow-green right water, dark connected lower reflection, broken pale glints. Wash question; paper tooth supplies sparkle. Glints 8–24 cells. | Pale connected underwash, dry; medium blue/green wash, dry; final shadow intention crosses lower bow, neighboring boat and water in two restrained applications. Keep horizontal glints as irregular gaps or pale painted planes; no hard horizontal cutoff. |

Broad cool brush radius is 25.7 native cells: main plane width/radius about 1.2–6.2; overlapping strokes cover wider shapes. Adaptive planned warm/neutral radii are roughly 4.3–17.1 cells; typical rope-body width/radius is about 1–4. Features below four cells cannot hold a watercolor body and are suggested by neighboring value planes. They are not turned into ink. Compile inspection must confirm nonzero paths and sufficient coverage; the half-size preview is only for composition, with physical detail judged at 1200 px.

Lights list: broad upper-right cream plane and small connected near-paper slivers are bare cream paper. The central bow's oblique sheen is chiefly pale painted plane, not a broad blank slit. Anchor light flanks and water glints use natural fitted gaps and pale planes. No opaque white restoration. Tone adjacent pale planes in the first wash and middle pass; protected true whites remain the sheet colour.

## Moisture and glaze discipline

Each independent shaped passage begins on fully dry paper. The reference has firm boats and rigging, so no whole-sheet prewet or wet style override is justified. Watery foundation and flowing middle load use planner water 0.62; shadow water 0.45 with medium pigment at 0.8 gain. Existing planned-lane clean-water contacts are confined to the shape; the measured dry-paper gate takes precedence over any intention to join them. Within the same passage, a measured own wet edge may be joined. Small details stay outside unrelated wet passages.

Before every mark, the fixed executor measures the whole brush footprint plus neighbors; dry, remeasure or stop if the state is wrong. Never bypass the wet/dry gate and never claim an unobserved moisture reading. No new wet-on-wet gate is requested. Allow ordinary physical drying between layers and before each cross-region shadow application. Cross-region glazes connect the lower bow, left boat shadow and water; a family boundary must not cut the shadow.

No departure from light-to-dark is planned. The two shadow applications share one connected support; they are a restrained build of the same shadow rather than independent region fills. Opening and closing files have `medium: none` and zero paths.

## Acceptance checks and stops

Run `bash bench/check.sh` and require ADMITTED. Inspect the compiled value plan and preview for connected broad shapes, protected cream planes, cross-region shadow support and absence of unsupported straight seams. Do not launch a separate physical proof: this task permits painting only through bench/paint.sh. Use the first stopped wash as the technique proof.

1. Opening: cream paper, zero drawing.
2. Foundation and first blue: broad pale connected masses, selective lights, no large unintended slit or regular brush stripes. Compare to its light-wash intent, not final darkness.
3. End of middle: rounded blue bow and fresh water read clearly; warm hardware supports them. Right ship remains light. Inspect before shadows.
4. Shadows: lower reflection joins the bow, upper rim and fittings are selective; no all-over dark contour reinforcement.
5. Before closing: judge thumbnail values, lights, edge roles, landmark proportions, purposeful mark character, then progression. Empty closing; finish and stop.

Failure signs: disconnected pale holes through a continuous blue plane, regular stripes, scalloped rims, flattened cream hull, muddy water, widened rope, dark anchor before surrounding form, or repeated glaze that loses light. A revision must address the earliest remaining controllable layer without sacrificing another region. Admission and artistic success are separate judgments.

## Preflight observations

The explicit option check returned `ok: true`. The standalone check could not create its shared lock under /tmp, so I stopped that waiting check and submitted through `bench/paint.sh start`, which performs admission in the harness. A separately permitted 600 px CPU compile completed successfully with zero unsupported seams, 1,201 connected shapes, 55 pigment/region passes, and ten paper-light components totaling 11,849 cells (4.05% of this preview). Of 216 shadow shapes, 190 cross color regions. The compiled progression retains a continuous blue bow without the previous long blank slit; it still simplifies tonal nuances into planes, so this is a geometry check rather than a claim about physical watercolor quality. Native execution and physical looks remain the decisive proof.

## Execution status

Submitted `bash bench/paint.sh start` at 2026-10-10 00:29 UTC. Repeated `wait` and `status` requests for approximately fifteen minutes continued to report: "not started yet: the admission check for your start is running". Both `run 12` and `finish` were refused with "A check or a revision is still under way; run bash bench/paint.sh wait first." No refusal of the painting plan itself, admitted cloud result, opening stop, or physical painting was returned. No physical look or revision could therefore be made. The accepted local result is the option check plus the successful 600 px CPU planning compile, not a completed painting or a full-width ADMITTED result. Leave these submitted files for the TASK.md fallback that checks and paints the plan without stops if the session ends before painting starts. Do not interpret the compile preview as the finished painting.
