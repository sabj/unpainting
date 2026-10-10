# White Ships — Sargent, V4 try 2

Target: bench/targets/sargent-crop.png, 300 × 244. Painting: 1200 × 976, 280 × 227.73 mm, seed 0, V096 painter. Pure transparent watercolor, no ink, graphite, gouache or drawn contour. Opening, closing and ink4 fallback files contain no lines.

## Reference and value thumbnail

The focal contrast is the curved blue-grey left hull against the luminous pale right ship. Its dark upper rim, central dark fitting and deep lower-left wedge establish roundness. The right ship has two dark oval fittings, pale cool horizontal bands and a tapering silhouette. Ochre and rust rigging cross these planes; green-blue water carries short broken horizontal reflections.

Five values in order: warm paper and hull lights; pale cool foundation; blue-grey middle planes and ochre rigging; connected cooler hull shadow and green water; sparse sepia-blue fitting, rim and under-hull accents. First washes stay much lighter than the reference. The middle stage establishes likeness. Two last glazes build the darkest connected forms, crossing color-family boundaries rather than outlining each region.

## Executable choices

Precise-watercolor throughout. Family bounds are descriptive overlap labels; executed boundaries come from fitted color/value shapes. No rectangular region style overrides on the interlocking ships. The hulls need dry shaped edges: their connected foundation is wet on dry with own wet-edge overlap. No atmospheric override, because the pale hull shadows have distinct edges and the water consists of shaped reflections.

Current recipe `region_w15_lay2_cg10_dk12_acc3_dp85_noslane_softs`:

- W15 selects a physical brush per passage: broad mop/flat contact for planes, round/rigger for details. Direction follows the fitted plane.
- Two middle layers replace four: foundation and selective deepening, avoiding repeated contours on the curved hull and pale right ship.
- Cool gain 1.0 replaces 1.3: keep the subdued green-grey and blue-grey rather than intensifying every cool plane.
- Shadow gain 1.2 replaces 1.3: keep transparent shadow, separated from the deepest fittings.
- Accent share 0.3 and deep threshold 85 move small darkest fittings/rim portions to last dry paint stages. They remain painted masses.
- Remove sky lanes: the crop has no open sky. Hull strokes follow its curved form and water follows fitted reflections.
- Selected soft boundary arcs use the real clean damp brush: at most 12 arcs of 40 native cells per shape, 0.7 mm radius, split away from hard edges. This is physical edge softening on the planned turning boundaries, preserving hull silhouettes and hardware edges.
- After the foundation self-view, disable automatic relative-paper and estimated-paper light holds (`--paperrel 0 --paperlights 0`). The reference's cream hull lights are pale painted planes; the middle washes must tone them. Keep only the two small explicit bare-paper cores.
- Available pans: yellow ochre, burnt sienna, French ultramarine, cerulean, sepia watercolor, sap green. Warm/cool/green middle passages stay separate; neutrals emerge through transparent glazing. Sepia is watercolor, not a drawing medium.

## Region decisions, paper and load

Every layer chooses its move from the reference. The fixed executor checks measured paper state across the footprint and neighboring cells before every stroke. Dry means measured dry, never a timer. Own same-passage overlap is allowed; a later shape/glaze waits for a dry base. First/middle wash loads are watery, water 0.62 with calibrated pale/middle pigment demand. Glazes use medium water 0.45 and stronger calibrated pigment demand. Keep a flowing finite load, reloaded by the executor; do not globally reduce water to simulate dry brush.

| Region | Cue / resolution choice | Layers and technique | Edges and lights |
| --- | --- | --- | --- |
| Left hull | Broad curved blue-grey form and irregular pale diagonal planes. Wash question. Major planes roughly 20–90 target px, 80–360 native cells, 18.7–84 mm. | Connected pale wet-on-dry foundation; dry; two shaped middle washes; dry; connected turning-shadow glazes. Flat/mop belly, controlling one wet edge within a passage. | Hard curved rim/silhouette, softer interior turns. Actual paper flecks held by inferred light shapes; pale blue planes receive paint. No tiled islands. |
| Right hull | Warm white body, pale cool bands, pointed lower edge. Wash question. Bands roughly 4–12 target px, 16–48 cells, 3.7–11.2 mm. | Thin foundation; dry; restrained fitted cool middle planes; dry; only actual shadow deepens. Broad light wash and controlled rounds for bands. | Broad paper-related light remains. Hard lower silhouette and oval borders, selected soft turns. Do not fill white space to use paint. |
| Left background / spars | Narrow grey-blue gaps, warm spars/knots. Wash question for gaps, density question for fine rope planes. Ropes about 2–4 target px, 8–16 cells, 1.9–3.7 mm. | Pale gap foundation, dry warm/cool middle shapes, selective last rust/sepia paint accents. Point/belly contact and flowing stronger pigment. | Firm spars with lost/broken stretches. Negative-painted pale gaps and rope lights. No traced outline. |
| Water | Muted green-blue/ochre strips, pale ripples. Wash question. Ripple bodies roughly 3–10 target px, 12–40 cells, 2.8–9.3 mm. | Connected pale underwash; dry; fitted reflected-color middle passages; dry; deepen contiguous ship reflection. Horizontal fitted gestures, flowing load. | Keep light ripple gaps. Near reflections firm; color within a band merges during its own passage. Avoid equal dots. |
| Rigging / fittings | Ochre diagonal rope with rust interruptions; dark oval hardware and upper rim. Density question, native 1200 cells. Oval bodies about 6–15 target px, 24–60 cells, 5.6–14 mm. | Pale warm foundation; dry narrow middle planes; darkest accents last on dry paper. Rigger/round point for narrow bodies, round belly for ovals. | Irregular taper/changing width. Retain pale openings from fitted geometry. Accent actual dark shapes only. |

One native cell is 0.233 mm. A 1.2 mm rigger radius is 2.57 cells: an 8-cell rope body is 3.1 radii wide and above the four-cell minimum body threshold. A 3 mm round radius is 6.43 cells: a 24-cell fitting body is 3.7 radii wide. W15 records actual selected brush radius and support ratio. Broad brushes are 25.4–38 mm, 54.4–81.4 cell radius, with few long sweeps. Inspect native pixels for fittings. The 300 px reference limits finer geometry; do not invent unresolved thin rigging.

## Lights and connected glazes

The broad right hull is a pale painted plane on warm paper. The first foundation used automatic simplified near-paper masks. Self-view showed these as overly bright white holes, so the remaining middle washes release them for thin local-color tints. Only two explicit reserve cores remain within upper and central hull lights, about 4 × 4 target px, less than 4.2 mm on the longer side. Surrounding pale paint prevents a long artificial straight edge. Keep these cores as warm paper at finish. Eye catchlights do not apply to this subject.

Glaze 1 crosses left-hull pale blue, neutral and rusty families into the lower wedge/reflection. Glaze 2 deepens the same support and dark rim/fittings, leaving lit planes outside. Right-edge hull shadow crosses pale horizontal bands. The hanging rope crosses dry hull/water. Both glazes need fully dry measured paint; no region-by-region outline glazing.

The departure from a wet-in-wet sea is deliberate: this close crop shows firm broken reflection shapes, so use a dry underwash-and-reflection sequence. No dark-first move. With no drawing layer, structure is carried by painted value edges at native density.

## Checkpoints and acceptance

1. Before first wash: clean warm paper, no drawn rigging/outlines.
2. Foundation complete: very pale connected warm/cool placement, lights held, no deepest fittings. Judge continuity and lights only.
3. Middle complete: readable ship silhouettes/rounded left form, warm rigging and green-blue water; right hull luminous. No contour rings or patchwork squares.
4. Shadows: coherent curved dark and under-hull wedge with separate fitting accents; glazes cross color families, no black outline.
5. Finish: inspect thumbnail value shapes, lights, hard/soft/lost edges, rope/fitting landmarks, mark bodies/tapers, then light-to-dark progression. Compare to the reference, never pixel error.

Run `bash bench/check.sh`; inspect stage instructions, light shapes, brush choices, cross-region glazes and unsupported-axis-edge report before start. The first real wash supplies representative physical proof; no direct local physics render. Look after light passes, middle passes, and before closing. At a visible failure, revise only unpainted work when useful. Failure means lost hull lights, uniformly blue hull, disconnected dark islands, unsupported reserve seams, concentric contours, blurry hardware, stippled ripples or parallel scan bands. Admission alone is not artistic acceptance.

## Changes and observations

Initial independent plan: empty drawings for the requested medium, two middle layers, restrained cool/shadow gains, native passage brush choice, small late painted accents and reference-related light cores. No previous try consulted. Record self-view revisions here with the observed cue and reason.

Initial pre-render check completed with ADMITTED. At native 1200 width the initial plan had no unsupported axis edges, 74 pigment/region passes and 2758 connected shape instructions. Connected protected light shapes occupied 9.89% of the sheet. There were 376 shadow instructions crossing color-region boundaries. Selected brushes included rigger, round4/8/12, 25.4 mm flat and 38 mm mop. The marks-only opening preview was blank, verifying zero selected drawing paths. No executable revision before start.

Self-view 01, boundary 0: actual warm-white textured sheet, zero brush strokes and zero pen lines. Self-view 02, boundary 1: 72 brush strokes and zero pen lines. The first pale ochre passage has connected filled bodies, irregular fitted edges and transparent light interiors; no scratchy gaps, stippled deposition or unsupported long straight seam is visible. It satisfies the first-wash intent, not the finished-value intent. Keep the plan and continue through the complete light foundation at pass 20.

Self-view 03, boundary 20: 1371 brush strokes, zero pen lines. The pale foundation reads as the correct ship silhouettes, warm rigging and cool hull body, with filled flowing marks. It is appropriately light before the middle and shadow stages. Two visible failures need correction in the unpainted work: (1) large inferred paper lights look glaring white and fragmented, whereas the reference shows cream/pale-blue painted hull planes; (2) several gentle interior boundaries have fine contour rims. Revision 1 releases inferred paper lights for pale middle tints, retaining the two deliberate small cores, and adds controlled physical softening only on selected low-contrast boundaries, split away from hard edges. Pigment strokes still require measured dry paper; clean damp softening is a deliberate same-passage edge action. Do not blur the oval fittings, rope or hull silhouette. Judge the next checkpoint by light toning, continuous hull value planes and preserved focal edges before proceeding to the connected dark glazes.

Revision 1 passed the cloud admission check. A separate `bash bench/check.sh` on the final revised files also ended with ADMITTED. Resume from the existing boundary 20 sheet, preserving all previous paint, and inspect the middle values before the final connected shadow glazes.

Self-view 04, boundary 60: 8881 brush strokes, zero pen lines. Inspected the side-by-side comparison and the native 1200 × 976 sheet. The large right-hull light planes now carry a thin grey/cream tint, so the glaring wholly bare-paper holes have diminished; the two small deliberate cores remain. The curved blue hull plane and rusty rope silhouettes are readable with filled flowing marks, and focal geometry remains firm. Several contour rims and fragmented pale interior patches remain, so do not claim the edge problem solved. The main oval fittings and the dark lower wedge still lack their last paint accents. The pale lower band is the foundation awaiting the base recipe's connected ground/shadow glaze; judge its continuity after that glaze, not as a finished value. Keep the current executable settings: next paint the two planned cross-family shadow stages and inspect before the empty closing drawing. Acceptance priorities remain value-shape cohesion, toned lights, correct focal edges/landmarks, purposeful mark bodies and honest light-to-dark progression.

Self-view 05, before closing: all 90 passes, including the painter's touch-ups, are complete; 14082 brush strokes and zero pen lines. The comparison shows a recognizable curved cool hull, pale right ship, warm rigging and deep under-hull wedge. The fittings now have their dark painted cores. Lights remain distinct from the shadows, although the left hull is darker and more fragmented than the reference. Edge acceptance is incomplete: hard contour rims persist around many interior shapes, and a pale horizontal transition remains across the lower left hull. The rope and fittings retain their locations and changing widths; filled watercolor bodies carry the forms without drawing lines. The recorded progression proceeds from pale foundations through middle color to the darkest connected masses. No further unpainted value passages remain to correct the visible limitations. Finish with the empty closing drawing and retain this candid assessment alongside the completed sheet.
