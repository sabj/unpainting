# Self-review of try 1 (Hills, V5)

Written from `previous-painting.png`, `compare.png`, `stages.jpg`, the previous plan and checkpoints, before reading
FEEDBACK.md.

## What works

- Composition and landmarks: both paths are placed and shaped right (the upper-left path and the centre S-path). The
  big oak sits above the S-path, the dark ravine woods are centre-right, and the lower meadow is lit. At thumbnail size
  the painting reads as a wooded hillside cut by meadows and paths.
- Value split: the woods are dark and the meadows light, in about the target's proportions. The darks are mixed
  (indigo, olive, blue-grey), not ink black.
- Progression: the stages run light to dark (pale yellow wash, olive mids, then blue-black shadows), the way a person
  layers.

## What is wrong (most important first)

1. **The colour is off.** The target's meadows are acid yellow-green (hansa and sap green, very saturated). Mine are
   olive and khaki. The top-right slope, one of the brightest planes in the target, is nearly bare pink-cream paper
   with scattered yellow flecks. The bottom strip is pale too. The whole sheet sits in a dull olive/navy key, while the
   target is a bright yellow-green against deep blue-green.
2. **Woods texture is camouflage, not oaks.** The canopy is made of flat blotches with hard rims and pale halo rings
   around them (cell rings), stacked in layers. The target's woods are rounded oak crowns: a lit grey-green top, a
   blue-green body and a dark underside, clumped. Mine has no readable crowns, and the blues are navy where the
   target is teal/blue-green.
3. **Paths are blazing white paper.** The target paths are warm tan/peach with a darker broken rim. In mine they are
   cut-out white strips, the brightest thing on the sheet, which reads as missing paint.
4. **The ink layer is almost gone, and what is there looks like artifacts.** For a "loose ink and wash" request, the
   drawing should carry crown outlines, trunks and path banks. Instead there are a dozen ruled black slashes (the
   diagonal lines top right, the cross by the centre oak) that read as scratches, not drawing.
5. **Early-stage block.** At 10% the sheet shows a giant pale wash with a long straight diagonal edge across the
   middle (the woods "wedge" of passes 2 to 18), plus grey blobs. That straight edge is exactly the artifact the owner
   rejects, and a trace of it stays on the lower right.
6. Pink paper tone shows through the top right and the margins: unpainted gaps, not a chosen vignette.

## At which stage it went wrong

- Planning: a whole-sheet woods family plus the painter's default single fitted gesture per plane produced the wedge
  (passes 2 to 18). `_spl6` came in only at pass 22.
- Palette: `--paintsadd ultramarine,rawsienna` on the fitted box gave too little acid yellow; raw sienna warmed the
  grass toward olive, and the ultramarine pushed the woods to navy.
- Opening drawing: the path-edge lines were traced on the protected light and dropped, so the opening had no path
  structure.
- Closing ink: 50 of 51 lines dropped by the 1224 grid contrast test, so there was no ink to speak of.
- The texture of the woods (blotches with rims) comes from many separate value-island passages (about 100 passes)
  each dried before the next: a patchwork of glazes, not a few connected washes.

## My scores

- Finished painting: **3.5 / 10**. The composition reads, but the colour key, the camouflage woods, white-cut paths and
  missing ink are all clearly wrong for the target.
- Plausibility of the process: **2.5 / 5**. Light to dark, but the early straight-edged wedge and the hundred
  blotch-by-blotch passes do not look like a person painting.

## After reading FEEDBACK.md: where I agree and disagree with the judges

Judges: composite 5.27; vision 3.0 from all three (composition/values 4.67, edges/detail 3.0, marks/texture 2.0);
classic metrics 7.54 (edge 9.08, marks 7.09, value 6.45). Progress judge: 1.5, 1.5, 2.0, 2.5, 5.0 (mean 2.5); 0 of 2
judges found the order of work human.

Agree:
- **Marks and texture 2.0** is the worst criterion and matches my point 2: the woods are a camouflage of flat
  blotches with rims, not oak crowns. My score (3.5) sits close to their 3.0 overall.
- **"Flat evenly-toned slabs"** at 10% and 25%: this is the wedge block of passes 2 to 18 (a single fitted gesture per
  sheet-sized plane), which I also named. Agree fully.
- **"Cut or scalloped wash edges, round holes"**: agree. The value-island passages leave hard scalloped rims and
  pale holes in the woods.
- **Early stages 1.5/5** ("revealed from a white background via a mask"): agree that the 10% frame looks like a
  partial reveal. The right third of the sheet was still bare while the left had its wash, with a straight edge
  between. A person covers the sheet with the first light wash and a pen sketch first.

Disagree or only partly agree:
- **"Speckle or dotted trails instead of drawn lines"**: partly. The opening pen lines were short, broken dashes
  (26 surviving fragments), which can read as dotted trails. But much of the "speckle" is paint flecks from the
  value islands, not ink. I treat it as two fixes: longer connected pen gestures, and fewer tiny paint islands.
- **"Texture arriving as a dump, everything sharpening at once late"**: I disagree that this is the main problem. The
  75% frame already holds the darks; light to dark with the accents last is the correct order. The real tell is that
  the early frames hold no structure (no drawing, no wash across the whole sheet), so the late frames look like a
  sudden arrival by contrast. Fixing the early frames is the lever, not spreading the darks earlier.
- **The 100% stage 5.0/5** is noise in the other direction: a finished painting is easy to call human. I do not take
  it as evidence the process was fine.
- **Classic edge 9.08 and marks 7.09** reward pixel agreement and blur (skill section 9). I ignore them as evidence of
  quality.
- The judges said nothing about colour, but I rank colour (olive meadows, navy woods, pink bare paper) and the
  cut-out white paths as the largest visible failures. On a learning round I trust my own reading of the target here.

## Root causes found while preparing try 2 (in the code, not guessed)

- The pink-cream bare paper and the white paths had one cause. The template's `--paperrel 1 --paperlights 1
  --paperbase source` took the lightest tenth of the target (paths plus bright meadow, mean 227/221/150) as "paper".
  It reserved every cell near it (34,523 protected cells, mostly the tan paths) and tinted the sheet. The target is
  on white paper; its paths are tan paint.
- The palette could reach the target in every variant I tried (about 3 ΔE locally for `ultramarine,rawsienna`,
  `phthaloblue,sienna`, `ultramarine,sienna`). The olive meadows came from layering: the raw sienna lane wash over
  everything and violet (rose + ultramarine) shadow glazes over yellow-green, which the skill's mud rule predicts.
- Closing ink: the painter keeps a closing line only if the mean 4-neighbour value contrast along its points is at
  least .06 on the 1224 grid. A line on a thin dark target line sits in the valley floor, where that contrast is
  near zero, so traced dark lines fail. Lines on wood and meadow edges pass.
