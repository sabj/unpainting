# Plan: White Ships (Sargent crop), pure watercolor, no ink. V5 try 3 (learning round)

## Reference cues (value thumbnail, read from a 3x enlargement of the target)
- Paper: cream, brightest areas about 221/215/199, not white. The right half above the horizon (y about 0.69) is that
  cream paper with a few pale blue rope strokes; the white swishes on the hull are scratched or reserved paper.
- Mid values: the hull is one smooth transparent greyed-cerulean wash (about 149/161/162), darker saturated blue along its
  left rim, paler and warmer to the right, a dotted orange line down its right edge. Turquoise-olive sea under the horizon;
  blue water at lower left.
- Darks (small): black-brown mooring blob on the hull, grey bollard disc top right, dark grey-green waterline across the
  bottom, grey spars top left. Orange-brown mast right (thin, with dots), orange-pink mast far left, sandy-orange anchor.
- Focal point: the mooring blob with the paper swishes on the hull, and the hull edge against the cream paper.

## Style balance
- Pure watercolor: `opening-lines.json` and `closing-lines.json` empty (`medium: none`). Structure comes from wet-on-dry
  shapes, hard edges where the hull meets paper, reserved paper and dark accents in paint. Loose plate: the paper on the
  right stays bare (vignette), detail is concentrated on the hull.
- Style `precise-watercolor` for the whole sheet, **no region style overrides** (a region style on a rectangle makes the
  axis-aligned seams the painter refuses; nothing here needs another style).

## Regions (resolution question: wash for all; the smallest features are brush marks)
Families are loose labels of the painter's own colour/value segmentation, not outlines.
- hull: wash question. One connected greyed-blue wash, wet on dry, paper dry before each glaze; darker blue rim hard on
  the left, right side lighter. Mooring blob as the last dark accent.
- rigging (right, above horizon): almost nothing. Cream paper stays bare; a few pale blue strokes, the grey bollard and
  the orange-brown spar as single dry accents.
- sea (right, below horizon): one pale turquoise/olive wash, wet on dry, paper glints; the orange-brown mast last.
- left: pale blue sky, orange-pink mast and grey spars as a few dry strokes.
- foot (lower left): blue water, sandy-orange anchor, dark waterline last across hull foot and sea (one glaze that crosses
  family bounds).

## Order
Light foundations (hull blue, sea, left sky) -> dry -> mid values on dry paper (hull rim, water, masts, anchor) -> dry ->
one cross-region shadow glaze (hull foot into waterline) -> dry -> dark accents (blob, bollard, waterline). No closing
drawing. Breaks from light-to-dark: none planned.

## Moisture, load, edges
- Washes: wet on dry, watery-medium load, big brush. Mid values and accents: dry paper, medium-thick load, pointed brush.
  Never wet-in-wet over the hull edge or the mast.
- Edges: hard on the hull's left rim, bollard and masts; softer on the hull's right side (edge fade) and the sea.

## Protected lights
No rectangular reserves. The paper lights are the painter's own: with the sheet declared as the target's cream paper,
everything at or near that cream stays bare paper.

## Tokens and settings
- `region_w13_lay2_noslane_efade`: `_lay2` (two mid layers), `_noslane` (no banded sky), `_efade` (edgefade 1.2 mm: a dark
  mass against paper is lighter and broken at its contour). The base `_dk13` (darkgain 1.3) applies (try 2's `_dk11` is gone).
- `extra-args.json`: `--paints ultramarine,cerulean,phthalogreen,sienna,ochre,rawsienna,sepia`; `--groundglaze 0` (the base
  `_rg10` cuts a straight horizontal edge at y = 0.62 across the hull); `--paperrgb 221,215,199` (the target's own cream
  as the sheet colour); `--layersmooth 1.5`; `--holefill 2.5` (dry hollows inside a wash fill); `--minshapecells 300`;
  `--whitefloor 2.5` (more cream paper held out of every pass); `--edgewobble 0.8` (wash boundaries wander).
  Try 2's `--holerim 2.5` is removed (CPU only).

## What would show failure
White boxes or any straight seam, a veil over the right-hand paper, hull as grey/blue islands with outlines, orange turning
muddy brown, the mast as a ruled stripe, the sea a flat teal block, dark accents spread over the hull, speckled round
holes, the swishes in the hull filled in.

## What I changed and why (V5 try 3)
Final files: variant `region_w13_lay2_noslane_efade`; extra-args = try 2's list without `--holerim`, plus
`--whitefloor 2.5` and `--edgewobble 0.8`.
1. **Removed `--holerim 2.5`.** The try-2 render failed on it: `src/media/gpu/stepfull.mjs:89` throws "holeSpan
   (--holerim) is not on the GPU", and the benchmark renders on the GPU. I read the rest of the GPU guards
   (marangoni/slope, 16 pigments, buffer size): nothing else in the plan trips them, and `--holefill` has a GPU shader
   path (`stepfull.wgsl:555`).
2. **`--whitefloor 2.5` (new).** First look with the try-2 settings: after 3 ground passes a faint mottled veil lay over
   the whole sheet, including the right-hand paper. The planning log said 84% of the sheet covered, 8.9% held as paper.
   `--whitefloor` is the floor under which a cell's total pigment is held out of every pass (default 0.5 x glaze 0.12).
   I tried 1.5 and 3 in the planning step at 600 px (15.9% and 29.8% held; shape and pass counts unchanged) and measured
   the target itself: 17% of its pixels lie within 60 (summed RGB) of the cream paper, 26% within 90. 2.5 holds about a
   quarter, which fits, and 3 or more would start dropping real pale-blue paint. Applied by revision 1 at pass 3.
3. **Dropped `_dk11`, so the base `_dk13` (darkgain 1.3) applies.** My `_dk11` was an untested try-2 guess ("darks are
   small accents"). At pass 60 the sheet had no mooring blob, bollard or waterline yet and was pale overall; the dark
   passes come last and `darkgain` scales them, so I went back to the champion value. Revision 2.
4. **`--edgewobble 0.8` (new).** The mid-stage looks showed straight, faceted shard edges. The option moves large wash
   masks through a smooth displacement field (wavelengths 2.5 to 12 mm) so boundaries wander like wet edges; small
   accents are not touched, and it is planning only. Effect in the looks: small. Straight diagonal facets remain at
   lower right, so I do not claim it fixed them. Revision 3.
5. **The GPU machine failed once** right after revision 2; the harness repainted from the start with the revised plan, so
   the final painting is a single run of the final plan (whitefloor 2.5, dk13, from pass 1; edgewobble from pass 1 too,
   because I added it at the restart point before any wash).
6. **Kept as before, with no evidence either way:** cream `--paperrgb`, `--groundglaze 0`, `--layersmooth 1.5`,
   `--holefill 2.5`, `--minshapecells 300`, `_efade`, `_lay2`, `_noslane`, the seven paints. The ladder is 87 passes
   (seven pigments x value steps), more than the 25 to 45 the brief mentions; I did not cut pigments because I could not
   show it would help colour, and it would have changed the palette fit untested.

What I saw (my own judgement, not a score): at pass 69 of 87 the composition is right (hull, brown mast, tan anchor, bare
cream right half) and the blues are stronger than at pass 41, but the surface is a faceted collage of flat shapes, greyer
and tealer than the target's hull, the turquoise sea and the pale left sky are weak, and the target's smooth hull with
paper swishes is not reproduced. I could not change that with the settings I control.

Finished painting (104 passes incl. the painter's own touch-ups, 7748 strokes): composition and value layout are right
(blue hull, dark mooring blob close to its place, grey bollard disc, brown mast, tan anchor, dark waterline, bare cream
right half). The darks arrived with `_dk13` as intended. What is wrong: the hull is a faceted patchwork of flat blue and
grey shapes, not one smooth wash with paper swishes; the sea has no turquoise and the left sky is nearly absent; the
whole is greyer than the target; edges are all similar. I did not score it: my 0 to 10 and 1 to 5 scores were asked for
the previous try, and that try produced no painting to score.

Critique points I rejected: none. The feedback was one factual failure (the `--holerim` GPU limit), and it matches the
code. Without a painting there were no judge scores or tells to accept or reject.
