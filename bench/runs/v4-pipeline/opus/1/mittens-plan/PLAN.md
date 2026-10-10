# Mittens, V5 try 1: plan

Requested style: watercolor portrait sketch, fine lines and light washes. Sheet 234.1 mm x 202.1 mm, 1200 x 1036 px,
one cell 0.195 mm; one target pixel (300 x 259 target) is 4 cells, 0.78 mm.

## Reference read (value thumbnail, 4 values)

1. Paper white: the whole background (top right, left edge, below the cat's chin), the cat's muzzle and chest, the man's
   forehead, nose bridge and upper cheeks. These stay paper or get one very pale tint.
2. Light: cream ground of the cat's head, pale warm skin planes, the pale green cat irises.
3. Mid: raw/burnt sienna patches on the cat's brow, cheek and the fur behind the man's cheek; the warm sepia shadow down
   the man's left cheek against the cat; the blue-grey hair mass.
4. Dark: hair core under the curls and at the hairline, cat eye rims and pupils, man's irises, brows, nostrils, mouth line.

Focal points: the two gazes, the man's eyes (both) and the cat's near eye. Detail and closing ink concentrate there.

## Lights (all reserved before any paint, explicit reserves in config.json)

| light | category | toned when |
|---|---|---|
| cat near-eye catchlight (79-82, 55-60 target px) | bare paper | never |
| cat far-eye catchlight (23-28, 62-64) | bare paper | never |
| man's left-eye catchlight (179.5-182, 185-187.5) | bare paper | never |
| man's right-eye catchlight (242.5-244.5, 175.5-178) | bare paper | never |
| background, muzzle, chest, forehead | held by the painter's near-paper lights | never; vignette into white |

The cat irises are a pale tint (light band only), not bare paper, so the eye does not blaze.

## Regions and technique (families in config.json; the painter's colour clusters are assigned to them)

| region | style | resolution question | smallest feature | move, paper, load | edges | layers |
|---|---|---|---|---|---|---|
| MIT.cat-head | precise-watercolor | wash (patches), ink (whiskers, eye rims) | whisker 1 px = 4 cells: ink; eye rim 2 px = 8 cells: paint dark then ink | wet on dry, medium water, pale then medium sienna | hard on the patch edge facing light, soft into the cream | light wash, mid patches, dark rim accents |
| MIT.cat-body | precise-watercolor | wash, a few broken strokes | stripe 3-5 px = 12-20 cells | wet on dry, watery | broken into paper, vignette | light wash, one mid layer |
| MIT.human-hair (+ side) | ink-and-wash | ink and wash (curls below 4 cells as locks) | curl 2-3 px | blue-grey value wash wet on dry, dry, shadow glaze under the curls, directional curl ink | broken silhouette into paper, white flecks kept | wash, glaze, ink |
| MIT.face | precise-watercolor | wash (planes), ink (lids, brows, mouth) | iris 6 px = 24 cells (paintable on dry paper); lid 1-2 px: ink | pale skin wash wet on dry, dry; mid planes on dry paper; dry; one sepia shadow glaze down the left cheek | one hard edge on the cheek against the cat, soft turn on the jaw | light, mid, shadow, accents |

Brush radius against feature: the painter's round for mids is a few mm (10+ cells); features under 4 cells (lids,
whiskers, curls) are ink, not paint.

## Order and wet passages

1. Opening drawing (opening-lines.json, 81 lines): sparse traced contours: cat ears, head and cheek, whiskers, both cat
   eyes and the nose; the man's face contours, brows, eyes, nose and mouth; no lines inside the hair mass (the wash and
   closing curls carry it). Light weight (0.45), thin (0.8), smoothed so the pen does not stair-step.
2. Light band: one pale connected passage per mass (cat head and body cream/sienna, skin), wet on dry, lights reserved.
   No wet-in-wet: nothing in the reference is a large soft gradient except the hair edge, and that is a broken edge.
3. Dry. Mid band(s) (3 mid layers, `_lay3`): sienna patches on the cat, skin planes (eye sockets, side of the nose,
   left cheek), hair value mass. Dry paper, controlled load, so the eyes stay sharp.
4. Dry. Shadow glazes cross regions: the warm shadow runs from the cat's fur behind the cheek across the man's left
   cheek and jaw; the hair shadow glaze runs from the hairline across the curls on the right side. Deep accents last:
   pupils, iris rims, nostrils, brow cores, lip corners (base `_dk13` keeps them reaching target depth).
5. Closing ink (closing-lines.json, 33 lines, sepia ink): only at the focal points: man's upper lids, irises, brows,
   nostrils, mouth line; cat eye rims, nose and mouth. Never in the lights; no ink fill of the hair.

## Recipe and settings

- `region_w13_lay3`: three mid layers instead of four. The target is a light sketch; fewer mid layers keep the skin and
  cat washes clean (one fewer glaze over the face) while still stepping light to dark.
- Base `_dk13` kept: earlier 3T runs delivered darks 26 to 33 levels too light; I will watch the mids and may revise
  darkgain before the shadow bands if the painting runs heavy.
- `--paints rawsienna,sienna,ochre,sepia,ultramarine,paynes`: the target's own family (cat: raw and burnt sienna;
  skin: ochre and sepia; hair: Payne's grey and ultramarine with sepia; green eye: ochre with Payne's). Explicit to
  avoid green or violet patches in the coat (1D failure). Ink pigment: sepia (`_sep8` in the base).
- Subject name MITTENS (not 3T) so the 3T whole-sheet stubble and jaw-ink rules, whose coordinates are for the full
  3T sheet, do not land on the wrong part of this crop.

## Stage intents (what each stop should look like)

- After the opening drawing: a light sepia line sketch; both heads readable; eyes, nose, mouth present.
- After the light band: pale cream/sienna on the cat, a barely-there skin tone, pale grey hair; lots of white paper.
- After the mids: cat patches and hair mass at value, face planes modelled; edges crisp around the eyes.
- After the shadows and accents: the cheek shadow against the cat, dark hairline, pupils and brows dark.
- After closing ink: fine lines at the eyes and mouth only.

## Failure signs

Hair as a flat dark blob or ink-filled; sclera or catchlights painted over; blur round the eyes; skin muddied by
grey; green or violet patches on the cat; parallel bands or stipple in the fur; opening lines reading as traced
outlines everywhere; the painting much heavier than the target.

## Revisions made while painting (measured against the target, mean L in target boxes)

- Start: `region_w13_lay3` (darkgain 1.3 from the base). After the ground band (pass 7) the first wash was a pale,
  cool grey over half the sheet; values right, colour cooler than the target. No change: `_vio` acts on Y1 only and
  `_cg13` only strengthens cool cells (the hair).
- After the mids (pass 25) the cat matched the target (dL 0 to -16) but the hair was 90 to 98 levels light: as
  ink-and-wash it is painted only by the band-4 glazes (the odd passes 27..37, one per pigment).
- Revision 1 (before pass 34): `_dk18`. Pass 35 (ultramarine hair glaze) moved the hair 19 levels and made it neutral grey.
- Revision 2 (before pass 36): `_dk32` for the last hair glaze (Payne's grey), and hair curls added to closing-lines.json
  (41 traced curl edges inside the hair, smoothed, weight 0.6, width 0.9: directional pen curls by value for the
  ink-and-wash hair). Hair reached L 171 (target 125).
- Revision 3 (before band 5): `_dk22` for the face and cat accents (irises 36 levels light, brows 20, the cat at or
  darker than target). After band 5 and the painter's touch-up rounds: hair L 127-132 (target 125-128), irises and
  brows at target, cat 10 to 21 levels darker than target, cheek shadow 13 darker.

Lesson for the next try: the light-sketch character is lost mostly in the mid layers on the face (tan planes over the
cheeks and around the eyes), not in the darks. The hair needs a much higher dark gain than the rest from the start
(only one band paints it), while the cat and skin want less; the touch-up rounds then add a lot (1338 to 5181 strokes).

## V5 changes and why (first try: no feedback yet)

First plan for this subject. Choices made from the reference and the skill: explicit catchlight reserves for all four
eyes, a target-family palette, three mid layers for a lighter sketch, hair as ink-and-wash, sparse smoothed opening
lines and focal-only closing ink.
