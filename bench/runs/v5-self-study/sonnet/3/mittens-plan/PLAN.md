# Plan: Mittens (orange tabby and a man with dark curly hair), V5 try 3

Style asked: watercolor portrait sketch, fine lines and light washes. I judged try 2 myself first (`bench/SELF-REVIEW.md`,
part 1, written before I opened the critique), then read it, then changed what I agreed with. The painting was made
with `bash bench/paint.sh` with 11 looks and 2 revisions (see "What happened").

## What I changed from try 2, and why

1. **The drawing files were rebuilt around what the painter will actually draw (biggest finding).** `selectValueInk`
   (src/paint/experimental/light-to-dark.mjs) filters both drawing files before any nib touches the sheet: a line is
   dropped whole if any point lies on a protected light (near-paper target pixel), the opening drawing keeps only lines
   of at least 3.5% of the sheet width, and a closing line must have a mean 4-neighbour value contrast of at least .06 on
   the target as planned at 1200 px, i.e. 4x upscaled, so every edge is blurred. I emulated this rule offline
   (validated: 11 of my 34 try-2 style lines pass at 600 px against the painter's own preview count of 12) and found that
   at 1200 px only 3 of 34 pass. That is why try 2's whiskers and most lid lines never appeared and the few that did
   floated. Now: smooth curves are authored from gridded zooms of the target, snapped to the steepest part of the
   contour (the pen follows an edge), split where they cross paper-white, and only fragments that pass my emulation of
   the painter's filter are delivered: 21 closing fragments (lids, iris arcs, nostrils, mouth, the cat's lid and nose)
   that sit on their edges. That count is the emulation's; the painter's own count of drawn lines was not shown to me
   at the final stop, and on the finished sheet the pen touches are few and small (a cat ear line, the cat's lid and
   mouth, a brow and lid line on the man's left eye). Whiskers and hair wisps have a contrast of .02 to .05 and cannot be drawn as ink on this pipeline; the
   only whiskers are the painter's own reserved paper streaks.
2. **Opening drawing: three loose pencil lines** (the cat's ear, two edges, and the cat's mouth), no eyes, brows or
   lids. Try 2's progress judge named "face lines already inked in the first 25%". The eyes now arrive with the pen,
   last.
3. **Palette `ochre, sienna, hansa, ultramarine, paynes` (umber dropped).** I compared candidate pan sets by the
   painter's own colour-fit error: try 2's six pans 3.52, no hansa 9.28, no umber 2.65, no ultramarine 5.76. Fewer pans
   also means fewer passes (36 planned).
4. **Touch-up passes off at first (`--touchpoints 0`), then one round at the end.** In try 2 the touch-ups laid 2844 of
   3998 strokes, so the judge's 50%, 75% and 100% frames were all inside "darken everything". I painted the ladder
   alone first (1036 strokes), looked, then added one round (`--touchpoints 1 --touchgain .7`) for colour: the cat's
   orange and the hair's cool grey were still weak. That round laid 1611 more strokes (61% of the total), so late frames
   are dominated by it again. I traded process for colour here and do not know yet that it paid.
5. **`--darkgain` 2.3 from pass 32** (1.7 before; try 2 had to revise at pass 31 as well). Measured on a hair box: hair
   median luminance 134 against the target's 117 at pass 31; 106 after the last dark band; 103 after the touch round.
6. **`--edgefade 2`**: the shadow glazes start 2 mm inside the contour of a dark mass against paper, so hair meets
   forehead with a paler, broken rim instead of a hard dark one.
7. **Base mid layers kept (`_lay4`, I no longer write `_lay3`)**: smaller value steps between layers, so less
   visible terracing. Unverified guess; the painting still shows contour rims.
8. **No rectangular reserves, no region styles** (as try 2). I tried `ink-and-wash` on the hair family (two steps,
   pale wash and one glaze, to avoid five terraces); the plan preview showed one flat grey slab, which is exactly the
   "flat evenly-toned slabs" tell, so I removed it.

## Critique points I rejected or discounted
- "Composition values 5.5 to 6, edges 2.5 to 3, marks 2": taken as direction (edges, marks) but not as numbers; the
  classic scorer gave edge 8.73 and marks 7.17 and the small models agree with a human expert about half the time.
- "Whisker detail present from the start" (progress judge): those early whiskers are the painter's reserved paper
  streaks, not my drawing, and cannot be removed from a plan; I could only remove my own early lines (item 2).
- "Hair lingers as a flat even blob": I agree it does at 25% to 50%, but it is the value ladder's mid layers (a
  region is one tone per layer), not a plan error; I could only make it cooler and darker.
- "Only 1 of 2 judges found the order human": the process judge varies by about half a point on identical images; I
  read the favourable note ("light washes first, darks and whisker detail last like a real watercolor") as evidence
  that the order is right and the tells are about value and stroke distribution.

## Reading the reference
- Value thumbnail (4 values): paper white (man's forehead and cheeks, cat's muzzle and chest, upper right); pale
  warm tints (cat's pale orange, man's shadow side); mid browns and oranges (cat's patches, ear inside, jaw, stubble);
  darks (hair, brows, upper lids, nostrils, the cat's upper lid).
- Focal points: the cat's green eye under its dark lid, the man's two eyes with brows. The hair is the one large dark.
- Smallest features: whiskers and lid lines (ink question; whiskers cannot be drawn here), irises about 13 px in the
  target = 10 mm on the sheet (wash question, dry paper), brows about 6 px = 4.7 mm.

## Regions and technique (four families, geometry from the painter's own colour/value clusters)
1. Cat head: pale orange on dry paper in the patches only, brown patches as drier layers on top; green eye left
   pale; upper lid a dark ribbon, thick at the inner corner, then a few pen fragments on its edge. One hard edge on the
   lid, soft where orange fades into white fur. Wet on dry throughout (the target has crisp edges and bare paper).
2. Cat body: faded vertical strips of pale orange on the left, brown patches against the man's cheek, chest bare.
3. Hair: one connected cool grey wash built by the ladder, dry between layers, edge faded 2 mm from paper, ragged dry
   edge with paper flecks; no ink fill; the pen touches only the iris and lid edges.
4. Face: bare paper first; one pale warm wash on the shadow side; mid planes left cheek and jaw; brows, lids, nostrils
   and mouth last, dry.

## Order (light to dark)
Pencil (ear, mouth) -> band 1 pale washes over the whole figure (6 passes) -> dry -> 4 mid layers (5 pans each, dried
between) -> dry -> two shadow bands -> dry -> one touch-up round (corrective glazes for colour) -> dry -> closing pen
fragments on dry paint. Breaks from light-to-dark: none. Moves: wet on dry, glazed in the shadow bands; the painter
chooses dry brush for the first washes.

## Protected lights
Bare paper: forehead, nose bridge, cheeks, cat muzzle and chest, whisker paths, the upper right. The painter's own
near-paper lights stay held. No box reserves.

## Drawing
Ink pigment: base sepia ink (unchanged). Opening pencil weight about .2 (three lines, 4 drawn); closing pen weights
.3 to .7 by feature, ink contact widths about 1.5 to 3 px at 1200. All lines are smooth splines, tapered, edge-snapped.

## Tokens and settings (on top of V096)
- `region_w13_noslane` (no sky lanes); base lay4, ink4, uncap and the rest kept.
- extra-args: `--paints ochre,sienna,hansa,ultramarine,paynes --darkgain 2.3 --edgefade 2 --touchpoints 1 --touchgain 0.7`
  (started as darkgain 1.7 and touchpoints 0; revised at pass 31 and at pass 36).

## What happened
Strokes: 62 after pass 6 (first band), 146 at pass 11, 493 at 21, 568 at 26, 806 at 31, 1036 at 36, 1380 at 38 and
2647 before the closing drawing. The first band is still a faint whole-figure silhouette, now with visible diagonal
dry-brush sweeps; the cat's patches and the face shadows arrive in the mid layers; hair and lids in the shadow bands.
Final painting: cleaner lid, brow and nostril lines than try 2, no floating arcs; the cat more orange; the hair
cooler with navy blotches on brown. Still wrong: terraced contour rims, a mask-like face, no whiskers, and a
yellow-olive tangle at the cat/man seam near the bottom (from the hansa touch-up pass over the dark blocks there),
plus two faint stray grey-blue streaks on empty paper in the upper right. My guess, not verified, is the recipe's
second "ultramarine, granulating, for the sky" tube (a pass of it is listed as pass 6 and again as pass 43, although
this picture has no sky); `--skyblue 0` in extra-args is read by the painter and would remove the tube, which I did not
try.

## What would show failure
Colour still brown-grey; hair as flat grey or camouflage blotches; ink filling the hair; orange washed evenly over
white fur; white squares at the eyes; a ruled line anywhere; a first frame showing the finished picture faintly; the
last frames being a global darkening (touch-ups) rather than local additions.
