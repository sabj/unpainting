# White Ships — V4, try 2

Prepared from the fixed 300 × 244 reference for the 1200 × 976 painting on a 280 mm sheet. Pure watercolor, no ink or graphite. Technique references: `.claude/skills/watercolor-technique/SKILL.md` and the supplied painting-planner procedure. This is an independent plan; no other tries or scores were consulted.

## Reading and value intention

The central blue-grey bow is the principal mass. Its curved left contour, descending rusty fittings, the warm rope at right, and the two upper-right dark openings establish the boats. The focal contrast is the central dark opening against the silvery blue hull; the lower-left hull/water junction supplies the weight. Preserve the reference's angular brush planes and restrained cool/warm color, with cream light showing through.

Five values: (1) cream paper and near-paper hull lights; (2) pale blue-grey reflected light and warm rope lights; (3) broad blue-grey bow and sage/turquoise water; (4) connected deep hull/reflection shadows and rigging intersections; (5) a few dark oval openings and the darkest bottom-left notes. Progress goes light to dark, with full drying between layers. The picture fills the sheet; no invented vignette.

## Executed choices

`precise-watercolor` governs all families. Bounds describe subjects for assignment to the painter's color/value shapes; the geometry remains fitted to the reference. No region style rectangles cut the sheet. `region_w13_lay2_dk11_cg10` retains the fitted physical brush paths, uses two middle layers instead of four, dark gain 1.1 instead of 1.3, and cool gain 1.0 instead of 1.3. These changes protect the silvery hull and avoid repeated blue build-up. The inherited two final shadow stages remain.

The palette is yellow ochre, burnt sienna, French ultramarine, cerulean, sepia watercolor, and sap green. Ochre/sienna give warm ropes; the two blues and earths give grey hull planes; cerulean with the modest green demand gives water. Sepia is a watercolor pigment, never a drawn ink layer. The physical paper color is explicitly RGB 227/220/204, the average of the reference's brightest 1%, so reserved paper matches its cream rather than becoming white holes. Both drawing files are empty with medium `none`, and `--drawing none` explicitly disables drawing. No tracer is used.

## Lights

Use the executor's connected, near-paper light mask relative to the reference paper. No added rectangular reserves: the large right-hand cream hull, the small upper edge gaps, the broken light ribbon on the central bow, and the pale rope sides are irregular or oblique. Their brightest cores are bare cream paper; adjacent light planes receive a very pale local-color wash. Water streaks are negative-painted light gaps, not white paint. The smaller blue-grey facets inside the central hull are pale painted planes, not holes. Do not erase the blue-grey light notches inside dark openings. No opaque white, masks with invented straight borders, or late light over dark.

## Region techniques and resolution

At native width, a cell is 0.233 mm; one source pixel spans four cells and 0.933 mm. About four cells (0.93 mm) is the minimum useful wash body. Most essential ropes are 2–5 source pixels, or 8–20 cells (1.9–4.7 mm); oval openings are about 10–22 source pixels, or 40–88 cells. Their fitted brush radius is roughly half the local support width: 4–10 cells for ordinary rope bodies, and 20–44 for broad oval bodies; support/radius is approximately 2, with actual values determined by the unchanged path fitter. Subpixel texture and the thinnest hairlines are omitted rather than imitated with ink. Native density is fixed and sufficient for the painted landmarks.

| Region | Resolution question and reference cue | Layers, paper state, water and pigment | Edges and brush intent |
|---|---|---|---|
| Central bow | Wash; facets 3–20 source pixels (12–80 cells), not individually stippled texture | Light foundation on dry paper, watery pigment with water load 0.62; two connected middle washes on dry paint, medium pigment with the same finite flowing load; dry, then shadow glazes at water 0.45 | Broad fitted side/belly contact along the curved mass; firm silhouette and crisp facet junctions, selected softer turning edges. Preserve pale internal planes. |
| Right white hull | Wash; light planes tens of pixels, diagonal shadows 4–12 pixels (16–48 cells) | Leave near-paper cores; watery pale foundation; dry middle shadows; dry shadow glaze only where the reference is actually shaded | Few broad angular strokes; hard diagonal structural edges, soft/lost edges within the pale plane. No wash to fill unused space. |
| Left masts and rigging | Wash/negative painting of narrow shapes, 8–20 cells for useful rope bodies | Pale ground, fully dry; middle ochre/sienna and blue shapes with controlled medium pigment; dry dark intersections last | Point contact for narrow members, belly for boat planes; long connected gestures following the fitted direction, tapering ends and paper gaps. |
| Lower water and reflections | Wash for reflection planes, paper-tooth question for small broken lights; 12–60-cell reflection bodies | Transparent underwash on dry paper; dry; medium middle reflections; dry; lower cross-region shadow glaze at water 0.45 | Connected broad reflection bodies with broken natural edges; horizontal light gaps persist. No separate stipple or ornamental dry-brush pass. |
| Right warm rope | Narrow wash shape, 8–20 cells | Light ochre foundation, dry middle sienna, dry selective deeper accents | Connected diagonal, uneven warm value, crisp against pale hull; its bright side remains light. |
| Focal openings and fittings | Small painted planes, 40–88-cell main oval bodies | Pale location in foundation; dry middle value; strongest paint in final two dry stages, medium-to-thick pigment with controlled water | Small fitted brush shapes with irregular contours and interior notches, not outlines or black disks. |

The same decisions apply to related colors wherever the executor assigns its broad color families. All light passages explicitly use wet on dry because the reference is constructed from distinct hull/rope planes rather than a large open atmospheric sky. Same-passage wet overlap is permitted to connect broad washes. No separately dried tiles within a plane. This is a deliberate use of the skill's dry placement default, not an atmospheric-wet override.

## Glazes and state gates

First dry the connected local colors. The main cool-neutral shadow crosses the central bow facets into the lower reflection mass; the next dark restatement connects the lower-left overlapping boats, the foot of the bow, and adjoining water. These use the executor's region-independent shadow support rather than filling each family separately. Upper-right cast shadows and dark openings remain separate where the reference separates them. Darks build in the final two stages; no dark-first exception.

Before every physical stroke, retain the executor's measured paper-state observation over its footprint and neighbors. For a fresh wash or glaze the base must be dry; own-pass overlap is allowed. If the required state is wrong, the existing gate must wait/dry or work elsewhere. Use actual observations, not elapsed time as a substitute. Never send wet broad work into a dry detail by treating it as atmospheric blending. No physics changes or output recoloring.

## Checkpoints and acceptance

1. Before paint: admission must pass; inspect compiled families, moves, connected supports, and light-to-dark bands. No unsupported axis-aligned seams and no missing executed choices. Opening sheet has no drawing.
2. First light washes: the silhouette arrangement is only hinted at, cream light survives, warm and cool foundations remain transparent. Judge as a foundation; dark openings are not expected yet.
3. Middle washes: central bow becomes one readable mass, right hull stays light, ropes separate the planes, and water connects below. Stop and revise future settings if the foundation is patchy, too dark, or blurry.
4. Before closing: assess joined shadows and selective accents. No drawing will follow. Finish when the reference's value hierarchy, lights, landmark proportions, and firm/soft/lost edge roles read at thumbnail scale.

Acceptance follows the technique guide's order: value masses, lights, edge roles, landmarks, purposeful marks, then human light-to-dark progression. Failure signs are a uniform blue cast, flat cream hulls with no facets, ink-like contours, lost porthole notches, tiled patches, scratches, repeated contour bands, or disconnected flecks carrying large-region tone. Material execution and artistic judgment remain separate; passing admission alone is not proof of visual quality. The authorized proof is the compiler followed by early passage inspection through `bench/paint.sh`; no separate local physics render is used.

## Revisions and observations

Initial plan: the changes from the fixed recipe are the two middle layers, restrained cool/dark gains, six-pigment palette, and absent drawing, for the reference cues described above.

Prepaint check: the first compile was ADMITTED with no unsupported seams. Its automatic paper selector reported 252/251/248 despite measuring a bright reference region at 221/215/199. To avoid blazing white reserves, the plan now declares physical cream paper at 227/220/204, measured from the brightest 1% of the reference. This changes the sheet and pigment fitting before painting, not the export. Recheck before starting.

Final prepaint check: ADMITTED. The compiled revised plan has no unsupported axis-aligned seams, uses wet-on-dry for light, middle, and shadow shapes, and includes 362 shadow shapes crossing color regions. Its required first-stroke state is fully dry with own-passage overlap allowed. The small focal and rope families supply descriptive intentions; the broad color-cluster assignment resolves to central hull, white hull, left rigging, and water. Thin details retain fitted paint geometry and receive no ink despite the generic compiler's ink suggestion for sub-four-cell lines.

Look 1, boundary 0: cream physical sheet, zero brush strokes, zero pen lines. Look 2, after light passes 1–20: 1,974 brush strokes, zero pen lines. The light bow silhouette, warm ropes, and lower water arrangement read; cream hull lights remain intact. The blue ground has visible granulation, to be judged again after the middle wash connects the values. Strong openings and lower hull shadows are deliberately still absent. Continue unchanged through the first middle layer, then inspect before the second. The cloud pass list also reports the executor's inherited local technique classifications; these are distinct from the authored wet-on-dry value-plan intentions and were not claimed as measured execution evidence.

Look 3, after pass 40: 3,827 brush strokes and zero pen lines. Lights are intact and local-color masses are established; the deepest openings and lower dark unity still await the shadow stages. The blue hull has coarse clustered granulation compared with the reference's finer broken wash. Revision 1 sets `--skyfloc 0.2` instead of the inherited 0.5 for the granulating ultramarine used in the cool hull/water passages. This reduces clustering in subsequent blue loads without disabling granulation or changing physical paper, pigments' absorption colors, region geometry, gains, or the passage ladder. Already painted marks stay. The reference cue is the broad silvery blue plane, which should read before its grain. Continue through the second middle layer on dry paint, inspect, then shade.

Revision 1 passed admission and was applied from the saved pass-40 sheet. Look 4, after pass 60: 5,420 brush strokes, zero pen lines. The second middle wash has strengthened the bow and warm rigging while leaving cream light planes. Earlier coarse blue grain remains visible; the later material adjustment is not claimed to undo it. The central opening, upper-right openings, and lower connected shadow still need their final dark values. Proceed with both planned shadow stages and the painter's ordinary shape-average touch-up, then inspect before closing. No further recipe change is indicated by this middle-stage value check.

Completion route: both shadow stages and the ordinary touch-up rounds ran through pass 90, reaching 9,989 brush strokes. The requested closing review stop is conditional in this fixed executor: `--drawing none` skips that pause and proceeds to finalization. Therefore the last self-view is Look 4 at pass 60, not a claimed final visual acceptance. The finished artifact and its recorded progress, rather than an unobserved final quality claim, are the deliverable. Four self-views were taken and one admitted material revision was made. All actual drawing files remain empty.
