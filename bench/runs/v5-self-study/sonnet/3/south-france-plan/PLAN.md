# Plan: South France, V5 try 3 (urban sketch, pen plus light wash)

Read before planning: `.claude/skills/watercolor-technique/SKILL.md`, `bench/SELF-REVIEW.md` (my review of try 2 written
before I opened the critique, then my comparison with it) and `bench/feedback/FEEDBACK.md`.

## Reference cues and value thumbnail
Hillside village seen from above, 304 x 249 px target on a 280 mm sheet (1 target px = 0.92 mm, 1 output px = 0.23 mm).
Five values: (1) paper-light: sunlit tan walls, pale path, roof lights; (2) the bright yellow-green pine crown (bottom left)
and the ochre terraces; (3) mid greens of the olive crowns, terracotta roofs; (4) lilac and purple shadow walls, grey-green
shaded olives; (5) darks: cypress flames, the pine trunk and limbs, window openings, the deep shadow between crowns.
Focal point: the terracotta-roofed house group right of centre (x 195-295, y 80-205 px). Secondary: the cypress pair top
centre and the pine bottom left. The pine crown must stay LIGHT (it came out dark olive in tries 1 and 2).

## What I changed from try 2, and why
Try 2: finished painting judged 4.0 and 4.0 (my own 4/10); progression 3.5, 2.5, 1.5, 2.5, 3.0 (mean 2.6; my own 3/5).
The worst stages were 25 % and 50 %: "straight travelling front, wipe or raster sweep", "whole sheet at one faint value",
then "no change from the previous snapshot" at 75 % to 100 %. Each change names its cause.

1. **Stroke-planned lanes instead of one giant gesture per plane** (`_spl6` and `_wre15` in `variant.txt`; this was added by a
   revision after pass 3, see "Revision 1" below). Cause of the bands: my try-2 sheet had straight-edged diagonal bands across
   the first washes and a pale blue-white strip down the centre; the judges named "straight travelling front, wipe or
   raster sweep" three times. I first thought sky lanes caused it and turned them off (`_noslane`, `--skyblue 0`, both
   still in the plan). The pass-3 look showed the bands were still there, so that guess was wrong. The mechanism is in
   `src/paint/experimental/shaped-marks.mjs` (lines 7-8): with no sky lanes a large plane is "one fitted diagonal gesture"
   along its principal axis as wide as the shape. `--strokeplan 1 --lanemm 6` (`stroke-plan.mjs`) lays the passage instead
   as overlapping 6 mm brush lanes cut into strokes of at most 30 mm, each with its own charge from the plan's local amount;
   `--washreach 1.5` lets a wash end where its stroke ends instead of on the mask outline. The V095 note says `_spl6 _wre15`
   was rejected as "noisy and fake on hair"; this subject has no hair, so I tried it and judged it on the washes and the
   foliage. **Result, and my mistake:** with the token's own 6 mm lanes and 30 mm strokes (passes 4 to 21), the whole-sheet
   ground washes came out as a regular horizontal corrugated or brick pattern over the entire sheet (lane stripes with
   vertical joints), a mechanical tell like the diagonal bands. After pass 21 I set `--lanemm 16 --strokemm 120` in
   `extra-args.json` (it is appended last, so it wins over the token): wide sweeps with few joints, smooth washes, no new
   stripes. The final plan files carry those values. I did not test the lane size before starting, and I should have.
2. **The pen is split in time: sparse structure first, the sketcher's foliage line last.**
   - `opening-lines.json` (84 lines): houses, roofs, openings, terrace walls, cypress, pine trunk and limbs. No foliage
     contours. Cause: "fine detail already present in the first 25 %" (named twice) and my own view that the early frames
     should be a sketch of the big structure.
   - `closing-lines.json` (289 lines): (a) the 80 structure lines drawn again with a hand's drift (offset up to 0.35 px,
     slow wobble, weight +0.12), so the closing pen adds visible weight instead of retracing the opening line exactly (try
     2's closing pen changed 0.11 % of the sheet); (b) the 143 broken foliage contours from try 2, drawn over the dry wash;
     (c) 66 short hatch flicks on the shaded wall faces of the village (angle about 52 degrees with jitter, spacing and
     length jittered, slightly bowed: not a ruled hatch). This also gives the 75 % to 100 % frames a real difference.
   - I kept a pen opening at all because an urban sketch is drawn first and the 10 % stage was my best-scored (3.5).
3. **Kept from try 2**, because they worked: pen pressure 0.9 (`--openingpressure`, a visible nib of 0.2 to 0.4 mm), no
   hand-made reserves (rectangular reserves left square white holes in try 1), touch-up passes off (`--touchpoints 0`),
   precise-watercolor ladder on the foliage families (`_lay3`, `_dk11`), palette `ochre, sienna, hansa, sapgreen,
   ultramarine, cerulean, rose` (planning-step colour error 4.57; sepia 5.35, raw sienna and phthalo green 4.86, umber 5.37).
   The planning step now reads 63 passes, 1231 shapes, 88 glazes.
4. **Not changed on purpose:** the config's families and region styles, because the previous plan was admitted and the
   village and cypress were the good parts of the sheet.

## Rejected from the critique
- **Classic edge 9.17 / marks 7.06 as evidence of quality.** I see stepped, cut-out blob edges; a metric that rewards
  crispness is not evidence of good edges. Not tuned to.
- **Removing the early pen** (from "fine detail already in the first 25 %"). Partly accepted (foliage contours moved to the
  end) but the structure drawing stays first.
- **The composite null** is a failed third judge (spend cap), not information about the painting.
- **The note that the "dark-to-light build is believable"**: the painter works light to dark; one noisy note, ignored.

## Regions, technique, order (families in `config.json`)
| family | cue | question | move | paper state needed |
|---|---|---|---|---|
| SF.village | terracotta roofs, tan walls, lilac shadow sides | wash plane per wall and roof; pen for edges and windows | wet on dry, pale wash per plane, one lilac shadow glaze across wall and window | dry before the shadow glaze |
| SF.village-top | small pale houses | wash plane, paler than the focal group | wet on dry | dry |
| SF.terrace | ochre walls and path, hut | wash plane; hut opening dark last | wet on dry, one connected ochre wash | dry |
| SF.cypress | flame shapes, darkest darks | wash question, mixed green-black, pen outline | wet on dry, one mass per tree, darkest last | dry |
| SF.hills | distant blue-green | wash | wet in wet, pale, soft | damp |
| SF.foliage-centre / -left / -low | olive crowns, clumps | wash plane in graded layers, broken pen contour last | wet on dry: pale base, three mid layers, shadow glaze across crowns | dry between layers |
| SF.pine | light yellow-green crown, dark trunk and limbs | crown is a wash question; trunk and limbs an ink question | crown pale and light; trunk and limbs pen | dry |

Resolution check: a leaf is under one target px (0.9 mm), well under four cells, so leaves are not painted as marks; the
foliage is a value plane with an edge and the pen's broken contour supplies the sketch texture. A nib of 0.2 to 0.4 mm is
0.9 to 1.7 output px, which survives cold-press tooth.

## Moisture and load
Wet on dry throughout except the hills (wet in wet). First layers watery and pale, mid layers medium, shadow glazes
thicker; those are the painter's own per-layer loads, which I do not set. Fast drying between passes (fixed).

## Protected lights
None authored. The painter's own near-paper lights (the sunlit tan walls and the pale path) are the only lights kept.

## Edges
Hard where the target is hard (roof ridges, wall corners, cypress edges, pine limbs), drawn by the pen; soft only on the
distant hills. The painter's foliage blobs have stepped edges that I cannot change; the broken closing contour carries
some of that.

## Values
Light to dark: pen structure; pale washes; mid layers; shadow glazes (lilac on the walls, green-black under the crowns and
in the cypress); closing pen (doubled structure, foliage contour, wall hatch). The pine crown should stay the lightest
large green in the lower half.

## What would show failure
- Diagonal bands or a straight front in the first washes; a pale blue-white central strip; (new) ruled horizontal lane
  stripes or brick joints in the washes.
- The pine crown dark olive again; one-hue olive foliage; blue-black blotches in the centre.
- Closing pen that still changes nothing, or hatch that reads as ruled; foliage contours that read as closed worms.
- Frames at 75 % and 100 % that are still the same picture.

## Revisions made while painting
1. After pass 3: variant `_spl6_wre15` added (stroke-planned lanes, see change 1). Cause: the pass-3 look still had straight
   diagonal bands although sky lanes were off.
2. After pass 21: `--lanemm 16 --strokemm 120` added to `extra-args.json`. Cause: the 6 mm lanes made a corrugated pattern.
3. Before the closing drawing: 17 traced dark pine limb and trunk fragments appended to `closing-lines.json` (306 lines in
   all). Source: `tools/q-trace-ink.mjs` on the target, kept only inside the pine box. Cause: the pine's dark limbs are a
   main feature of the target and my opening pen only had a few thin ones.

## Outcome
The plan was admitted and painted to the end: 63 passes, 9,866 brush strokes before the closing drawing; the painter
reported 88 pen lines at the first stop (my opening file has 84 lines; I did not check why they differ) and my closing file
has 306 lines (I did not verify how many the painter drew). Twelve looks, three revisions. The GPU machine failed once before the first stop and the harness
restarted it from the start with my plan (no effect on the plan). Checking: the local `bash bench/check.sh` hung in my
sandbox (its slot loop does `mkdir <local path>`, which was denied, so it never reached the end and never printed ADMITTED). I
ran its two parts by hand instead: the executor pre-check printed `"ok": true` with the painter arguments I intended, and
the planning step at 608 px passed (63 passes, 1231 shapes, palette error 4.57). The harness's own admission check for
`bash bench/paint.sh start` passed at full size. I did not see the ADMITTED line from `check.sh` itself.

What happened, by stage (my own reading of the looks; I have not seen the judges' strip):
- **Opening pen:** a sparse, plausible sketch of houses, cypresses, terrace lines and the pine; thin hairlines.
- **Pass 3 (first wash):** the diagonal bands were already there (so the sky-lane theory was wrong).
- **Passes 4 to 21 (ground, 6 mm lanes):** burnt-sienna roofs and patches fine; the whole-sheet ground washes showed a ruled
  horizontal corrugated pattern. This is the stage of the 25 % and 50 % progress frames (stroke counts: 25 % is about pass 10,
  50 % about pass 16), so I expect those frames to carry a mechanical tell again, probably not better than try 2's diagonal
  bands. This is an estimate; I cannot see the frames.
- **Passes 22 to 34 (mid layers, 16 mm lanes):** smooth broad washes, an olive veil over the whole sheet, no new stripes.
  The 75 % frame (about pass 35) is this stage.
- **Passes 35 to 63:** the foliage clumps and the dark glazes. Edges are softer than try 2's cut-out mosaic and the clumps
  differ more in value.
- **Closing drawing:** 306 lines changed 0.23 % of the sheet (2,798 pixels; try 2: 0.11 %). Thin hairlines over a dark mosaic
  are close to invisible, so the plan to make the last frames differ through a visible closing pen did not work. The
  75 % to 100 % frames differ because of the dark passes, not the pen.

Measured against the target (mean luminance, sheet against target): whole 129 / 124, pine 118 / 117, olive centre 128 / 122,
houses 128 / 128, top-left terrace 151 / 145. So the mean tone is right; what is missing is contrast and hue variety
(lit yellow-green against shaded blue-green), and the pine's average colour in the target is olive too. I almost lowered
`--darkgain` on a visual impression at pass 43 (the sheet looked dark); the numbers showed it was lighter than the target at
that point, so I left it.

Still wrong: the pine crown and the olives are one dull olive-khaki; the blue-black blotches in the middle remain; white
holes at the top-left terraces; the closing pen is almost invisible; the whole-sheet veil at the mid stages is inherent in the
painter's pass structure (seven pigments each laid over about 80 % of the sheet at the lightest steps) and I did not change it.

My scores (not the judges'): finished painting **4.5 / 10** (try 2: 4); plausibly painted **3 / 5** (same as try 2, with the
corrugated 25 % to 50 % stage as the likely weak point).

If I had another try: set `--lanemm 16 --strokemm 120` (or larger) from the start, with `_spl6 _wre15`, so the ground is one
smooth sweep; make the closing pen heavy enough to show (more lines in the dark foliage with a wider nib, not retraces of
thin lines); keep checking numbers against the target (mean luminance and colour by region) at each stop before changing a
setting.

## Checked against the skill's closing list (`watercolor-technique/SKILL.md`, section 9), finished sheet
- **Value shapes at thumbnail size:** mean tone matches the target by region (numbers above); the structure is only partly
  right: the village group and the dark cypress read, the pine and the olives are one flat olive without a lit crown.
- **Lights:** I authored no reserves. The painter kept near-paper lights; at the top-left terraces they came out as bare
  white holes with ochre scraps where the target has pale ochre walls, so they are blazing rather than toned. Fails.
- **Edges:** softer than try 2 on the foliage, still stepped; the hard edges (roofs, cypress) are carried by the pen and
  fine. Partly.
- **Landmarks:** house group, cypress pair, pine, centre path and the top hills are in the right places. Passes.
- **Mark character:** the 16 mm lane washes are smooth; the early 6 mm lanes left a ruled pattern that later layers mostly
  cover. The closing pen is too faint to count as a mark layer. Partly.
- **Progression:** light to dark across the stages; the middle is a whole-sheet veil; the 25 % and 50 % frames are the
  likely weak point (corrugated ground). Not verified against the judges' strip.
- **Loose plates:** not a loose plate: the painter covers 100 % of the sheet whatever the style (the planning step says so).
