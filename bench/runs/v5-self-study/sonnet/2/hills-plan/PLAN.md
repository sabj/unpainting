# Plan: Hills (aerial oak hills, loose ink and wash), V5 try 2

Technique reference read before planning: `.claude/skills/watercolor-technique/SKILL.md` (layering model, foliage, grass,
ink and graphite, plan check). My own review of try 1 is in `bench/SELF-REVIEW.md`.

## Reading the reference
- Aerial view of rolling hills: bright yellow-green (lime) grass slopes cut by two winding pale-peach dirt tracks, dark
  blue-green oak canopies packed in the folds, a few single oaks casting small shadows on the grass.
- Value thumbnail (5 values): (1) near paper: the tracks and the small white flecks along track and canopy edges;
  (2) light: sunlit lime grass, brightest in the lower-right meadow and the top-right slope; (3) mid: olive-grey crowns,
  shaded grass; (4) dark: blue-green canopy masses; (5) darkest: indigo crowns centre-right and lower-left.
- Focal point: the big oak beside the track bend (left of centre) and the meadow below it; the diagonal lit grass bands and the
  S-curve of the tracks lead the eye through the dark masses.
- Resolution decision: a leaf clump is 1 to 3 target pixels (0.5 to 1.5 mm, 4 to 12 cells at 1224 px). Canopies are an
  ink-and-wash question (connected mixed-dark masses at clump scale, pen on the edges). Grass is a wash question (one
  connected wash, mottling below one mark). Tracks are reserved near-paper planes with crisp edges.

## Regions, technique, order (unchanged in kind from try 1; the family map is kept)
1. **Opening drawing, before any wash.** 26 long, sparse pen gestures with small pen lifts, drawn from the target's own
   edges (not hand-guessed): the outline of the lit grass planes and both edges of the tracks. Pressure 0.35 so it is a
   pencil-weight placing drawing that the washes cover.
2. **Light foundation (band 1), wet on dry, big brush.** One connected pale local-colour wash. Paper whites (tracks, flecks)
   stay out of every wash.
3. **Dry, then mid planes (bands 2 and 3), wet on dry.** Sunlit grass as shaped planes (`precise-watercolor` families),
   olive-grey crowns at medium load. Four mid layers are kept (the base `_lay4`) so the middle values arrive gradually.
4. **Dry, then the two shadow glazes (bands 4 and 5)** crossing region boundaries: blue-green darks from sap green, cerulean and
   ultramarine, with burnt sienna warming the shadows on grass.
5. **Dry, then closing ink, last and selective.** About 180 short broken fragments on the lower-right (shadow) side of the
   dark crowns, which is where the pen would restate an edge. None on grass, none as fills, none on the lights.

## Moisture, load, edges
- Everything wet on dry on a fully dry sheet; light washes watery, dark masses medium. Nothing is painted into an open wash
  near the tracks, so the track edges stay crisp. Wet-in-wet is not used: this reference has no soft transitions.
- Edges: hard where grass meets canopy and along the tracks, lost inside the dark masses; broken pen edges, not outlines.

## Protected lights
Tracks and the white flecks along their edges and the grass/canopy boundary (the painter's own near-paper rule; no
rectangular reserves, which would make straight seams). Bare paper until the end.

## Values and settings
- Variant `region_w13`: the V096 base unchanged (four mid layers, dark gain 1.3). I started with `region_w13_dk11` (dark gain
  1.1) because I believed try 1's darks were too black. Measuring try 1's finished painting against the target in the same
  boxes showed the dark-mass mean was already right (value 69 against 65), so I went back to the base at the revision below.
- `extra-args.json`:
  - `--paints hansa,sapgreen,cerulean,ultramarine,sienna,ochre`: real greens for the lime grass, a blue pair for the
    canopy, sienna and ochre for the warm shadow and the path edge. No quinacridone rose.
  - `--skyblue 0`: there is no sky in this crop; the base `_skyb` assigned a second, granulating cerulean to 23.7% of the sheet.
  - `--layersmooth 0.7` (default 2 mm) and `--minshapecells 60` (default about 180): shapes at clump scale, not 3 mm blobs.
  - `--openingpressure 0.35` (was 0.45).
- Style: `ink-and-wash` overall, `precise-watercolor` for the grass and track families (family boxes unchanged: they passed the
  seam check in try 1).

## What would show failure
- Grass olive or grey instead of lime; green washed into the track edges.
- Canopy as smooth big polygons again, or as speckle (too fine): a few clumps per crown, with olive lights between the darks.
- Pink or orange rims on the darks; paper-white holes inside the dark masses.
- Ink lines off the painted edges, ruled or hairy, or heavy ink over blurred paint.
- A first wash that reads as the whole sheet at one faint grey-green.

## V5: what I changed and why (try 2)
Changed (all from my own review; see `SELF-REVIEW.md`):
1. **Palette**: `--paints` with real greens and no rose. Reason: the painter's own pick was hansa, cerulean and rose; rose gave
   the orange/pink rims on the darks and grey-olive grass, and no green meant no lime.
2. **Sky-blue tube off** (`--skyblue 0`). Reason: with no sky, the second granulating cerulean took the blue canopy cells.
3. **Shape scale** (`--layersmooth 0.7`, `--minshapecells 60`). Reason: marks/texture was the lowest vision score (1.67) and the blobs were
   3 to 5 times a leaf clump. The compile preview at 612 px went from 707 to 2472 shapes with the same 42 passes.
4. **Mid layers** back to the base four (`_lay3` dropped), so the middle values arrive in more, smaller steps (the judges
   named the late dump of contrast). **Dark gain**: tried `_dk11`, then reverted to the base 1.3 in revision 1 (see below).
5. **Ink**: both files are now generated from the target's own value edges (scratch generator, not delivered). The opening
   follows the lit grass planes and track edges; the closing has about 180 broken fragments on the shadow side of crowns
   (try 1 had 16 hand-placed lines, two of which were floating crown outlines).
6. **Opening pressure** 0.45 to 0.35. Reason: the judges named "fine detail already present in the first 25%".

Kept: the family map and styles (they admitted cleanly and the layout was right), no reserves, wet-on-dry throughout.

Rejected critique points: the classic edge (9.06) and classic marks (7.18) scores, which reward hard polygon edges; the single
"dark before light" tell, which the stage frames do not show; the 5.0 at 100% as evidence of anything about process.
Not solved: the planner gives every cell a pale band-1 foundation, so the first wash covers the whole sheet; I watch for this at the first looks.

### Revisions during painting
One revision, at the stop after pass 36 of 55 (all mid values painted, no dark glaze yet):
- `bench/variant.txt` from `region_w13_dk11` to `region_w13`. At that stop the dark-mass box measured value 122 against 65 in
  the target, so the two dark glazes had to carry a lot, and try 1 had shown that gain 1.3 lands on the target mean.
- `closing-lines.json`: line weights raised (0.82 to 0.95 on the darkest edges, 0.68 to 0.80 on the lighter ones, from 0.6 to
  0.9 and 0.45 to 0.6). In the opening drawing only fragments of my lines had been drawn, which I took to mean that
  pressure times weight (0.35 x 0.8) is too faint for most segments to deposit; I did not want the same loss at the closing.
  The opening file could not change (already on paper) and was left byte-identical.

### How it turned out (seen at the last look, my reading, not a score)
- Better than try 1: no pink or orange rims, blue-green leafy canopy at roughly clump scale, mean value of the dark mass
  matches (68 against 65). The first wash was a pale yellow with paper showing, painted pigment by pigment, not a grey blanket.
- Still wrong: the grass is a dull olive, darker than the target (the meadow box measures value 139 against 168), so the
  lime is not reached; tracks are bare white, not peach; paper-white holes remain inside the dark mass at right of centre;
  the first wash of the sage ground (pass 12) still covers the left two-thirds while the right third is bare, so that
  process tell is probably not fixed.
- The opening drawing came out as 21 short, scattered hooks (about a fifth of my 26 long lines), not the long contours I
  authored. Next time: higher opening pressure, not lower.
