# South France — V4 try 2 — urban sketch, pen plus light wash

Target: sf-crop.png, 304 × 249 source pixels. Physical sheet: 280 × 229.34 mm; output 1216 × 996. Date: 2026-10-09. Fixed V096 painter; this independent plan does not consult other tries.

## Reference and value design

The three houses stepping down the right hillside are the focal point. Their terracotta roofs and warm walls contrast with olive-grey foliage; narrow cypresses and the open pine at lower left establish the vertical rhythm. There is no open sky. Pale stone terraces and winding paths form a connected diagonal through the vegetation.

Five-value thumbnail: paper and palest warm stone; pale ochre walls and yellow-green crowns; middle terracotta and olive; cool shadow planes and connected canopy undersides; smallest darks in cypresses, pine trunk, eaves and window recesses. Simplify the reference's density to a pen drawing with transparent washes. Keep colour masses recognizable without filling the page with leaf texture.

## Executable choices and order

Global urban-sketch, with no rectangular region style overrides. Family rectangles describe target-derived colour/value shapes, never painted rectangles. The fixed harness applies its ink-and-wash value floor; stylegain 0.8 and darkgain 1.0 keep this lighter than the supplied base. There are light foundations followed by dry connected shadow glazes; no request for extra mid layers that this style would not use.

1. Reserve target-relative near-paper light shapes and three small measured glints. Draw sparse black pen structure on dry paper: roof silhouettes, principal wall junctions, terrace fragments, cypress rhythm, pine trunk and selected branching. Opening drawing follows observed architecture and trees, with broken contours where foliage occludes them. No crosshatching, stone-block pattern, foliage stipple or closed outlines around every tree.
2. Lay light local-colour washes wet on dry paper. Use a flowing watery load, pigment dilute, side/belly contact and fitted connected sweeps. Water is the urban profile's 0.5 calibrated load. Same-passage wet overlap is allowed; unrelated passes must dry. Ochre/raw sienna for walls and paths; burnt sienna for roofs; sap green with ochre and ultramarine/cerulean for foliage; sepia only to neutralize mixtures. Broad lights remain pale painted planes rather than expanding every light into bare paper.
3. After a measured dry gate, glaze connected shadow groups across local boundaries: (a) focal roof undersides into side walls and obscuring foliage; (b) middle olive undersides through adjacent crowns and cypress bases; (c) lower pine and olive shade across the path. Medium pigment, controlled water load 0.5, wet on dry. Maintain the same shadow support, and do not outline each colour region. Dark masses remain paint.
4. Dry fully. Closing black pen restores only selected eaves, wall junctions, tiny doors/windows and trunk branch junctions supported by the reference. Do not repeat the entire opening drawing or compensate for blurry paint with heavy ink.

## Region techniques and resolution decisions

At the fixed native density, 1 cell = 0.2303 mm and 1 source pixel = 4 cells = 0.9211 mm. A four-cell wash body is about 0.92 mm. The reference itself contains no more detail than 304 × 249 pixels; added native density supports physical marks, not invented reference detail. Fitted brush radii vary by shape and are recorded by the executor; planned broad radii 3–12 mm are 13–52 cells, small-plane radii 1–3 mm are 4–13 cells. Inspect actual contact widths at checkpoints rather than claiming a fixed measured radius.

| Region | Resolution and smallest required feature | Technique, layers, loads and edges |
|---|---|---|
| Focal houses | Wash planes 3–15 source px = 12–60 cells; eaves/mullions 0.3–1 px = 1.2–4 cells are an ink question. Small wash width/radius about 1–6; subthreshold lines use pen. | Opening structure, pale warm wash, dry shadow glaze, selective closing openings. Watery light load then medium glaze. Hard roof junctions and shadow-side wall edges; lost lower corners in foliage. |
| Upper village | Walls 2–8 px = 8–32 cells, tiny openings 1–4 cells: wash plus very sparse pen. | One pale warm wash; shadows share the connected final glaze. Less ink and contrast than focal houses; no invented tiles. |
| Terrace walls and paths | Light planes 3–18 px = 12–72 cells: wash question, never dry-brush scratches. | Watery ochre/raw sienna over dry paper; preserve target light corridors. Broken boundary against vegetation, firm wall-top fragments. |
| Middle olives | Crown groups 6–20 px = 24–80 cells; leaves below 4 cells omitted. Typical support/radius 1–6. | Connected light green masses on dry paper, dry, one connected medium cool-green shadow glaze. Irregular silhouettes and paper gaps; crisp selected outer edges, quiet internal joins. No dots or uniform leaf disks. |
| Cypresses | Tapered widths 2–6 px = 8–24 cells, tips below 4 cells in pen. | Dry-edged tapering wash, then dry shadow inside the same mass; medium load at dark stage. Do not blur into lit stone. |
| Foreground pine | Canopy 20–70 cells, branches 1–4 cells: wash plus directional ink. | Pale open canopy, connected dry shadow, dark tapering trunk/branches in pen. Keep branches subordinate to houses and let some disappear into foliage. |
| Lower path | Winding light plane 12–40 cells: wash; small glints bare paper. | Very pale warm wash, with dry tree shadow crossing vegetation and ground. Lights persist through the final glaze. |
| Distant grove | Grouped planes 16–50 cells, individual leaves not resolved. | Pale blue-grey green wash, restrained dry shadow only where needed. No drawing of separate trees; softer, less emphatic than foreground. |

## Paper, lights and material checks

Paper is explicitly near-white (252,251,248), not the photograph's yellow stone treated as a whole-sheet paper tint. Automatic target-relative lights protect the broad sunlit walls/path. Three tiny explicit paper glints stay inside actual roof/path/wall lights; all are under the unsupported-seam length. Pale wall faces are painted lightly in the foundation, not reserved as rectangular holes. No planned lifting, no masking lines, no opaque repainting.

Black-ink pigment is explicitly declared, with neutral K and absorption scale 2, dry waterproof profile. Pressure caps: opening 0.65, closing 0.7; intended physical line widths about 0.15–0.29 mm (0.65–1.26 cells). Pressure tapers through authored point weights. Review the actual opening sheet before the first wash to verify visible houses and branch structure.

The frozen executor measures paper moisture over each actual stroke footprint and its neighbours. For dry placement it dries and remeasures if needed; only its own wet edge may overlap. Keep these gates enabled. Every chosen move here is wet on dry, with separate full drying before shadows and closing pen. No wet-in-wet detail and no departure from light-to-dark is needed for this crisp, sunlit sketch.

## Checkpoints and acceptance

Before physics: run bench/check.sh to ADMITTED; examine value-plan stages, connected shadow supports, reserve/seam report, and the selected paths. No separate crop physics run is permitted in this benchmark; the opening and first washes are the fast physical proofs through bench/paint.sh.

Opening: the focal houses and pine should already be recognizable, with broad open areas for wash. First colours: quiet transparent local masses, no isolated decorative flecks or filled darks. Completed light band: stone/path lights separate houses from foliage. Shadow stage: village depth and cypress silhouettes emerge without hiding the light routes. Closing: openings clarify scale, with only a small increase in total darkness.

Judge in the skill's order: value shapes, preserved/toned lights, chosen hard/soft/lost edges, roofline and tree landmarks, purposeful connected marks, then light-to-dark progression. Reject uniform blur, ink-over-blur, scratchy facade washes, tiled seams, stippled foliage, excessive black contouring and equal darkness at every depth. This is an artistic inspection, not a numerical similarity score. Material checks and artistic judgement remain separate.

## Changes and observations

Initial plan: replaced the exploratory automatic trace (which included many stray texture fragments) with a selected structural drawing; chose near-white paper, a seven-pigment stone/olive palette, neutral black ink, and reduced wash/shadow strength for the requested light urban-sketch style. No code changes.

Pre-paint checks: half-size planning produced 31 pigment/region passes and 593 connected shapes, with no unsupported axis-aligned edges. The selected opening preview contains 65 structural paths after the painter's filtering. The optional summary-board export then reported missing SF-region provenance; this occurs after the successful planning step and does not invalidate it. Full-size admission likewise reached the successful target-values checkpoint: 31 passes, 1201 connected shapes, shadows unsplit by region. The harness then advanced to GPU startup. The source/drawing overlay was inspected for roof, wall and trunk registration.

Standalone `bash bench/check.sh` completed with `{"preview":"ok","planningStep":"passed"}` and `ADMITTED` before any wash.

Cloud execution: `bash bench/paint.sh start` was submitted at 23:02 UTC. Following admission and the GPU queue, the harness reported GPU startup by 23:17 UTC. Repeated `wait` and `status` requests through approximately 23:42 UTC still reported startup, with no refusal and no first checkpoint. `look` was attempted but refused because no stopped sheet was available. `finish` was also requested; its response still reported startup, not completion. No physical painting or paper-state observations have been returned, so no physical artistic verdict or finished-painting claim is made. The submitted plan remains admitted and unchanged; cloud execution is the outstanding dependency.
