# Mittens, V5 try 3: plan

Requested style: watercolor portrait sketch, fine lines and light washes. Sheet 234.1 x 202.1 mm, 1200 x 1036 px, one
cell 0.195 mm; one target pixel (300 x 259) is 4 cells, 0.78 mm.

## What I changed from try 2, and why

| change | from | to | why |
|---|---|---|---|
| touch-up rounds | base `_tp2` (2 rounds) | `_tp0` | In try 2 the touch-ups were about 4000 of 5009 strokes. Frames are cut by stroke count, so the "10%" frame was already pass ~15 with the whole patch map laid: the judges' "cat arrives nearly formed at 10%" (1.5/5) and "whole sheet at one faint value". Touch-ups are also whole-shape single-pigment glazes: the "flat evenly-toned slabs" tell and the darkening of the shoulder strip and stubble I saw. Without them the early frames fall inside the light band and the mids. |
| mid planes | colour-cluster domains (base) | `_onedom` (`--middomain 0`) | The planner's own note: mid planes then follow the target value, "so smooth skin is not split into flat posterized patches along invisible cluster lines". My biggest fault in try 2 was posterised nested islands. |
| soft edges | base: 1 soft arc of 16 cells per shape | `_softs` + `--softarclen 100 --softmm 0.9` (12 arcs per shape, cut near hard edges rather than dropped) | Real clean-damp-brush softening along the target's soft boundaries, after each wash on dry paper: "soften one turning edge". The target's patches fade into paper; mine had hard rims on every side. Hard edges (eyes, lids, brows) are skipped by the painter's own hard-edge check. |
| dark mass contour | none | `_efade` (`--edgefade 1.2`) | Shadow weight ramps up over 1.2 mm from light paper: the hair silhouette and the warm strip behind the cheek are lighter and broken at their contour, as in the target. |
| palette | `rawsienna,sienna,ochre,sepia,ultramarine,paynes` | `rawsienna,sienna,ochre,paynes` | The cat came out brown, not orange: every warm band also carried sepia and blue. Burnt + raw sienna carry the orange, ochre + Payne's the green-grey irises, sienna + Payne's the dark browns (brows, stubble), Payne's the blue-grey hair. Fewer pans, fewer passes. |
| sky pass | base `_skyb` granulating blue "sky" pass over 38% of the sheet | `--skyblue 0` | There is no sky. It carried almost no pigment but added a pass and greyed the light band. Set before start (it cannot change after). |
| darks | `_dk16`, then `_dk20` from pass 32 | `_dk16` to start; decide at the look before the shadow bands | The CPU preview still shows a heavy dark-brown X down the cat/man boundary in bands 4-5. Without touch-ups the hair may run pale. I judge both on real paint at the stop before band 4. |
| opening drawing | 24 gestures, 18 drawn: the painter drops a whole path if one point is on a protected light | the same gestures cut where they cross the protected mask (rebuilt at 1200 px, matched the painter's 56.9%), pieces of at least 10.5 px (the 3.5%-of-width opening rule), weight at least 0.5 | Eyes, nose and brows were lost last time. The judges asked for a "line-then-wash build-up"; the drawing must survive and be visible. |
| closing ink | 42 pieces | 42 pieces + 16 whisker pieces | Whiskers are the most visible fine lines in the target. Authored as long arcs, snapped onto the target's dark whisker cores, fitted as smooth quadratics, cut where they cross protected paper. Weight 0.5, width 0.5, tapered. |
| catchlights | 1.1 mm squares | about 1.03 mm squares | Slightly smaller (the plan minimum is 1 mm); they read as pasted squares. |

Kept: `_lay2`, `_sep4` (light sepia lines), `--paperdelta 30` (white paper came back in try 2), the families and the hair
as ink-and-wash.

## Critique points

Agreed and acted on: progression tells "region arriving finished", "fine detail present in the first 25%", "flat slabs"
(touch-ups off, visible opening drawing); marks/texture 2-3 and edges/detail 3-4 (soft arcs, one mid domain,
edge fade, cleaner palette).

Rejected: the 100% stage's 5.0 (the same surface as the 75% frame, noise); the "cat fully formed while the man is a
fading blob" as an order-of-work problem: both subjects get their first wash in the same passes, and the cat is just
more saturated; classic edge 8.35 (a pixel metric that rewards the hard patchwork I am removing). Details in
`bench/SELF-REVIEW.md`.

## Reference read (value thumbnail, 4 values)

1. Paper: background, cat muzzle, chin and most of the chest, the man's forehead, nose bridge and upper cheeks.
2. Light: pale green-grey cat irises, warm cream fur between the patches, a whisper of skin tint.
3. Mid: orange patches on the cat's brow, between the eyes, the cheek, the strip behind the man's cheek; light
   sepia-grey cheek shadow and jaw; stubble; the blue-grey hair.
4. Dark: hair core and hairline; cat eye rims and pupils; the man's irises, brows, nostrils, mouth line.

Focal points: the two gazes (the cat's near eye, the man's eyes).

## Lights

| light | category | toned when |
|---|---|---|
| four catchlights (cat both eyes, man both eyes) | bare paper, explicit 1.03 mm reserves | never |
| background, muzzle, chest, forehead, nose bridge, upper cheeks | bare paper (within 30 levels of the sheet white) | never; the sketch vignettes into white |
| cat irises | pale tint, band 1 | band 1 |

## Regions and technique

| region | style | question | smallest feature | move, paper, load | edges | layers |
|---|---|---|---|---|---|---|
| cat head | precise-watercolor | wash for patches; ink for whiskers, rims, pupils | whisker 2 cells: ink; eye rim 8 cells: paint then ink | wet on dry; watery band 1; medium sienna mid | patch edges softened with clean water where they turn; eyes hard | band 1, 2 mids, accents |
| cat body | precise-watercolor | wash | stripe 12-20 cells | wet on dry, watery | soft into paper | band 1, mids, shadow only where the target is dark |
| hair | ink-and-wash | ink and wash | curl 8-12 cells | one connected blue-grey wash, dry, one glaze under the curls, pen curls | broken silhouette, edge fade | wash, glaze, ink |
| face | precise-watercolor | wash for planes; ink for lids, brows, mouth | lid 4-8 cells: ink | pale skin only where the target has tone; mid planes on dry paper | hard against the cat, soft turn on the jaw | band 1, mids, shadow, accents |

## Order, moisture, glazes

1. Opening drawing (26 pieces, sepia at 4x): likeness lines of both subjects.
2. Band 1: pale connected wash per mass, wet on dry, watery; most of the sheet stays white. No wet-in-wet (the target's
   soft edges come from softened edges, not from merged wet passages).
3. Dry. Two mid layers on dry paper, controlled load; each shape's turning edge softened with clean water.
4. Dry. Shadow glazes (bands 4-5) cross region boundaries: warm shadow from the fur behind the man's cheek onto his
   cheek; hair shadow from the hairline through the curls. Then deep accents.
5. Closing ink (58 pieces) on dry paint, at the focal points and whiskers only.

Breaks from the default: none.

## Stage intents and what would show failure

- Opening: light brown lines, both faces readable. Failure: eye lines missing again.
- Band 1: under half the sheet tinted, warm on the cat, no grey cast. Failure: one beige over everything.
- Mids: orange patches with soft edges and white between; hair a connected grey mass. Failure: hard rims everywhere.
- Shadows: hair core dark, eyes dark, the strip behind the cheek mid, not near-black. Failure: the dark X (lower `_dk`
  or raise `--shadowthresh`), or pale hair (raise `_dk`).
- Final: fine lines, whiskers visible, light washes, paper white dominant.

## Settings

- `bench/variant.txt`: `region_w13_lay2_sep4_dk16_tp0_onedom_efade_softs` at the start; `region_w13_lay2_sep4_dk20_tp1_onedom_efade_softs` from pass 21 (revision 2)
- `extra-args.json`: `--paints rawsienna,sienna,ochre,paynes --paperdelta 30 --skyblue 0 --softarclen 100 --softmm 0.9`, plus `--shadowthresh 0.5` from pass 13 (revision 1)
- Ink pigment: sepia ink (`_sep4`).

## Revisions while painting

- **Stop 0 (opening):** 36 pen lines drawn (try 2: 18). Cat ears, both cat eyes, nose and mouth; the man's head
  contour, brows, both eyes, nose and smile. Both faces readable before any paint. No change.
- **After pass 4 (light band, 378 strokes):** under half the sheet tinted, muzzle, chest, forehead and background
  white. The band is a grey-beige, cooler than the target's warm cream: the Payne's grey band-1 pass covers the same
  42.8% as the warm ones (the cat's demand fit carries some grey). Faint diagonal lanes in the face. Cannot be undone.
- **After pass 12 (mids, 1311 strokes):** cat and face planes at or past the target value, browner than its orange.
  The hair still pale grey (ink-and-wash weights put 58% of it in band 4). **Revision 1: `--shadowthresh 0.38 -> 0.5`.**
  The shadow glazes then cover 4.0% of the sheet instead of 7.2%: hair core, eyes, brows and pupils only. The warm planes
  were already dark enough, and the CPU preview's dark X down the cat/man boundary came from this band.
- **After pass 20 (value 4, 1843 strokes):** no dark X. The hair was still a light speckled grey, far from the target.
  Band 5 has zero weight in ink-and-wash, so raising `_dk` could not reach the hair. **Revision 2: `_dk16 -> _dk20`,
  `_tp0 -> _tp1`.** One touch-up round after the planned passes glazes only shapes still lighter than the reference.
  By now that is mainly the hair and eyes, and it comes last, the way a painter deepens the darks.
- **Before closing (3363 strokes, 29 passes):** the hair is a dark blue-grey with paper flecks, close to the target; the
  cat's eye rims and the man's eyes are dark. Finished.

## Outcome (my reading of `bench/looks/08-compare.jpg`)

Better than try 2: the opening drawing survived and reads; no dark X down the cat/man boundary; the hair reaches its
value with one touch-up round instead of two (3363 strokes instead of 5009, so the stroke-count frames should show a
light band at 10% and mids at 25%).

Still wrong: the cat is a mid brown, not the target's clean orange, and the face's side planes are flat brown. Both
were set by the light band and the mids (the grey in the light band). The patches still have firm edges; the soft arcs
are not visible at full-sheet scale. The closing ink barely shows, and the whiskers do not read in the final, so most of
the 58 closing paths were probably dropped by the painter's closing-contrast test (mean neighbour value difference
at least 0.06 at 1200 px) or drew too light. I did not verify this at 1200 px before closing.

Next time: a warm-only light band (Payne's grey kept out of band 1, if a setting allows it); test the closing paths
against the 1200 px contrast rule before starting; a lower `--midgain` for paler cat and face mids.

Final files: variant `region_w13_lay2_sep4_dk20_tp1_onedom_efade_softs`; extra-args `--paints rawsienna,sienna,ochre,paynes
--paperdelta 30 --skyblue 0 --softarclen 100 --softmm 0.9 --shadowthresh 0.5`.
