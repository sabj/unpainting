# Self-review of try 2 (Hills, V5), written before reading FEEDBACK.md

Looked at: `bench/feedback/previous-painting.png` (native 1224 px, plus a 600 x 450 native crop of the centre),
`compare.png`, `stages.jpg`, the target upscaled to 1224, and the try-2 plan and checkpoints.

## What works

- The composition reads at thumbnail size. You can see the tan S-path in the centre, the upper-left path, the lit
  lower meadow, the top-right slope and the right diagonal band, all in about the right places.
- White paper, with no pink tint. The paths are painted tan, not cut out (the `_cur` + `--paperlights 0` fix from
  try 1 held).
- No sheet-sized wedge and no straight seam from a single fitted gesture. The first wash covers the sheet.
- Ink is present at both ends: an opening sketch in the early frames and closing sepia rims where wood meets meadow.

## What is wrong (largest first)

1. **The main value split is lost.** In the target, the woods are a connected dark-mid teal / blue-green mass
   (value about 3 to 4 of 5) and the meadows are light acid yellow-green (value 2). In the painting, the ground
   between the woods' dark islands is a light-mid olive-khaki, almost the meadows' value. So the woods read as navy
   blotches floating on a khaki field, not as a dark mass with lit crowns. This is the biggest failure: it flattens
   the hills' structure (meadow slopes cutting through dark woodland).
2. **The woods are camouflage, not oak crowns.** Flat slate-navy islands with hard scalloped rims, pale holes, and
   burnt-sienna/rust flecks scattered through them. The target's crowns are rounded clumps: lit grey-green tops,
   teal bodies, blue-black undersides, a soft broken top edge and a darker bottom edge.
3. **Meadow colour is olive/khaki-yellow, not acid yellow-green.** The faint vertical lane seams and block tones from
   the band-1 grid (passes 3 to 14) still show in the lower meadow.
4. **Ink reads as a tracing, not loose ink.** The closing lines are uniform, wiry black curves. Several are isolated
   hooks and loops in the open meadows (lower right, top right) that follow no visible edge. The woods, where a loose
   ink-and-wash painter would put the pen (crown scallops, trunk ticks, shadow scribble), get almost none.
5. **The white seams are missing.** The target's thin white paper seams between meadow and wood are its sparkle, and
   they are mostly gone. The paths lack their bright inner light and merge with the beige meadow.

## At which stage it went wrong

- **Passes 3 to 30 (the light band and first mids):** the painter's own segmentation put about 79% of the sheet in one
  region, and `_spl6` lane strokes take one charge per lane stroke. So the base everywhere became the mean of meadow
  and woods: olive. That is where the woods/meadow value split was lost, and nothing later could restore the meadows'
  acid light (watercolour cannot go lighter).
- **Passes 30 to 100 (mid and dark bands plus touch-ups):** the woods were built from many small, separately dried
  value islands (100 passes, 10,648 strokes). Each one left a hard rim, which gave the patchwork and camouflage.
  Burnt sienna in the box added the rust flecks.
- **Planning, closing ink:** I chose the lines to pass the painter's contrast filter (wood/meadow rims). That produced
  outline-like curves in the wrong places, not value-led pen work in the woods.

## Progress (how plausibly it was painted)

The stages go light to dark, which is right. But the 10% frame is a pinkish, blotchy tint with isolated pen
squiggles. The 25% frame is grey-blue islands on a pale ground. At 50% the sheet turns olive all at once, and from
75% the navy blotches arrive. A person would put in the yellow-green meadows and a connected woods wash early, then
model the crowns. Here the island-by-island build and the lane seams look mechanical.

## My scores

- Finished painting: **3.5 / 10**. The layout reads, the paper is white and the paths are painted. But the value
  split, crown modelling, meadow colour and ink character are all wrong for this target.
- Plausibility of the process: **2.5 / 5**.

## After reading FEEDBACK.md: where I agree and disagree with the judges

Judges: GLM 4.0 overall (composition/values 4, edges/detail 3, marks/texture 4), Qwen 3.0 (4, 2, 2; spread 1.5 over
five calls). The third judge failed (spend cap), so the composite is null. Classic metrics: value 6.35, edge 9.13,
marks 9.2. Progress judge: 1.5, 1.5, 2.0, 2.5, 3.5 (mean 2.2), and 0 of 2 judges found the order human.

Agree:
- **"The whole sheet at one faint value, as if faded in" (named 6 times)** is the main progress tell, and it is right.
  I traced the cause in the planner (`src/paint/experimental/light-to-dark.mjs`): with one style on the whole sheet
  and the base's `layerhue`/`skysplit` grouping, each light pass was a single 79%-of-sheet shape, one pigment at a
  time. So each early frame was a uniform tint over everything, in lockstep. This is the same mechanism that made the
  base olive (my point 1), so the progress tell and the finished-painting failure share one root.
- **"Pinkish washes not present in the target"**: agree. Quinacridone rose was in the fitted box, and its light pass
  went over the whole sheet early.
- **"Straight rectangular seams" / "pixel-grid or stair-step fill"**: agree. These are the 30 mm lane-block grid of
  passes 3 to 14, before revision 1 set `--strokemm 300`.
- **Overall 3.0 to 4.0**: close to my 3.5.
- The note that **"the contour lines sensibly describe the path and terrain"**: agreed, so I keep the opening sketch,
  pruned of its stray loops.

Disagree or only partly agree:
- **GLM's marks/texture 4.0**: I disagree. The camouflage woods with rust flecks are the worst feature of the
  painting. Qwen's 2.0 matches my reading. The panel is two small models with one spread at 1.5, so I weight this
  little.
- **"Texture arriving as a dump between 50% and 75%"**: only partly. Darks last is the right order, and I keep it.
  The dump looked sudden because the woods had no mid-value base of their own: navy darks landed on an olive ground
  shared with the meadows. The fix is a woods-only base that darkens in steps (pale base, two mid layers, then the
  glazes), not earlier darks.
- **Classic edge 9.13 and marks 9.2**: these measure pixel agreement and reward blur (skill section 9). They are not
  evidence that the edges or marks are good.
- **Composition/values 4 from both judges**: the composition is right, but the values are not. The woods/meadow value
  split, the plate's main structure, is weak. The judges did not mention colour (the olive meadows), which I still
  rank as a top failure.
