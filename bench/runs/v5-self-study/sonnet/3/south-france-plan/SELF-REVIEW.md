# Self-review of V5 try 2 (written before opening `bench/feedback/FEEDBACK.md`)

Looked at: `previous-painting.png`, the target (enlarged to 1216 px), `stages.jpg`, my own try-2 `PLAN.md` and checkpoint
log. Not yet read: `FEEDBACK.md`.

## What works
- **The houses on the right.** The terracotta roofs, tan walls and the pen outline (roof ridges, corners, windows) read as
  a village group, in about the right place and proportion. This is the one part that looks like "pen plus wash".
- **Cypress flames, top left.** Dark, tall, in the right place, with a thin pen edge. Recognisable.
- **The opening stage and the first wash.** 10 % and 25 % frames: a pen sketch on bare paper, then pale ochre patches with
  lots of paper showing. A person could have done that.
- **The pen is now visible** (try 1 had hairlines that dissolved into dots).

## What is wrong
1. **Colour and value of the foliage, which is 70 % of the sheet.** It is a camouflage mosaic of olive and khaki with hard,
   cut-out edges. The target is a lively mix of yellow-green, blue-green, grey-green and warm ochre with a clear light
   side and dark side. Mine has one hue and one mid value. Almost no light-green, almost no cool grey-green.
2. **The pine, bottom left, is the biggest and brightest mass in the target and it is dark olive in mine.** The pale
   yellow-green crown never separated. It reads as another bush.
3. **The path down the centre is a pale blue-white strip with straight, parallel diagonal edges** (and a ripple texture
   in it). In the target that is a warm ochre path winding between olives. The straight diagonal sweeps are a mechanical
   tell; no hand makes parallel-edged bands across a sheet.
4. **White holes in the wrong places.** The top-left terraces (ochre walls in the target) and patches on the left are bare
   white, so the sheet looks half finished and spotty rather than lit.
5. **Blue-black blotches in the centre** (x 480-740, y 380-720 in the 1216 px sheet). They do not correspond to a clear
   dark in the target and look like ink spills.
6. **The pen on the foliage** is worm-like closed contours round blobs. It does not describe leaf masses, trunks, steps
   in the terrace walls. Pen is thin everywhere and the closing pen added nothing visible (the plan itself recorded 0.11 %
   of pixels changed).
7. **Edges.** Every foliage shape has the same stepped, hard, wobbly edge, and the shapes are similar in size. No soft edge,
   no lost edge, no variety.

## At which stage it went wrong
- Opening and first wash: fine.
- **Between the 25 % and 50 % frames (passes ~3 to 23):** the whole sheet is suddenly covered by a sage-grey wash laid as
  broad diagonal bands. This is where the "painted by a machine" look starts, and the centre strip is born here.
- **Mid layers (passes 23 to 44):** blobs with hard edges stack up; no hue shift, so it just gets darker olive.
- **75 % to 100 %:** two nearly identical frames. The last third of the strokes only darkens things already there. Reads as
  "finished at 75 %".

## My scores
- Finished painting: **4 / 10.** (My try-2 note said 5; on a fresh look next to the target I think that was generous: the
  colour is wrong over most of the sheet.)
- Plausibly painted: **3 / 5.** Good start and a human-looking early stage; the middle is a whole-sheet wash with straight
  bands; the end is a flat mosaic.

---

# After reading `bench/feedback/FEEDBACK.md`

## What the judges said (short)
Finished painting: GLM 4.0 and Qwen 4.0 (composition/values 5 and 6, edges/detail 4 and 3, marks/texture 4 and 3); classic
value 6.06, edge 9.17, marks 7.06; the composite is null because the third panel judge (Kimi) failed on a spend cap, so
that says nothing about the painting. Progression 3.5 / 2.5 / 1.5 / 2.5 / 3.0 at 10 / 25 / 50 / 75 / 100 % (mean 2.6, 0 of
2 judges found the order human). Tells: straight travelling front or raster sweep (3), whole sheet at one faint value (2), no
change from the previous snapshot (2), texture arriving as a dump late (2), fine detail already in the first 25 % (2),
flat slabs (1), a region finished beside untouched paper (1).

## Where I agree
- **The diagonal bands and the travelling front (25 % and 50 %) are the worst fault, and they are the same thing I saw as
  "a pale blue-white strip with straight parallel edges".** I scored the finished picture 4 and the process 3; the judges
  give 4.0 and 2.6. The 50 % stage at 1.5 is lower than I felt but I agree it is the worst stage: it is where the whole
  sheet is veiled by one sweep, with finished houses beside it. I traced the cause in the code this time:
  `--skylanes` in `tools/paint-plate.mjs` (line ~3406) lays any large plane that reads cool (blue over red by 10) as
  overlapping parallel lanes, and `--skyblue` moves the blue of the same cells to a granulating tube (the ripple texture).
  **Correction made while painting this try:** I first guessed the bands came from sky lanes (this crop has almost no sky,
  and the pale central path might read as "cool"). I switched sky lanes and the sky-blue tube off (`_noslane`,
  `--skyblue 0`), painted the first three passes, and the straight diagonal bands were still there. So that guess was
  wrong, or at most a small part of it. The real mechanism, from the comment in `src/paint/experimental/shaped-marks.mjs`
  (lines 7-8) and the header of `stroke-plan.mjs`: without lanes, a large plane is laid as "one fitted diagonal gesture"
  along its principal axis, as wide as the shape, with straight sides that "left wedges and streaks". With seven pigments
  each laid over about 80 % of the sheet at the lightest step, that is a sequence of giant straight-sided diagonal wipes:
  the "raster sweep" the judges named. The painter's own alternative is `--strokeplan` (token `_spl6`), which lays a
  passage as overlapping brush lanes cut into strokes, with `--washreach` letting a wash end where its stroke ends instead
  of on the mask outline (token `_wre15`).
- **"No change from the previous snapshot" (75 % to 100 %) and "whole sheet at one faint value".** Both match my own
  stage notes. The `urban-sketch` style has weights `[1,0,0,0,0]`: everything is in the first wash. My foliage families
  were on the precise ladder, which helped, but the village and the rest were not.
- **Marks/texture and edges are low (3 to 4).** I agree: hard stepped blob edges, all alike.

## Where I disagree, or only partly agree
- **"Fine detail already present in the first 25 %".** Partly. The pen first is how an urban sketch is made and the 10 %
  stage got the best score (3.5), so I keep a sparse pen opening. What I accept: the first drawing carried 143 foliage
  contours as well as the structure. Those can come last. A late pen also gives the 75 % to 100 % frames a real
  difference (the closing pen added 0.11 % of pixels last time, which is why those frames were identical).
- **Classic edge 9.17.** Not evidence of good edges; I see stepped, cut-out edges. Not tuned to.
- **The judges say nothing about colour.** I still think the drab one-hue olive foliage and the dark pine are the largest
  fault in the finished sheet, so I keep working on the palette even though no judge named it.
- **A "dark-to-light build is believable" note** is the opposite of what the painter does (light to dark); the judges are
  noisy and one note is no guide. I do not read anything into it.
- **Scores are noisy** (half a point on identical images, half agree with a human). I act on the points that two judges
  and my own review share (bands, no change late, faded whole sheet) and not on single notes.
