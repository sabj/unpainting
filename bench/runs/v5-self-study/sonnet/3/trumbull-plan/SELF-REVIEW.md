# Self-review of the previous try (try 2), written before reading FEEDBACK.md

Seen: `bench/feedback/previous-painting.png`, `compare.png`, `stages.jpg`, and the target. I had not opened FEEDBACK.md
or the previous plan files when I wrote this part.

## What works

- Drawing and big shapes are in the right place: the gable and its steep slate roof, the tower, the chimney block on the
  right, the sign, the tree on the right. The composition is recognisable at thumbnail size.
- Palette is right: warm ochre and sienna sandstone, grey-blue slate, yellow-green tree, a blue sky.
- The big value contrast is kept: sunlit gable face pale, left tower and left wing darker, roof and window openings
  darkest. The lit gable face has believable horizontal stone coursing in small rectangles.
- The tall pointed arch windows (two big ones and the narrow lancets in the gable) read as dark openings with a frame.
- The sign is a clean dark navy rectangle with its pale emblems, like the target.

## What is wrong

1. **Shaded stone is camouflage.** The left tower, the left wing and the pier beside the gable are covered in mottled
   brown, grey and dark blobs of equal size with hard edges. The target has long horizontal courses of stone with a
   few warm and cool bands. The painting has the value but not the structure, so it looks dirty and noisy, not like
   masonry. This is the biggest fault.
2. **Sky and paper whites are ragged.** The upper left sky is mostly bare paper with cut-out, jagged blue islands. The
   target sky is a continuous pale blue graded to white at the left, with soft clouds on the right. The white
   cutouts have hard, wiggly edges, like a stencil, not a cloud. The top of the tower is a brown mottled mess, and the
   pinnacle and the small spire at the left are lost.
3. **Confetti of white holes.** Speckles and white flecks across the right wing and the lower right, where the target is a
   continuous mid-tone sunlit ochre. The lower right and the ground read as torn paper.
4. **Ruled lines.** The pen lines include long, straight, thin black verticals (at about x=180 and x=490 of 1200, and
   the box around the chimney) that run through the stone like wires. They are the wrong kind of line: not a painter's
   structural line. They do not follow a visible edge for most of their length.
5. **Window blues too saturated, trim missing.** Several windows on the right are bright ultramarine; the target is dark
   grey-blue with pale stone surrounds. The pale limestone window surrounds and string courses (the lighter bands that
   make this a "precise architectural" picture) are absent, so the windows look like holes.
6. **Halos.** Light rims around dark shapes (arches, sign, windows): a ring of lighter wash left around each dark
   passage. It reads as a cell-scale artefact.
7. **Left edge and foreground.** The lower left tree and the street figures are dirty brown blobs. The traffic lights and
   the pole are readable but crude.

## At which stage it went wrong

- From `stages.jpg`: at 10% the sheet is a flat tan wash with a diagonal pale streak and the ruled lines already
  showing. It looks like a fill, but the pale-first order is right. At 25% the mottled patches appear and the sky
  cutouts are already ragged. From 50% on, each stage only adds more blotches; 75% and 100% are almost the same. So the
  fault is in the first wash and mid-value passes (the shape and size of the patches), and the late passes add speckle
  and saturated blue on top of that, and do not repair it.
- The progression does not look like a painter's: there is no moment where the large shapes are settled and then
  details are placed. It goes from "pale fill" to "mottled everything" with the structure (courses, trim) never
  appearing as its own step.

## My scores

- Finished painting: **4 / 10**. Right shapes and palette; noisy, mottled masonry, ragged sky, white confetti, ruled lines.
- Plausibility of how it was painted: **3 / 5**. Pale-to-dark order is right, but the marks are uniform blobs and the
  late stages look like the same thing repeated.

# After reading FEEDBACK.md

Scores given: composite 5.98; vision judges 4.0 / 4.0 / 5.0 (edges and detail 3.3, marks and texture 3.0, composition
and values 6.0); process judge 1.0, 1.5, 1.5, 1.5, 2.5 for the five stages (mean 1.6), 0 of 2 judges found the order
of work human.

## Where I agree

- **Finished painting, 4 to 5 out of 10.** My 4 sits close to the vision panel's 4.3. Their weakest criteria, edges and
  detail 3.3 and marks and texture 3.0, are my faults 1, 3 and 5: mottled masonry, white confetti, windows without
  trim. Composition and values 6.0 matches what I found right: the big shapes and the sunlit/shaded split.
- **Process "the whole sheet at one faint value, as if faded in" (named 6 times).** I agree, and I can now say why. In
  the planner (`src/paint/experimental/light-to-dark.mjs`) band 1 gives every cell a small share of its own fitted
  pigment (at most 28%, less on dark cells), so the first wash is a faint copy of the whole target, window holes
  included. Band 2 then arrives over the whole sheet at once. Last time I put that down to "the first band is always
  pale" and left it. That was too easy: it is pale, but it also has the final image's layout in it.
- **"Fine detail already present in the first 25%".** I agree. With `--recessclean 1` (base) every window is a bare
  hole in the first wash, so the windows, the sign and the arches are drawn as negative shapes in the very first
  frame. A painter washes over the window and darkens it later.
- **"Texture arriving as a dump, everything sharpening at once late" and "no change from the previous snapshot".** I
  agree with both. The windows, the shadow glazes, touch-up passes and 110 closing lines all come in the last band. By
  75% of the strokes nearly everything the viewer sees is already there.

## Where I disagree, or discount

- **"Classic edge 9.52, classic marks 7.2".** Those are pixel statistics. They gave a high score to a painting I and
  all three vision judges find blotchy (edges 3.3, marks 3.0). I did not tune for them.
- **The 1.0 and 1.5 for the early stages as a measure of the order of work.** The judge saw a strip, not the painting.
  Half a point of that is noise (the task says so). What I use is only the named tells, and I checked each against
  `stages.jpg`: all four are really there.
- **"A global dissolve/sharpen filter".** Not true; every stroke is a real brush pass in the stroke log. But the judge
  only sees the frames, and the frames do look like that, so the tell is a fair read of the images, not of the method.
- **Final-stage 2.5.** At 100% the judge gave more credit for a finished image. I do not trust it; the 50 and 75%
  frames are the same picture as 100%.
- **Judges did not mention the ruled lines, the halos, the white speckle on the right wing or the ragged sky cut-outs.**
  They are real (my faults 2, 3, 4 and 6). They are small next to the first-wash and texture problems in the judges'
  eyes, but they are what I see first in the finished image.

## What the critique, my review and the code together say to change

1. Make the first wash look like a first wash: one block with no window holes (`--recessclean 0`), and no scattered
   paper holes on the lit stone.
2. Make the later bands arrive more gradually (three mid layers, broader planes, richer mid-tone) instead of a faint
   fade and then a late dump of detail.
3. Calm the masonry: bigger minimum shape (`--minshapecells`), broader layer planes (`--layersmooth`).
4. Continuous sky instead of paper cut-outs: only true white cloud is held as paper (`_cur`), the sky is one layer (`_sk1`).
5. Pencil for the opening drawing instead of dark ink, so the first marks read as a painter's construction lines and
   do not show as wires through the finished wall.
6. Remove the diagonal pale streak (wash lane gaps): `--overlap` up from .15.
