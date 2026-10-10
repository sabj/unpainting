# Self-review of V5 try 1 (Trumbull), written before reading FEEDBACK.md

Sources: `bench/feedback/previous-painting.png`, `compare.png`, `stages.jpg`, 600 px native crops of the left range and
the gable (`bench/looks/prev-crop-*.png`), the previous plan and checkpoint log.

## What works

- Composition and landmarks are where they belong: the gable and its ridge, both towers, the roofline, the lancet row,
  the two big arched windows, the window grid of the right range, the navy sign, the traffic lights, the tree.
- The lit gable is the lightest built plane and reads as warm sunlit ochre with sparse horizontal block hints. At native
  size it is the best part of the sheet: broken coursing, warm and cool variation, not a flat fill.
- Window glass is dark blue in pale frames; the hierarchy "darkest = glass, signs" is right.
- Overall mean value is close to the target; the progression goes light to dark.

## What is wrong (worst first)

1. **Mottled shadow sides (camouflage).** The left range, the shaded wing left of the gable and most of the right range
   are covered in overlapping small brown, olive and grey-blue blobs with pale flecks between them. Nothing in the
   target looks like that: the target's stone is coursed in horizontal bands with one shadow tone per face. This is the
   single biggest defect, and it is a mark-character failure (stamps, tiled patches), not a value failure.
2. **Olive-green shadows.** The strip right of the left tower and the inside corner right of the gable are an olive
   green band. The target's are warm brown-grey. Green belongs only to the tree and shrubs.
3. **Pale halos round the windows.** Every lancet and many range windows sit in a light rim a few mm wide, then a
   dark contour line. It reads as cut-out shapes with an outline, not windows set into stone.
4. **Sky broken into torn fragments.** Hard-edged blue islands with many white tears across the whole top, especially
   left of the gable and around the left tower; the target is one soft graded blue with one soft cloud at top right.
   The sky is also more saturated than the target.
5. **Diagonal paper scratches across the gable** (white streaks from the ground wash lanes), and scattered white/grey
   specks over the facades: noise.
6. **Bottom edge**: the street and the base of the right wing dissolve into white blotches; the right lower wing is
   washed out with an orange blob (the tree reads ochre-orange, not yellow-green).
7. Lesser: rose window and left spire missing; some ink contours sit off the paint edges and read traced.

## At which stage it went wrong

- Ground (passes 1 to 16): diagonal lanes left paper streaks; the sky was laid as fragments with white tears. Visible
  already at 10% strokes.
- Mid layers (to ~pass 64): stone still clean but too light in the shadows (darkgain 1.4).
- The decisive failure is the end: the touch-up grew to 18 passes and ~8000 extra strokes (more than half of all
  strokes) of small corrective marks because the main ladder had left the shadows too light. That is where the mottle,
  the olive patches and the specks come from. The 50%, 75% and 100% stages look almost the same, so the second half of
  the strokes added noise, not form.

## My scores

- Finished painting: **4 / 10.** Correct drawing, palette and values on average, but the dominant impression at normal
  viewing size is blotchy camouflage over the stone and a torn sky, which is the opposite of "precise architectural".
- Process plausibility: **3 / 5.** The order (drawing, pale wash, mid, darks) is a painter's order, and the first stage
  reads like a tinted drawing. Against it: ragged white holes in the first wash, a mid stage made of patches, and a
  second half that barely changes the picture while laying thousands of small marks.

## After reading FEEDBACK.md: where I agree and disagree with the judges

Judges' finished scores: GLM 3.0, Qwen 2.0 (composition/values 5 and 4, edges/detail 2 and 2, marks/texture 2 and 2);
classic metrics value 6.24, edge 9.49, marks 7.19. Progress judge: 1.5, 2.0, 2.5, 3.0, 4.0 (mean 2.6), 0 of 2 found
the order human. The third vision judge failed (spend cap), so the finished score rests on two small models.

Agree:

- **Marks/texture 2.** The mottle is the dominant defect; this matches my point 1 exactly.
- **"Cut or scalloped wash edges, round holes" (named 4 times).** Yes. I traced it to a cause in the code: the base
  `_rcl` (`--recessclean 1`) zeroes the first wash on every window cell, so every window starts as a hole cut in the
  facade wash (visible at 10%), and later ends as a dark shape inside a pale rim (my point 3). The paper-light reserves
  in the sky (hard edged, `--paperlights`) add the torn sky holes.
- **"Texture arriving as a dump, late" and "speckle".** Yes: the touch-up laid ~8000 of the 14123 strokes after the
  main ladder, as many small per-shape corrective glazes. That is both the late dump and the speckle.
- **"Flat evenly-toned slab" at 10%.** Partly: the first stage is one beige value over the whole building with holes.
  A pale overall wash is a normal first move, but a wash that already avoids every window is what makes it look like a
  mask over a finished image rather than a wash.

Disagree, and why:

- **Edges/detail 2.** Too low. Placement of the gable, towers, arches, window grid and signs is accurate (the classic
  edge metric, 9.49, agrees). The edge faults are specific (window halos, offset contours, torn sky), not a general
  lack of detail. I will fix those causes rather than add more line.
- **"The order of work is not human" (0 of 2).** The order was a painter's order: drawing, pale wash, mid planes,
  shadows, darks, closing ink. The judges reacted to mark character (holes, slabs, speckle dump), not order. So I keep
  the light-to-dark ladder and change what makes each stage look filtered.
- **"Whole sheet at one faint value, as if faded in."** I will not answer this by skipping the pale wash or painting
  darks first (`_dkf`): that would break light-to-dark, which the technique reference treats as the core of the craft.
  I answer it with a visible pen drawing under the first wash, washes that run over the windows, and fewer late marks
  so the strokes are spread over the real stages.
- **"A region arriving finished while its neighbour is untouched" (2).** I do not see this in the strip; the sky and
  building develop together. No change for it.
- Composition/values 5 and 4 for the finished piece undersell the value structure, which is close to the target on
  average; the shadow sides were too light until the touch-up, though, so I accept "values" as a mid score.
