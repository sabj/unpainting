# Self-review of the try-2 painting (written BEFORE opening bench/feedback/FEEDBACK.md)

Looked at: `previous-painting.png`, `compare.png` (target | painting), `stages.jpg` (10/25/50/75/100% strokes) and the target.

## What the target is
A hillside seen from above: bright lime / yellow-green grass slopes with soft mown-looking texture, two pale pinkish-tan
dirt tracks winding down through them, and the rest is clusters of dark blue-green oak crowns (some with visible trunks and
forked branches, e.g. the big tree left of centre). Lights = grass and the tracks. Darks = tree crowns, strongly blue. Value
structure: light grass shapes cut by a dark, busy tree mass; a few mid-green tree tops in between.

## What works
- The big composition is right: tracks at the right places, grass slopes in the right places, the dark tree mass at the
  right and lower-left, the light-to-dark order of the stages is believable (pale wash, grass, then darks last).
- Paper is left white in a few places; the dark right-hand tree mass reads as a dark mass.
- A few black ink lines sit on the edges of grass and track.

## What is wrong
1. **Colour of the grass.** Target grass is a bright, warm lime-yellow green. Mine is a dull olive / khaki. It is the main
   light shape of the picture and it is wrong in hue and too dark and too uniform. Painting looks muddy, not fresh.
2. **Tracks are blank white paper.** In the target they are a pale warm tan / peach, i.e. painted pale planes. Stark white
   holes pull the eye and look like missing paint, not like a path.
3. **Tree masses are camouflage.** The trees come out as hundreds of small, hard-edged grey-green and navy patches with no
   crown structure (round tops, a lit upper side, a dark underside, trunks). The mid-grey-green mush covering the whole left
   half has no value contrast; the target has a clear dark / light rhythm there. It reads as a camo or a terrain map, not
   as loose ink and wash.
4. **Ink is almost absent and in the wrong place.** About 20 short black contours on grass edges and nothing in the trees
   (no trunks, no branches, no crown accents). For a "loose ink and wash" picture the ink should carry the drawing; here
   it reads as a few stray outlines added at the end.
5. **First wash is a grey-teal cast** over the whole sheet with a hard diagonal front (10% frame). It colours everything
   a cool grey, which is why the greens never get fresh afterwards.
6. **White blow-outs** among the right-hand trees (paper holes with ragged edges) look like unpainted gaps, not as sky
   or light.

## Stage where it went wrong
- Stage 1 (first wash): wrong, grey-teal over everything. Grass hue was never recovered.
- Stage 2 (grass passes): right shapes, wrong colour, flat.
- Stage 3-4 (darks): lots of equal-sized patches, no crown structure. This is where the "camouflage" appeared and it was
  never fixed by the ink.

## Own scores
- Finished painting: **3 / 10** (right layout, wrong colour, no tree structure, no ink drawing).
- How plausibly it was painted: **3 / 5** (the ladder from pale to dark is plausible; the patch-by-patch trees and the
  hard-edged white holes are not what a person does).

---

# Part 2 (written AFTER reading bench/feedback/FEEDBACK.md)

What the feedback says. Finished painting: the composite is null (the third vision judge, Kimi, was never called: spend
cap), so only two judges count: GLM 4.0 and Qwen 3.0 out of 10, with composition/values 5 and 4, edges/detail 3 and 3,
marks/texture 3 and 2; classic value 5.5, edge 9.35, marks 7.11. Progression judge: 1.5, 1.5, 1.5, 2.0 and 4.5 out of 5 at
10/25/50/75/100 % of strokes (mean 2.2, and 1.5 for the first two stages); tells: cut or scalloped wash edges and round
holes (5), whole sheet at one faint value as if faded in (4), speckle or dotted trails instead of drawn lines (3), texture
arriving as a dump late (2), flat slabs (1); 0 of 2 judges found the order of work human.

## Where I agree
- **Finished score level.** 3 to 4 out of 10 is where I put it (3), and "edges/detail 3, marks/texture 2 to 3" matches my
  points 3 and 4: camouflage patches and no real ink drawing.
- **"Whole sheet at one faint value, as if faded in" (4 mentions).** This is my own stage-1 finding. In try 2 I could see
  the first wash was a grey-teal sheet over everything. After reading the planner I know why: the canopy families were
  painted in `ink-and-wash`, whose weights put almost all of a cell's colour into the first wash. So the cause is a
  setting I control (family styles), and I change it.
- **"Cut or scalloped wash edges, round holes" (5 mentions, the top tell).** Same as my point 6: ragged paper-white holes
  in the right-hand trees and cell-shaped scalloped patch edges. My best reading of the code is that the planner holds every
  cell whose total pigment is under 0.06 as paper (`--whitefloor`); that would explain the white tracks, but I have not
  confirmed it explains the holes in the trees, so lowering it is a bet and I will check the first looks. The scallops
  come from the many small equal patches; the nested layers and finer shape floor address them but I cannot claim to have
  fixed them until I look.
- **"Speckle or dotted trails instead of drawn lines" (3 mentions).** My ink was 21 scattered hooks. I agree it does not
  read as a pen drawing, which is my point 4.

## Where I disagree or discount
- **The 4.5 at 100 %.** The last frame is the finished painting; it says nothing about the order of work, and it
  lifts the mean. The honest process level is about 1.6 over the first four stages, lower than my 3/5, so I was too kind
  to my own sequence: a frame-by-frame look shows the whole sheet washed at once with no sparse early stage.
- **Classic edge 9.35 and classic marks 7.11.** They are pixel statistics and reward crisp polygon edges, which is the
  fault I see. The two vision judges (4 and 3) match my review, so I do not tune toward the classic numbers.
- **"Flat evenly-toned slabs standing in for a form" (1 mention).** A single mention, and my stage frames show nested
  patches rather than slabs; I treat it as noise.
- **The judges give no reason for the finished painting.** The grass colour (olive, not lime), the white tracks and the
  missing trunk are things only my own look found; the feedback does not mention them and I act on them anyway.

## What I take into the plan
1. Fix the cause of the faded-in first wash (family styles) and keep the pen visible through the global style.
2. Fix colour: no burnt sienna, lighter mids, tracks painted thin ochre instead of left as paper.
3. Draw the ink at pen length from the target's own edges, with the oak's trunk and limbs, and a heavier opening.
4. Look at every early stop and measure grass and canopy boxes against the target; revise the remaining passes if the
   first frames still read as a uniform tint.
