# Plan: Mittens (orange tabby and a man with dark curly hair), V5 try 2

Style asked: watercolor portrait sketch, fine lines and light washes. This is try 2: I judged try 1 myself first
(`bench/SELF-REVIEW.md`), then read the critique, then changed what I agreed with.

## What I changed from try 1, and why
1. **Colour (biggest change).** Try 1 left `--paints` to the painter and got one sepia family: tan cat, brown-grey hair,
   no green. Now `extra-args.json` names the pans: `ochre, sienna, hansa, umber, ultramarine, paynes`, in that order.
   Cat orange = sienna + ochre + hansa; skin and shadow = ochre, sienna, umber; hair = Payne's grey with ultramarine
   (blue-black, not ink black). Why: both the LLM judges (overall 3 and 3, "edges detail 3, marks texture 2") and my own review saw
   a sepia-filter look; the target is orange and blue-grey. The pass order also helps the progression: the ladder
   runs one pigment at a time, so the warm cat/skin washes come first and the cool hair last, which is how a person
   would block this in. This is also my attempt at the progress judge's main tell ("whole sheet at one faint value, as
   if faded in", named 5 times): with one pigment per pass, I expect the early frames to show the warm washes only.
   I have not verified that; I will check it in the looks.
2. **No rectangular reserves.** Try 1's four small rectangles painted as hard white squares. `reserves` is now empty;
   the painter keeps the target's own near-paper lights, so catchlights come from the target's shape, not a box.
3. **Lines rebuilt.** Try 1 had 25 + 26 lines with few whiskers, and two long near-straight hairlines (a face-edge line
   at x about 610 and a curve across the cat's body) that read as ruled. Now: 25 soft pencil lines in the opening
   (ears, lids, brows, nose wings, mouth, the two faint pencil arcs round the head, a few whisker roots) and 41 in
   the closing (cat lid ribbon and pupils, nostrils, the man's brows, lids, nostrils and mouth, 16 whiskers, four hair
   flicks at the edge of the mass; 36 at the start, five whiskers added at the last stop). See "Outcome" below: most of
   the closing lines were not drawn. All are smooth spline curves from control points read off a 7x gridded zoom of the
   target, with tapered width and weight; no line follows the cat/man boundary and none runs inside the hair.
   Generator: `bench/looks/mklines.mjs` (scratch, not delivered).
4. **Look while painting.** Try 1 was started and left (0 looks, 0 revisions). This time I stopped at passage boundaries
   (11 looks, 2 revisions). Revision 1, at pass 31 of 38: `--darkgain 1.7` (was 1.3 from the base). Measured on the
   look images (median luminance in a hair box, 1200 x 1036 output): hair 145 at pass 31 against 106 in the target;
   after the revision and the touch-ups 103. Cat patches and cheek stayed within about 8 of the target. Revision 2,
   at the stop before the closing drawing: five more whisker curves in `closing-lines.json`.
5. **Mid layers 3** (kept from try 1): light-wash sketch, bare paper stays.
6. `_noslane` kept: without it the base turns on sky lanes, and the hair is the one large cool plane here, so it could
   be laid as horizontal bands. I did not test that; I keep the token because banded hair is a known failure.

## Critique points I rejected or discounted
- "Composition values 5, edges 3, marks 2" from two small vision models that scored 3.0 each: I take the direction
  (colour, marks) but not the numbers; the classic scores (value 6.8, edge 8.9, marks 7.1) disagree with them and
  the judges are noisy.
- The progress judges gave 5.0 at 100% and 2.0 to 3.0 earlier. I accept the tell, but not "uniform darkening of
  the final image" as a verdict on the whole order of work: the sequence (pencil, pale washes, darker patches,
  hair, small darks) was a real order. I fix it by pigment sequence and by not baking all detail into the first
  wash, not by changing the light-to-dark ladder.

## Reading the reference
- Value thumbnail (4 values): paper white (the man's forehead, cheeks, nose bridge, the cat's muzzle, chest and
  the whole upper right); pale warm tints (cat's pale orange patches, man's shadow side); mid browns and oranges (cat's
  patches, ear inside, left cheek and jaw, stubble); darks (the man's hair, then brows, upper lids, nostrils, the
  cat's upper eyelid).
- Focal points: the cat's green eye under its black upper lid, and the man's two eyes with brows. The hair is the
  one big dark mass.
- Smallest features: whiskers and lid lines (ink question, well under a brush mark), eye irises about 13 px in the
  target = 10 mm on the sheet (wash question, dry paper), brows about 6 px = 4.7 mm.

## Regions and technique (four families, geometry follows the painter's own colour/value clusters)
1. Cat head: pale orange on dry paper in the patches only, brown patches as a second drier layer on top; green eye
   kept pale; upper lid a dark ribbon thick at the inner corner. One hard edge on the lid, soft where orange fades
   into white fur.
2. Cat body: faded vertical strips of pale orange, brown patches against the man's cheek, most of the chest bare.
3. Hair: one connected cool grey wash, dry, then darker blue-grey in the temple and hairline; ragged dry edge,
   paper flecks kept; no ink fill; a few flicks at the edge only.
4. Face: bare paper first; one pale warm wash on the shadow side; sepia mid planes left cheek and jaw; brows, lids,
   nostrils and mouth line last on dry paper.
Moves: all wet on dry (the target has crisp edges with bare paper between washes; no wet-in-wet).

## Order (light to dark)
Opening pencil-weight pen layout -> pale washes (ochre, hansa, sienna, then umber and cool) -> dry -> 3 mid layers ->
dry -> shadow glaze crossing the cat/man boundary and the hair edge -> dry -> closing pen on dry paint.
Breaks from light-to-dark: none.

## Protected lights
Bare paper: the man's forehead, nose bridge and cheeks, cat muzzle and chest, the whisker paths. The painter's own
near-paper lights stay held. No box reserves.

## Drawing
Ink pigment: base sepia ink (unchanged). Widths are file pixels (the base gain doubles them): 0.25 to 0.5 for whiskers
and pencil arcs, 0.8 to 1.15 for brows, upper lids and nostrils. Opening weights 0.4 to 0.55, closing 0.62 to 0.9.

## Tokens and settings (on top of V096)
- `_lay3`: three mid layers instead of four. `_noslane`: no sky lanes (hair is not sky).
- `--paints ochre,sienna,hansa,umber,ultramarine,paynes` (extra-args).
- `--darkgain 1.7` from revision 1 (extra-args), replacing the base's 1.3 for the last dark band and the touch-ups.
- Kept from the base: violet shadow, cool gain 1.3, sepia ink 8x, uncapped lines.

## What would show failure
Colour still brown-grey; hair in bands or one flat grey; ink visibly filling the hair; the cat's patches turning
into an even orange wash over the white fur; whiskers thick or stubby; white squares at the eyes; a long straight
ink line anywhere; face washed all over instead of mostly paper; first frame showing the finished picture faintly.
