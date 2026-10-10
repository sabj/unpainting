# Plan: White Ships (Sargent crop), pure watercolor, no ink. V5 try 1 (learning round, no prior feedback)

## Reference cues (value thumbnail)
- Lights: the whole right half above the horizon is bare cream paper with a few pale blue strokes; white swishes cut
  across the hull (below the black mooring blob and on the lower hull); sparkle on the sea under the horizon.
- Mid values: the hull, one big blue-grey wash (cerulean/ultramarine, greyed), darker saturated blue rim on its left
  edge, paler toward the right. Pale blue sky at top left; turquoise and olive sea at right; blue water at left.
- Darks (small): black-brown mooring blob on the hull, grey bollard top right, dark grey-green waterline across the
  bottom, grey spars top left. Orange-brown mast right, orange-pink mast far left, sandy anchor lower left.
- Focal point: the mooring blob and the white swishes on the hull; the hull edge against the paper.

## Style balance
- Pure watercolor, so no ink at all: `opening-lines.json` and `closing-lines.json` are empty (`medium: none`). Structure
  comes from wet-on-dry shapes with hard edges, reserved paper, and dark accents laid in paint. Loose plate: the paper
  on the right stays mostly untouched (vignette into white), detail is concentrated on the hull.
- Style `precise-watercolor` for the whole sheet, no region overrides. Reason: atmospheric-wet everywhere would blur
  the hull edge and the mast, and the one-style seam check refuses rectangular region styles; the sheet has no fur or
  foliage that needs ink-and-wash.

## Regions (resolution question: wash for all; smallest features are brush marks, not threshold-limited)
Families are only loose labels of the painter's own colour/value segmentation, not outlines.
- hull (x .22-.66): wash question. One connected blue-grey wash, wet on dry, paper-state dry before each glaze. Darker
  blue on the left rim kept as a hard edge; right side of the hull soft and lighter. Mooring blob as the last dark
  accent on dry paint. Reserves keep the two white swishes.
- sails (right, above horizon): almost nothing. Pale blue strokes only where the target has them, bollard and the grey
  rope as one dry dark accent each. The painter keeps near-paper lights; no wash to fill the paper.
- sea (right, below horizon): one pale turquoise/olive wash, wet on dry, glints left as paper; orange-brown mast last
  as one thin dry stroke over it.
- rigging (far left): pale blue sky wash with the orange-pink mast and grey spars as a few dry strokes.
- foot (lower left): blue water wash, sandy anchor in ochre, dark waterline last across hull foot and sea (one glaze
  that crosses family bounds).

## Order
reserve lights, no opening drawing, pale washes (sky, sea, hull base), dry, mid values on dry paper (hull rim, water,
mast), dry, one cross-region shadow glaze (hull foot into waterline), dry, dark accents (blob, bollard, waterline).
No closing drawing. Breaks from light-to-dark: none planned.

## Moisture, load, edges
- Washes: wet on dry, watery-medium load, big brush. Mid values and accents: dry paper, medium-thick load, pointed
  brush. Never wet-in-wet over the hull edge or the mast (blur is the main defect to avoid).
- Edges: hard on the hull's left rim, bollard, mast; soft on the hull's right side and the sea.

## Tokens and settings (and why)
- `region_w13_lay2_noslane_dk11`: `_lay2` replaces the base `_lay4` (two mid layers: this picture is a few broad washes
  and the paper must show); `_noslane` removes the sky lanes (no banded sky here, the sky is bare paper and a pale
  patch); `_dk11` replaces `_dk13` (darkgain 1.1: the only true darks are small accents, a stronger gain would turn
  the whole hull heavy).
- `extra-args.json`: `--paints ultramarine,cerulean,phthalogreen,sienna,ochre,rawsienna,sepia`: the blues and the
  green-teal of the sea, burnt sienna for the masts, ochre/raw sienna for the anchor, sepia for the dark accents
  (not black).
- Reserves: three small ones (hull swishes, sea sparkle). The first try with a long rectangular reserve (85 px) was
  refused as an unsupported axis-aligned seam, so they are kept under 60 px.

## What would show failure
Hull wash too dark or flat (no paper streaks), hull edge blurred, paper on the right filled with wash, mast
as a ruled stripe or beaded dots, a straight region seam across the sheet, orange turning muddy brown, sea as a
flat teal block, dark accents spread over the hull.

## What I changed and why (V5)
First try, no earlier plan to change. Starting choices: no ink, fewer layers, lighter darkgain, explicit palette.
