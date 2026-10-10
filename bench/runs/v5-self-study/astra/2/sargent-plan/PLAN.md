# White Ships — V5 try 2

Fixed target: `bench/targets/sargent-crop.png`, 300 × 244 source pixels. Native painting: 1200 × 976 cells, 280 × 227.733 mm, 0.2333 mm per cell. Date: 2026-10-09. Pure watercolor, no ink or graphite. Read watercolor-technique before judging and planning; use its final acceptance list and the painting-planner procedure. This file is the technique intent; config, recipe and settings implement it through the fixed painter.

## Reference and value thumbnail

Five values: warm cream paper lights; pale blue-grey and warm neutral hull tint; connected middle blue central bow and green water; deep blue-grey upper rim and lower reflection; small near-black fittings and anchor junctions. The main focal relationship is the rounded blue bow against the cream right ship, with the central oval fitting and warm rigging explaining scale. Keep the pale right ship broad and the lower shadow joined to the bow.

The brightest 0.1% of source pixels average approximately 232/225/210. Select a physical warm cream sheet, 235/229/214. This is a declared material before painting, not an image adjustment. The inferred irregular near-paper lights remain bare warm paper: the broad right hull lights, central oblique facets, anchor light edges and small water glints. Adjacent less-light planes get a transparent tint. No rectangular reserve cuts through a wash. No opaque light correction or drawing is planned.

## Learning from try 1

See SELF-REVIEW.md for the independent judgment written before external feedback. Retain the correct composition, fitted target geometry, warm/cool palette relationship, selective edge softening and no-ink choice. Change the earliest failed layer:

- W15 per-passage brush selection from the first wash. Try 1 used oversized W13 paths, then narrow lanes, and changed to W15 only at the end; later paint could not erase the earlier white wedges or stripes. W15 supplies a rigger/round for small shapes and broad flat/mop contacts for broad planes. Inspect actual first-wash coverage before allowing all middle paint.
- `_lay1`: one connected middle-value wash rather than two nested layers. The reference bow has continuous tone and intentional oblique lights, not overlapping contour islands. This also reduces repeated whole-picture restatement.
- `_rg0`: remove the inherited architectural ground-glaze deferral. The previous cutoff at y=.62 cut across the bow and is unsupported by this reference. Hull middle values are present across their full shape in the same middle stage.
- `_dk10` and `_cg10`: use unit dark and cool gains. The previous 1.3 shadow gain made the lower wedge heavy; blue should stay transparent and muted. The six paints remain yellow ochre, burnt sienna, ultramarine, cerulean, sepia watercolor and sap green.
- A warm cream physical sheet replaces the automatic bright-white sheet. The automatic estimator found a cream patch but rejected it as the sheet color because it did not touch the border. The target's lights are visibly warm cream.
- `_dkf`: after the pale foundation dries, establish the structural shadows in two transparent applications, then the single middle wash. This is the named exception to the default order. The upper rim, oval fittings, anchor junctions and connected lower shadow provide the reference's strong scaffold. Painting them before surrounding middle color establishes structure without making the entire image darken in lockstep. No light paint is expected to cover or lighten those darks; middle pigment is allocated by the same planned value accounting.
- Keep `_softs`: only selected low-contrast turning boundaries receive small clean damp contacts; neighboring hard structure is excluded. Keep cold-press paper and ordinary physical drying. No added texture layer, geometric wobble or all-sheet wetting.

Accepted critique: early wash fragmentation, flat value islands, delayed structural emphasis, and late texture accumulation. Rejected: the automatic 9.25 edge score and a perfect 5/5 finished-stage plausibility score, since the prior sheet visibly retained stripes and scallops. The opacity-dissolve description is a useful visual analogy, not evidence that physical strokes were absent. We improve stage emphasis without imitating a wipe or withholding regions artificially.

## Per-region technique and resolution

All family rectangles are descriptive overlap labels. Actual supports follow the painter's fitted color/value shapes; no rectangle clips a wash and there are no regional style rectangles.

| Region | Cue, resolution and edge roles | Move, load and sequence |
| --- | --- | --- |
| Central bow | Wash question. Main planes 8–40 source px = 32–160 native cells, 7.5–37.3 mm. Oblique cream facets define curvature. Broad flat/mop bodies; firm upper rim and silhouette, selected soft internal turns. Fitting width 8–16 source px = 32–64 cells. | Pale watery pigment, .62 planner water, wet on fully dry paper with its own wet overlap. Dry. Transparent structural shadow applications, .45 water and medium pigment, across lower bow into reflection and in the rim/fitting. Dry. One connected middle-blue wash, .62 water, medium transparent pigment. No arbitrary ground cutoff. |
| Right cream hull | Wash/negative-painting question. Light planes 12–50 source px = 48–200 native cells. Bare warm paper on inferred light shapes, pale painted planes around them. Hard upper structure and fitting; lost internal light edges. | Pale tint on dry paper around reserved lights; dry; blue shadow shapes and fittings with controlled .45-water glazes; dry; a single pale/middle local wash where required. Never flood the cream plane with blue. |
| Left rigging and anchor | Narrow painted bodies, not subpixel line drawing. Useful rope widths 2–5 source px = 8–20 cells, 1.9–4.7 mm. Anchor arms broader. Pointed round/rigger follows fitted axes and leaves holes open. | Pale warm base at .62 water, dilute paint. Dry. Restrained dark joints at .45 water, then dry and warm ochre/sienna body at .62 water and medium pigment. Connected gestures, taper, no dot texture or contour ink. |
| Right diagonal rope | Narrow wash shape 2–7 source px = 8–28 cells, 1.9–6.5 mm. Hard light flank against cool hull; target-supported gaps. | Same warm dry-paper sequence as left rigging. Middle color follows the fitted diagonal; no global prewet that could spread it into the hull. |
| Water and lower reflection | Wash question for masses, dry-brush question only for natural paper-tooth sparkle. Useful glints 2–6 source px = 8–24 cells. Broad reflection connects across hull and water rather than ending at a labeling boundary. | Pale underwash on dry paper, .62 water/dilute pigment; dry; two connected .45-water medium shadow glazes linking lower bow, left support and reflection. Dry before one green/blue middle wash. Preserve cream broken horizontal glints. No explicit stipple or extra dry-brush scatter. |

At native density a 1-source-pixel feature spans four cells (0.933 mm), the practical minimum for a painted body. Subpixel threads are omitted or suggested by adjacent planes. W15 selects physical diameters 1.2, 3, 5, 7, 25.4 or 38 mm: radii approximately 2.6, 6.4, 10.7, 15, 54.4 or 81.4 native cells. Typical 8–28-cell rope bodies against a 6.4–15-cell round radius give feature/radius ratios around 1–3; actual compiled support and selected brush must be inspected. Large plane supports use flat/mop width and multiple fitted contacts where required. Target-fitted clipping preserves light gaps and concavity.

## Moisture and cross-region glazes

The reference contains shaped hulls and water, not a sky requiring a whole-sheet wet bath. Every region explicitly begins wet on dry. Adjacent strokes within that same physical passage may join their own wet edge. No details are scheduled inside an intentionally wet background. The fixed executor measures the complete contact footprint and three-cell neighbors before every stroke, dries and remeasures if an independent dry stroke is not ready, and records actual paper state and brush load. Keep those gates intact; do not assume elapsed time proves dryness.

Two shadow glazes share the connected support across central lower hull, neighboring left boat mass and lower water. Each begins on a fully dry preceding layer, uses medium transparent pigment and .45 water, and preserves the right hull and warm rope lights. They occur after the light base and before the middle wash by the declared early-structure exception. The second restates the first without increasing total gain. Warm middle color is not an opaque correction to a dark. The base recipe's final broad-shape touch-up remains available after all planned values; inspect before completion and restrain it only if it visibly starts to overwork the sheet.

Opening and closing drawing files each contain zero paths with `medium: none`. No ink pigment is deposited. Base drawing tokens therefore cannot add lines.

## Preflight and physical checkpoints

Run `bash bench/check.sh` and require ADMITTED. Inspect compiled bands, light shapes, brush decisions, cross-region shadow support and absence of unsupported axis-aligned edges. Do not render any independent physics proof: the task allows painting only through `bench/paint.sh`; the first stopped physical foundation is the representative proof.

1. Before wash: warm cream sheet, zero lines.
2. Early foundation: pale connected warm/cool passages; evaluate coverage, retained cream lights and purposeful paint edges. A pale stage need not look finished. If broad triangular holes or regular stripes appear, stop and revise unpainted passages at the earliest boundary.
3. Structural shadows: dark upper rim, fittings and lower reflection read before the rest is filled with middle color. Judge the connection and restraint of these shapes, not their contrast against unfinished neighboring planes.
4. Middle wash: central bow becomes a connected blue plane with oblique lights; warm rope bodies become clear. The right hull remains pale cream and lower reflection connects without a straight horizontal band.
5. Final correction and empty closing: judge values, lights, edge roles, landmarks, mark character and stage progression in that order; finish and stop.

Reject a revision if it loses another region. Failure signs: unsupported horizontal or diagonal coverage seams, uniform stripes, scalloped patchwork, coarse dots, overly dark base, enlarged light holes, blue flooding of cream hull, blurred rope and fittings, or additional strokes that merely restate the whole image. Technical admission is separate from artistic success. Labels for looks: Sargent, V5 try 2, W15, 1200 × 976, 2026-10-09; recipe/commit provenance is recorded by the harness.

## Execution observations

Standalone `bash bench/check.sh` completed with **ADMITTED**, `planningStep: passed`, and no unsupported straight seams. Native compile: 23 connected paper reserves, 115495 cells (9.86% of the sheet); 736 light shapes, 684 middle shapes, and 198 shapes in each shadow application. 178 of the 198 shadow shapes cross color-region boundaries. The largest light plane is 327941 cells and uses five 38 mm mop sweeps. Its area/perimeter support estimate is 34.17 cells versus an 81.43-cell brush radius (ratio .42); this irregular support requires the physical clip to preserve gaps, so the first actual wash is an essential coverage check. Smaller fitted supports use the round/rigger kit as planned. All compiled painting moves are wet on dry; the right rope shares a warm rigging color region rather than owning a separate segmentation region.

Submitted the admitted files with `bash bench/paint.sh start`. Physical observations pending.

Cloud execution note: after approximately 30 minutes of repeated `wait` requests, the harness still reported "starting on a cloud GPU" and returned no opening stop. A `look` request confirmed that no stopped sheet was available. I then issued `bash bench/paint.sh finish` to request completion without further stops; its response still reported startup. No visual acceptance or physical stroke result is claimed from this delay. The admitted plan files have not been revised.

Last status check, approximately 38 minutes after the start request: still "starting on a cloud GPU"; 9.0 of 85 working minutes used, zero looks and zero revisions. Repeated waits after the finish request also returned startup. All preparation files and the successful standalone admission check are complete. A finished painting is **not confirmed**: cloud startup remains the outstanding external blocker. Continue with `bash bench/paint.sh wait` when the service advances; inspect an available stopped sheet if it returns a stop rather than completion, then finish. Do not infer an artistic result or a successful render from the admitted plan alone.
