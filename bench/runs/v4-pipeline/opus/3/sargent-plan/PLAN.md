# Plan: White Ships (Sargent), V4 try 3, pure watercolour, no ink

## Reading the reference (value thumbnail)

- Paper is cream (max luminance ~232), not white. Lights are measured relative to it.
- Five values: (1) cream paper air right of the bow and top right; (2) pale blue-violet hull and pale blue air at left;
  (3) mid: cobalt right edge of the hull, teal sea, orange pole, orange masts, ochre anchor, blue diagonal rigging;
  (4) mid-dark: grey-blue rigging masses at the top, blue hull of the near boat at left; (5) darks: navy and umber
  shadow at the waterline under the bow, the hawse hole, the two pulley blocks.
- Focal point: the bow just under the hawse hole, where the orange rivet line turns across the pale hull and meets
  the cobalt right edge.

## Style balance

- One style everywhere, precise-watercolor: Sargent states the bow, poles, rigging and anchor as wet-on-dry shapes with
  hard, irregular edges, darks laid in paint, structure from reserved paper. No ink anywhere. No region override (see
  "What changed" below).
- Ink: none. `closing-lines.json` is empty with medium none, so the base `_ink4` closing pass draws nothing (no
  `closingink4-lines.json`). The opening drawing is pencil (`--outlinemedium graphite`), not sepia ink.
- Palette (`--paints`), Sargent's limited palette: ultramarine, cerulean, burnt sienna, yellow ochre. The target's
  colours are muted: sea (153,178,164) and (169,176,139), hull (171,173,164) lit and (138,155,163) shaded, waterline
  dark (69,80,82), pulley (103,94,82), rust pole (168,134,95). Hull: ultramarine and cerulean greyed with sienna.
  Sea: cerulean with ochre (greyed greens, no phthalo). Rust: sienna with ochre. Darks: ultramarine with sienna, not
  black or umber.

## Regions, technique and order

| region | cue | question | move, paper, load | edges | layer |
|---|---|---|---|---|---|
| bow | pale blue-violet hull, lit left plane with paper streaks | wash | pale wash wet on dry, watery, one connected passage | soft inside, hard silhouette | 1 |
| bow right edge | cobalt band along the right side | wash | mid glaze on dry paper, medium | hard on the outside, softened inward | 2 to 3 |
| rivet line, hawse hole | orange dots, dark hole | wash (dots ~2 to 3 mm, 9 to 13 cells at 0.233 mm/cell) | dry on dry, thick, small round | crisp | 3 to 4 |
| background air | cream with blue rigging strokes | wash | wet on dry around the kept paper lights, watery | crisp rigging, paper left | 1 to 2 |
| pulleys, top rigging | dark grey-blue blocks | wash | mid then dark on dry, medium to thick | hard, irregular | 3 to 4 |
| sea | teal under a crisp horizon | wash | wet on dry, medium, broken lights kept | hard horizon | 2 |
| left ships | pale blue air, orange masts, blue hull | wash | pale wash then mid shapes on dry | hard masts | 1 to 3 |
| foreground | ochre anchor, navy shadow at the waterline | wash | ochre pale first, dry, shadow glaze last | hard top edge of the shadow | 1, then 4 |

Smallest features: rope lines and rivet dots are 2 to 4 target px = 1.9 to 3.7 mm = 8 to 16 cells at 1200 px, above
the four-cell threshold, so all of it is paint. No density window is needed.

Order: sparse pencil; pale washes (air, hull, sea underwash, ochre anchor); dry; mid planes (cobalt edge, teal sea,
orange pole and masts, rigging); dry; shadow glazes across region boundaries; dark accents last (hawse hole, pulleys,
waterline navy). The painter's touch-up passes (`_tp2`) only add glazes where it is lighter than the shape mean.

## Lights

- Bare paper: the cream air right of the bow (one small explicit reserve, 17 x 17 mm, left of the dashed rope), plus
  the painter's own near-paper lights: top right air, flecks on the near boat's deck, streaks in the sea.
- Pale painted planes: the lit hull streaks stay inside the first pale wash and receive no mid glaze.

## Glazes

- Waterline shadow: one navy-umber glaze across the bow foot, the anchor shadow and the left boat, on dry paper.
- Bow right edge glaze runs from the top rigging down to the waterline as one passage.

## Drawing

- Opening: 10 sparse pencil gestures (bow silhouette, bow right edge, rust pole, horizon, anchor shank and flukes,
  hawse hole, left mast, left boat sheer, pulley block). Light, under the paint.
- Closing: none (pure watercolour).

## Recipe changes and why

- `_noslane`: the right background is not a sky graded in lanes. Horizontal lanes would put bands across the cream air.
- Everything else stays V096.

## What changed during the try, and why

- First start (6 paints, `sargent.background` in atmospheric-wet): the plan had 118 passes. The painter stopped itself
  at pass 3: "value-plan wet wash whole-footprint gate failed" (band 1, a wet-in-wet stroke of 259k cells, moist share
  0.50 against 0.7, puddle 0.71 against 0.15). The cream air is mostly near-paper, which the painter keeps dry by
  itself. A wet-in-wet wash over it is full of dry holes, so the whole-footprint wetting can never be even. The
  palette could not be changed after the pencil was down.
- Second start (clean sheet): the background is precise-watercolor, wet on dry, around its kept lights. This is closer
  to Sargent's crisp rigging strokes in any case. The 600 px planning step now has 2075 shapes, all wet on dry, and no
  wet-in-wet passage that the gate could refuse. The palette is cut to four paints (ultramarine, cerulean, sienna,
  ochre): the target's greens and darks are greyed mixtures, phthalo green and umber were too strong, and fewer tubes
  give fewer whole-sheet pigment passes.

## Failure signs

- The bow reads as flat blue with no lit left plane, or as banded value islands.
- Rope and rigging washes leak into the hull or the reserve.
- Hard rectangles in the background air. The cream reserve showing as a box.
- Sepia or graphite visible as outline at the end; any ink.
- The waterline darks muddy, or black instead of navy and umber.

## Stage intents

1. After the pencil: a few faint structural lines only.
2. After the first washes: pale hull, pale air, ochre anchor, paper left in the cream air.
3. Mid passes: the cobalt edge, sea and orange pole arrive; the bow starts to turn.
4. Last passes: darks at the waterline, hawse hole and pulleys; lights untouched.

## Result (finished, second start)

- 89 passes (77 ladder passes plus touch-ups), 8394 strokes, no ink, closing drawing empty as planned.
- Values against the target, 30 px blocks: mostly within +-15 of luminance. Waterline navy 74 vs 69, pulley 101 vs
  103, lit hull 172 vs 171. Landmarks in place: bow silhouette, hawse hole, rust pole, anchor, both pulleys, horizon.
- Weaknesses seen: the colour is greyer than the target's blues and teal (the sea is 159,165,167 against 153,178,164).
  The surface is patchy in small shapes. A straight horizontal step about 62% down the hull stayed partly visible.
  The cream air is the whiter paper (241 against 212).
