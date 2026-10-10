# Plan: Mittens (orange tabby and a man with dark curly hair), V5 try 1

Style asked: watercolor portrait sketch, fine lines and light washes. First try of three, so this is the baseline plan; I
note below what I would change after seeing the painting.

## Reading the reference
- Value thumbnail (4 values): paper white (most of the sheet: the man's forehead, cheeks and nose bridge, the cat's
  muzzle, chest and the whole upper right); pale warm tints (cat's orange patches, man's skin shadow); mid browns (cat's
  brown patches, ear inside, left cheek and jaw, stubble); darks (the man's hair, blue-grey to blue-black, then brows,
  upper lids, nostrils, the cat's upper eyelid and nostrils).
- Focal points: the cat's green eye under its black upper lid, and the man's two eyes with brows. The hair is the heaviest
  value mass and the only large dark.
- Smallest features: whiskers and lid lines (well under a brush mark; ink and wash question), eye irises about 13 px
  across in the target = 10 mm on the sheet (wash question, dry paper). Brows about 6 px thick = 4.7 mm.

## Regions and technique (four families, geometry follows the painter's own colour/value clusters)
1. Cat head: pale orange wash on dry paper in the patches only; the brown patches as a second, drier layer on top;
   green eye kept paper-pale and tinted last; upper lid as a dark ribbon thickest on the inner corner. Hard edge on the
   lid and soft edge where an orange patch fades into white fur.
2. Cat body: faded vertical strips of pale orange, then brown patches by the man's cheek on dry paper with ragged edges;
   most of the chest stays bare paper.
3. Hair: one connected cool grey wash for the mass, dry, then darker mixed grey (blue-violet shadow, not ink black) in the
   temple and hairline; ragged dry edge with paper flecks kept open. No ink fill. A few loose curls are pen lines only.
4. Face: bare paper first; one pale warm wash only on the shadow side; sepia mid planes on the left cheek and jaw; brows,
   lids, nostrils and the mouth line as the last dark accents on dry paper.

## Order (light to dark)
Opening pen layout (light pressure) -> first pale washes (cat orange, face shadow side, hair base grey) -> dry ->
mid layers (3 instead of 4: it is a light-wash sketch) -> dry -> shadow glaze that crosses cat/man boundary (the
brown patches against the cheek and the hair-edge darks) -> dry -> closing pen on dry paint: lids, brows, nostrils,
mouth, whiskers, a few hair curls.
Breaks: none from light-to-dark; no wet-in-wet anywhere (every family is "wet on dry") because the reference has crisp
edges and bare paper between the washes.

## Protected lights
Bare paper: the man's forehead, nose bridge and cheeks, cat muzzle and chest, all whisker paths. Painter's own
near-paper lights stay held. Reserves: four small catchlights (cat near eye, cat far eye, man's left and right eye).

## Drawing
Hand-authored from the target on a 300 x 259 grid (the tracer returned broken fragments of the soft pencil lines, so I
placed the key gestures myself and checked them on a grid overlay). Widths are in file pixels (about 1.1 mm each with
the base drawwidthgain 2): 0.35 to 0.45 for whiskers and fine lids, 0.7 to 1.0 for brows, upper lids and nostrils.
- Opening (25 lines, light pressure 0.4 to 0.7): ears, eye lids, nose and mouth lines, face edge, two long whiskers.
- Closing (26 lines, pressure 0.65 to 0.95, all at line weight 0.6 or more so the closing pen takes them): the dark
  lids, brows, nostrils, mouth, cat pupil, seven whiskers, four hair curls. No line inside the hair mass.
Ink pigment: base sepia ink (not changed).

## Tokens and settings (on top of V096)
- `_lay3`: three mid layers instead of four; light washes, bare paper kept.
- `_noslane`: the dark hair reads as a large cool plane, and the sky lanes would lay it as horizontal bands; a curly mass
  should not be laned.
- Kept from the base: darkgain 1.3 (the hair needs real depth), violet shadow, cool gain 1.3, sepia ink 8x, uncapped lines.
- No extra-args: the wide palette picks its own pans from the picture.

## What would show failure
Hair in horizontal bands or one flat grey; ink visibly filling the hair; cat patches turning into a uniform orange wash
that covers the white fur; whiskers drawn thick or stubby; catchlights toned over; hard rectangular edges at reserves;
brows heavier than the hair; face washed all over instead of mostly paper.

## V5 note (what changed and why)
First try, no previous feedback. Departures from the example: hand-made line files rather than traced lines, small
width values because the crop is 3.7x coarser per pixel than the 3T sheet the base was tuned on, and `_noslane` because
the only cool plane here is hair, not sky.
