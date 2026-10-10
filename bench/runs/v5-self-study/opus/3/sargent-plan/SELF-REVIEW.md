# Self-review: White Ships (Sargent), V5 try 2

Written from `bench/feedback/previous-painting.png`, `compare.png` and `stages.jpg` before reading `FEEDBACK.md`.
Try 2 recipe: `region_w13_lay2_ew8_dk11_cg11_lf_softs_ms300`, paints `ultramarine,cerulean,phthalogreen,ochre,sienna`,
cream `--paperrgb`, `--touchgain 0.8`, graphite opening, no closing drawing. 76 passes, 16,592 strokes, no revision.

## What works

- Composition and landmarks: the bow silhouette, its strong cobalt left curve, the hawse hole, the two round blocks
  at the upper right, the orange spar, the masts at the left and the anchor are all where the target has them.
- The cream paper at the upper right stays open, and the rigging diagonals cross it as pale blue strokes.
- Colour is cleaner than in try 1. Dropping sepia removed most of the grey mud on the hull's left half, and the cobalt
  edge reads as one curve.
- No ruled seam across the sheet (`_ew8` from the first wash worked).
- The order runs light to dark: pale tint, then shapes, then mids, then darks.

## What is wrong

1. **The hull is still a patchwork of cut-outs.** The target's bow is one airy pale cobalt body with a brighter
   centre and pale diagonal streaks. Mine is grey-khaki islands with blue islands on top, and every island has its own
   rim. The pale centre went khaki-grey. A fan of pale arcs in the middle of the hull (the soft-split clean-water
   arcs, I think) reads as a mechanical artefact, not as Sargent's streaks.
2. **Lower hull too dark and too blue-grey.** From about 60% height down, the hull and the area to its right are a
   heavy slate-blue mass. In the target the lower hull stays mid cobalt, and only a thin strip at the foot is dark.
3. **Hull foot and top fittings are near-black hard slabs.** The touch-up passes at gain 0.8 put flat dark wedges in
   at the end. The target's foot is a soft dark blue-green band with steps.
4. **The sea lost its colour.** The target has yellow-green at the horizon and clear teal below. Mine is pale
   grey-green with a few khaki shards. That was the most saturated colour in the target and it is gone.
5. **The boat at the lower left is slate patchwork.** The target has a clear mid blue with white streaks.
6. **Texture is uniform mottle.** Granulation (cold press plus the sky-blue flocculation) speckles every wash the same
   way, so the hull, the haze and the foreground all have the same stipple. That adds to the "processed photo" look.
7. **Small accents lost or broken**: the hawse hole is a broken brown blotch, the rivets are gone, the rigging is frayed
   shards.

## Where it went wrong

- First stage (10%): one faint grey-green tint over almost the whole sheet. It is the same fault as try 1, so my try-2
  change (no sepia) did not fix it. The tint comes from the painter's first wash covering every non-paper cell.
- 25%: the shapes come in as pale flat cut-outs with rims. The segmentation is visible from here on, and nothing later
  can remove it.
- 50 to 75%: the khaki-grey enters the hull's centre (ochre and phthalo over blue), and the lower half goes slate.
- Touch-up (passes 63 to 76): hard black slabs at the foot and the top fittings.

## My scores

- Finished painting: **3.5 / 10**. The layout, the main darks and the bow's left curve read, and the colour is less muddy
  than try 1. It is still a posterised cut-out picture: grey hull, lost sea colour and black slabs.
- Process plausibility: **2.5 / 5**. The order is right, but 76 passes of flat rimmed shapes, a uniform faint tint at
  the start and black slabs at the end look like a machine layering a segmentation.

## After reading FEEDBACK.md: where I agree and disagree with the judges

Scores: vision judges 3.0 (GLM) and 2.0 (Qwen); composition and values 5 / 4, edges and detail 2 / 2, marks and
texture 2 / 1. Classic metrics 7.51. Progression 1.0 / 2.0 / 2.5 / 3.5 / 5.0 at 10 to 100%, with 0 of 2 judges finding
the order human. The composite is null, because the third judge hit a spend cap.

Agree:
- **Marks and texture are the weakest part (1 to 2).** It is the same fault as in my review: rimmed cut-outs and a
  uniform mottle. This is the main thing to fix in the finished painting.
- **Edges and detail 2.** Agreed: the soft edges are still too few, and the hawse hole, rivets and rigging are broken.
- **Composition and values are the strongest (4 to 5).** Agreed. Keep what placed them: the families, `_dk11`, the
  cream paper colour and the opening drawing.
- **10% stage at 1.0: "the whole sheet at one faint value, as if faded in", "every form already faintly present".**
  Agreed, and this is the most useful note. Reading `light-to-dark.mjs` explains it: band 1 lays about 28% of every
  cell's demand, pigment by pigment, over the whole sheet, so the first quarter of the strokes is a faint copy of the
  finished image. In try 2 band 1 used 25% of all strokes, so both the 10% and 25% frames showed only that faint copy.
- **"A straight travelling front, a wipe or raster sweep" (named twice).** Agreed, and I think I know the cause.
  The template's `--skylanes 1` lays every large cool plane as horizontal lanes from the top down. On this subject the
  hull and the haze are the large cool planes, so they were swept like a sky in horizontal bands.
- **"Flat evenly-toned slabs standing in for a form".** Agreed: the hull, the boat and the foot.

Disagree, or only partly:
- **"Digital fade-in or opacity reveal" / "blocky, low-resolution stages" (one judge).** Partly. The stages do add
  shapes and the values build light to dark. They are not a global opacity ramp. But a faint copy of every form is
  what makes the first two frames read that way, so I treat it as the same problem as the 10% note.
- **"Texture arriving as a dump, everything sharpening at once late".** Partly. The darks did arrive late and hard
  in the touch-up (my `--touchgain 0.8`), and that I accept. But darks last is correct watercolour order, so I will not
  move the darks earlier. I will make them softer and smaller instead.
- **100% stage scored 5/5.** Too generous. The finished sheet still shows segmentation cut-outs. I do not treat
  the last stage as solved.
- **Classic metrics (edge 8.94).** Pixel metrics reward posterisation, so I ignore them as evidence of quality.
- **The judges' overall 2 to 3.** Close to my 3.5. The noise is about a point, so the two scores agree.
