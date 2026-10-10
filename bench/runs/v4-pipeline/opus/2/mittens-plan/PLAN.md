# Plan: Mittens (cat and man), watercolor portrait sketch, fine lines and light washes

## Reference cues and value thumbnail
- Two heads on white paper: an orange tabby cat looking up (left half) and a man's face under dark curly hair (right half).
  The target leaves about 70% of the sheet as paper; washes are pale and broken, lines are fine.
- Values (5): paper white (background, cat chest, man's forehead and cheeks); pale warm (skin, light fur); mid orange-ochre
  (tabby patches, cheek shadows); mid-dark grey (hair mass); darkest notes (upper lids, pupils, brows, nostrils, the cat's
  eye rim and nose).
- Focal points: the man's eyes and brows; the cat's right eye (the large one with the dark rim).

## Lights (protected)
- Bare paper: background, cat chest, man's forehead, nose ridge and cheek lights. The painter holds near-paper cells
  (about 51% of the sheet) out of every pass.
- Catchlights, reserved as explicit 2 px paper reserves before any paint: man's left eye (180-182, 186-188 target px),
  man's right eye (241-244, 175-177), cat's right eye (80-83, 55-58), cat's left eye (22-25, 61-63). They stay bare
  paper. Measured on a luminance grid of the target.

## Regions, technique and order (config.json families)
| family | style | resolution question | move, paper, load | edges |
|---|---|---|---|---|
| 3T.cat-head | precise-watercolor | wash: tabby patches are value planes (6-20 mm, 30-100 cells) | wet on dry, watery-medium raw/burnt sienna | hard on the patch side where the target shows it, broken into white |
| 3T.cat-chest | precise-watercolor | wash plus paper | wet on dry, watery; most of it paper | broken stripe edges |
| 3T.human-hair, 3T.hair-side | ink-and-wash | ink-and-wash: locks are 1-2 target px (0.8-1.6 mm, under 4 cells of brush body) | one connected blue-grey mass (sepia + ultramarine), dry, then darker valleys by value | flicked broken edge into paper |
| 3T.face | precise-watercolor | wash: skin planes | pale warm sepia wash, dry, cheek and jaw shadow planes on dry paper | one hard edge at the cheek and jaw turn, soft into the lit cheek |
| 3T.man-eyes | precise-watercolor | dry detail: iris about 4 target px = 3 mm = 16 cells, lid ribbon 1-2 px = 4-8 cells | dry on dry, controlled load | crisp |

Order (the painter's light-to-dark ladder, base lay4): opening graphite, then pale local-colour washes (skin, light fur,
pale hair), dry, then mid values on dry paper (tabby patches, cheek planes, hair mass), dry, then cross-region shadow glazes
(left cheek into the cat's flank, the hair's shadow side into the right temple and jaw), then the darkest accents
(lids, pupils, brows, nostrils), then the closing ink.

## Glazes
- The last shadow glaze runs across the boundaries: the shaded left cheek of the man continues into the cat's orange
  flank beside it; the hair shadow runs down the right temple into the jaw. The painter's shadow passes are not split
  by region.

## Wet passages
- None wet-in-wet by choice: every family is "wet on dry" or "dry on dry". The eyes family is dry detail. A wet
  hair passage cannot spill into the eyes because it is dried before the mid-value passes.

## Drawing
- Opening (graphite HB, light pressure 0.25, under the paint): 26 sparse strokes authored on a zoomed grid of the
  target: cat ear, the shared contour between the cat and the man's cheek, both cat eyes, cat nose and mouth, hair
  silhouette and hairline, the man's jaw, brows, eyes, nostrils and mouth.
- Two painter filters were checked against a copy of the painter's mask: a path that touches any held white cell is
  dropped, and a 3T path longer than 6% of the width with most points at y 0.5-0.85 is dropped (the "jaw" rule). So
  strokes were snapped onto the target's dark line (within 1.5 px), split where they cross paper whites, and the long
  lines in the brow-eye-nose band were cut into 11-17 px strokes (pen lifts). The compile preview kept all 26.
- Closing (sepia ink, base `_sep8`, `_ink4` reads closing-lines.json): 23 selective strokes at the focal points: the
  upper lids of both eyes as dark ribbons, brows, nostrils, mouth line, the cat's eye rims, nose and mouth, and three
  fine whiskers on the right side. Strokes sit on the edge where the target's value changes (they need value contrast
  0.06 or more to survive the painter's filter). No lower-lid creases, nothing in the lights, no fills.

## Palette and values
- `--paints rawsienna,sienna,hansa,sepia,ultramarine`. The automatic pick was sepia, raw sienna and sap green (error 3.96).
  Sap green risks green patches in fur and skin (1D failure, 10-04), and that palette has no cool for the blue-grey hair.
  This five-paint palette fits the target's local colours with error 4.10, and its greys fit better (4.5 against 9.6).
- Values: base darkgain 1.3 kept. The target's darkest notes are true darks (lids, pupils); the washes stay light
  because the plan covers about 41% of the sheet.

## Tokens
- `region_w13`, the V096 base unchanged: four mid layers (enough steps for a visible light-to-dark progression), sepia
  ink, cold-press paper.

## Stage intents (what each stop should look like)
- After the opening: faint graphite showing both faces' features; no paint.
- After the first passes: pale ochre and skin washes, pale grey hair, lots of white paper; no darks yet.
- Middle passes: tabby patches and hair mass reach mid value; the face gains its cheek and jaw planes.
- Last passes: hair valleys, lids, pupils, brows; then the ink lines.

## Failure signs to watch
- A green or blue cast on the cat or skin (palette); hair as a flat black blob or as stipple; eyes without catchlights
  or with blurred lids; man's features washed out; cat's orange patches merging into one flat block; heavy ink over
  soft paint; paper whites filled in.

## What I would change at a stop
- Hair too dark or flat: lower darkgain for the remaining passes (`--darkgain 1.1`) or drop a mid layer.
- Colour cast: change `--paints` for the passes still to come.
- Features too faint before the closing: keep the closing ink. If the ink reads heavy, thin it to the lids and pupils.
