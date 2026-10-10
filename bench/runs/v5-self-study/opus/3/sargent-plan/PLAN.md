# Plan: White Ships (Sargent), round V5, try 3 of 3

Style asked for: pure watercolour, no ink. I read `.claude/skills/watercolor-technique/SKILL.md` before planning.
`bench/SELF-REVIEW.md` has my review of try 2 and my response to the judges.

Files: `config.json` (same six families as try 2, no reserves), `opening-lines.json` (14 hand-placed graphite lines,
same as try 2), `closing-lines.json` (empty, medium none), `extra-args.json`, `bench/variant.txt` =
`region_w13_lay2_ew8_dk11_cg11_lf_softs_ms700_noslane` at the start, and `..._dk10_...` from pass 46 on
(revision 1, below; the file now holds the final `region_w13_lay2_ew8_dk10_cg11_lf_softs_ms700_noslane`).

## Reading the reference (value thumbnail)

- Paper: cream (226/219/202). It is bare at the upper right between the rigging, in the hull's pale streaks and on the
  anchor's lights.
- Value 1 (light): cream paper, pale cobalt haze strokes, the hull's pale streaks and the fan of light streaks on the
  hull's lower left.
- Value 2 (light-mid): the hull's airy blue body, the yellow-green sea at the horizon, the tan anchor.
- Value 3 (mid): the hull's cobalt left edge and darker right side, the teal sea, the orange spar, the masts, the
  rivets, the blue boat at the lower left and the rigging.
- Values 4 and 5 (dark): the hawse hole, the two round blocks, the fittings at the top of the bow, and the shadow at
  the hull foot and the foreground strip.
- Focal point: the bow, with the hawse hole and the curve of orange rivets. The spar on the right balances it.

## Lights

- The cream paper is the sheet colour (`--paperrgb 226,219,202`), so the painter's near-paper holds keep the upper
  right and the anchor lights as bare paper. There are no rectangular reserves: they would cut straight seams through
  the hull's diagonal streaks.
- The hull streaks are a pale painted plane: the light wash left showing where the later blue planes do not reach.
- `--planmasses 4` merges very small lights into their plane. About 4.6% of the sheet stays held paper (try 2: 5.5%).
  The upper-right cream and the large streaks survive.

## Regions, technique and order (all precise watercolour, wet on dry, light to dark)

| family | cue | resolution question | light wash | mid planes (L0, L1) | shadow and accents |
|---|---|---|---|---|---|
| hull | white bow in airy cobalt | wash | one pale connected plane, laid as a gesture along the form (no lanes) | whole form, then the darker left edge and right side | hull-foot glaze; hawse hole and top fittings last |
| haze | cream paper, loose pale cobalt strokes | wash | pale blue only where the target has strokes | rigging, blocks and spar on dry paper | blocks dark last |
| sea | yellow-green to teal | wash | pale sap green and cerulean | teal ripples | none |
| masts | orange and grey verticals | wash (8 to 12 cells across) | pale raw sienna and blue | narrow strokes | none |
| anchor | blue boat, tan anchor | wash | pale | blue boat plane, anchor shape cut against it | shadow-side glaze |
| foot | mixed browns and blue-greens | wash | pale | mid | darkest glaze, with value steps |

Resolution: at 1200 px on 280 mm, one cell is 0.233 mm. The thinnest features (rigging, masts) are 2 to 3 target px,
or 8 to 12 cells across, so they are wash marks, not lines. The rivet dots are about 2 target px (about 64 cells in
area), under the 700-cell shape floor. They will be lost, and I accept that because no ink is allowed. The brush
follows the fitted plane, so the brush-to-feature ratio is set by the painter's geometry, not by me.

Moisture and load: the light wash is watery, wet on dry, and dries before the mids. The mid planes are medium load on
dry paper, with one hard side and a clean-water soften on the soft side (`_softs`). The shadow glazes are medium load
on fully dry paint. The touch-up passes use the base gain of 0.6.

Glazes: the band 4 and 5 shadow glazes cross families. The hull foot runs into the foreground, and the hull's shaded
side runs into the boat behind it.

Wet passages: none on purpose (see "Rejected").

Drawing: sparse graphite HB at pressure 0.4 (hull contours, hawse hole, anchor, masts, spar, both blocks, horizon, one
rigging line). No closing drawing; the style is no ink.

## What I changed from try 2, and why

1. **Palette `ultramarine, cerulean, sapgreen, rawsienna, sienna`** (was `ultramarine, cerulean, phthalogreen, ochre,
   sienna`). I measured the painter's own palette fit for five candidate palettes (`palette wide` line of the planning
   step). This one has the lowest sheet error, 4.40 against 5.47 for try 2's. The hull blues improve (h256 off 1.9 vs
   2.6, h262 off 1.9 vs 2.9), and so do the sea greens (h138 off 0.9 vs 2.8, h101 off 1.0 vs 3.1). Phthalo green sits
   next to cerulean in hue, so the unmix put it into the blue-greys of the hull. That made the teal-khaki centre in try
   2. Sap green is a yellow-green and stays in the sea. Raw sienna replaces ochre for the tan anchor and orange masts.
2. **`_noslane`**: no horizontal sky lanes. The template lays every large cool plane as horizontal lanes from the top
   down. On this subject those planes are the hull and the haze, not a sky. I think this is the "straight travelling
   front / raster sweep" the judges named twice. Each plane is now one gesture along its own long axis. On the hull
   that is a diagonal, as Sargent brushed it. The worked example uses the same token for its seascape.
3. **`--skyblue 0`**: no second granulating ultramarine tube. It took the blue of 34% of the sheet, added a sixth pass
   to every value step and speckled every wash with the same mottle.
4. **`--planmasses 4`**: an edge-preserving mean over 4 cells at 540 width before unmixing. The painter's own notes say
   it is meant to stop "a patchwork of value islands" inside a form, which is my main fault in the hull and the boat.
5. **`--layersmooth 3`** (was 2 mm): smoother, rounder covers for the second mid plane, with fewer jagged rims.
6. **`_ms700`** (was 300): a 700-cell shape floor at 1200 px (about 6 mm square). Fewer, larger shapes and fewer
   fragments between the lights. Planned shapes at 540 dropped from 772 (try-2 settings) to 373.
7. **Touch-up gain back to the base 0.6** (try 2 used 0.8). The touch-up passes put black slabs at the hull foot and
   the top fittings.

Kept: `_lay2`, `_ew8`, `_dk11`, `_cg11`, `_lf`, `_softs`, the cream paper, the graphite opening, `wet on dry` for every
family, no reserves, and no closing drawing.

## Critique points rejected or reinterpreted

- **Make the first stage less faint by laying darks early.** Rejected. Light to dark is correct watercolour order.
  Instead I removed what made the first stage a full faint copy: lanes, a sixth tube, and speckle-driven fragments.
- **A wet-in-wet first wash (`--firstwet`) to soften the faint copy.** Considered and rejected. Try 1's wet-on-wet
  light washes stopped the painter. A whole-sheet wet wash also risks flooding the cream lights, which carry the
  composition.
- **"Opacity fade-in".** Not a separate fault. It is the same faint whole-sheet band 1 as the 10% note.
- **Pixel metrics and the 5/5 at 100%.** Not used as evidence.

## Stage intents and failure signs

- Opening: faint pencil only.
- After the light wash: pale blue hull, pale tan masts and anchor, pale green sea, bare cream at the upper right.
  Failure: one grey-green tint over everything, or horizontal bands.
- After the mid planes: the hull as one or two broad blue planes with a strong left edge; the sea visibly green-teal.
  Failure: khaki in the hull centre, nested islands with rims, straight seams.
- After the shadows: the hawse hole and blocks dark but not black, and the foot shadow connected, with steps.
  Failure: black slabs, mud over the hull.
- What I will change at the stops: if the darks come in as slabs, lower `--touchgain` or `_dk`. If the blue goes grey,
  lower the remaining dark gain. I will not change `--paints` mid-ladder: that re-plans the pass list, so the next pass
  index would no longer match the paper.

## Changes during painting

One revision. Stops and what I saw (`bench/looks/`):

- Before the first wash (look 2): faint pencil, all 14 lines present. 56 passes planned (try 2: 63), 5 tubes, no
  sixth sky tube.
- After pass 6 (look 3, 1,132 strokes): the ultramarine and cerulean light washes read as an irregular pale blue
  wash, with the cream paper open. There are no horizontal lane bands. Try 2's frame at this point was an almost blank
  grey-green tint.
- After the light wash (pass 15, look 4, 2,830 strokes): pale blue hull, tan masts, spar and anchor, bare cream at
  the upper right. The sea is warm tan rather than pale green.
- After the first mid plane (pass 30, look 5): the structure reads and the hull is blue, not khaki. Faults: the sea
  is olive, and a straight horizontal edge runs across the left half at about 62% height. That edge is a region
  boundary in the painter's segmentation, not one of my reserves.
- After the second mid plane (pass 45, look 6): the hull is already mid blue-grey, darker than the target, and 10
  shadow passes over 27 to 35% of the sheet each are still to come. **Revision 1: `_dk11` to `_dk10`** (dark gain 1.1
  to 1.0), so the shadow glazes do not turn the lower hull slate as in try 2. The pass list was unchanged by this, so the
  re-planned ladder stayed in step with the paper.
- After band 4 (pass 50, look 7): the darks build gently. The hawse hole and foot are still light, and there are no slabs.
- Before closing (look 8): band 5 and the touch-up (11 corrective passes, 67 in all, 13,613 strokes) brought the hawse
  hole, top fittings and blocks to dark. No closing drawing, then finished (look 9).

## What the finished sheet shows (for the record)

- Better than try 2: the hull is clean blue with a strong, continuous cobalt left curve and a cobalt right plane, and
  much less khaki in the centre. The first stages are visibly blue and tan instead of one faint grey tint, with no
  horizontal lane sweep. The hawse hole, blocks and top fittings are dark but smaller and less slab-like than in try
  2. Fewer strokes overall (13,613 vs 16,592).
- Still wrong: the shapes are still segmentation cut-outs with pale rims and a uniform paper mottle. The sea is olive
  at the horizon, with only a little teal below. The hull foot is still a hard near-black wedge. The horizontal region
  edge at about 62% height across the hull remains. The rivets are lost.
- My estimate: about 4 / 10 for the finished painting and 3 / 5 for process plausibility.
