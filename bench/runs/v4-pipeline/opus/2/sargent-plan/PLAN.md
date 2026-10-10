# White Ships (Sargent), V4 try 2: plan

Style asked for: pure watercolour, no ink. The only drawing is a light HB graphite lay-in under the paint; nothing is
drawn at the end.

## Reading the reference (value thumbnail, 4 values)

1. Paper and near-paper (warm cream, about 227/220/203): the right sky and sail behind the bow, the streaks on the hull's
   lit side, the white hatching on the left boat.
2. Pale: the pale cerulean sky at the left, the lit blue-grey hull, the salmon mast, the ochre anchor and the water lights.
3. Middle: the hull's shadow side (ultramarine, a little violet), the teal-green sea, the blue boat on the left, the rust pole,
   the blue rope strokes in the right sky.
4. Dark: the hawse pipe, the two pulley blocks, the dark spars at the top left, the blue-black band where the hull meets
   the water, the stays at the bottom.

Focal point: the bow, from the hawse pipe down the orange rivet line. Lights there are the paper streaks on the hull's
upper left.

## Regions (families), technique and order

| family | cue | question | move | edges |
|---|---|---|---|---|
| sargent.hull | pale blue-grey bow, paper streaks, rivets, hawse pipe | wash, then mid planes on dry | wet on dry, watery first wash, medium mid layers | hard edge on the bow line, softened turn on the left side |
| sargent.sky-left | pale cerulean sky, salmon mast, grey spars | wash | wet on dry, watery | masts crisp (dry paper), sky lost into paper |
| sargent.sky-right | paper-white sky, loose blue strokes, pulleys, rust pole | mostly paper; wash for the blue strokes | wet on dry | blue strokes with one hard edge; pulleys dark accents last |
| sargent.boat-left | blue boat, white hatching, ochre anchor | wash with broken paper | wet on dry, medium | broken lights from paper |
| sargent.water | teal-green sea with ochre light | wash | wet on dry, watery ochre first, teal strokes side by side over it | soft-ish inside, horizon hard |
| sargent.foreground | dark band at the hull's foot, anchor, stays | mid and dark glazes on dry | wet on dry, thicker load last | hard top edge against the water |

Order (light to dark, the painter's ladder): graphite lay-in; pale washes over the whole sheet except paper lights
(sky cerulean, hull blue-grey, ochre in the water and anchor, salmon mast); dry; mid values on dry paper in three layers
(`_lay3`, one fewer than the base: Sargent's sheet is few and bold washes, not many thin ones): hull shadow planes,
the boat, the sea's teal, the rust pole and rope strokes; dry; shadow glazes that cross region boundaries (the hull's
shadow side running into the foreground band and the water's edge, `_vio` violet in the shadow); dry; darkest accents
last: hawse pipe, pulley blocks, spars, the hull's foot.

Cross-boundary glaze: the shadow along the hull's foot runs across hull, foreground and the left boat in one passage.

## Protected lights

- Painter's own near-paper lights (paperlights): hull streaks, boat hatching, sail.
- Four small reserves (each about 11 x 11 mm, under the seam limit) at the brightest paper of the right sky and sail,
  taken from the target's brightest 12 x 12 px windows (min luminance 207 to 212). They stay bare paper; the sky around
  them is near paper anyway, so they do not read as boxes.

## Drawing

- Opening: eight long graphite gestures (HB, `--outlinemedium graphite`), drawn by hand in target pixels: the hull's
  left contour, the bow line, the hawse pipe, the rust pole, the large pulley block, the horizon, the salmon mast, the
  left boat's gunwale. A painter's lay-in, not a trace.
- Closing: none (`closing-lines.json` empty, medium none). No ink anywhere: the request is pure watercolour.

## Pigments

`--paints ochre,sienna,ultramarine,cerulean,phthalogreen,sepia`: ultramarine and cerulean for the hull and skies,
ochre and sienna for the anchor, mast, rivets and rust pole, phthalo green with cerulean and ochre for the teal sea,
sepia for the dark accents (mixed into ultramarine, not a flat black).

## Tokens and settings

- `region_w13_lay3`: three mid layers instead of four (fewer, bolder washes). Everything else is the V096 base
  (dark gain 1.3 kept: the target has real darks in the pulleys, hawse pipe and hull foot).
- extra args: `--outlinemedium graphite` (lay-in in pencil, not ink), `--paints` as above.

## What would show failure

- Hull reading as a flat blue slab without paper streaks, or a hard rectangular white box anywhere.
- Right sky filled grey instead of left as paper.
- Rust pole, masts or rivets lost or blurred into the sky (should be crisp, dry paper).
- Sea painted with hard internal contours or as a flat block; the horizon lost.
- Darks (hawse pipe, pulleys, hull foot) missing or as ink-like outlines.
- Stripes or lanes in the skies.

## Stage intents

- After the lay-in: eight light pencil lines only.
- After the first passes: pale blue hull, pale skies, ochre water and anchor; right sky mostly paper.
- Middle: hull shadow planes, teal sea, blue boat, pole and rope.
- End: dark accents at the bow, pulleys and the hull's foot.

## Changes during painting

- Start 1 was refused by the painter at pass 1: the sea was an atmospheric-wet region (water 0.88), and its first
  wet-in-wet passage met a puddled footprint (waterMax 0.63; the gate allows 0.15). All 423 wet-on-wet and dry-on-wet
  passages in the plan came from that one region. Fix: no region styles; the sea is painted wet on dry like the rest
  (Sargent's sea here is visible side-by-side strokes anyway). Re-checked: 3064 passages, all wet on dry. Restarted on
  a clean sheet.
- Looks at passes 6, 20, 40 and 79: the ladder went light to dark as intended (warm ground, pale blue hull planes,
  then the mids), with paper kept in the right sky and the hull streaks. It is greyer than the target, because all six
  pigments are glazed over the same shapes; the sea came out grey-blue, not teal.
- After pass 86 (dark band 4) the sheet's mean value matched the target (157 vs 155). My paper is white (252) and the
  target's is cream (227), so relative to paper the sheet was already a little too dark, and the lower hull read as a
  dark slab (99 against the target's 135). Dark band 5 (six more passes over 28% of the sheet) would have pushed it into
  mud. Revision: `_dk10` (dark gain 1.0 instead of the base 1.3) for the remaining passes. Values are set by the
  darks already on the paper, and the small accents still come from the touch-up round.
