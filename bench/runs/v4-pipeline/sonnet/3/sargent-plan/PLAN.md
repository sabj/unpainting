# Plan: White Ships (Sargent crop), V4 try 3, pure watercolour, no ink

## Reference cues (value thumbnail)
- Five values. Paper cream (right half: sail and sky, mostly bare). Pale blue-grey (hull highlights, left sky behind the
  rigging). Mid blue (the big bow plane, soft gradation from a darker blue left edge to a paler centre). Warm ochre/sienna
  (left mast, right spotted post, anchor). Darks: black-brown hawsehole and bollard blobs, grey-green waterline strip,
  dark foot shadow. Teal green sea at bottom right.
- Focal point: the dark hawsehole blob on the hull and the ochre dots under it, against the broad blue plane. The right
  post with its dabs is the second accent.
- Lights: the cream paper right of the hull, the white dry-brush streaks across the hull, the sparkles in the sea.
  All are bare paper or near-paper lights the painter keeps itself (no rectangular reserves: they would cut straight
  seams where the target has curved edges). Category: bare paper, never tinted white.

## Style and ink
- Pure watercolour. `opening-lines.json` and `closing-lines.json` are empty with medium "none": nothing is drawn. The
  base `_ink4`/`_sep8` tokens therefore have nothing to draw. Structure comes from wet-on-dry shape edges, dark
  accents painted in sepia/ultramarine, and paper left bare.
- Style: precise-watercolor everywhere (value planes with hard edges). I first asked for atmospheric-wet on the pale
  sail area and the teal sea (soft lost edges), but the painter's wet-wash gate (whole footprint evenly moist) refused
  the first wet-in-wet pass, so those two regions are now wet on dry too; their softness has to come from pale,
  low-contrast passes and the painter's own soft-edge rule, not from a wet passage.

## Regions (resolution question: all wash or dry-brush; nothing needs ink at 0.23 mm/px)
1. Hull (blue plane, about 120 px wide): wash question. Wet on dry, a connected pale blue wash, then mid blue on dry
   paper with one hard edge on the right side and a soft left-to-centre gradation, then dark blue edge glaze down the
   left side. The white streaks stay as paper (dry-brush where the load is thin). Water: medium; pigment: medium.
2. Left rigging and mast: narrow ochre and grey strokes, wet on dry, on dry paper, each one stroke with a tapered
   end. Smallest feature about 4 px at target scale (about 16 cells at 1200 px), so it can be painted.
3. Sail and sky (right): wet on dry, very pale blue glazes, mostly left unpainted. The grey rigging lines are a few
   dry-paper strokes. Paper state needed: fully dry before every stroke.
4. Sea (bottom right): wet on dry, one teal-green connected pale passage (cerulean + phthalo green), sparkles kept.
5. Right post: ochre/sienna wet on dry, one hard edge, darker dabs added after it dries.
6. Foot: anchor, boat rim, waterline. Dark shaped marks last, on dry paper.

## Order and moisture
Light to dark by the painter's ladder: pale washes (sail, sky, sea, hull base) while open, a full dry, mid values on
dry paper (hull plane, post, anchor), dry, one shadow glaze crossing hull, foot and waterline, dry, last dark accents
(hawsehole, bollard, waterline). The painter dries each pass; I check paper state at each stop before going on.
No break from light-to-dark layering and no wet-in-wet: every region is laid wet on dry, on paper the painter has
dried. The soft transitions on the right are painted as pale, low-contrast glazes.

## Settings
- Tokens: `region_w13_lay3`. Three mid layers instead of four: the hull is one big plane and four glazes risk mud.
  Everything else stays on the V096 base (uncapped lines, `dk13` darks for the black-brown accents, `cg13` cool gain,
  `skyb` for the faint blue ground).
- Palette (extra-args): ochre, sienna, ultramarine, cerulean, phthalo green, sepia. Blue hull = ultramarine + cerulean;
  masts = ochre/sienna; sea = cerulean + phthalo green; darks = sepia + ultramarine (not black).

## What would show failure
- Hull filled with flat or patchy mid blue, or white streaks washed over; the right hull edge lost or blurred.
- Cream area on the right tinted grey or blue all over (paper must stay bare).
- Dark blobs too large or pure black; ochre mast turning pink or grey.
- Rectangular seams between regions; stripes or stipple on the hull; sea too dark or too uniform.

## Revision log
- v1: atmospheric-wet region styles and "wet on wet" base moves for sail and sea. The painter refused it at the first
  stroke: "value-plan wet wash whole-footprint gate failed" (pass light/b1/p0/r2/s1, moistShare 0.71, waterMax 0.63).
- v2: removed the region styles and made every family wet on dry, then restarted on a clean sheet. I did not use
  `--wetgate 0` (it only logs the failed paper-state check and paints anyway), because the paper-state check before a
  stroke is part of the technique. Nothing else changed.
- v3 (revision at pass 40 of 94): added `--groundglaze 0` to extra-args. The look after pass 40 showed a straight
  horizontal step across the left two thirds at 62% of the sheet height; the recipe's ground glaze (`_rg10`,
  `groundfrom` .62) moves cool-neutral cells below that line into the shadow band, which suits a road or pavement
  and not a hull. The six-pigment `--paints` list stayed so the ladder numbering stayed aligned with what was already
  painted (the ladder went from 94 to 95 passes). The step was already on the paper and is still faintly visible.
- Considered and not done: dropping `--paints` (the painter's own 4-pigment fit of phthalo green, cadmium yellow,
  ultramarine and rose scores about 2 dE against about 6 for my six-pigment list, and gives a ladder of about 48
  passes). I only saw this after 40 passes were painted; changing the palette then would have left only the last few
  dark passes. It is the first thing to change in another try.

## Outcome (finished painting, 110 passes, 13,299 strokes, no drawing)
- Right: landmarks are in place: hawsehole blob and ochre dots on the hull, the bollard at upper right, the ochre
  post with its blue cap, the anchor, the dark waterline. The cream paper on the right stays bare.
- Wrong: colour is slate blue and warm grey, not the luminous periwinkle of the target; the hull face is broken into
  patches instead of one plane with a hard right edge and soft gradation; the teal sea strip at lower right is
  missing (only a faint grey-green); the 62% step is faintly visible; edges are ragged rather than a few clean
  wet-on-dry shapes. These are what the failure list above said to look for, and the first two came from my palette
  choice and from letting the painter's colour segmentation cut the hull.
