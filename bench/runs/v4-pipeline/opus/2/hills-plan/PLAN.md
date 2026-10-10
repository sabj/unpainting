# Hills, V4 try 2: loose ink and wash

## Reference read (value thumbnail)
- Four values. 1) Lightest: the cream dirt track, an S from top-left (x 55-75, y 30-120 of 306x242) to the lower bend
  (x 130-160, y 135-235), plus a short track top right and a stub bottom right; thin white flecks along the meadow edges.
  2) Light-mid: sunlit yellow-green meadows (lum .70-.80), top-right band, left slope beside the upper track, and the
  broad lower meadow around the bend. 3) Mid: blue-green / grey-green oak canopy (lum .35-.45). 4) Dark: indigo shadow
  undersides of the canopy clumps (lum .17-.30), heaviest lower left and centre right.
- Focal point: the lower track bend where it leaves the dark tree (centre trunk at x 105-125, y 120-150) and runs down
  into the bright lower meadow.
- Paper: the painter picks a white sheet (252/251/248); the track is a pale warm tint, not bare paper.

## Style balance
- Global style `ink-and-wash` (requested): two connected washes per area (light wash, then shadow glaze), pen carries
  edges and canopy character. Sepia ink (base `_sep8`, pigment declared in the line files).
- Meadows stay in the global ink-and-wash style, painted wet on dry: the grass slopes are wash questions (smooth graded
  planes, blades far below cell scale), so they get one connected pale field wash per colour shape. (First plan gave
  them `atmospheric-wet`; see Changes.) Families only label the painter's colour clusters (woods / meadow); region
  edges follow colour shapes, not rectangles (seam check: 0 unsupported edges).
- Palette (`--paints`): hansa, sap green, yellow ochre, French ultramarine, cerulean, sepia. Hansa + sap green for the
  meadows, ochre for the track and warm grass, ultramarine/sap green/sepia mixed darks for the canopy (no ink-black
  fills), cerulean for the cool grey-green canopy tops.

## Regions, technique, order
| region | cue | question | move / paper | load | edges | layer |
|---|---|---|---|---|---|---|
| track | cream, warm | wash | painter's near-paper lights held out; pale band-1 tint elsewhere | watery | hard against grass, drawn in pen | 1 |
| meadows | bright yellow-green, soft grading | wash | wet on dry, one connected passage per colour shape | watery | crisp where canopy cuts it | 1, then a light band-4 glaze where terrain turns |
| woods | blue-green clumps, indigo undersides | ink and wash | wet on dry mixed-dark wash, dry, shadow glaze across clumps | medium, then thick | broken silhouettes | 1, 4 |
| canopy texture | scalloped clump undersides | ink | pen on dry paint, closing | - | crisp, tapered | closing |

- Smallest features: track width 6-15 target px = 24-60 cells at 1224 (0.13 mm/cell): paintable as a shape. Meadow
  white flecks ~1 px = 4 cells: left to the painter's held-out whites. Canopy scallops ~1-2 mm: pen.
- Order: opening pen -> band-1 light washes (meadows wet, track tint, canopy pale mixed base) -> dry -> band-4 shadow
  glazes across the canopy clumps and into their cast shadows on the grass -> dry -> touch-ups -> closing pen.
- Cross-boundary glaze: the band-4 shadow glaze runs across canopy clusters and onto the meadow where trees cast shade
  (painter's "shadows never split by region").
- Wet passages: none. Every pass is wet on dry (checked in the value plan: 0 wet-on-wet passes), so no wash floods the
  drawn canopy edges; softness comes from the mop brush and the light-wash water (.55).
- Tokens: `_lay2` (two mid layers instead of four: loose plate, most of the sheet gets one or two washes). Everything
  else is the V096 base (dk13 keeps the deep canopy darks the target has).

## Drawing (authored from the target's value shapes, `bench/scratch/lines.mjs` logic)
- Opening (`opening-lines.json`, 42 gestures, 29 kept by the painter): both edges of the track, offset 1.3 px out of the
  light, and the longest meadow/canopy silhouettes, as smooth 25-85 px gestures with tapered width (1.0-1.7 px) and
  medium weight (.45-.55). Any gesture crossing a held-out white is split there (the painter drops lines on whites).
- Closing (`closing-lines.json`, 70 gestures): scalloped pen lines along the shadow undersides of the dark canopy clumps
  (iso-value .31 of the blurred target, only where the dark is above the line), weight .62; six trunk/limb lines at the
  focal tree and a few others. Nothing in the meadows or on the track. Density follows value; no fills, no hatch.

## Failure signs to watch at the stops
- Meadows going dry-brush scratchy or khaki instead of luminous yellow-green; meadow wash bleeding into canopy.
- Canopy as one flat dark mass without the lighter blue-green tops; ink-black instead of mixed darks.
- Track lost (painted over) or blazing white instead of a cream tint.
- Closing ink outlining every clump (traced lineart look) or ink in the lights.

## Stage intents
- After opening: sparse sepia lines, track and meadow silhouettes readable on white paper.
- After band 1: pale yellow-green meadows, pale blue-green canopy, track pale; whole sheet light.
- After band 4: clump shadows and value structure match the thumbnail.
- Closing: pen scallops give the canopy its character; focal tree trunk.

## Changes during painting
- Start 1 refused by the painter before any paint: the band-1 wash of one colour cluster (about 85% of the sheet) was
  planned wet on wet (from the atmospheric-wet meadow style and wet-in-wet family moves) and failed the painter's
  whole-footprint wet gate (moist share .48 < .70). Fix: dropped the atmospheric-wet region styles and set every family
  move to wet on dry. Did not use `--wetgate 0`: it is read only when the gate trips, so an untripped gate would fail the
  render as an unread option. Re-check: ADMITTED, 21 passes, all wet on dry, same 29 opening gestures selected.
