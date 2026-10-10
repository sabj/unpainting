# Plan: Hills (aerial oak hills, loose ink and wash), V5 try 1

Technique reference read before planning: `.claude/skills/watercolor-technique/SKILL.md` (layering model, foliage, grass, ink and graphite, plan check).

## Reading the reference
- Aerial view of rolling hills: bright yellow-green grass slopes cut by two winding pale-peach dirt tracks, with dark blue-green oak canopies packed in the folds and a few single oaks casting small shadows on the grass.
- Value thumbnail (5 values): (1) near-paper: the tracks and the small white flecks along track and canopy edges; (2) light: sunlit grass, brightest in the lower-right meadow and the top-right slope; (3) mid: olive-grey crowns, shaded grass; (4) dark: blue-green canopy masses; (5) darkest: indigo crowns in the centre-right and lower-left, trunk shadows. About 5% of pixels are near black, 65% sit between 32 and 160.
- Focal point: the big olive oak beside the track bend (left of centre) and the meadow below it; the diagonal lit grass bands and the S-curve of the tracks lead the eye through the dark masses.
- Palette: left to the painter's own pick (hansa yellow, cerulean, quinacridone rose, sap green plus sepia ink: 1.9 dE whole-sheet error in the planning step). Darks come from cerulean + rose + sap green mixes, not from black.

## Regions, technique, order
Resolution decision: a crown leaf clump is 1 to 3 target pixels (0.5 to 1.5 mm, 4 to 12 cells at 1224 px), so the canopies are an **ink-and-wash question**: connected mixed-dark value masses first, structure and edge accents in pen. Grass is a **wash question** (the mottling is below one brush mark): one connected wash with a shadow glaze, no dry-brush texture over the middle distance. Tracks are **reserved/near-paper plane** with crisp edges.

1. **Opening drawing (before any wash), sparse and long, pressure 0.45:** both edges of the two main tracks and the short top track, the upper and lower boundary of the grass wedge, the meadow's top edge and the forest block that closes it on the right, the top-right track and diagonal band edge, the lower-left meadow edge, a scalloped contour of the big oak's crown top, its trunk, and the lone oak's crown. 16 lines, hand-authored in target pixels from the reference, loose and slightly off the edge on purpose (wobble 0.5 to 1 px) so the paint can overrun them.
2. **Light foundation (band 1), wet on dry, big brush, watery:** one pale connected local-colour wash over grass, canopy and track surrounds; paper whites (tracks, edge flecks) stay out of every wash. The painter keeps near-paper target lights itself; no rectangle reserves, because a rectangle on a curved track makes an unsupported straight seam.
3. **Dry (paper state checked before each pass), then mid planes (band 2), wet on dry:** the sunlit grass in `precise-watercolor` (family labels HILLS.grass-*): shaped planes with a crisp edge where it meets the canopy, one soft edge where the slope turns. Olive-grey crowns and the oak at medium load.
4. **Dry, then dark canopy masses (band 3 and 4), wet on dry, medium-thick load:** `ink-and-wash` for HILLS.forest-* and HILLS.oak. Mixed blue-green darks, lighter on the lit upper-left side of each crown; two mid layers (`_lay3`) so the lit olive crowns survive between the dark ones. Shadow glazes cross region boundaries (tree shadows run on to the grass).
5. **Dry, then closing ink (last), selective:** dark broken dashes along the track edges (the reference has them), trunks and branches of the big oak and the lone oaks, scalloped partial contours on the lower-right (shadow) side of about 15 crowns. None on grass, none as fills, none on the lights.

## Moisture, load, edges
- Washes on dry paper; light washes watery, dark masses medium to thick. Never paint into an open wash near the tracks, so the track edges stay crisp.
- Edges: hard where grass meets canopy and along the tracks, lost in the interior of the dark masses; scalloped (leafy) pen edges, not ruled lines.
- Wet-in-wet is not used anywhere: no soft transition in this reference (even the dark masses have crisp white flecks along their edges).

## Protected lights
Tracks (near-paper), white flecks along the track edges and the grass/canopy boundary, the brightest meadow plane. All bare paper until the mid pass; the tracks get at most the palest warm tint.

## Values and settings
- Base V096 recipe unchanged except `_lay3` (three mid layers instead of four) to keep it loose and give a person-like progression with fewer passes (27 planned passes). Darkgain stays at the base 1.3 because the reference has real indigo darks.
- `extra-args.json`: `--openingpressure 0.45` so the opening ink reads as confident pen (the default 0.3 is pencil-faint); everything else from the base.
- Style: `ink-and-wash` overall with `precise-watercolor` for the grass and track families. The painter assigns its own colour/value segmentation (6 regions here) to the family whose bounds overlap it most, so the families only label those regions; I kept the family boxes tight to the grass, track and canopy zones.

## What would show failure
- Track edges soaked by the green wash (soft, no peach), or tracks tinted dark.
- Grass scratchy or patchy (dry brush where the plan says wash); blotchy pale islands in the meadow.
- Canopies flat grey-green with no indigo, or ink black filling a crown instead of a pen edge.
- Pen lines far off the painted edges, or ruled/regular marks; heavy ink over blurred paint.
- Straight seams where one family style meets another.

## V5: what I changed and why (try 1 of 3, no feedback yet)
First try, so this is the baseline: the champion recipe plus the minimum of changes (`_lay3`, opening pressure) and hand-authored sparse pen lines (the tracer finds no thin dark lines in a 306 px aerial image, so a traced set would be empty). The painting is reviewed pass by pass; changes made at stops are logged below.

### Revisions during painting
(none yet)
