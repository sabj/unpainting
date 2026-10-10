# Trumbull, V5 try 1: precise architectural watercolor

## Reading the reference (value thumbnail)

- Five values. 1 lightest: the white cumulus top right (paper), the sunlit gable front and the lit faces of both towers
  (pale warm ochre, not paper). 2: blue sky (graded, deeper top left), lit stone of the left and right ranges, pale
  roofs. 3: warm stone in half-shade (left face of the main block, tower flanks), slate roofs, green tree. 4: shadow
  sides and recesses (strip right of the left tower, the inside corner right of the gable, under-eaves). 5 darkest:
  window glass (dark blue), the navy street signs, traffic lights, ground-floor openings.
- Focal point: the sunlit gable and its two arched windows, with the navy street sign on the corner below it.
- Light comes from the left/front: the gable front is the lit plane; the shade falls on the faces turned right and in the
  inside corners.

## Style balance

- Precise watercolor for every family (one style, so no style boundary can cut the facade washes into blocks).
- Wet versus dry: broad connected wet passages only for the pale stone foundation and the sky (the base lays the sky as
  one wet passage of overlapping lanes); everything with detail (windows, mullions, tower edges, signs) on dry paper.
- Glazes: four mid layers (base `_lay4`), then two cross-region shadow glazes (bands 4 and 5) that run across stone,
  windows and roofs on the shadow side; no more than two glazes per region on top of the mid planes.
- Ink: sepia (base `_sep8`), opening drawing as sparse structure, closing ink only on hard dark lines the target shows.

## Regions, technique and order

| Region (family) | Cue | Question | Move / paper / load | Edges | Layers |
|---|---|---|---|---|---|
| Sky | graded blue, white cumulus top right | wash | one wet passage of overlapping lanes (base), watery-medium, granulating ultramarine/cerulean | hard at the roofline, soft inside | light 1 only (+ shadow toning where the plan's shadows reach) |
| Gable front (focal) | sunlit pale ochre, sparse block hints | wash + sparse dry texture | pale broad wash on dry paper, watery; block hints in band 3 as paper-tooth dry brush (Y1 stone rule) | hard at the corner, broken block edges | light, mid L0 to L3, stone hints |
| Shade wing, tower flanks | same stone in half-shade | wash + glaze | local colour wash, dry, violet-umber shadow glaze across stone, windows and eaves | one hard edge at the lit corner, soft into the recess | light, mid, shadow b4/b5 |
| Left and right ranges, towers | warm stone, mullioned windows | wash | broad pale wash, mid planes on dry paper | crisp at window frames | light, mid, shadow |
| Roofs (main, right, low) | blue-grey slate | wash | cool mid wash wet on dry, darker eave | hard at ridge and eave | mid, shadow |
| Windows, doors | dark blue glass, pale frames | density (smallest mullion ~2 target px = 8 cells; window panes 4 to 6 target px = 16 to 24 cells) | dark recess accents last on dry paper (base `_rec2x _rcl`: two recess layers, clean) | hard | recess accents last |
| Tree right | yellow-green canopy, darker shadow side | wash | one irregular canopy mass wet on dry, green shadow group on dry paper (base `_leaf` refit, `_pgreen` sap green) | soft lit side, firmer shadow | light, mid, shadow |
| Trees/shrubs left | muted olive | wash | one pale mass, darker at the ground | soft | light, mid |
| Street | grey pavement, people in light clothes | wash | cool violet ground glaze (base `_rg10`, `_vio`) | soft | shadow |
| Signs, traffic lights | navy, near-black | ink-and-wash at this scale | darkest accents as paint, closing ink on their hard edges | hard | last |

Brush and resolution: 1200 px over 280 mm, 0.233 mm per cell. A mullion of ~2 target px is ~8 cells (1.9 mm), above the
four-cell threshold, so windows are painted, not inked; the closing ink only restates their hard dark edges.

## Protected lights

- Reserve (paper): the brightest white cumulus, top right ([0.94,0.01,0.985,0.05], 12.6 x 9.8 mm, small so it cannot
  cut a seam). The painter also keeps the target's near-paper lights (lit sills, sign lettering, white shirts) itself.
- The sunlit gable front is a pale painted plane (band 1), not paper. Not toned further; the shadow glazes stop at its
  lit corner.

## Drawing

- Opening (`opening-lines.json`, 85 lines): structural step edges traced from the target itself (Canny on luminance plus
  warmth, chains split at sharp corners, light smoothing, length >= 14 target px, trees and passers-by removed):
  roofline and gable slopes, both towers' silhouettes, the lit main corner, arch heads, window jambs. These are the
  light-on-light edges the dark-line tracer misses (Y1 failure: drawing missing chimney, corners, arches). Thin
  (1.2 to 1.8 target px, tapering at both ends), weight from edge contrast.
- Closing (`closing-lines.json`, used by the base `_ink4` since there is no `closingink4-lines.json`): the dark-line
  tracer at .10 contrast filtered by `q-closing-ink` to spans the target shows as hard dark lines (darker than both
  sides), 158 spans, weight from line darkness: window frames, mullions, the pole, signs. None in the lights.
- Ink pigment: sepia (base `_sep8`).

## Values and settings, what changed from V096 and why

- `_dk14` (darkgain 1.3 -> 1.4; raised to `_dk16` for the last shadow band, see revisions): The reference calls for more contrast; the target's
  window glass and shadow sides are darker than V096 painted them.
- `_lw` (litwarm, added at revision 1 from pass 23): lit stone faces glazed in clean yellow ochre, not a grey mix.
- `--skygran 1.6` (from 1.2): "more sky granulation" (the sky tube's granulation).
- `--gran 0.3` (from 0.25): "a little granulation in detail".
- Config: thirteen descriptive families (one style), reference cues per family, one small cloud reserve; subject `Y1` so
  the planner's Trumbull stone-texture rule applies.
- Opening drawing: new structural trace (above) instead of a dark-line trace only.
- Considered and not done: a wet-on-wet sky family. The compile showed the target's blue colour cluster holds the sky
  and the window glass together, so a wet-on-wet sky would have put 46 window and sign shapes into wet passages. The
  base already lays the sky as one wet lane passage.

## Revisions while painting (what I saw at the stops and changed)

- After pass 16 (ground): pale warm-grey stone wash, granulating blue sky, lit planes and window lights left as paper.
  Fault: the broad stone wash left diagonal paper bands across the facade (the same lanes repeated for each ground
  pigment). Already painted; relied on the differently shaped mid washes to break them up (they mostly did).
- After pass 22: stone read pinkish-grey against the target's golden ochre (an ultramarine pass over ~50% of the
  sheet still to come). Revision 1 (before pass 23): `_lw` (`--litwarm 1`), so on lit faces the cool and neutral share
  of the demand goes to yellow ochre (one clean warm glaze). The ladder changed only a little.
- After pass 42 and 64: buildings, roofline, window grid and graded sky read well; stone block hints sparse. Stone
  redder than the target in the shaded areas (R-G 40 against 27).
- After pass 72 (first shadow band): lit gable matched the target in value (188,167,141 against 186,164,130), but the
  shadows stayed far too light (shaded wing 172,132,94 against 142,115,84; the strip right of the left tower 145,125,95
  against 97,78,62). Revision 2 (before pass 73): `_dk16` (darkgain 1.6) for the last shadow band only. The lit gable
  is outside the shadow mask, so this adds contrast where the target is dark.

## Stage intents (what each stop should look like)

1. After the opening: thin sepia structure, roofline, towers, main corner and arches legible; no fill.
2. Light passes: pale warm stone over the buildings, pale graded blue sky, paper left in the cloud and the lights.
   Should look like a tinted drawing, no window darks yet.
3. Mid layers: roofs, half-shade stone, tree mass, window bodies start; edges crisp at frames; stone hints sparse.
4. Shadow glazes: one violet-umber glaze per shadow side crossing stone, windows and eaves; the lit gable stays pale.
5. Recess accents and closing ink: dark glass, signs, a few hard lines.

## What would show failure

- Sky in visible horizontal streaks or bands; sky rims at the roofline.
- Facade as a patchwork of pale islands with rims (separate passages) or a uniform khaki fill.
- Blurred windows, lost mullions, the gable's arches missing.
- Opening drawing missing towers, roofline or corner; closing ink heavy over soft paint or crossing the lit gable.
- Stone texture as random dots; tree as separate disks.
- Too little contrast (shadow side as pale as the lit face), or blacked-out shadows without steps.

## Result (finished, 98 passes, 14123 strokes, 105 opening lines, 2 revisions) and notes for the next try

Mean colours, target against painting: whole 162,145,122 / 166,147,123; lit gable 186,164,130 / 174,153,126; shaded
wing 142,115,84 / 152,117,81; tower strip 97,78,62 / 103,85,58; sky 189,207,231 / 159,185,215.

Held: landmarks (gable, both towers, roofline, arched and lancet windows, window grid, signs, traffic lights); dark
blue window glass in pale frames; graded granulating sky with white cloud shapes; structural opening drawing visible
under the paint; values close to the target on average; lit gable the lightest plane.

Failed or weak, worst first:
1. Blotchy shadow sides. The touch-up grew from 1 pass to 18 (8000 extra strokes) and laid many small olive and brown
   patches with pale flecks over the left range, the shaded wing and the right range: a mottled patchwork, not one
   glaze per shadow side. Cause: the main ladder left the shadows far too light (darkgain 1.4 until pass 72), so the
   touch-up had a large gap to close in small corrective marks. Next: `_dk16` from the start, so the planned
   cross-region glazes carry the value and the touch-up has little left to do.
2. Deep shadows olive-green (sap green in every shadow glaze); the target's are olive-brown. Next: try `_pbs` (burnt
   sienna back alongside sap green) so darks can mix sienna and ultramarine.
3. Diagonal paper bands from the ground wash, still visible on the lit gable. They come from the base ground passes,
   which repeat the same lanes for each pigment.
4. The right-hand tree reads ochre-orange, not yellow-green.
5. Sky somewhat deeper and more saturated than the target (skygran 1.6 and the base sky blue); granulation is good.
