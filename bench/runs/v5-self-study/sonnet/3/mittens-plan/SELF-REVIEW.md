# Self-review of try 2 (part 1 written BEFORE opening FEEDBACK.md)

Looked at: `bench/targets/mittens-crop.png`, `bench/feedback/previous-painting.png`, `compare.png`, `stages.jpg`, 600 px
crops of the man's face and the cat/man seam, and my own try-2 plan files and checkpoints (not the critique).

## What works
- Layout and landmarks hold: cat head upper left, man lower right, hair as the one big dark mass, most of the upper
  right and the cat's chest/muzzle left as bare paper. It reads as a light sketch, not a flooded sheet.
- Colour is much better than try 1. The cat patches are now actually orange and ochre, the hair is cool blue-black
  mixed with brown, not one sepia filter. Naming the pans was the right call.
- The man's eyes are the right size and place, with dark upper lids, brows and a mouth line; the man's face is the
  strongest part of the sheet at thumbnail size. The cat's dark upper lid and nose are in place.
- Progress order is a believable one (pencil eye outlines at 10%, pale warm washes, then hair and darks last).

## What is wrong
1. **The seam between cat and man is the worst thing on the sheet.** Along the man's left cheek (x about 600 to 650,
   y about 560 to 1000) there is a chain of dark brown and olive-green rectangular blobs, like a zip or stitching,
   and an X-shaped dark tangle at the bottom (x 500 to 650, y 850 to 1030). The target has a soft warm shadow there.
   It is a painted artefact, not an edge.
2. **Posterised, terraced islands.** Every wash is a stack of contour-line shapes with hard rims. The man's cheeks,
   the cat's face and the face outline show onion-ring bands. A watercolourist would have fewer, larger shapes with one
   soft edge each.
3. **The man's face is still a mask.** Flat bare-paper forehead and cheek with a scalloped hard edge against the hair
   and a tan rim down the right cheek. The target has soft warm modelling there: under the brows, around the nose, the
   right cheek and the jaw, and the stubble. The nose is a few faint blobs; the lips and the smile have almost no
   tone. The face needs mid-value planes, not nothing.
4. **Pen lines float.** On the man's viewer-left eye there are three or four thin arcs that do not follow the lid;
   the brow line floats above a brow wash made of orange-brown rectangles; the cat's chin/mouth curve reads ruled.
   Lines that miss the wash edge by a few pixels look traced, not drawn.
5. **Whiskers and fine lines are mostly absent.** "Fine lines" is half the brief. The target has dozens of long
   whiskers across the cat's muzzle, long ear hairs and wisps around the hair. I have a few short streaks.
6. **The cat's eye lost its green.** It is the focal point of the cat and the only cool-green note in the target;
   the iris is pale tan and the black upper lid is a heavy wedge. The orange mask between the eyes is a scatter
   of blobs instead of a band running down to the nose.
7. **Hair reads as camouflage spots.** Dark blue-black blobs with hard edges, no curl strokes, no wisps at the rim.
   The target's hair is ragged dry-brush with white flecks and a few flicked curls at the edge.
8. **Stray marks.** Grey-blue smudges at upper right (about (920,160) and (1060,320)) that belong to nothing.
9. **Lower cat body is a faint ghost** of pale orange strips; the target's chest has stronger vertical orange stripes.
10. **Too light overall.** Mid values sit in a narrow tan band; only the hair and the lids go dark.

## At which stage it went wrong
- First wash (10%): the whole silhouette of cat, man and hair is already there as one flat pale tan film. That is
  the "faded in" look and it started at the very first wash.
- Mid layers (25% to 50%): posterised islands accumulate; the seam chain of blobs appears around 50% to 75%.
- Pass 31 revision (`--darkgain 1.7`): fixed the hair luminance by measurement but made the hair darker in blobs,
  not in strokes, and did nothing for the face.
- Closing drawing: 36 lines authored, most of the closing lines were not drawn (4000 strokes in total, the closing
  lines are a small share); the ones that were drawn miss the washes (item 4).
- 50% to 100%: little changes except hair darkening; the last half adds few things a person would add.

## My scores for try 2
- Finished painting: **4.5 / 10.** Better colour and a correct layout; still posterised, a broken seam, a mask face,
  few fine lines.
- Plausibly painted: **3 / 5.** A real order and bare paper, but the first frame is already the whole picture
  faintly, and later frames mainly darken.

---

# Part 2 (written after reading `bench/feedback/FEEDBACK.md`)

## Where I agree with the critique, and why
- **Marks/texture 2.0 and edges/detail 2.5 to 3 (both vision judges).** Agree in direction: my own review had
  terraced rims (item 2), a mask face (3), missing fine lines (5) and camouflage hair (7). The composition/values
  scores (5.5 to 6) match mine: layout and landmarks were the strong part.
- **Progress judge: "the whole sheet at one faint value, as if faded in" (named 5 times).** Agree, and I can now say
  why from the code: in each value band every pan covers the same footprint, and the first band lays 16% of each cell's
  demand, so the first frames are a pale copy of the finished picture over the whole figure. I measured from my own
  checkpoints that 10% of the strokes was already pass 21 of 38, and that the touch-up passes laid 2844 of 3998 strokes.
- **"Fine detail already present in the first 25%".** Half agree: my opening drawing had both eyes outlined; that was my
  choice and is removed. The early whisker streaks are the painter's reserved paper, not my lines.

## Where I disagree, and why
- The numbers from the small vision models (3.0 and 4.0 overall against classic 7.58). They agree with a human expert
  about half the time, the classic marks score (7.17) contradicts their marks score (2.0), and the process judge
  moves about half a point on identical images; so I used the notes as direction only.
- "Hair lingers as a flat even blob through the middle stages" as a plan fault: it is the ladder's mid layers. I
  could not change that, only make the hair cooler and darker.
- "Only 1 of 2 judges found the order human": its own note says light washes first and darks and fine detail last "like
  a real watercolor pass order". I kept the order.

## What I found that neither critique mentions
- The painter drops a whole pen line if any point of it touches a protected light, and a closing line also needs a mean
  4-neighbour value contrast of at least .06 on the target planned at 1200 px (4x upscaled). At that width only 3 of my
  34 try-2 style lines pass. That, not the line shapes, is why try 2's fine lines were missing. See PLAN.md item 1.

## Review of the try-3 painting (after painting it)
- Works: layout and landmarks; clean lid, brow and nostril strokes with no floating arcs; the cat more orange than in
  try 2; the hair cooler (navy on brown) and about as dark as the target at its right edge (median 103 against 117);
  the palette fit is better; the sheet still has a lot of bare paper.
- Wrong: terraced contour rims everywhere; the man's face is still a mask (forehead and cheek one bare shape with a hard
  scalloped edge, little modelling around nose and mouth); no whiskers; hair as dark blotches, not curls; a
  yellow-olive tangle at the cat/man seam near the bottom (the hansa touch-up glaze over the dark brown blocks there);
  two faint stray grey-blue streaks in the upper right; the first frame is still a faint whole-figure silhouette (now
  with visible dry-brush sweeps).
- At which stage it went wrong: the first band (faded silhouette, inherent to the ladder); the touch-up round at the end
  (61% of all strokes, global darkening and the seam tangle); the pen layer is small because the painter's filter drops
  most fine lines.
- A decision I am not sure about: adding the touch-up round. It fixed colour but spent the late progress frames on it.
- Score for the finished painting: **5 / 10** (try 2: 4.5). Plausibly painted: **3 / 5**: a believable order with
  visible brush sweeps and a sparse early drawing, but the first frames are still a faded copy and the last half of
  the strokes is one corrective glaze.
