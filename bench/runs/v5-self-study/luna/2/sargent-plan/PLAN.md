# White Ships (Sargent), V5 try 2

## Read of the reference and value thumbnail

The crop is a loose watercolor on warm paper. A large blue-grey sail/hull turns down through the centre and anchors the picture in a deep lower contact. Pale sail shapes remain open at the upper right. A darker cropped vessel and a few ochre spars cross at the left; a turquoise water band is visible at the right. The target's edges alternate between lost pale contours, soft turns in the water, and firmer overlaps. There is no ink.

Four values, light to dark:

1. Warm sheet and near-paper sail shapes; these are mostly untouched paper, with only pale painted planes where the target is visibly tinted.
2. Pale cerulean and turquoise foundations across the large sail/hull and water.
3. Mid-value blue-grey hull planes, muted turquoise, and the warm left overlap.
4. A connected cool lower-hull shadow, a compact dark vessel overlap, and a few deepest blue-violet/umber contacts.

The focal point is the curved central hull and the small warm/dark rigging junction left of centre. The hull curve and the pale sail openings should read before the small marks.

## What changed from try 1

- I keep pure watercolor and no drawing layer. Both line files are empty with `medium: none`, and `--drawing none` remains explicit.
- I switch to W15 passage-specific brushes. Broad connected planes can receive wide brushes and long fitted sweeps; smaller paint shapes receive smaller rounds. This addresses the previous many-small-marks texture and the target's sparse, fine rigging.
- I keep two dry middle layers and raise `minshapecells` from 300 to 500 after the first look showed fragmented grey-blue islands. The native 1200 px sheet has 0.233 mm cells; a 1–2 source-pixel rope is about 4–8 sheet cells wide. W15 should choose a 1.2–3 mm small brush (radius about 2.6–6.4 cells) for the narrowest fitted marks, giving feature-to-radius ratios of about 0.6–3.1. Finer marks are simplified to a few broken tapered accents rather than individually resolved hairlines.
- Try 1 ended with thousands of late corrective strokes that increased fragmentation, so I initially set `touchpoints` to zero (`tp0`). The completed pass sequence exposed the painter's option audit: this token also emits `--touchgain`, which the renderer does not read when touch-up rounds are zero. For this clean start, one correction round uses gain 0.1. It limits the correction's weight while allowing any broad shape deficit found at the finish to be glazed.
- I remove all explicit rectangular reserves. No isolated glint outweighs the risk of a geometric hole; automatic near-paper target lights stay protected, while broad pale sail shapes remain pale planes.
- After the second look showed fragmented cool planes, I raise cool gain from 1.45 to 1.6 and retain ultramarine, cerulean, ochre and sienna. This should keep the blue hull and turquoise water more chromatic while leaving the warm notes limited to their actual spars and overlaps.
- The first light wash covered roughly 83% of the sheet. I raise `paperdelta` to 30 to leave more of the warm sheet visible around the pale sails and reduce the over-washed field.
- I disable the base recipe's extra granulating sky-blue tube: the target has no sky, and the compile preview assigned that tube to 33.9% of blue cells anyway. One ultramarine/cerulean family should keep the hull wash more unified; cold-press paper supplies the needed texture.
- The previous judges called the progress frames a static low-opacity image. I partly disagree with that description: the provided 10/25/50/75% frames do change, with new darks and edges appearing. But the 10% frame already contains too many scattered pieces of the whole scene, so I accept the underlying process criticism and will judge the early value grouping closely. I agree with the critique on grey, fragmented planes, the square water reserve and excessive late touch-ups.

## Region plan and paper-state choices

Every passage checks measured moisture over its full stroke footprint and neighboring paper before contact. If the state is wrong, the executor waits or works elsewhere; it does not substitute an assumed reading. Water and pigment load are chosen separately. The openings are blank, so the first look should show only warm paper.

| Region | Reference cue and resolution | Order, move, moisture, and load | Edge and value intent |
|---|---|---|---|
| Central sail/hull | One large curved cool plane, not surface texture. Wash question. The smallest useful hull feature is its turning edge; W15's broad brush radius should stay smaller than the plane's width. | First, a pale watery cerulean/ultramarine wash, wet on dry over the initially dry sheet, in long connected sweeps. Dry fully. Lay two medium-load wet-on-dry middle planes on dry paper, letting the lighter plane establish the curve before the darker lower turn. Dry fully. Finish the shadow side with a controlled medium glaze on dry paint. | Preserve the broad curve and the light sheen. Keep one firm outer edge where the boat cuts across the pale shapes, soften a selected turning edge with clean water on one side only, and leave the remaining silhouette broken. Values progress pale blue → blue-grey → deep lower contact. No repeated flecks or outline. |
| Pale sail and open paper | Large near-paper shapes behind the vessel. Wash question: planes are carried by their edges, with no need for individual pale flecks. | Leave the warmest paper and inferred near-paper lights untouched. Where the target's sail has a blue/ochre tint, lay one very watery wet-on-dry wash with a broad brush, then dry. Do not rewet or glaze the whole light shape. | Lose parts of the contour against the sheet; keep only target-supported firmer overlap edges. A pale plane should stay open, not become a white cutout or a flat filled block. |
| Left vessel and ochre spars | A dark cropped mass crossed by warm rigging at a small focal junction. The hull mass is a wash; the 4–8-cell rigging width at 1200 px is near the minimum watercolor body and needs smaller, fitted paint strokes. | Lay a pale cool underwash wet on dry, then dry fully. Build one connected medium shadow group wet on dry. After it dries, add the shared cool shadow glaze across the left overlap and central lower hull where the target connects them. On fully dry paper, place a few medium/thick-load ochre or sienna accents with W15's small round/rigger choice; vary length, pressure and taper. | Keep the brown/orange spars distinct from the blue hull, with gaps and broken ends. Concentrate the deepest paint at real crossings. No drawn line, hatch, or continuous dark contour. |
| Right-side water | A soft, irregular turquoise band, not a set of horizontal strips. Wash question for the field; dry-brush is reserved for only a few broken surface glints if the target supports them. | The family is wet on wet for the light passage: prewet evenly to measured sheen, then lay the pale turquoise foundation as connected strokes into that sheen with a watery load. Check the entire field and hull neighbor before each stroke. Let it dry completely. Add a few medium-load mid-value reflections wet on dry; after another full dry, add at most one restrained cool glaze where the water turns darker. | Keep a soft transition within the water and a clear boundary against the dry hull. Vary edge softness; do not tile patches or add repeated ripple marks. There is no explicit paper reserve in the water; retain target lights as pale paint or inferred paper. |

## Cross-region glaze and finish

After the middle layers dry, one connected cool shadow glaze crosses the lower central hull and the left vessel only where the target shows a shared overlap. It is wet on dry, medium watery and medium pigment load. The executor checks the whole glaze footprint and its neighbors; the target-supported outer contour stays irregular. Dry fully before the last accents. Finish with a few compact, thick-load paint touches at the dark junctions and lower hull contact, leaving the reserved paper and pale planes alone. No closing ink.

## Checkpoint intents and failure signs

- Opening: clean warm sheet; no marks.
- First light wash: large pale central plane and pale water field appear as connected washes; the sheet remains mostly light, the pale sail remains open, and no small dark details have arrived early.
- Middle: the hull's curved plane and the left overlap read as broad masses; the water is distinct turquoise; warm spars stay sparse. Reject a stage where small islands dominate the plane or the cool regions have become grey.
- Shadow glaze: connected depth across the hull turn and overlap, not separate dark borders around every shape. Reject any hard rectangular reserve, parallel strip, or abrupt boxed boundary.
- Finish: a few dark contacts improve the focal junction and hull base without adding a field of corrective marks. Judge thumbnail values, light placement, edge roles, the hull curve, the spar crossings, and the clarity of blue/turquoise versus ochre.
