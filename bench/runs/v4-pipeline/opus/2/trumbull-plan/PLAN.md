# Trumbull, V4 try 2: precise architectural watercolor

## Reading the reference

A Gothic sandstone college front in afternoon sun. A central gable bay (lancets, two arched windows, a rose
roundel, arched doorways) stands between a shaded tower on the left and a lit tower and wing on the right. Slate
roofs, a blue sky with a white cloud at the top right, two navy banners on a pole, signal heads, a young street tree
and small figures along the street.

Value thumbnail (5 values):
1. Paper and near paper: the cloud, the pale sky above the rooflines, sunlit cream stone on the central bay and the
   right wing's coping and sills, the pavement, white shirts.
2. Light: pale ochre lit stone everywhere, pale cerulean sky.
3. Mid: raw-sienna stone blocks, blue-grey slate, the tree's yellow-green, the greyer stone of the left tower.
4. Dark: shadow sides (left tower faces, the re-entrant corners either side of the central bay, the buttress right
   of the arched windows), shadow under copings and eaves.
5. Darkest: window glass, door recesses, banners, signal heads, pole bases.

Focal point: the central bay, from the lancets down to the arched windows, with the banners at its foot.

## Style balance

- Whole sheet `precise-watercolor` (subject `Y1`, the base V096 was tuned on it, so the Y1 stone texture rule and the
  ultramarine + burnt-sienna shadow glaze stay on). No region overrides: the painter clusters the target into 6 colour
  groups without position, so an override would spread over every cell of that colour.
- Washes carry the form. Ink only on the hard dark lines the target shows (mullions, recesses, banners, the pole).
- Pigments: base Y1 `_pgreen` box (yellow ochre, raw sienna, hansa yellow, French ultramarine, cerulean, sepia, sap
  green) plus the granulating ultramarine the base gives the sky. Ink: sepia (`_sep8`), declared by the base.

## Regions, technique and order

| Family | Cue | Question | Move / paper | Load | Layers |
|---|---|---|---|---|---|
| Y1.sky (cool blues) | graded cerulean to ultramarine, white near the roofs | wash | wet on dry, one connected granulating wash; no wet-in-wet (see Breaks) | watery, light | band 1, then band 2 at the top right |
| Y1.roofs | slate planes | wash | wet on dry, one plane per pitch, hard edge on the coping | medium | bands 1 to 3 |
| Y1.stone | ochre / raw-sienna sandstone, broad lit planes | wash, then dry brush for block texture (band 3, base Y1 rule) | wet on dry; texture dry on dry, light pressure | watery first, medium mids | bands 1 to 3 |
| Y1.shade | greyer stone of the left tower and wing | wash + glaze | wet on dry; shadow glaze over dry paint | medium | bands 2 to 5 |
| Y1.windows | navy glass, lit mullions | wash + ink | dry paper, last dark accents | thick, small round | bands 4 to 5 |
| Y1.tree | yellow-green tree | wash | wet on dry canopy mass, darker greens shadow side | medium | bands 2 to 4 |
| Y1.street | pavement, figures, signals | wash + accents | wet on dry; small dark accents last | medium | bands 3 to 5 |

Smallest feature: a mullion or lancet is 1 to 2 target px, 4 to 8 cells at 1200 px (0.23 mm a cell): at the
threshold for a painted mark, so mullions are mostly left as the light between dark glass passes and restated in ink.

Order: opening ink drawing, band 1 pale washes (stone, sky, slate) on dry paper, dry, bands 2 to 3 mid planes and
stone texture on dry paper, dry, bands 4 to 5 shadow glazes crossing walls, windows and buttresses (shadows never split
by region), window and door recesses, touch-ups, closing ink.

## Lights

- Bare paper: the painter's own held whites (0.6% of the sheet: the cloud, white shirts, the brightest lit sills),
  held out of every pass.
- Pale painted plane: the sunlit stone of the central bay and the right wing, band 1 only.
- No rectangular reserves. A rectangle around the cloud or the shirts left square white patches of sky and pavement in
  the plan preview, so I removed them and let the painter's target-shaped whites carry the lights.

## Glazes

Bands 4 and 5 are the cross-boundary shadow glazes (ultramarine + burnt sienna, the base Y1 mix): one over the left
tower and left wing, crossing wall, windows and buttress; one down the re-entrant corners either side of the central
bay; one over the buttress right of the arched windows. Each needs the sheet fully dry (the painter dries every pass).

## Drawing

- Opening (`opening-lines.json`, 85 lines): the skyline silhouette (gable apex and slopes, both rooflines, right tower
  top, left spire), found as the edge of the sky region and simplified into long strokes, plus the longer strict-traced
  hard lines (mullions, jambs, the right gable coping, the pole), drawn lighter (weight at most 0.55) so the washes
  cover them.
- Closing (`closing-lines.json`, used by the base `_ink4`): target-supported hard dark lines traced at contrast 0.14,
  length 12 or more, cut at the closing stop to 64 of 140 lines (see Revisions): mullions, jambs, copings, string
  courses, the pole. No skyline in the closing ink, so the building is not outlined.

## Recipe

`region_w13`: the V096 base unchanged to start, because it was tuned on this subject. I adjust the remaining passes
at the stops if the painting shows a need (see below).

## Breaks from the default

- Sky not wet-in-wet. The sky's colour cluster also holds window glass, banners and slate (the plan preview put 436
  wet shapes on the windows). Windows are detail and must stay dry, so the sky is a connected wet-on-dry wash.
- `atmospheric-wet` not used: its style lists no accepted result, and the base has a sky treatment tuned on Trumbull.

## Stage intents and failure signs

- After the opening: a sparse skyline and window structure, not a traced line drawing.
- After band 1: a pale warm building, a pale blue sky, white lights already present; no hard seams.
- After the mids: stone planes with value steps, slate reading as planes, the tree as one mass.
- After the glazes: the left tower and corners clearly in shadow, the central bay still lit; windows dark.
- Failure: muddy or speckled stone, sky banding or contour rings, windows blurred, lights filled in, ink heavy over
  blur.

## Revisions during painting

- Opening drawing (look 1): sparse skyline, copings, jambs and mullions, as intended. Parts of the right roofline came
  out faint.
- After pass 4 (look 3): the first ochre and raw-sienna ground washes are broad pale planes, but two diagonal pale
  stripes cross the building where neighbouring flat-brush gestures did not meet. This comes from the fitted
  diagonal gesture for very large planes; lane washes exist only for skies or under `region_w15`. Not changed: the
  mid passes (over 50 to 66% of the sheet) are different shapes and mostly covered them by pass 62.
- After pass 16 (look 4, end of band 1): the building had gone a greyed beige. The ultramarine, cerulean and sepia
  ground washes each covered 81% of the sheet and neutralised the ochre, while the target's sunlit stone is a clean
  warm gold. **Revision 1 (before pass 17): `region_w13_lw` + `--litl 76`.** `_lw` moves the cool and neutral share of
  a lit warm stone face into yellow ochre, so the face is one warm glaze with paper glowing through, and it takes the
  shadow glaze off lit faces. The default threshold (lit L* 86) caught only about 17% of the target's warm stone. Its
  lit faces form a separate group at L* 75 to 95, against shaded stone at L* 45 to 60, so I set 76. Effect in the
  re-planned ladder: the mid ultramarine pass over the building dropped from 65.8% to 48.0% of the sheet.
- After pass 62 (look 8, end of the mids): towers, gable, arches and roundel read; the sky is a good graded blue with
  paper clouds. The stone runs too orange-sienna, and paper flecks are scattered on the left wing. The windows are bare
  paper by design (`Y1` recesses are kept off the paper until bands 4 and 5, `_rcl`). No change.
- After pass 72 (look 10, band 4): windows are blue glass with lit mullions, banners painted, shadow sides on the left
  tower and buttresses, central bay still lit. Dark gain left at 1.3: band 5 lays the second recess layer.
- Before the closing drawing (look 11, 98 passes including the painter's touch-up rounds): the touch-ups moved the
  stone from orange toward the target's gold; windows are dark navy with lit mullions; the central bay is the lit
  focal plane. The left wing and tower stay mottled, with pale flecks, and the tree and shrubs are busy masses.
  **Revision 2 (closing ink only):** laid over this sheet, the 140 traced closing lines put squiggles in the shrubs,
  the tree and the mottled left wing (heavy ink over busy paint). I kept the 64 lines that run fairly straight
  (chord/length at least 0.75, length at least 12 px) and lie outside the shrub zone (x < 0.27, y > 0.70) and the tree
  (x 0.61 to 0.76, y 0.62 to 0.98). The ink restates structure the paint cannot hold at this scale (mullions, jambs,
  copings, string courses, the pole) and nothing else.
- Finished (look 12): light, selective closing ink on the copings, jambs and mullions. Against the target: the value
  shapes, skyline, window grid and lit central bay match. The weaknesses are the mottled left wing and tower (pale
  flecks), stone a little more orange than the target, the tree and shrubs as busy yellow-olive masses, and faint
  traces of the diagonal first-wash stripes.
