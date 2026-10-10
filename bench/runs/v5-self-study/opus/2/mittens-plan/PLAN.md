# Mittens, V5 try 2: plan

Requested style: watercolor portrait sketch, fine lines and light washes. Sheet 234.1 x 202.1 mm, 1200 x 1036 px,
one cell 0.195 mm; one target pixel (300 x 259) is 4 cells, 0.78 mm.

## What I changed from try 1, and why

| change | from | to | why (self-review / critique point) |
|---|---|---|---|
| paper protected as bare white | painter default (`--paperdelta 10`, 49% of the sheet held) | `--paperdelta 30` (57% held, measured in the 1200 px plan) | Fault 1: the cat's muzzle and chest, the forehead and cheeks got a beige wash; the target leaves them paper. This also answers the progress judge's "whole sheet at one faint value": band 1 now covers less, and only where the target has tone. |
| mid layers | `_lay3` | `_lay2` | Fewer stacked mids means fewer nested hard-rimmed islands (fault 2, marks/texture 2.33). The target's skin and cat are one light wash plus one mid at most. |
| dark gain | `_dk22` (ended there after revisions 18, 32, 22) | `_dk16` | The dark sienna band down the cat's neck and the heavy jaw were the darkest warm notes on the sheet (fault 3). The hair and eyes reached their value last time with room to spare; touch-up passes (`_tp2`) still glaze shapes that come out lighter than the reference. I will look before the shadow bands and revise if the hair or eyes run pale. |
| ink colour | base `_sep8` (sepia, absorption x8: read as black) | `_sep4` | "Fine lines": the target's lines are light brown-grey, not black (fault 5). |
| opening drawing | 81 traced fragments, weight 0.45 | 24 hand-placed, smoothed gestures, weight about 0.3, tapered pressure | Sparse first lines that carry likeness: cat ears, both cat eyes, nose and mouth, one body contour; the man's face contours, brows, lids, nose wings, mouth; two loose hair-silhouette arcs. Dropped the spurious lines across the cat's cheek and the long line down the cat/man boundary. |
| closing ink | 74 lines, many in the hair | 39 selective lines | Focal points only: cat's upper eye rims and slit pupils, nostrils; six fine whiskers (weight 0.4, width 0.55); the man's upper lids, iris arcs under the lids, short directional brow strokes, nostrils, mouth corners; eight curl gestures in the darker hair only. Nothing in the lights. |
| catchlights | four 2-4 mm rectangles | four 1.1 x 1.1 mm reserves, placed from 8x crops of the eyes | Square white boxes in the eyes read as pasted on (fault 4). The new size is the plan minimum, at the target's own glint positions. |
| cues | | rewritten per family | Say "paper" and "never a solid band" where the target is white or broken. |

Kept: the families and their bounds (they admitted and gave correct landmarks), hair as ink-and-wash (best passage last
time), palette `rawsienna,sienna,ochre,sepia,ultramarine,paynes` (hue family was right), base `_tp2` touch-ups.

Critique points rejected: the 100% stage's 5.0 (noise; the surface has the same tells as at 75%); "cat half-formed at
10% while the figure is barely sketched" (it contradicts "whole sheet at one value"; both subjects got their first wash,
the cat's colour is just stronger); classic edge/marks (pixel metrics that reward the patchwork). Details in
`bench/SELF-REVIEW.md`.

## Reference read (value thumbnail, 4 values)

1. Paper: background, cat's muzzle, chin and most of the chest, the man's forehead, nose bridge and upper cheeks.
2. Light: pale green-grey cat irises, a whisper of warm skin on the cheeks, the pale cream fur between the cat's patches.
3. Mid: sienna patches on the cat's brow, between the eyes, the cheek and the fur strip behind the man's cheek; light sepia
   shadow down the man's left cheek and right jaw; stubble; the blue-grey hair mass.
4. Dark: hair core under the curls and along the hairline; cat eye rims and pupils; the man's irises, brows, nostrils,
   mouth line.

Focal points: the two gazes. The cat's near eye and the man's two eyes carry the detail and the closing ink.

## Lights

| light | category | toned when |
|---|---|---|
| catchlight, cat near eye (81.3, 56.3 px) | bare paper, explicit reserve 1.1 mm | never |
| catchlight, cat far eye (26.3, 63.1) | bare paper, explicit reserve | never |
| catchlight, man's left eye (183.1, 185.6) | bare paper, explicit reserve | never |
| catchlight, man's right eye (246.3, 176.9) | bare paper, explicit reserve | never |
| background, muzzle, chest, forehead, nose bridge, upper cheeks | bare paper (near-paper lights within 30 levels of the sheet white, connected shapes) | never; the sketch vignettes into white |
| cat irises | pale tint (band 1 only) | band 1 |

## Regions and technique

| region | style | resolution question | smallest feature (cells) | move, paper, load | edges | layers |
|---|---|---|---|---|---|---|
| MIT.cat-head | precise-watercolor | wash for patches; ink for whiskers, rims, pupils | whisker 0.5 px = 2 cells: ink. Eye rim 2 px = 8 cells: paint, then ink. Pupil slit 1-1.5 px: ink | wet on dry; watery pale band 1, medium sienna mid | hard on the patch edge toward the light, lost into paper | band 1, one mid, dark accents |
| MIT.cat-body | precise-watercolor | wash, a few broken strokes | stripe 3-5 px = 12-20 cells | wet on dry, watery | broken into paper, vignette | band 1, one mid; shadow glaze only where the target is mid-dark |
| MIT.human-hair (+ side) | ink-and-wash | ink and wash (curls 2-3 px are below 4 cells as locks) | curl 2-3 px | one connected blue-grey wash wet on dry, dry, one shadow glaze under the curls, a few pen curls | broken silhouette into paper, white flecks kept | wash, glaze, ink |
| MIT.face | precise-watercolor | wash for planes; ink for lids, brows, mouth | iris 7-8 px = 30 cells: paint on dry paper. Lid 1-2 px: ink | pale skin only where the target has tone, wet on dry; dry; mid planes (cheek shadow, eye sockets) on dry paper; dry; one sepia glaze down the left cheek | hard edge on the cheek against the cat, soft turn on the jaw | band 1, one mid, shadow, accents |

Brush against feature: mid-band brushes are a few mm (10+ cells). Everything under 4 cells is pen, not paint.

## Order, moisture, glazes

1. Opening drawing (24 gestures, sepia at 4x, weight 0.3): the likeness lines first, as continuous tapered strokes.
2. Band 1: pale connected wash per mass, wet on dry, watery. Most of the sheet stays white. No wet-in-wet: the
   target's soft transitions are only at the hair edge, and that edge is broken, not graded.
3. Dry. Band 2 (two mid layers): cat patches, the fur strip, cheek and socket planes, the hair value mass. Dry paper with
   a controlled load, so the eyes stay sharp.
4. Dry. Shadow glazes (bands 4 and 5) cross region boundaries: the warm shadow from the fur behind the man's cheek onto
   his left cheek and jaw; the hair shadow from the hairline through the right-hand curls. Then deep accents: pupils,
   irises, brows, nostrils.
5. Touch-up rounds (base `_tp2`): the painter steps back and glazes shapes that are lighter than the reference.
6. Closing ink (39 lines) on dry paint, at the focal points only.

Breaks from the default: none planned.

## Stage intents and what would show failure

- After the opening drawing: light brown lines, both faces readable. Failure: black lines, or lines inside the lights.
- After band 1: well under half the sheet tinted; the muzzle, chest and forehead are bare paper. Failure: an even beige
  over both subjects.
- After the mids: cat patches distinct with white between; hair a connected grey mass. Failure: hard rims everywhere,
  or a dark band down the cat's neck.
- After the shadows: hair core dark, eyes dark. Failure: hair still pale (revise `_dk` up before the last shadow band),
  or the neck band going dark brown (revise `_dk` down).
- Final: fine lines, light washes, paper white dominant, small catchlights, smile visible.

## Settings

- `bench/variant.txt`: `region_w13_lay2_sep4_dk16` at the start, `region_w13_lay2_sep4_dk20` from pass 32 (revision 2)
- `extra-args.json`: `--paints rawsienna,sienna,ochre,sepia,ultramarine,paynes`, `--paperdelta 30`
- Ink pigment: sepia ink (the painter's ink profile, `--inkk` sepia absorption from `_sep4`).

## Revisions while painting

- **Stop 0 (before the first wash): only 18 of my 24 opening gestures were drawn, and the eye, nose and brow lines were
  missing.** Cause, from `selectValueInk` in `light-to-dark.mjs`: the painter drops any pen path that has even one
  point on a protected light cell. With `--paperdelta 30` the protected lights reach the whites of the eyes, the
  muzzle and the skin next to the lids. My hand-placed lids crossed those cells. The opening drawing cannot change once
  it is on the paper, so the opening now has the ears, head, face and body contours, the mouth and one lid, and the
  eyes will come from paint and the closing ink.
  Fix for the closing ink (`closing-lines.json`): lid, rim, nostril and mouth paths are snapped to the darkest target
  pixel within 1.5 px, then cut wherever they cross a near-paper target pixel (within 30 of the sheet white) or a
  catchlight reserve. Pieces shorter than 2.5 px are dropped. The iris arcs are gone (they lay across the sclera). 42
  pieces remain: rims, slit pupils, nostrils, both upper lids, brow strokes, mouth corners, the whiskers' segments over
  fur, and hair curls. Lesson for the next try: run the same cut on the opening file before starting.
- Tried `--skyblue 0` to remove the base recipe's granulating "sky" pass (pass 7, one passage over 38.5% of the sheet
  carrying 3 cells of blue). Refused: it removes a tube, and the palette cannot change once painting has started. It
  stays; it carries almost no pigment. Next try: set it before `start`.
- Look after pass 7 (light band): forehead, cheeks, muzzle and chest are bare paper as intended. The band is a pale
  neutral, greyer than the target's warm cream on the cat (all six pigments share the band). Diagonal wash lanes show
  across the forehead. No change.
- Look after pass 19 (mids): the cat and face planes are at or slightly past the target value and browner than its
  orange. The fur strip behind the cheek is mid, not the dark band of try 1. The hair is still pale (ink-and-wash puts
  its weight in the shadow band). No change.
- Look after pass 31 (value 4): the hair is a mid grey-mauve with paper flecks, far lighter than the target's near-black.
  The warm planes hardly moved. **Revision 2: `_dk16` to `_dk20`** for the value-5 passes (32 to 37), so the hair,
  pupils and lids reach depth. I stopped below try 1's `_dk22`, which over-darkened the warm neck band. The touch-up
  round (base `_tp2`) adds corrective glazes where the hair is still lighter than the reference.
- Closing stop (53 passes, 5009 strokes; the touch-up rounds added about 4000) and finish: hair dark blue-grey with paper
  flecks, close to the target; catchlights small; background, forehead, muzzle and chest white. Closing ink laid as
  planned; it is light and barely shows at full-sheet scale.

## Outcome against try 1 (my reading of `bench/looks/07-compare.jpg`)

Better: much more white paper (the forehead, muzzle, chest and background are clean), no black traced lineart, small
catchlights instead of boxes, the neck strip mid rather than near-black, and the hair as good as or better than before.
Still wrong: the cat and the face's side planes are browner and heavier than the target's orange and pale sepia. The
patches still have hard rims. The opening drawing lost its eye lines to the protected-light filter, so the "fine lines"
character is weaker than planned.

Next try: run the protected-light cut on the opening file before `start`; set `--skyblue 0` before `start`; try `_lay1`
or a lower `--midgain` for warmer, paler cat and face mids. Final files: variant `region_w13_lay2_sep4_dk20`;
extra-args `--paints rawsienna,sienna,ochre,sepia,ultramarine,paynes --paperdelta 30`.
