# Self-review of try 1 (Hills, loose ink and wash)

Part 1 was written from looking at `previous-painting.png`, `compare.png`, `stages.jpg` and my own try-1 plan files only.
`FEEDBACK.md` had not been opened when this part was written. Part 2 (below the line) comes after reading it.

## What works
- Composition and value layout are recognisable: the big dark mass right of centre, the dark bottom-left, the two light
  track curves and the lit grass wedge are all in about the right places and at about the right value.
- The tracks stay as clean light shapes with crisp edges; no green wash soaked into them.
- The lower-right meadow is one connected wash with a few lighter patches, which is the right idea for grass.
- The sequence of stages is at least in the right order: pale first, darks last (10% -> 25% -> 50% -> 75%).

## What is wrong
1. **Colour of the grass.** The target grass is a vivid yellow-green (lime). Mine is a dull olive/khaki, especially the
   lower meadow and the wedge. It reads as dried grass, not sunlit grass. This is the biggest single miss.
2. **A grey-sage blanket over everything.** The canopy area is covered by a flat greyish green mid-tone with navy blotches
   on top. The target's canopies are blue-green with varied olive lights and many small leafy clumps. Mine looks like
   camouflage: large polygonal patches with hard cut-out edges, not clumped foliage.
3. **Holes and fringes.** The right-centre canopy has large paper-white holes and orange/pink halos round the dark blobs.
   The target has small white flecks, not blown-out holes, and no pink rims. These look like artefacts, not watercolour.
4. **Tracks are bare white.** In the target they are pale peach/ochre. Plain white paper reads as a hole in the picture
   rather than a dirt track.
5. **The ink is almost absent and arbitrary.** About 16 thin lines, a few long diagonals and two floating scalloped crown
   outlines. They do not sit on the painted edges, so they read as stray marks, not as a pen drawing under and over a wash.
   For a "loose ink and wash" brief this is a weak ink layer: no trunks, no branch marks, no clump edges.
6. **Scale of the dark shapes.** The dark blobs are 3-5x larger than the target's leaf clumps and carry no internal
   structure, so the forest looks like a map, not trees.

## At which stage it went wrong
- **Stage 1 (10%)**: the first wash was one flat grey-green sheet over grass and canopy together. Everything after was
  glazed over that grey, so the grass could never get back to lime and the canopy mid-tones stayed flat. This is the root
  cause of points 1 and 2.
- **Stages 25% to 50%**: the dark canopy shapes arrive as large patches (point 6) and the white holes/halos appear
  (point 3).
- **75% to 100%**: almost nothing changes; the last quarter of the strokes adds little, so the painting does not "finish"
  in a visible way. The closing ink is too sparse to rescue it.

## My scores
- Finished painting: **3 / 10** (layout right, colour and foliage character wrong, ink layer weak).
- How plausibly it was painted: **3 / 5** (the order is believable and the early washes look human; the flat grey blanket,
  the blown-out holes with pink halos and the unchanging last quarter look machine-made).

---

# Part 2 (after reading FEEDBACK.md)

What the feedback says: composite 4.96. Vision panel 2.67/5 overall (Kimi 2.0, GLM 3.0, Qwen 3.0): composition/values
3.67, edges/detail 2.33, marks/texture 1.67. Classic metrics: value 5.48, edge 9.06, marks 7.18. Progression judge: 1.5, 2.0,
2.5, 2.5 and 5.0 at 10/25/50/75/100% of strokes (mean 2.7). Tells: whole sheet at one faint value as if faded in (5),
a region arriving finished beside an untouched one (4), speckle/dotted trails instead of drawn lines (2), texture
arriving as a dump late (2), fine detail already present in the first 25% (2), dark before light (1). Zero of two
judges found the order of work human.

## Where I agree
- **Marks/texture is the weakest score (1.67) and the largest blobs are the cause.** This matches my points 2 and 6: the
  canopy is big smooth polygons, not leaf clumps. I checked the planner: layer shapes are smoothed at 2 mm
  (`--layersmooth` default) and merged to a floor of about 180 cells at 1224 px, which is roughly 3 mm across. A clump in the
  target is 0.5 to 1.5 mm. This is a setting I control, so it is the first thing I change.
- **"Whole sheet at one faint value" (named 5 times).** This is my stage-1 finding. I traced it into the planner: every
  cell gets a pale band-1 foundation weight (`light = min(.28, .085/v)`), so the first wash covers 99.8% of the sheet
  as one sage-grey. I cannot remove that, but I can stop it being so grey (see colour, next point).
- **Colour.** The judges do not say this in as many words, but "edges/detail 2.33" and the progression notes fit what I
  saw: the painter's palette for the previous try was only hansa yellow, cerulean and quinacridone rose (plus a second,
  granulating cerulean assigned to 23.7% of the sheet because the painter's sky-blue step treats blue canopy cells as
  sky). Rose in the glazes gave the orange/pink halos; no real green gave olive grass. Both are settings I control.
- **Dump late / nothing changes at the end.** Bands 4 and 5 (the two dark glazes) arrive in the last passes and carry most of
  the contrast, which matches "texture arriving as a dump". Partly mine: I used `_lay3` and made the mid bands thinner.
- **Speckle instead of drawn lines.** The speckled white fringe at 10% and the blown-out holes are the same artefact I
  listed as point 3.

## Where I disagree or discount
- **Classic edge 9.06 and classic marks 7.18.** I do not trust these. They are pixel-statistics scores and the skill
  file says never to judge by pixel error. A painting of hard-cut polygons scores high on "edge" because the edges are
  crisp, which is exactly the fault I see. I will not tune toward them. Likewise classic value 5.48 looks fair, and
  composition/values 3.67 is about what I would give for the layout.
- **"Fine detail already present in the first 25%" (2 mentions).** This is probably the opening ink. A painter drawing
  first is normal and the brief itself asks for ink; I will keep an opening drawing, but fainter (pressure 0.35, not 0.45),
  so it reads as a pencil-weight sketch and not as finished detail.
- **"Dark before light" (1 mention).** Not true in the plan: the stage frames go pale then dark. I read it as noise (the process
  judge varies by about half a point on identical images) and do not act on it.
- **The 5.0 at 100%.** The final frame is the finished painting, so it says nothing about process; the mean of 2.7 is
  inflated by it. The honest number is about 2.1 over the first four stages, which is worse than my 3/5.
- **Overall vision scores of 2 to 3.** I put it at 3/10; the panel's 2.67/5 is a similar level, so I do not disagree on
  the level, only on what to change: the judges give no cause, and I found mine by reading the planner and the
  compile preview.

## What this means for the plan
Fix colour first (real greens, no rose, no sky-blue tube), then clump scale (finer shapes), then the ink (edge-following
contours drawn from the target's own value edges, with many more closing fragments), then pace (keep four mid layers, lighter
opening pencil). I could not change the sheet-wide band-1 foundation; I will watch the first looks for it and use revisions
if the first washes still read as a uniform fade.
