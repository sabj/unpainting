# Plan: Hills (V4, try 2), loose ink and wash

## Reference cues (read before choosing anything)
- An aerial view of oak woodland on hills. Three value families: (1) near-black navy-green crowns (about 20% of the
  area, rgb about 51/64/72), (2) grey-green mid foliage and shade (about 50%), (3) bright yellow-green meadow
  (about 30%, rgb about 190-205/195-205/85-105), plus a pale peach-cream winding dirt track (near paper, rgb
  230-250/200-238/155-210).
- Lights: the cream core of the lower track, the pale upper-left track strip, cream flecks along the meadow/tree edges.
  Lights are bare paper (reserves + the painter's own near-paper holdout), never white paint.
- Focal point: the S-bend of the track against the dark crowns, and the tree cluster at the centre-left.
- No pen lines exist in the target, so the tracer finds none. The pen lines are authored from the target's own value
  masses (`bench/mklines.mjs`): contours of the smoothed dark masses and of the track, cut into broken spans.

## Regions, technique, order (resolution question for each: wash vs ink-and-wash)
1. Meadow (families meadow-low / meadow-high / meadow-left, wet on wet): wash question. Smallest feature is a
   mottle several mm across, so this is a pale connected yellow-green wash (hansa + sap green, a little ochre), laid
   wet in wet as the first passage, paper kept for the track core. Moisture: moist, not glossy; load watery, pigment
   pale. Edge: soft inside, the crisp edge comes later from the dark crowns laid over it on dry paper.
2. Woodland grey-green (family wood-left, wet on wet for the pale foundation only): same first wet passage, so the pale
   foundation of the whole sheet is one soft wet underwash (break from "dry and sharp" named: the reference mottles
   softly under the crowns; nothing here is detail). Mid values and darks then go on dry paper (the painter dries
   each pass before the next), so crown edges stay crisp.
3. Navy gully and crowns (family wood-right, wet on dry): dark mass in mixed darks (ultramarine, Payne's grey, sap
   green, sepia, the granulating blue from the base recipe), medium water, thick pigment, on dry paper, 2 mid layers
   (`_lay3`) then the shadow glaze that crosses families. Crown tops stay lighter than their undersides.
4. Track: left as the pale first wash with warm ochre/sienna touches, the cream core reserved; it is drawn, not
   painted dark.

## Layer order
Opening pen (broken contours of the big dark crowns and the track edges, sepia) -> one pale wet wash over the sheet
(meadow warm-yellow, woods grey-green) -> dry -> 3 mid layers on dry paper -> dry -> shadow glaze across crowns,
meadow shade and track edges -> dry -> closing pen: darker crown undersides and valleys, track edges, short and
broken (never a fill).

## Protected lights
Two small reserves on the track (cream core of the lower track, upper-left strip); the painter's own near-paper
holdout (0.2% of the sheet). Not toned later; the cream core stays paper.

## Edges
Hard where a dark crown meets the bright meadow (the strongest edge in the picture), soft inside the meadow and in
the grey-green shade. Pen lines sit on the dark/light boundaries and break where the target's edge is lost.

## Values (five-step thumbnail)
Paper cream track > bright meadow > grey-green mid > dark green > navy-black crowns. The plan should progress light to
dark. `--darkgain` stays at the base 1.3 because the target has deep navy darks.

## Drawing
Sepia ink (base `_sep8`), authored files: opening 56 spans / 1710 points; closing 83 spans / 1185 points. Opening is
sparse, long and confident (spans 40-95 px of 306); closing is shorter and lighter and follows only the darker
accents. Widths follow the base `_dwg200`.

## Palette (extra-args)
hansa, sap green, ochre, sienna, ultramarine, cerulean, Payne's grey, sepia. Greens are mixed from yellow + blue
rather than one tube, and the darks are mixed from blue + sienna/sepia, not black.

## Recipe
`region_w13_lay3`: three mid layers instead of four (a looser, fewer-pass painting; the ink-and-wash profile has
two washes by design). Everything else is the V096 base.

## What would show failure
- Wet underwash bleeding across the meadow/crown boundary and softening crown edges (blur at the crowns).
- Closing ink heavy over soft paint, or doubled outlines; ink used to fill a dark mass.
- Meadow reading as a flat green tile with straight seams, or patchwork between wet and dry shapes.
- Lost track: cream core darkened by a later glaze.
- Crowns as uniform equal disks, or all value steps collapsed into one dark.

## Changes (V5 field)
Not applicable: first plan of this try. Any revision after looking at the first passes will be noted below.
