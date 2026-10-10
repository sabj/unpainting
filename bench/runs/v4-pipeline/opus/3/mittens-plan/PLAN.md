# Mittens (V4, try 3): watercolor portrait sketch, fine lines and light washes

## Reference read (value thumbnail)

The target is a watercolour itself, on white paper: a ginger-and-white cat (left half) looking up-left, and a smiling man
with dark curly hair (right half), cheek to cheek. Five values:

1. Paper (about 54% of the sheet): background, cat's muzzle, chin, chest and throat, man's forehead, nose ridge, cheeks.
2. Pale tint: skin (pale raw sienna), pale orange fur, the cat's pale green irises, light greys inside the hair.
3. Mid: burnt-orange fur patches and stripes, sepia eye sockets, under-nose, stubble and jaw turn, mid hair greys.
4. Dark: hair mass (cool grey-black), brows, cat's right head edge, stripes on the brow.
5. Accents: cat's upper lids and pupils, nostrils; man's lids, irises, nostrils, mouth line.

Focal points: the cat's large right eye and nose, the man's eyes and brows. The real 3T progression
(`refs/live-sources-v3/3T-stage-*`) is: full pencil drawing, then pale orange and skin washes, grey hair, then darker
stripes and darks last. The plan follows that order.

## Style balance

- Overall `precise-watercolor`: fine graphite drawing under light, shaped washes; value planes carry the cat's markings
  and the face; detail dry; selective closing ink.
- Hair (`3T.human-hair`, `3T.human-hair-side`): `ink-and-wash`, as in the 3T registry. Curls are thinner than a brush
  mark (a strand is about 1 target px = 0.78 mm = 4 output cells; the brush needs several cells). One mixed grey-black
  mass, ragged edge into paper, a few ink curls at the edge.
- Wet versus dry: mostly wet on dry, with shapes kept as washes. No wet-in-wet over any eye, nose or mouth.

## Regions (families) and technique

| family | cue | question | move, paper | layers |
|---|---|---|---|---|
| 3T.cat-head | orange patches on white, sienna stripes, green eyes, dark lids | wash (patches); ink (lids, pupils) | wet on dry, medium water; stripes dry on dry later | pale wash, mid patches, dark stripes |
| 3T.cat-body | white chest as paper, orange and brown fur down the right side | wash plus broken directional marks | wet on dry, broken edges into paper | pale wash, mid, a few darks |
| 3T.human-hair(+side) | cool grey-black curly mass, ragged top | ink and wash | mixed dark, wet on dry, lighter grey breaks kept | pale grey, mid, dark glaze, ink curls |
| 3T.human-face | pale skin, sepia sockets, stubble, jaw turn | wash | pale skin wash wet on dry, then mid planes dry | pale, mid, shadow glaze on the left cheek and jaw |

Smallest features in cells (1 target px = 4 output px = 0.78 mm): man's iris about 8 px target = 32 cells across; cat's
large eye 34 x 24 px target; lid lines 1 to 2 px target (4 to 8 cells) are drawing, not paint.

Palette (`--paints rawsienna,sienna,sepia,ultramarine`): the painter's own pick was sepia, raw sienna and sap green, which
would give green patches in the fur (the 1D failure) and olive hair greys with no blue. Raw sienna for skin and pale fur,
burnt sienna for the cat's orange, sepia for skin shadows and brows, ultramarine with sepia for the cool hair greys and the
cat's pale grey-green eyes (raw sienna plus a touch of ultramarine).

## Protected lights

- Reserved (config): catchlights in both cat eyes (large eye upper-left of the pupil, small eye at the pupil) and both of
  the man's irises. Each about 1.3 mm square, on bare paper, never toned (they are tiny).
- Painter's own near-paper lights: background, cat's muzzle, chin and chest, man's forehead, nose ridge and upper cheeks.
  These stay paper; nothing is laid over them by any wash.

## Order and glazes

1. Opening graphite drawing (`opening-lines.json`, 37 authored gestures, smooth, measured on the target): cat ears, head
   edge, both eyes with pupils, nose, mouth, three whiskers, chest edge; man's hair silhouette, hairline, face contours,
   brows, eyes with irises, nose, mouth. Sparse and light (weight .28 to .6).
2. Pale washes (band 1): pale orange fur, skin tint, pale hair grey. Dry.
3. Mid values on dry paper (bands 2 to 3): fur patches, eye sockets, under-nose and stubble, hair mid greys. Dry between.
4. Darks and shadow glazes last: cat stripes and the dark right head edge; hair darks; the man's shadow side (left cheek
   by the cat, jaw) as a glaze crossing face and hair. Dry before each glaze.
5. Closing ink (`closing-lines.json`, sepia ink, 20 lines): lids and pupils of all four eyes, nostrils, the man's mouth
   line and brows, cat's mouth, three hair curls. Selective, never in the lights.

Ink pigment: sepia (base `_sep8`, recorded as `sepiaInk: true` in the check). Graphite HB for the opening.

## Values and tokens

Start from the V096 base unchanged (`region_w13`), only the palette in `extra-args.json`. Values are judged at each stop
against the target; if washes come out heavier than "light washes" asks, I lower `--darkgain` for the rest of the ladder.

## What would show failure

- Green or olive fur, or hair that turns brown/olive (palette).
- Washes crossing the white muzzle, chest or forehead; lost catchlights ("zombie" eyes).
- Hair as one flat black fill or stippled flecks; printer streaks in the fur.
- Heavy closing ink over blurred eyes; ink lines doubled off the painted features.
- Straight seams at x = 0.5 (cat/man boundary is a real edge in the target, so a seam there is supported).

## Drawing audit before painting

- The painter drops any drawing path with a point on a held white cell (`selectValueInk`: about 51% of the sheet is held
  paper) and, for subject `3T`, any long path mostly in the middle band of the sheet ("jaw" rule written for the full 3T
  sheet; on this crop it removed the brows, lids and face contours). First compile: 5 of 37 opening and 6 of 20 closing
  paths survived.
- Fixes: subject renamed `MITTENS` (own name; styles come from `styleSelection`, the drawing still uses the 3T drawing
  profile from the target path); each authored gesture snapped within 1.5 target px onto the target's own pencil/ridge
  line, then split where it would cross held paper (mask approximated from the target at a 56% held share, stricter than
  the painter's 51%); opening paths flagged `outline` so short runs are kept. Result in the 600 px compile: 31 opening
  and 13 closing paths, covering both cats' eyes, nose and mouth, the man's face contours, brows, lids, irises, nose and
  mouth. The hair silhouette lies on paper and is carried by the wash edge instead.
- Tracer output (`q-trace-ink.mjs`) was rejected for the opening: fragmented, zig-zag spans that missed the ears, the
  cat's small eye and nose.

## Changes during painting (V5 notes)

- Stop 0 (opening drawing, 43 pen lines): sparse and correct; kept. Tried to drop the granulating "sky" tube
  (`--skyblue 0`) because a portrait on white paper has no sky and pass 5 listed it over 47.8% of the sheet. Refused:
  the palette cannot change once painting has started. Reverted `extra-args.json` to the start state (palette only).
  Pass 5 then changed no visible pixel (max difference 3 of 255), so it was harmless.
- Passes 1 to 4 (band 1): one pale connected ground over cat, hair and face; muzzle, chest, forehead, nose ridge and
  background kept as paper. Passes 6 to 21 (band 2 rounds): cat warms, face gets eye sockets, nose shadow, stubble.
  Passes 22 to 33 (bands 4 to 5): lids, brows, irises, cat's nose bridge and stripes; hair reaches a mid cool grey.
  Touch-up rounds (base `_tp2`): hair deepened to the target's dark blue-grey with light breaks. Closing ink: light,
  selective (cat lid, nostril, mouth; man's brow, pupil, nostril); lines over dark paint drawn at low pressure.
- No revision was accepted; the plan painted as started.

## Result against the plan

- Value shapes and landmarks: both heads, eye spacing, ears, brows, nose and mouth in place; light-to-dark progression
  visible across the stops (drawing, pale ground, mid planes, darks, hair glazes, ink).
- Lights: muzzle, chest, forehead and background stay paper; catchlights present in all four eyes. They read as small
  bright squares at native size; a smaller (1 mm) reserve would look less mechanical.
- Weak points: the cat's orange is more muted and pinker than the target's burnt orange (four-paint mixing); the hair
  carries many small pale flecks; a darker sepia band runs down the man's left cheek where it meets the cat, heavier than
  in the target. The hair silhouette and whiskers have no line work because the painter drops lines on held paper.
