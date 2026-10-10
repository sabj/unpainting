# White Ships (Sargent) — V4 plan

## Read of the reference

At thumbnail size I read four values: (1) bare warm-white paper and the sail's palest blue, (2) a broad blue-grey sail with lighter turning planes, (3) the turquoise water and middle-blue hull, and (4) the connected deep blue-grey hull shadow with a few warm rigging accents. The large curved sail is the focal shape; the lower hull and the warm crossing rigging give it weight and scale. The smaller right sail and sea stay subordinate.

## Region decisions

The family boxes describe where each target-derived color shape gets its cue; they are not wash boundaries. The planner retains its target-color segmentation. All regions use precise watercolor and no ink override.

- **Main sail:** wash question. Broad pale blue-white plane, then two middle washes on dry paper for its curved cool turns. Keep the upper light and the broken warm/cool edges visible. Use a large, watery first load, then a medium load matched to each plane; a shadow glaze is lower-water and stronger, on fully dry paint.
- **Lower hull:** wash question. One joined blue-grey foundation, two dry-paper middle layers, then the final dark glaze across the hull foot and adjacent reflection. The hull's deepest shape stays blue-black made from watercolor pigments; do not trace it or fill it with ink. Use a medium load for the foundation and middle values, then a more concentrated, controlled glaze on dry paper.
- **Right water:** wash question. Keep the horizon irregular and the turquoise open; leave the narrow light streaks as paper. Lay a pale watery foundation on dry paper, dry, then add medium turquoise planes and the final dark accents on dry paper. Soften selected edges with a clean damp brush on one side only.
- **Upper-right air and secondary sail:** wash question. A thin, watery pale wash on dry paper, merging locally only where the reference loses the sail into the air. Keep the sail/sky light separation broken and quiet; do not draw a rectangular sky field.
- **Left rigging and right mast:** wash question at this scale, not ink-and-wash. The smallest persistent traces are about 1–2 source pixels, or 4–8 native cells after the 300-to-1200 enlargement (about 0.93–1.87 mm on the 280 mm sheet). They are just large enough to read as narrow watercolor shapes; at 540 wide they should become accents rather than linework. Use the per-passage brush choice, a pointed/rigger contact, medium pigment and low water on dry paper. Vary and break the strokes, let a few disappear into the sail or water, and keep the warm marks sparse.

## Order, water and paper state

1. The opening drawing is intentionally empty. The sheet stays dry; no ink or graphite is introduced.
2. Paint the pale light wash first: thin, watery pigment, broad brush contact and long connected movements through the light planes. The pale air and the sail's paper lights remain open. Do not force coverage into paper-white shapes.
3. Let the sheet dry fully. Before every stroke, check the measured paper state over the whole footprint and its neighbors. If the planned move needs dry paper and any part is wet or damp, wait or work elsewhere. The only damp move is clean-water softening along selected water or sail edges, after the adjacent paint is fully dry and at a measured sheen.
4. Build the two middle layers with medium water and a controlled pigment load on dry paper. Keep the sail's cool planes broad and shaped, the hull connected, and the sea's lights broken. Edges are hard but irregular on the sail and hull silhouettes; interiors soften on one chosen turning edge, not all around.
5. Dry fully again. Lay the final low-water, stronger shadow glazes over connected support across the sail foot, hull and reflection, rather than filling family by family. Retain the deep hull shape and a few warm accents without converting them to outlines. No passage should leave a straight boundary unsupported by the target.
6. The closing drawing is intentionally empty. Finish with paint only; there is no pen pass.

The paper-white mask from the target's near-paper lights protects the broad sail lights, pale air, and water glints. I leave explicit rectangular reserves empty because the brightest shapes are ragged, broad and interwoven; the automatic near-paper mask follows them more faithfully. I will keep every later wash away from those protected lights, and tone only any isolated light that proves too stark with a pale local glaze.

## Values, edges and checks

The first checkpoint should read as a pale, continuous marine wash with an intact sail light. The two middle layers should establish the curved sail, right-hand water and connected hull without dividing them into tiles. The last glazes should give the hull its deepest weight while preserving the sail's cool light and a few water glints. Hard edges belong at the sail and hull silhouettes and at selected rigging contacts; soft edges belong inside the turning sail and across the water; a few distant edges may be lost.

Failure signs are a flat pale oval instead of a bowed sail, a solid black hull, a rectangular seam or parallel band, turquoise water filled to one value, pale unpainted holes inside the intended planes, or warm rigging that is either erased or repeated as uniform linework. At each look I will compare value shapes and landmarks first, then check protected lights and edge variety. If a broad layer visibly breaks the sail or water into patches, I will revise only the unpainted passages and preserve the already-dry paper state.

## Recipe

`region_w15` selects brushes per passage so narrow rigging can use a small watercolor brush; `_lay2` reduces the base recipe's four middle layers to two broad middle washes; `_ink2` routes the closing drawing to an explicitly empty file; `_noslane` removes generated sky lanes that would stripe the quiet air and sail. After the pass-77 look, I reduced the dark gain from 1.3 to 1.1 for the remaining deepest band: the hull shadow was established, while the sail's shadow side was already heavier than the reference. The chosen palette is French ultramarine, cerulean, phthalo green, yellow ochre, raw sienna, burnt sienna and Payne's grey, giving the cool sail and water, warm rigging and deep mixed hull shadows without using ink.
