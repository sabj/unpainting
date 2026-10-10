# Self-review of V5 try 2 (Trumbull), written before reading FEEDBACK.md

Sources: `bench/feedback/previous-painting.png`, `compare.png`, `stages.jpg`, native 1200 px crops of the gable, the
left range, the right range and the street next to the same target crops (`bench/looks/prev/*.png`), the try-2 plan
files and checkpoint log (variant `region_w13_dk16_lw`, 92 passes planned, three looks, no revision).

## What works

- Composition and landmarks: gable and ridge, both towers, the roofline, the lancet row, the two arched windows, the
  window grid of both ranges, the navy sign, the traffic lights and the tree are all in place and in proportion.
- The lit gable is the lightest built plane, warm pale ochre with sparse horizontal block hints. It is the best part
  of the sheet and reads as sunlit stone.
- The olive-green shadows of try 1 are gone. With burnt sienna back the shadow sides are warm brown, close to the target.
- Window glass is dark blue and is the darkest value with the signs; the pale rims round the windows are smaller than
  in try 1 (`--recessclean 0` worked).
- The sky is a continuous blue field on the right, lighter on the left, with paper clouds. Better than try 1's tears.
- The stages go light to dark: drawing and pale wash, sky and stone, mid planes, darks.

## What is wrong (worst first)

1. **Ruled black rectangles round the window groups** on the left and right ranges (eight of them). These were the
   "window boxes" I drew by hand into the opening lines in try 2: closed 5-point rectangles, ink, weight 0.66. On the
   paper they are thin hard boxes floating around the windows, which nothing in the target shows (the target has pale
   stone frames, not dark outlines). This is the most artificial thing on the sheet and it was entirely my choice.
2. **Mottle on the shadow sides.** The shaded wing left of the gable, the strip right of the left tower and the
   lower left range are covered with dark brown-violet blobs with ragged edges and pale holes between them. It reads as
   camouflage or lichen, not coursed stone in one shadow tone. Less olive than try 1, but the same mark-character fault.
3. **Speckle over every facade**: small pale blue-grey flecks and rust-orange dots scattered over the lit gable and
   the ranges. The orange dots look like spatter; the blue flecks look like paper holes in the shadow glaze. Noise at
   normal viewing size.
4. **Long straight opening lines that do not sit on paint edges**: verticals down the tower and wing (x ~ 180, 285,
   950 in sheet pixels) running 400-500 px, and contour lines beside the arches that sit a few mm off the paint.
   They read as a traced overlay rather than a drawing the washes followed.
5. **Diagonal pale streaks across the upper gable** (the wash lanes of the first ground pass), still visible at the
   finish.
6. **The bottom fifth dissolves**: the street, the base of the right wing and the area round the doors break into white
   blotches; the right low wing is washed out; the tree is an ochre-olive mottled blob rather than a yellow-green crown.
7. Lesser: the arched windows are solid dark masses without the pale tracery; the rose window, the small spire left
   of the tower and the crenellation of the right tower are missing; the left tower top is mottled.

## At which stage it went wrong

- Opening drawing (before any wash): the ruled window boxes and the long unsupported verticals were already in the
  drawing. A plan fault, not a painting fault.
- Ground passes (10% strokes): the first wash was laid in diagonal lanes that left pale streaks over the gable.
- Mid layers (25% to 50%): the shadow sides arrive as many separate small islands of the mid layers; by 50% the mottle
  is established. The shadow tone is built from several small shapes per band instead of one glaze per face.
- 75% to 100%: almost no change in form; the late passes added small dark and pale flecks. The touch-up, though reduced
  from try 1, still adds speckle without adding structure.

## My scores

- Finished painting: **4 / 10.** Better colour than try 1 (no olive shadows, a calmer sky), but the ruled window boxes,
  the mottled shadow sides and the speckle are what one sees first, and they are the opposite of "precise
  architectural".
- Process plausibility: **3 / 5.** The order is a painter's order and the first stage is a tinted drawing, but the mid
  stage arrives as patches, and the second half of the strokes changes little except adding flecks.

## After reading FEEDBACK.md: where I agree and disagree with the judges

Judges' finished scores: Kimi 4.0, GLM 3.0, Qwen 4.0 (vision overall 3.67; composition/values 5.67, edges/detail 3.0,
marks/texture 2.0); classic value 6.25, edge 9.58, marks 7.29; composite 5.69. Progress judge: 3.0, 2.0, 2.5, 2.0, 5.0
(mean 2.9), 1 of 2 found the order human. My own 4/10 and 3/5 are in line with them.

Agree:

- **Marks/texture 2.0.** The mottle and speckle are the dominant defect, matching my points 2 and 3. In the compile
  I found the cause: the two shadow glazes are cut into ~114 shapes per pigment, ~89 of them small islands.
- **Edges/detail 3.0.** Fair. The placement is right (classic edge 9.58), but the ruled window boxes and the
  off-register opening contours are edge faults of my own making.
- **"Fine detail already present in the first 25%" (4) and "line work perfectly formed from the start".** Yes. The
  opening was dark sepia ink, so every stage shows the finished linework under the washes, and the stages look like the
  final image at rising opacity. That is a drawing-medium choice I made in try 2 on purpose; it was wrong.
- **"Speckle or dotted trails instead of drawn lines" (2), "spatter-like texture dump".** Yes: the flecks and the
  orange dots, plus the dotted edges of the many small glaze islands.

Disagree, or only partly, and why:

- **"Whole sheet at one faint value, as if faded in" (4).** Partly. It is real in the mechanism: each light-band
  pigment pass covers the whole sheet, so the first ~9 passes are successive full-sheet tints. But a pale unifying
  wash is a normal first move for a painter, and the answer is not to skip it or paint darks first (that breaks
  light-to-dark, the core of the technique). I answer with a pencil lay-in under it, so the first stage reads as
  drawn, then washed.
- **"Texture arriving as a dump, everything sharpening at once late" (2).** Only partly. Some flecks did arrive late,
  but the late sharpening is mostly the closing ink and the dark glass, which is the right order for architecture
  (dark recesses and ink last). I keep the reduced touch-up and the closing ink.
- **100% stage 5.0 against the finished painting's 3.67.** The progress judge rated the last frame "unmistakably a
  person's painting" while the finish judges rated marks 2. Both are noisy; I give neither number weight on its own and
  go by the specific faults that I can see and trace to a cause.
- **Composition/values 5.67.** About right: the composition is correct, but the left range and the shade wing are
  darker and blotchier than the target, so "values" is a mid score.
