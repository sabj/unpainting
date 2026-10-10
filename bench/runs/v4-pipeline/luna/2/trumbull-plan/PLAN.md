# Trumbull — V4 try 2 of 3

## Read of the reference

The crop is a compact architectural view on warm paper: a large sunlit golden-stone gable and tower sit in front of cooler side wings; blue sky breaks around their rooflines; dark window recesses and eaves provide the deepest values. Green tree masses and street details occupy only the lower edge. The focal landmark is the central gable with its paired arched windows and the tower beside it.

Thumbnail values, light to dark:

1. Paper lights: small cloud breaks, the brightest limestone edges and the narrow sunlit reveals. Keep target near-paper lights; do not turn all pale stone into blank paper.
2. Light wash: open blue sky and broad warm wall planes.
3. Middle values: roof slopes, stone courses, turning facade planes and the cooler side wings.
4. Shadows: connected under-eave and arch shadows, tree shadow groups and the violet-blue ground turn.
5. Accents: window glass, the deepest arch recesses, signal hardware and a few structural junctions.

## Style and resolution

Use `precise-watercolor` throughout. The target asks for architectural planes with sharp openings and a restrained sepia drawing layer. No region style override is needed. The painter's cell size is 280/1200 = 0.233 mm. A one-pixel target mullion is about four output cells (0.93 mm), so window bars, roof junctions and signal poles are ink-and-wash details; I will not ask a watercolor brush to carry a one-pixel line. The pen profile's 0.12–0.45 mm stroke width gives a 0.26–0.96 cell radius, or about 4–15 times narrower than a four-cell mullion. The main wall planes span tens to hundreds of cells and remain wash questions. Small stone joints are texture, not separate drawn outlines.

## Region plan

| Region and cue | Technique, order, paper and load | Edges, lights and resolution |
|---|---|---|
| Open sky around the roof silhouettes; soft, cool blue variation | First light passage, wet-in-wet on an evenly measured sheen; watery load, with the planned atmospheric charge at the profile's 0.88 water setting. Keep the wet footprint inside the sky shapes. Let it dry before other values. | One connected passage where the target sky connects, ending naturally at the irregular roof silhouette. Cloud flecks stay as the painter's near-paper lights. Sky mottling is a wash question, not horizontal lanes; the smallest visible cloud patches are about 8–20 cells and merge into the broad wash. |
| Main gable, tower and pale front facade; warm lit limestone | Broad pale wash wet-on-dry, watery (0.62 water) with the fitted local pigment mixture; dry fully. Lay middle planes on dry paper in the four-step V096 ladder, watery to medium at the same controlled fitted delivery. Warm-stone band-3 texture is a low-water 0.22 dry-brush passage on dry paper: connected broken contact, never scattered dots. The existing irregular stone-block hints remain subordinate to the large wall planes. | Keep sunlit fronts broad and pale. Use crisp but tooth-broken edges at rooflines, openings and plane changes; soften only the turning edge. Large plane bodies are at least 80 cells across; a broad brush radius around 20–60 cells leaves a support-to-radius ratio above 1.3 for the main planes. Course joints under about eight cells are wash/texture; only clearly supported structural lines get ink. |
| Left and right wings, roof slopes and connector | Wet-on-dry pale base, then dry mid-value roof and side planes. One later connected shadow glaze crosses their walls, eaves and openings rather than filling each box separately. Medium, target-fitted pigment; the dry shadow glaze uses 0.45 water. | Crisp on the receding roof and window edges, slightly softened along a lit-to-shadow turn. The target's individual roof tiles and stone flecks are too small for separate brush marks; preserve their grouping and let fitted paint texture suggest them. |
| Arches, windows, doors and deep eaves | Paint the recesses last on dry local colors. The V096 recess treatment builds two dried dark layers, with its fitted target mixture; do not ink-fill the glass. Final paint accents are dark, with the base palette's blue and raw-sienna shadow mixture. | Sharp, irregular arch interiors and window rectangles; keep the warm stone arch rims distinct. At native density a narrow bar is around four cells and a pen radius is 0.26–0.96 cells, so the line detail belongs to the dry sepia pen. No wet passage may spill into the mullions. |
| Right tree and lower-left greenery | One irregular green mass per connected clump, wet-on-dry for the light value; dry before connected shadow groups. Medium fitted green/ochre pigment, then a restrained dry shadow glaze. | Broken canopy edges against stone, a few naturally occurring light gaps and no equal circular dabs. Individual leaves are below the wash scale; group them as value shapes. |
| Curb, street and small signal details | A narrow pale ground wash, fully dry, then one cool violet-blue ground glaze across the lower plane (the base ground-glaze setting). Keep cars, poles and signal heads as small target-fitted dark accents. | Lower-edge marks remain sparse. Pole and signal geometry is ink-and-wash at four to eight cells; no invented hatch or long ground contour. |

## Drawing and protected lights

The opening drawing uses 63 target-supported sepia line spans selected at high contrast and at least 18 target pixels long. It establishes the gable and roof junctions, towers, window groups, arch rims and other major structure before paint. The closing drawing uses 219 shorter, target-supported spans for the small mullions and junctions that remain visible on the dry sheet. Both are traced from the supplied 300 × 263 crop; they add no unsupported geometry. The base `_ink4` route reads `closing-lines.json` as its closing set because no separate `closingink4-lines.json` is supplied. Ink is neutral sepia, with restrained opening pressure and a selective dry closing line. Dark glass remains paint.

No rectangular reserve is added: its straight boundary could cut an unsupported seam across a facade. The planner already holds near-paper target lights. The brightest cloud chips and limestone glints stay bare paper; adjacent cream stone remains a pale painted plane. There are no eye or other focal catchlights in this subject.

## Glazes and passage checks

- The open sky is the only planned wet-in-wet break. The reference has soft blue variegation; the roof silhouette separates it from all architectural detail. Before each sky stroke, verify measured sheen across its footprint and neighbors. If sheen has gone, wait or rewet the connected sky area; never continue a wet stroke over the dry roof or windows.
- Let the broad light wash dry, then put the middle planes on dry paper. Check the full footprint and neighboring paper before every mark. If the state is glossy or merely damp where a crisp facade edge is needed, wait for dry paper.
- After the middle planes dry, use one coherent warm/cool shadow glaze across each connected shadow side, carrying it through wall, eave and window boundaries. The ground glaze crosses the narrow lower plane. Let each glaze dry before another dark layer; do not tile separate facade patches.
- Opening stage intent: a legible, light structural sketch without a dense traced outline. First wash intent: mostly paper and pale sky/stone masses. Middle-stage intent: the gable, tower, roofs and receding wings read through value planes. Shadow-stage intent: depth under eaves and in windows, with sunlit faces still bright. Closing-stage intent: restored small architecture only, not a new dark outline around every stone.

## Variant and failure signs

The V096 base recipe remains in force. I add `_noslane` because the target sky is a broad, softly varied wash and straight, evenly spaced lanes would read as printer streaks. I keep its four middle layers, warm stone hints, recess build, cold-press paper and green palette because they fit this crop's clear light, rough limestone and deep window grid.

Stop at the first visible failure: sky bands or a dark rim at the roof; disconnected or speckled first facade wash; a hard rectangular family seam; stone texture becoming uniform dots; glazing that dulls the broad lit face; blurred or merged arched windows; or ink so heavy that it outlines every masonry block. Judge the thumbnail value shapes, pale lights, roofline, gable arches, window grid and edge character before adding any further mark.
