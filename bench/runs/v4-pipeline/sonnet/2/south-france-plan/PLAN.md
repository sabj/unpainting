# South France, V4 try 2: urban sketch, pen plus light wash

## Reading the reference
Hillside village seen from above: a pale-green pine at lower left (dark trunk, rising dark branches), grey-green olive
masses in the middle, tall dark cypress columns (left, centre, top right), ochre sunlit path and terrace wall at upper
left, and stone houses with terracotta hip roofs: a focal cluster of three houses at right (x .66-.96, y .33-.82) and
smaller houses stepping up the top. No sky; a sliver of blue-green far hills top right.
Value thumbnail (4 values): 1 paper / lit ochre path and wall faces and the pale pine top; 2 light green, tan ground,
terracotta roofs; 3 mid grey-green olive masses, mauve shadowed walls; 4 near-black cypress, tree undersides, trunk.
Focal point: the right-hand house cluster (strongest hard edges, only warm-orange/mauve contrast in the picture); second
focus the pine's trunk and branches at lower left.

## Style balance (urban sketch, pen plus light wash)
The pen carries the structure and the wash stays light and flat. `urban-sketch` for the whole sheet (the executor adds
the ink-and-wash value floor, so the wash is a pale first layer plus one shadow glaze, with no mid layers). All
families keep one style so no region boundary shows as a seam; the families only describe cues. The mid-layer tokens
(`_lay4`, ...) stay at the base: this style has no mid band to layer.

## Regions: technique, order
1. Opening pen (before any wash), hand-drawn from the target: roof edges and eaves, wall corners, floor bands, windows
   and doors of the three right houses (focal), the top village houses, the left terrace wall and hut, cypress
   contours (a rising left line and a heavier right line), the pine trunk with its rising branches, three small olive
   trunks. 118 paths, sepia ink (`_sep8` base), width tapered at both ends, wobble under 1 px. No canopy outlines in
   the opening (the drawing cannot be changed once drawn).
2. Light wash, wet on dry, in one connected pass per pigment: pale ochre/sienna on path, walls and roofs; pale
   yellow-green (hansa + cerulean/sap green) on the foliage; the far hills wet in wet. Lit stone faces and the
   near-paper lights stay paper. Check paper dry before each pass.
3. Shadow glaze (dry paper): one connected dark glaze crossing houses, olive masses and cypress (grey-green and
   ultramarine/sepia), so the darks unify instead of patching region by region. Mauve wall shadows get violet-shadow
   (`_vio`, base).
4. Closing pen, last, on dry paint (`closing-lines.json`, weights over 0.6 only): re-state roofs, wall corners,
   windows, cypress sides, trunk and branches where the glaze buried them. Foliage scribble is decided after looking
   at the sheet (may add a few loose canopy edges at the pine and olive masses, never a fill).

## Protected lights
Reserves: pale limestone rubble on the path (x .45-.50, y .89-.94) and sunlit stones at the bottom edge. The painter
also keeps near-paper target lights (lit path and wall faces, sparkles in the pine).

## Edges
Hard edges at roof eaves, wall corners and the cypress silhouettes (dry on dry paper). Soft only in the far hills
(wet in wet). The pen supplies the thin lines paint cannot hold at this scale (mullions, window frames, branches).

## Paints and settings
`--paints ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia,sapgreen`: the default five cannot mix this
yellow-green. Recipe tokens: V096 base unchanged (`region_w13`), because dark gain 1.3, sepia ink x8, uncapped lines
and cold-press paper already suit a pen-led sheet; any change is decided after the first looks.

## What would show failure
- Foliage too pale and flat so the picture reads as a drawing with a few tints (fix: raise `--darkgain`/`--midgain` for
  the later passes).
- Greens too blue or too grey (fix: paints/hue), warm houses lost among the greens.
- Pen weight heavy over blurred paint, or tremor and spurs; cypress contours reading as double outlines.
- Washes spilling over the pen lines of the houses; light stone faces filled in grey.
- Banding or straight seams from the family boxes.

## Changes during painting (V5 log)
1. After pass 12 (look 3): with the base recipe the first washes were laid as two giant slanted flat-brush swaths
   (one gesture as wide as the 80%-of-sheet connected passage, clipped to its mask) with a dry gap between them. That
   is not how a person washes foliage. Changed the tokens to `_spl6_wre15` (lanes of 6 mm, strokes of at most 30 mm,
   washes ending short of or past the outline by up to 1.5 mm) for the passes still to come. The 12 passes already
   on the sheet (ochre, raw sienna, burnt sienna, hansa) stay as swaths.
2. After pass 24 (look 6): lanes read as horizontal brick courses on the olive-grey ground, and a pale blue band
   showed where the first ultramarine passes covered the swath gap. Passes 25-26 lay the granulating "sky" blue over
   79% of the sheet though this picture has no sky. I tried to take the sky tube out (`--skyblue 0`) and to raise
   dark gain to 1.5 (`_dk15`); the harness REFUSED that revision, because removing the tube changes the palette
   already on the paper. I restored extra-args.json and variant.txt to the accepted revision and painted passes
   25-26 as planned. I lost about 20 minutes of my own time finding this out (the refusal was in a response file,
   not in the command's output).
3. Passes 27-55 (warm darks, then ultramarine, cerulean, sepia, sap green darks, then the painter's own touch-up
   passes) ran unchanged. Look 8 (before the closing drawing): the foliage masses, pine, cypress and the diagonal of
   dark olive across the sheet are in the right places, but the greens are olive and brown rather than the target's
   fresh yellow-green, the houses lost most of their orange and pale-ochre contrast under the dark glaze, and the
   lane strokes leave a diagonal hatch in the darks. I did not revise the closing pen: another revision would have
   queued longer than the time I had left, and the closing set already restates roofs, corners, windows, cypress
   sides, trunk and branches.

## Verdict against the failure list
- Final look (09): the closing pen is barely visible. Thin hairlines show on the pine's trunk and a few house edges,
  but nothing reads as confident pen over the paint, so "pen plus light wash" is not achieved; the sheet reads as a
  heavy olive wash with a diagonal hatch, not a light wash with pen.
- Foliage too pale: no, the opposite; the dark glaze is heavy and warm-olive.
- Greens: too olive and grey, not yellow-green (hansa and sap green are painted but outweighed by the sepia and ochre darks).
- Brick or hatch texture from the lanes: yes, visible in the ground and the darks.
- Pale blue band from the first ultramarine passes: yes, a faint blue band through the middle of the sheet.
- What I would do from the start next time: keep `_spl6_wre15` from pass 1 (the base recipe's one-gesture wash made two
  giant slanted swaths), and decide about the sky tube before painting (set `--skyblue 0` in the first plan, since
  there is no sky).
