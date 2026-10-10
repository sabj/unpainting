# Mittens — V4 independent try 3

Reference: `bench/targets/mittens-crop.png`, 300 × 259. Final sheet: 1200 × 1036, 234.1068 × 202.1122 mm. Requested character: watercolor portrait sketch, fine lines and light washes. The cat fills the left half; the human face enters from the lower right. Both look upward. Cat eye spacing, the triangular ears, white muzzle, tilted human eyes and slight smile carry likeness.

## Value and material decisions

Five values: white paper; pale warm skin/white-fur shadows; ochre tabby planes; neutral middle-dark curls and cheek contact shadow; small darkest lids, pupils, nostrils and curl valleys. The paired eyes are focal points. Dark hair must read as a connected mass, while the forehead, cat bib, muzzle and surrounding paper remain luminous.

Use precise-watercolor throughout, with ink-and-wash treatment of sub-brush details. Family bounds only name overlapping target-derived shapes; they are not painted rectangular boundaries. All families use the same style, avoiding artificial seams. There is no background wash. This is a deliberate paper vignette in the reference.

Palette: yellow ochre, raw sienna, burnt sienna, French ultramarine, sepia and Payne's grey. Ochres carry cat stripes and pale skin; mixed cool-neutral pigment carries hair. Sepia ink is explicitly declared by the sepia recipe and material profile. Do not use ink as a dark fill.

Relative to the supplied V096 base, choose two middle layers instead of four: the reference has light washes with generous paper, not repeated opaque-looking modelling. Reduce shadow gain from 1.3 to 1.1. Reduce sepia absorption scale from 8 to 3 and set opening pressure 0.24 and closing pressure 0.46 for fine lines. Move a 0.3 share of small dark features to the last accent stage; the darkest target features below RGB 80 build last on dry paint. Retain target-fitted connected brush paths. No lane-stroke or expanded wash-reach recipe is requested.

## Light protection

- Four explicit, small bare-paper catchlights: cat left around (26.65,63.85), cat right (80.95,56.55), human left (181.15,186.25), human right (243.75,176.45), in target pixels. Each reserve is 1.5 px square, about 1.17 mm, six native cells. These stay untoned and no authored ink crosses them.
- Cat muzzle, blaze, bib and inner ears: source-shaped paper reserves inferred from near-paper lights. Warm reflected shadows remain pale painted planes. No large rectangular chest reserve.
- Human forehead and nose ridge: paper lights with small warm plane transitions. Sclera: pale painted plane, bounded by the reference, not enlarged eye-shaped blanks. Lip light remains source-shaped paper with a very pale local tint nearby.
- White hair gaps and the fur's diagonal white breaks remain negative-painted gaps. Whiskers already white in the target are held by the automatic source lights where resolvable; only a few reference-supported darker whiskers are drawn. No late opaque-white repair is planned.

## Region techniques and resolution

Native cell pitch is 0.19509 mm; one target pixel spans four native cells. A four-cell wash body is 0.780 mm. Source lines about 0.25–0.8 px wide are 1–3.2 cells, so they belong to the nib. The physical sepia nib spans approximately 0.12–0.25 mm under these pressure limits, 0.62–1.28 cells; radius about 0.31–0.64 cells. For these lines, feature/radius is roughly 1.6–10. Broad painted planes are typically 8–100 cells across. Brush radius is fitted to each connected shape by the fixed executor; do not claim one invented radius for the whole sheet. Native execution is 1200 px, even though the supplied reference has only 300 px of source information.

| Region | Reference cue and resolution choice | Ordered moves, state, load and edges |
|---|---|---|
| Cat ears | Thin triangular silhouettes and warm outer rims; interior hair is a line question, ear shadow is a wash question. | Layer 1: watery ochre on dry paper, avoiding pale interiors. Layer 2: medium local colour on fully dry base. Last: selective fine sepia inner hair. Crisp outer tips; broken/lost interior edges. |
| Cat face | Warm striped cheek planes surround white muzzle and pale olive eyes. Stripes 8–30 cells are washes; lid ribbons and fur hairs below four cells are ink. | Layer 1: watery ochre/sienna wash on dry paper. Layer 2: medium strength fitted stripes, avoiding the eyes and muzzle. Dry. Cross-cheek shadow glaze with medium water and dilute pigment. Final controlled thick dark accents at lids/pupil tips. Keep cheek edges broken and eye edges crisp. |
| Cat bib | Large paper-white chest, faint warm-grey chin shadow; wash question, no fur stippling. | Preserve paper first. Layer 1 pale reflected colour only where target has it, watery load on dry paper. Dry. One dilute glaze under chin into upper chest if supported by target. Edge becomes lost toward the central bib. No closing hatch. |
| Cat shoulder | Broad ochre flank with diagonal striped clumps and a dark meeting edge with the person. Wash question; two selected directional lines. | Pale connected dry-paper foundation, medium ochre middle wash, dry, connected sepia/sienna shadow glaze crossing face/neck/shoulder. Medium water 0.45 in the shadow stage, controlled pigment. Sharp dark contact edge; broken stripe ends. |
| Human hair | Charcoal crown, irregular pale gaps and loose curl silhouettes. Masses are washes; only a few curl gestures are ink. | Pale neutral foundation on dry paper, then two restrained dry middle layers. Fully dry before the cool-neutral shadow glaze through curl valleys toward temples. Medium flowing load, no dots, no dry stipple. Selective fine curls after drying, never fill the mass with ink. |
| Human face | Bright forehead and nose ridge, warm sockets and cheeks, dark brows and smiling mouth. Skin planes are washes; lids and mouth join are ink. | Watery earth foundation on dry paper around source-shaped lights. Dry. Two pale middle-value passes for sockets, nose turn and cheek; fully dry. A connected dilute shadow glaze follows temple into cheek and jaw, while the bridge and sclera stay light. Final small dark paint and sepia accents on dry paper. Lower lids stay pale, with no doubled under-eye crease. |

## Drawing and progression

Opening: 22 sparse gestures in fine sepia, establishing both sets of eyes, nose and mouth, cat ear set and a few incomplete silhouettes. Broad washes, not opening linework, will establish volume. All paths are registered to the supplied 300 × 259 reference. Closing: 34 selective accents, including a small set of target-traced focal fragments smoothed along their existing geometry, fitted eyelids/iris fragments, a few whiskers and three curl gestures. No blanket tracing of pigment flecks, no ruled hatching and no random stipple.

Order: reserves → opening ink → pale local-colour foundations → dry → first middle layer → dry → second middle layer → dry → cross-region shadows and small dark accents → dry → selective closing drawing. Pigment passes within a layer are the executor's normal fixed order. No dark-first exception is requested.

Cross-boundary glazes are essential: cat cheek/neck/shoulder; human temple/cheek/jaw; hair valleys into the temple edge. The executor's shadow support ignores family ownership, so these can remain connected. Do not turn each named family into an individually outlined fill.

The executor must observe the footprint and neighbours before each stroke. Dry-paper passages require measured dry support, permitting overlap only within their own connected wet passage. Wait or move elsewhere if the footprint is wrong. Drawing uses the physical dry-pen gate. This plan does not substitute a timer or a claimed measurement for the fixed executor's state checks. No broad wet-in-wet passage is requested because the reference's fine focal edges are the priority.

## Admission and review

Run `bash bench/check.sh` before GPU painting, inspect its value plan for protected lights, coherent shapes and unsupported seams, then start only through `bash bench/paint.sh start`. The task permits no separate physics crop; the first actual foundation passage and its stop serve as the practical technique proof. Judge native detail in the supplied look images; enlarged source images are registration aids only.

Opening checkpoint: recognizable placement of both portraits, sparse light marks and intact eye glints. First wash checkpoint: pale warm and neutral masses with much more paper than paint; do not demand finished darks. Middle checkpoint: ochre cat stripes and neutral hair should connect, face should remain light. Shadow checkpoint: clear eye spacing, cheek/neck turn and curl masses; no lost bib or forehead. Before closing: add only the planned selective accents if paint remains firm enough. Finish: darks concentrated near focal landmarks, crisp and lost edges chosen by form.

Failure tests from the technique guide: value shapes before pixel similarity; every catchlight present; no unsupported straight seams; no uniformly blurry lids, oversized irises or under-eye creases; no scattered fur islands, scratchy curls, parallel bands or all-over tracing; ink does not compensate for blur. Check progression is visibly light-to-dark and final paper share follows the reference. Changes during self-view will be recorded here with their reason before they are applied.

## Execution record

The pre-render option and frozen-target check returned `ok: true`. The allowed local 600 px compile reached `target values: 30 pigment/region passes, 431 connected shapes`, with `band1UnsupportedAxisEdges: []`. Its later preview-board assembly failed because the custom subject name made that preview-only code seek `work/w4/Mittens-region/provenance.json`; the admission-relevant value planning had already passed. This is not a completed physics render.

`bash bench/check.sh` could not acquire its temporary check slot in this session. A direct diagnostic confirmed that creating a new directory under `/tmp` returns `Operation not permitted`; shared slots were also occupied. Both local waiting checks were interrupted. `bash bench/paint.sh start` was submitted, but the harness continued reporting that its admission check was running for over ten minutes. `finish` was refused while that check remained active. At this record's time there is no `ADMITTED` result, no physical opening drawing, and no finished painting. Plan settings have not been revised since submission.
