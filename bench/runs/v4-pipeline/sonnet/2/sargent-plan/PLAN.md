# Plan: White Ships (Sargent), V4 try 2 of 3 — pure watercolour, no ink

## Reading the picture
- Value thumbnail (4 values): paper cream (right half, about a quarter of the sheet); pale blue-grey (hull body, the biggest
  shape); mid/dark blue (hull's left edge, a few pools low on the hull); small dark accents (grey-black blobs at the top, a
  brown-black fitting on the hull, bottom waterline) and warm orange/tan (masts, anchor, rivets).
- Focal point: the dark blob with its brown loop on the hull, the round fitting at upper right, and the hard dark-blue left
  edge of the hull.
- Lights: white streaks inside the hull wash (bare paper), the cream paper right of the hull (bare paper, toned only by the
  painter's own pale base), white ripples on the sea (bare paper). Nothing is toned later except by the painter's own pale base.

## Style and drawing
- Whole picture `precise-watercolor`, wet on dry on a dry sheet, with hard edges where Sargent has them: hull edge, masts,
  fittings, anchor. Soft transitions come from the painter's own edge softening on pale washes, not from wet-in-wet.
- No ink: opening-lines.json and closing-lines.json are empty (`medium: none`). Structure comes from wash shapes, the hard edge
  of the hull, reserved paper and dark paint accents. The ink token in the base recipe therefore draws nothing.

## Regions (family -> colour clusters it receives; the painter segments by colour, bounds are only descriptive)
- hull (blue-grey, mid grey, dark blue clusters): one big pale wash first, mid-blue second, dark blue edge and pools last, all
  wet on dry on a dry sheet. Smallest feature: the rivets and white streaks (about 3-6 cells at 1200 px), handled as reserved
  paper, not marks.
- air + sea (cream paper, pale blue streaks, teal water): pale wet-on-dry washes with the paper left showing; the teal comes
  from cerulean + phthalo green. `_noslane` removes sky lanes so there are no uniform horizontal bands.
- mast/anchor/rivets (orange and tan clusters): dry paper, medium load, one stroke per mast, crisp edges.
- left strip (sky, poles, boat): dry-edged, pale.

## Order and moisture
Pale base over everything not reserved (watery, on dry paper) -> dry -> mid planes on dry paper (medium load) -> dry ->
cross-region shadow glazes (hull shadow runs into the waterline) -> accents. Every pass starts on fully dry paper; no pass is
wet in wet, so no detail region sits inside a wet passage.

## Values, tokens, paints
- `region_w13_lay2_noslane`: two mid layers instead of four (Sargent uses few big washes), no sky lanes. Base darkgain 1.3 kept,
  the target has real dark accents.
- Paints (`extra-args.json`): ultramarine, cerulean, phthalogreen, sienna, ochre, umber — blue hull, teal sea, orange masts,
  tan anchor, brown-black accents mixed from ultramarine + sienna/umber.
- Reserves: three small ones (white streaks on the hull, sea glint), each smaller than the straight-edge limit.

## What would show failure
Flat uniform blue hull with no white streaks; banded or tiled right-hand paper; the hull edge blurred (should be a hard, darker
line); orange masts pale or smeared; dark accents missing or too heavy; teal sea reading as grey; right-hand cream paper
over-washed instead of left light.

## What I changed and why
First version used `atmospheric-wet` for the cream-air and sea colour clusters and `wet in wet` for those families. The painter
refused it at full size: one connected light wash (`light/b1/p0/r1/s1`, 260,267 cells, a shape spanning the hull-grey and the
cream clusters) went wet in wet and the whole-footprint wet gate failed (moist share 0.50 of the 0.70 required, water max
0.71 against 0.15 allowed). A wash that large cannot be wetted evenly. Change: removed the region styles and set every
family's baseMove to `wet on dry`, so only the dry-paper route is used. I did not turn the gate off (`--wetgate 0`): a wash laid
on unevenly wet paper is a wrong paper state, and the plan should not depend on that. Cost: the sea and the right-hand air lose
their wet-in-wet softness; they are pale dry-edge washes now. Checked in the compiled plan: all 2,507 shapes are wet on dry.
