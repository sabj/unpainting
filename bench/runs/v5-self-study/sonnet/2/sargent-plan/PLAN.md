# Plan: White Ships (Sargent crop), pure watercolor, no ink. V5 try 2 (learning round)

## Reference cues (value thumbnail, read from a 3x enlargement of the target)
- Paper: the target is on cream paper whose brightest areas read about 221/215/199, not white. The whole right half
  above the horizon is that cream paper with a few pale blue rope/rigging strokes; the swishes on the hull are scratched
  or reserved paper.
- Mid values: the hull is one smooth transparent greyed-cerulean wash (about 149/161/162), a darker saturated blue along
  its left rim, paler and warmer to the right, with a dotted orange line down its right edge. Turquoise-olive sea under a
  horizon at y 0.69; blue water at lower left.
- Darks (small): black-brown mooring blob on the hull, grey bollard disc top right, dark grey-green waterline across the
  bottom, grey spars top left. Orange-brown mast right (thin, with dots), orange-pink mast far left, sandy-orange anchor
  lower left.
- Focal point: the mooring blob with the paper swishes on the hull, and the hull edge against the cream paper.

## Style balance
- Pure watercolor: `opening-lines.json` and `closing-lines.json` stay empty (`medium: none`). Structure comes from wet-on-dry
  shapes, hard edges where the hull meets paper, reserved paper and dark accents in paint. Loose plate: the paper on the
  right stays bare (vignette), detail is concentrated on the hull.
- Style `precise-watercolor` for the whole sheet, **no region style overrides** (a region style on a rectangle makes the
  axis-aligned seams the painter refuses, and the sheet has no fur or foliage that needs another style).

## Regions (resolution question: wash for all; smallest features are brush marks, not threshold-limited)
Families are loose labels of the painter's own colour/value segmentation, not outlines.
- hull: wash question. One connected greyed-blue wash, wet on dry, paper dry before each glaze; darker blue rim kept hard
  on the left, right side lighter. Mooring blob as the last dark accent.
- rigging (right, above horizon): almost nothing. Cream paper stays bare; a few pale blue strokes, the grey bollard and
  the orange-brown spar as single dry accents.
- sea (right, below horizon): one pale turquoise/olive wash, wet on dry, with paper glints; the orange-brown mast last.
- left: pale blue sky, orange-pink mast and grey spars as a few dry strokes.
- foot (lower left): blue water, sandy-orange anchor, dark waterline last across hull foot and sea (one glaze that crosses
  family bounds).

## Order
Light foundations (hull blue, sea, left sky) -> dry -> mid values on dry paper (hull rim, water, masts, anchor) -> dry ->
one cross-region shadow glaze (hull foot into waterline) -> dry -> dark accents (blob, bollard, waterline). No closing
drawing. Breaks from light-to-dark: none planned.

## Moisture, load, edges
- Washes: wet on dry, watery-medium load, big brush. Mid values and accents: dry paper, medium-thick load, pointed brush.
  Never wet-in-wet over the hull edge or the mast (blur is the main defect to avoid).
- Edges: hard on the hull's left rim, bollard and masts; softer on the hull's right side (edge fade) and the sea.

## Protected lights
No rectangular reserves at all. The paper lights are the painter's own: with the sheet declared as the target's cream
paper, everything at or near that cream stays bare paper (15.9% of the sheet in the plan instead of 0.8%).

## Tokens and settings
- `region_w13_lay2_noslane_dk11_efade`: kept `_lay2` (two mid layers; the picture is a few broad washes), `_noslane` (no
  banded sky), `_dk11` (darkgain 1.1: the true darks are small accents). New: `_efade` (edgefade 1.2 mm: a dark mass against
  paper is lighter and broken at its contour, darkest inside; this is meant to take away the cut-out look of every shape
  having the same outline).
- `extra-args.json`:
  - `--paints ultramarine,cerulean,phthalogreen,sienna,ochre,rawsienna,sepia` (kept: blues, sea green-teal, burnt sienna for
    the masts, ochre/raw sienna for the anchor, sepia for the darks, not black).
  - `--groundglaze 0` (new): the base token `_rg10` cut a straight horizontal edge at y = 0.62 across the hull.
  - `--paperrgb 221,215,199` (new): declare the target's own cream as the sheet colour, so the plan stops laying a pale
    foundation over paper-coloured areas.
  - `--layersmooth 1.5` (new): smoother layer outlines, fewer ragged islands.
  - `--holefill 2.5 --holerim 2.5` (new): dry hollows inside a wash fill or dry without a dark rim (the white dots with
    dark rings in the hull).
  - `--minshapecells 300` (new): drops specks smaller than about 4 mm; they fed the speckled, many-island look.

## What would show failure
White boxes or any straight seam, a veil over the right-hand paper, hull as grey/blue islands with outlines, orange turning
muddy brown, the mast as a ruled stripe, the sea a flat teal block, dark accents spread over the hull, speckled round
holes.

## What I changed and why (V5 try 2) -- from my SELF-REVIEW and the critique
1. **No reserves.** The three rectangular reserves showed as white boxes in every stage (both the judges and I named this).
2. **`--groundglaze 0`.** I found that the hard straight seam across the lower hull is the base recipe's ground glaze starting at
   y = .62; a plan cannot make it go away except by this setting.
3. **`--paperrgb 221,215,199`.** The log of try 1 said the plan covered 99.2% of the sheet (0.8% paper): the painter had assumed
   a white sheet and was painting the target's cream paper as a pale wash everywhere. That is the "whole sheet faded in at
   one faint value" tell the progression judge named five times. Declaring the cream sheet leaves 15.9% bare paper in the
   plan.
4. **Holes and smoothing** (`holefill`, `holerim`, `layersmooth`, `minshapecells`) for the "round holes / scalloped edges /
   flat slabs" tells; `_efade` for the same outlines on every shape.
5. **Use the stops.** Try 1 had 0 looks and 0 revisions. This time I look at the first stops and each pass group and revise
   what is not painted yet.

Critique points I rejected: the absolute 1.0 progression score (it ignores that the order of work is light to dark; I
only take its specific tells), the harsh 1.0 on marks/texture (the classic marks measure was 6.4), and the single
"speckle/dotted trails" tell (the target has dotted orange marks on its mast and hull edge).
