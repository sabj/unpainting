# White Ships (Sargent), V5 try 1

## Read of the reference

This is a loose, full-frame watercolor on warm paper. The main shape is a large cool blue-grey hull that bends down through the centre. Pale sail and paper shapes sit behind it; a cropped darker boat and warm spars overlap at the left. Turquoise water opens at the lower right. Edges vary from soft and lost in the pale shapes and water to firmer pigment boundaries at hull overlaps. There is no open-sky gradient and no need for drawn linework.

Thumbnail values, from light to dark:

1. Warm paper and bare-paper glints (highest value).
2. Pale sail and hull sheen washes (light).
3. Blue-grey hull and turquoise water (middle).
4. Cool overlap shadows and the underside of the hull (dark).
5. A few blue-violet/umber contact accents at the left overlap and hull junctions (deepest).

The focal point is the curved hull and the small dark/ochre rigging intersection just left of centre. Preserve the broad blue hull plane and let its curve carry the composition; do not turn its surface marks into repeated strokes.

## Style and process

Use `precise-watercolor` for all families. The requested medium is pure watercolor, so `--drawing none` disables both the opening and closing drawing stages. Both line files are intentionally empty and declare `medium: none`. The ship silhouettes, ropes, and spars must come from the value shapes and small paint accents; no ink or pencil will be used.

The working palette is French ultramarine and cerulean for the cool hull and water, plus yellow ochre and burnt sienna for muted turquoise and the warm spars. Mix blue-violet shadows from the cool pigments; keep the warm notes sparse. The target's lightest cream is the sheet colour (`paperbase source`), not a white replacement.

V096 already has four middle layers and sky-related splitting/lanes. For this first learning try, `_lay2` replaces four mid layers with two, because this image has a few broad planes and should retain open paper rather than accumulate corrective bands. `_hue` keeps the base layer-hue handling but removes the sky-specific split, and `_noslane` removes horizontal sky lanes because there is no open sky and the water is irregular. Keep the base dark gain: the lower hull and left overlap need a real dark anchor. These choices change only future paint stages; the empty drawing applies from the start.

After the first wash, the water reserve read as a rectangular white patch at sheet scale. Before painting more, all three reserve boxes were reduced to about 6 by 4 source pixels, so they read as glints rather than cutouts. The first wash remains unchanged.

## Regions and techniques

The opening checkpoint should remain unmarked: no linework is permitted. Before each stroke, the executor checks measured moisture over the full stroke footprint and its neighbours. It waits or works elsewhere if the paper state does not match the move below; it does not infer or substitute a moisture reading.

| Region | Reference cue and resolution | Order, move, moisture, and load | Edge and value intent |
|---|---|---|---|
| Main hull (`sargent.main-hull`) | One broad curved blue-grey value plane. Wash question: the smallest form is a plane edge, not hull texture. At 1200 px, a source detail pixel spans about 4 output cells; the smallest rope/knot shapes are roughly 4–8 cells. Fine hairlines are below a watercolor brush's reliable body, so simplify them into broken paint accents. | First, a pale, watery wash wet-on-dry on the initially dry sheet to connect the hull body; avoid flooding the reserved sheen. After a full dry, two medium-load wet-on-dry middle passes state the curved side plane and the deeper lower turn. After another full dry, lay the shadow glaze with a controlled medium load. Finish with a few thick, short paint accents on dry paper. | Keep the outer hull edge irregular and mostly firm, soften only the turning edge. Preserve paper flecks in the sheen. Values progress light → blue-grey middle → cool dark underside; no ink outline.
| Pale sail and open paper (`sargent.pale-sail`) | Broad near-paper shapes against the vessel. Wash question: pale planes read by their value edge; their smallest internal flecks are not individually rendered. | Leave the brightest paper untouched. Lay a very watery pale blue/ochre wash wet-on-dry over the larger sail planes, with one selected edge softened using clean water while still evenly damp. Let it dry before any later shadow touches. | Keep most of the region at paper or pale-wash value. Lost edges against the sheet are intentional; no rectangular reserve may become a visible cutout.
| Left overlap and warm spars (`sargent.left-overlap`) | Cropped dark boat, crossing ochre spars, and a compact focal knot. Resolution decision: wash for the hull mass; the thinnest rigging is only 4–8 output cells wide and is simplified to interrupted paint marks, not ink lines or stipple. | Pale underwash first, wet-on-dry; dry fully. Build one middle-value connected shadow group, then glaze the left overlap after dry. Put the deepest cool/umber marks last on dry paper with a small controlled load. Warm ochre and sienna notes stay separate and sparse. | Keep the darks clustered at actual overlaps. The spars may be broken and tapered; no long ruler-straight stroke or uniformly repeated marks.
| Lower-right water (`sargent.water`) | Soft turquoise area with broken reflections. Wash question for the field; dry-brush question for the few surface glints, which are below the scale for individual ripples. | Lay one pale turquoise first wash wet-on-wet on uniformly glossy-wet paper; check the complete region and the adjacent hull edge before every charge. Let it dry fully. Place a small number of medium-load reflection shapes wet-on-dry; lift only a narrow streak while the passage is still glossy if it is needed to restore a reference glint. Glaze the deeper water only after a full dry. | Soft, varied transitions in the field, with a few crisp broken lights. No horizontal lanes, tiled patches, or detail spilling across the dry hull boundary.

## Protected lights and glazes

- The three small `config.json` reserves are bare paper: each is about 6 by 4 target pixels, for the blue hull sheen fleck, a sail-edge glint, and a lower-right water reflection. They stay out of every wash.
- The broad pale sail shapes and the overall warm sheet are pale painted planes / near-paper lights, not large rectangular masks. Preserve the painter's own near-paper target lights as well.
- There are no eyes or catchlights in this reference.
- After the middle planes have dried, one cool shadow glaze should cross the central hull into its lower overlap and the left foreground vessel where those shadows connect. A second, lighter blue-green glaze can cross the lower hull/water boundary only where the reference has a shared reflected shadow. Both are wet-on-dry on fully dry paint, with a medium/watery load sized to the visible value gap. Do not paint separate boxed shadows per family.

## Checkpoints and failure signs

- Opening: clean warm sheet, no linework.
- Light wash: paper still dominant, pale sail planes and hull/water underwashes present, reserved glints intact.
- Middle passes: recognizable curved hull and overlapping left boat; water stays distinct but connected; warm spars remain sparse.
- Shadow pass: connected depth across the vessel overlaps, not a dark contour around every shape.
- Final accents: a few compact dark pigment marks at the left crossing and lower hull junction; broad wash texture remains visible.

The plan fails if the blue masses become horizontal stripes, if the sail or water is filled into a flat block, if the light reserves look like rectangular holes, if the water turns into tiled patches, if the hull loses its curved value plane, if blue and ochre shadows go muddy, or if dark details become a drawn outline. Judge each stop against that stage's intent, then compare thumbnail value shapes, protected lights, edge roles, landmarks, mark character, and light-to-dark progression. Revise only unpainted stages when one of those visible checks fails.

## Try 1 critique for the next round

The final comparison keeps the main curved hull, pale sail shapes, left overlap, and lower-right water in the right places. The no-ink choice worked: the opening and closing stages made zero pen lines, and the dark knots and hull contacts are still carried by paint. The progression from a bare opening through broad pale washes to darker overlaps was clear in the progress frames.

The finished sheet is more fragmented and grey than the reference. Many small value islands keep sharp, separate edges instead of joining into softer blue and turquoise passages; the blue hull could carry more chroma. The lower-right reserved glint still reads as a small square. The auto touch-up stage expanded the planned 44 passes to 55 and the run ended with 7,422 brush strokes, so it produced more separate marks than the loose reference needs.

For try 2, keep pure watercolor and no line layer. Make the pale blue/turquoise passages more connected, reserve only a much smaller irregular reflection or let the water glint be a pale painted plane, and judge the mid stage for joined value shapes before adding more texture. Preserve the hull's broad curve and its deep lower contact; reduce isolated shape edges and late corrective marks.
