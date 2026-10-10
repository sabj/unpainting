# Plan: White Ships (Sargent), round V5, try 1 of 3

Style asked: pure watercolour, no ink. Technique reference read: `.claude/skills/watercolor-technique/SKILL.md` and the
bench copy (owner verdicts 7b: no streaks, no straight seams, no blocks, lights relative to the target's own paper).

## Reading the reference (value thumbnail)

- Paper: cream, about 226/219/202 (lightest 2% of the target). It shows bare at the upper right between the rigging,
  in the light streaks inside the hull and in the anchor's lights.
- Light (value 1): cream paper and the pale cobalt haze strokes behind the ship, the pale lower hull streaks.
- Light-mid (value 2): the hull's cool blue-grey body, the yellow-green sea near the horizon, the ochre anchor.
- Mid (value 3): the hull's cobalt left edge and lower body, the teal sea, the orange spar, masts and rivet dots,
  the blue boat at lower left, the grey-blue rigging.
- Dark (values 4-5): the hawse hole, the two round blocks at upper right, the grey-black fittings at the top of the
  bow, the shadow at the hull foot and the dark mixed foreground strip.
- Focal point: the bow with the hawse hole and the curved line of orange rivet dots below it; the spar on the right is
  the counterweight.

## Lights (protected)

- Cream paper, kept as paper by declaring the sheet colour (`--paperrgb 226,219,202`). On auto the painter chose white
  paper (the cream region does not touch the border), which held 0 cells and covered 99.9% of the sheet: the khaki
  failure the owner named. Paper lights are bare paper; no rectangular reserves (they would cut blocks into the hull's
  streaks), the painter's own near-paper holds follow the target's shapes.
- Hull light streaks: bare or pale-painted paper, toned by the later blue passes only where the target is darker.

## Regions, technique and order (all precise-watercolour, Sargent's confident wet-on-dry planes)

| family | cue | first wash | later layers | edges |
|---|---|---|---|---|
| hull | white bow in cool blue-grey | wet on dry, watery, pale (the painter adds its own soft merges) | mid blues wet on dry, medium load; hawse hole and rivets dry, thick | hard cobalt left edge, crisp right edge; soft turns inside |
| haze | cream with loose pale cobalt strokes | wet on dry, watery | rigging, blocks, spar wet on dry, medium to thick | rigging and blocks crisp |
| sea | yellow-green to teal under the horizon | wet on dry, watery | teal ripples wet on dry | firm horizon |
| masts | orange and grey verticals, diagonal spar | wet on dry | wet on dry | crisp narrow strokes |
| anchor | blue boat behind, ochre anchor | wet on dry | wet on dry | hard edges, anchor against blue |
| foot | dark mixed browns and blues | wet on dry | darkest shadow last | soft inside, hard at the hull foot |

Resolution: at 1200 px on 280 mm one cell is 0.233 mm. The thinnest features (rigging, rivet dots, masts) are 2 to 3
target px, 8 to 12 cells, so they are wash marks, not ink lines: pure watercolour holds them.

Order: sparse pencil (13 hand-placed lines: hull contours, hawse hole, anchor, masts, spar, block, horizon, one rigging
line; the tracer only finds 26 short thin darks, not the big shapes) in graphite HB at `--openingpressure 0.4`; light washes; dry; four mid layers on dry paper (base `_lay4`); dry; the painter's
shadow glazes across regions (hull foot shadow runs into the foreground strip, the hull's shaded left side into the
boat behind); dark accents last (hawse hole, blocks, top fittings). No closing drawing: the closing file is empty with
medium none, because the requested style has no ink.

Glazes: the shadow passes are planned per value band and never split by region ("shadows never split by region"), so
the hull-foot shadow and the left-side blue cross the hull/foot/anchor families in one glaze each.

Palette (`--paints`): French ultramarine (the granulating sky tube too), cerulean, phthalo green (sea teal with
cerulean), yellow ochre, burnt sienna (orange rivets and spar over ochre), sepia (darks with ultramarine). No lamp
black: Sargent's darks are mixed. Cadmium red was dropped before the first wash: every tube adds a pass per value band
and hue group.

Final recipe: `region_w13_onedom_ew8_dk11`; extra-args `--outlinemedium graphite --openingpressure 0.4 --paints
ultramarine,cerulean,phthalogreen,ochre,sienna,sepia --paperrgb 226,219,202 --touchgain 0.8`.

## Stage intents and failure signs

- Opening: faint pencil contours only; no dark lines.
- After the light washes: cream paper still open at the upper right; the hull a pale variegated blue-grey; sea a pale
  yellow-green. Failure: paper flooded with khaki, hull and background one flat tint.
- After the mids: hull edge crisp on the left, spar and masts as single strokes, rigging as long irregular diagonals.
  Failure: parallel bands, blocks with rims, rigging broken into dots.
- After shadows and accents: hawse hole and blocks dark but not black; hull foot shadow connected. Failure: dark mud
  over the hull, lost streak lights.

## Changes during painting (V5)

1. Before any wash (first start): `_onedom` and six tubes instead of seven, to shorten a 129-pass ladder of
   single-pigment glazes (112 after). The remaining three-way split per pigment is the base's hue grouping
   (`_sky3`/`_skyb`: blue, yellow-green and warm areas), kept as champion behaviour.
2. First start refused mid-pass: my `"baseMove":"wet on wet"` families (hull, haze, sea) made light washes into
   pre-wet paper with standing water (gate: moist share 0.71 needs at least 0.7, water 0.63 must be at most 0.15). I did
   not disable the gate (`--wetgate 0` would paint blooms into puddles). Fixed by `wet on dry` for every family, and
   restarted on a clean sheet with the pencil a little firmer (it had been almost invisible).
3. After pass 40: straight seams (a horizontal edge at 62% height across the left half, a vertical one at 35%
   width) from the painter's own mask edges. Added `_ew8` (0.8 mm edge wobble: wash and band boundaries wander like a
   wet edge) for all later passes. Pass structure unchanged.
4. After pass 105, region values against the target (L*): mids already matched or slightly dark (hull right 60 vs 64,
   hull left edge 50 vs 54), focal darks short by 13 to 15 (hawse hole 53 vs 39, hull foot 44 vs 29, top fittings 50
   vs 37). Paint cannot come off, so I undershot globally and corrected locally: `_dk11` (darks gain 1.3 to 1.1) for
   the value-5 round, `--touchgain 0.8` (base 0.6) for the touch-up, which glazes only the planning shapes still lighter
   than the target's shape averages. Result before closing: hawse hole 41 vs 39, top fittings 36 vs 37, hull foot 27
   vs 29, foreground 45 vs 44, block 55 vs 54; mids unchanged (hull right 59 vs 64, sea 66 vs 69, haze 74 vs 76).
   128 passes, 11562 strokes, no closing drawing.

## What the finished sheet shows (for the next try)

- Good: composition and landmarks (bow silhouette, hawse hole, blocks, spar, anchor, masts, rigging), cream lights at
  the upper right, darks at the right values and places, light-to-dark progression with a visible pencil start.
- Weak: colour is greyer than the target, since each pigment is glazed into every hue group (sepia and sienna over
  the blues). The sea is grey-blue, not teal and yellow-green; the hull is heavy navy-grey rather than airy cobalt;
  the granulating sky tube mottles the hull. The hull's light streaks and most orange rivet dots are lost. The seams
  laid before `_ew8` stay visible (left half, 62% height).
- Next try: `_ew8` (or more) from the first wash; consider fewer tubes or fewer mid layers (`_lay2`) against the
  greyness; consider reserves or a lighter value plan for the hull streaks; keep `wet on dry` families (the wet-on-wet
  light wash trips the gate); keep the cream `--paperrgb`, `_dk11` and `--touchgain 0.8` (the darks landed).
