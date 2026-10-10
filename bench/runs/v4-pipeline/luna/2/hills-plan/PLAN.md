# Hills, round V4 try 2 — loose ink and wash

## Read of the plate

The four-value thumbnail is: (1) pale warm paths and small sunlit flecks; (2) bright yellow-green slopes; (3) olive slopes and blue-green tree crowns; (4) the small blue-black/sepia branch valleys. The winding path through the middle is the focal route. Its light is a pale painted plane, not bare white paper; keep it readable by leaving its center light and do not ink both edges. The ridge glints are pale target lights, held by the painter's near-paper light handling. `reserves` is empty because rectangular reserve edges would cut across these narrow, turning lights.

## Region choices and order

The config leaves the target-derived color/value shapes unlabelled and applies one global `ink-and-wash` style. This avoids artificial rectangular region boundaries; the written regions below follow the plate's actual shapes.

- **Tree crowns and woodland at the top, left, right, and lower edge:** wash question for the canopy masses; loose mixed blue-green/olive wash, wet on dry on a fully dry sheet with a broad belly contact, medium watery load (style water .55). Let adjacent touches join only within each irregular crown. Dry fully. Add two broad mid-value builds on dry paper (the `_lay2` choice) and one final connected shadow glaze across the dark sides at the tree/ground turns, water .40. The darkest foliage remains painted pigment, not an ink fill. Edges stay broken and leafy; do not make a continuous outline. Finest twigs are below the wash's reliable body width, so use ink and wash for only a few branch forks.
- **Sunlit hill faces and green clearings:** wash question, one light transparent yellow-ochre/hansa/sap-green foundation with the target's luminous areas left pale. Dry. Two mid-value layers on dry paper define the slope planes; choose a crisp edge at the path and ridge where the target is crisp, and a selected softened edge where a slope turns into trees. Finish with a single shadow glaze that crosses slope and woodland values where their shadow shapes connect, fully dry before it lands. Middle distance stays a value plane; no individual grass blades.
- **Winding pale paths:** pale painted plane in the first light passage, then kept out of the dark glaze. No line border. Use the target's warm ochre/raw-sienna family sparingly; do not convert the path into bare paper or a white stripe. Leave small irregular warm and cool edges visible so the path keeps its meander.
- **Closing marks:** after the washes are fully dry, add only a few sepia branch/twig accents where the target has hard dark lines. The opening drawing is eight light, connected fork gestures inside the woodland masses; it does not trace leaf texture or hill contours. The closing file contains seven long hard-dark target-supported traces. Ink is sepia, with opening pressure .28 and closing pressure capped at .40; the base recipe's width gain is reduced to 1 so the marks stay near the source's fine branch scale.

The executor should measure paper state over each mark's footprint and neighbours before contact. Opening ink starts on dry paper. Washes run at their planned state; the painter dries between value passes, and mid/shadow work begins only when the footprint is dry. If a footprint is merely damp when a crisp tree edge, branch or path edge is due, wait or work elsewhere. Use the measured state, not a timer.

## Resolution and mark scale

The sheet is 158.0479 mm across at 1224 px: 0.1291 mm per native output cell. A 1–2 px feature in this 306 px target is about 4–8 output cells (0.52–1.03 mm). The physical floor brush is a 3 mm round (#4), radius 1.5 mm = 11.6 cells; the largest wash mop is 38 mm wide, radius 19 mm = 147 cells before the path is contained by its fitted mask. The smallest branch feature is therefore only 0.34–0.69 floor-brush radii across, so it belongs to the pen; individual leaf edges and grass blades also stay out of the wash. The 1.5 px source-line widths correspond to about 6 output cells before the physical pen profile. `W13` selects the value-plan version, not a brush size; brush choice remains with the physical wash path (`--brushchoice 0`). The compiled support width must remain at least four cells for a wash plane, and actual local path radii are measured by the executor; reject a pass if a contained brush swallows a path or turns a crown into a soft blob.

## Technique and recipe choice

`region_w13_lay2_noslane` replaces the base four middle layers with two and removes the template's horizontal sky lanes, since this crop contains no sky and its cool masses are trees. The compile preview also showed that the base's extra granulating sky-blue tube would cover 23.7% of the cool tree area, so `--skyblue 0` leaves those shadows to the ordinary ultramarine/cerulean/sepia mix. Two layers keep the hillside's value progression readable without stacking a fine band on every small color fluctuation. The base deep-value and sepia-ink choices stay because the plate has true dark canopy valleys and uses warm dark lines. The palette is constrained to ochre, hansa, raw sienna, sap green, ultramarine, cerulean, and sepia so the lit slopes stay yellow-green and the woodland can mix to blue-green/olive darks. No wet-in-wet break is requested: the target's foliage and hill edges are compact and broken, so dry-paper placement gives better control at this crop scale.

## What would show a failure

At thumbnail size the path should remain the light route through connected green slopes, framed by dark but varied woodland. Fail if the path disappears, becomes outlined, or is cut into patches; if the slopes become a flat yellow sheet; if the trees become a uniform blue-black mass; if the ink becomes a heavy net; or if soft spread removes the broken crown edges. Judge values, lights, edge roles, landmarks, and mark character in that order, not pixel error.

## Revision note

This is the initial V4 try-2 plan. Before the first admission check, I added `_noslane` after noticing the template's sky-lane setting could stripe a cool tree mass. The admitted preview then showed the base sky-blue tube affecting a large cool woodland area, so I disabled that tube while keeping ordinary ultramarine. The choices are two rather than four middle layers, no horizontal sky lanes, and no sky-only paint effect, chosen for a crop without sky.
