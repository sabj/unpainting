# Plan: White Ships (Sargent), round V5, try 2 of 3

Style asked: pure watercolour, no ink. Technique reference read: `.claude/skills/watercolor-technique/SKILL.md` and the
bench copy (owner verdicts 7b, engine-measured layering rules: "a complement over a warm base goes grey after 2
coffee glazes"). Self-review of try 1 and my response to the judges: `bench/SELF-REVIEW.md`.

## Reading the reference (value thumbnail)

- Paper: cream, about 226/219/202. Bare at the upper right between the rigging, in the hull's pale streaks and the
  anchor's lights.
- Light (1): cream paper, pale cobalt haze strokes, the hull's pale streaks.
- Light-mid (2): the hull's airy blue body, the yellow-green sea at the horizon, the ochre anchor.
- Mid (3): the hull's cobalt left edge and darker right side, the teal sea, the orange spar, masts and rivets, the
  blue boat at lower left, the rigging.
- Dark (4-5): hawse hole, the two round blocks, the fittings at the top of the bow, the shadow at the hull foot,
  the foreground strip.
- Focal point: the bow with the hawse hole and the curve of orange rivets; the spar on the right balances it.

## Lights

- Cream paper is the sheet colour (`--paperrgb 226,219,202`) so the painter's near-paper holds keep the upper-right
  sky and the anchor lights as bare paper. No rectangular reserves: they would cut straight seams through the hull's
  diagonal streaks.
- Hull streaks: pale painted plane, left as the pale first wash where the later blue plane does not reach.

## Regions, technique and order (all precise-watercolour, wet on dry)

| family | cue | light wash | mid planes | shadow and accents |
|---|---|---|---|---|
| hull | white bow in airy blue | one pale connected wash | two broad planes: whole form, then the darker left edge and right side | hull-foot shadow glaze; hawse hole and rivets last on dry paint |
| haze | cream paper, loose pale cobalt strokes | pale blue only where the target has strokes | rigging, blocks, spar on dry paper | blocks dark last |
| sea | yellow-green to teal | pale wash | teal ripples | none (no warm tube over it) |
| masts | orange and grey verticals | pale ochre and blue | crisp narrow strokes | none |
| anchor | blue boat, ochre anchor | pale | blue boat plane, anchor shape against it | shadow side glaze |
| foot | dark mixed browns and blue-greens | pale | mid | darkest glaze with value steps, not a slab |

Resolution: at 1200 px on 280 mm one cell is 0.233 mm. The thinnest features (rigging, masts) are 2 to 3 target px,
8 to 12 cells across: wash marks, not lines. Rivet dots are about 2 target px (about 80 cells in area), under the
painter's shape floor, so most will be lost; accepted, as no ink is allowed.

Order: sparse pencil (14 hand-placed lines, graphite HB at pressure 0.4: hull contours, hawse hole, anchor, masts,
spar, both blocks, horizon, one rigging line); light wash; dry; two mid planes on dry paper; dry; two shadow glazes that
cross families (hull foot into the foreground, the hull's shaded side into the boat behind); the painter's touch-up
glazes; no closing drawing (empty closing file, medium none).

## What I changed from try 1, and why

1. **Palette without sepia**: `ultramarine, cerulean, phthalogreen, ochre, sienna` (was + sepia). Sepia glazed
   into the blue hue groups was the main source of the grey mud; Sargent's darks are mixed, and ultramarine with burnt
   sienna reaches the hawse hole and foot darks. One tube fewer also means fewer passes.
2. **`_lay2` instead of base `_lay4`**: two broad mid planes instead of four. Four quantile layers per pigment and hue
   group made the hull a stack of nested islands (the patchwork and "flat slabs" in both my review and the judges').
   Passes: 62 planned (try 1: 112 to 128).
3. **`_ew8` from the first wash** (try 1 added it after pass 40, too late: the seams at 62% height stayed). Every
   wash edge wanders 0.8 mm; no ruled seams.
4. **`_softs`**: soft value boundaries inside a shape get a clean-water soften (12 arcs, 0.7 mm) while hard edges stay
   hard. Aimed at the judges' lowest scores (marks 1.67, edges 2.67): a chosen soft side instead of a rim everywhere.
5. **`_lf`**: feathered reloads, so broad washes have no darker band at every reload.
6. **`_ms300`**: shape floor 300 cells (auto was about 175): small segmentation fragments merge into their plane, so
   the hull and the boat read as fewer, larger washes.
7. **`_cg11` instead of base `_cg13`**: try 1's blues landed 4 to 5 L* too dark (hull right 59 vs 64, hull edge
   50 vs 54). Lighter cool gain keeps the hull airy.
8. **`_dk11` and `--touchgain 0.8` from the start**: in try 1 these were added late and put the darks on target
   (hawse 41 vs 39, foot 27 vs 29). Kept.
9. Opening drawing: added the second round block.

Kept: cream `--paperrgb`, graphite opening at 0.4, `wet on dry` for every family (try 1's wet-on-wet light washes
tripped the painter's standing-water gate), no reserves, no closing drawing.

Critique points rejected or reinterpreted:
- "Finished image fading in via opacity": rejected (the other judge saw a proper light-to-dark order). Not changed.
- "Whole sheet at one faint value": I keep a pale first wash because it is correct watercolour practice. I address
  its single grey hue (no sepia) rather than removing the wash.
- Classic edge 8.92 and the 5/5 at 100%: not used as evidence that anything is solved.

## Stage intents and failure signs

- Opening: faint pencil only.
- After the light wash: pale blue hull, pale ochre and orange masts and anchor, bare cream upper right. Failure: one
  grey-green tint over everything.
- After the mid planes: hull as one or two broad blue planes with a strong left edge; spar and masts single strokes.
  Failure: nested islands with rims, straight seams.
- After the shadows: hawse hole and blocks dark but not black; foot shadow connected with steps. Failure: black slab,
  mud over the hull.

## Changes during painting

None: no revision. Stops and what I saw (`bench/looks/`):

- Before the first wash: faint pencil, all 14 lines present. 63 passes planned (try 1: 112).
- After the light wash (pass 18): the sheet is not one tint. Pale blue on the hull, pale ochre on the anchor and
  masts, bare cream at the upper right. The granulating sky ultramarine mottles the hull's right band a little.
- After the first mid plane (pass 34): structure reads, no ruled seams. The pale centre of the hull and the haze at the
  upper left went khaki-grey (ochre and phthalo shares over the blue). I left the tubes alone, because changing
  `--paints` mid-ladder re-plans the pass list and the next pass index would no longer match what is already on the paper.
- After the second mid plane (pass 50): the cobalt left edge and darker right side of the hull read as broad planes.
- After the shadow glazes (pass 62): foot and boat behind have depth; hawse hole and top fittings still too light.
  Kept `--touchgain 0.8`.
- Touch-up: the painter added 13 corrective passes (76 in all, 16,592 strokes). Hawse hole now dark brown, top
  fittings and hull foot dark.

## What the finished sheet shows (for try 3)

- Better than try 1: the hull's cobalt left edge is one strong curve, the blues are cleaner and the sheet is less
  grey; no seam at 62% height; the first stage is varied in hue rather than one faint tint.
- Still wrong: shapes are still cut-outs with rims (the painter's segmentation shows through); the pale centre of the
  hull is khaki-grey, not airy blue; the sea is grey-green, not teal and yellow-green; the hull foot and the top fittings
  end as hard near-black slabs after the touch-up; the boat at the lower left is a slate patchwork. Rivets still lost.
- Next: keep ochre and sienna out of the blue groups. Choose the palette before the first wash (e.g. drop
  phthalo green, or test ultramarine, cerulean, sienna plus ochre only). Try `--touchgain 0.6` with `_dk12` so the
  darks build in the glazes, not as late slabs. Try `--skyblue 0` if the granulation reads as noise on the hull.
