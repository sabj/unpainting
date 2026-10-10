# Plan: Hills (aerial oak hills, loose ink and wash), V5 try 3

Technique reference read first: `.claude/skills/watercolor-technique/SKILL.md`. My own review of try 2 (written before I
opened the feedback) is in `bench/SELF-REVIEW.md`.

## Reading the reference
- Aerial view of rolling hills: bright lime / yellow-green grass slopes, two winding pale-peach dirt tracks, dark
  blue-green oak crowns packed into the folds, one big oak with a visible dark trunk and forked limbs beside the lower
  track bend (focal point), small single oaks casting shadows on the grass.
- Value thumbnail (5 values): (1) near paper: the tracks (pale peach, painted thin, not left white) and the few white
  flecks on canopy edges; (2) light: sunlit lime grass; (3) mid: olive-grey crowns, shaded grass; (4) dark: blue-green
  canopy; (5) darkest: indigo crowns centre-right and lower-left.
- Resolution decision: a leaf clump is 1 to 3 target pixels (0.5 to 1.5 mm, 4 to 12 cells at 1224 px). Grass and tracks
  are a wash question. Canopies are an ink-and-wash question: layered mixed-dark washes at clump scale with the pen
  restating shadow-side crown edges, and the oak's trunk and limbs as ink.

## Regions, technique, order
1. **Opening drawing (before any wash): 80-odd short pen pieces, 20 to 34 px long**, traced from the target's own edges
   (grass-against-canopy contours and both edges of each track), each piece with a small lift between, so it reads as a
   hand drawing with re-dips and not a continuous outline. Ink, visible nib (global style ink-and-wash), opening
   pressure 0.5.
2. **Light foundation, wet on dry.** Pale local colour: yellow-green on the grass, thin ochre on the tracks (they are
   painted, not reserved), pale grey-green tint under the canopy. Only near-white cells (0.1 % of the sheet) stay paper.
3. **Dry, then four mid layers, each dried (the base `_lay4`).** Each later layer covers only the darker part of the value
   field, so olive-grey crowns appear first and the blue-green crowns follow in nested steps. Every wash region is set to
   the precise-watercolor ladder (see "What I changed").
4. **Dry, then two shadow glazes** across family borders: blue-green darks crossing canopy, and oak shadows onto the grass.
5. **Dry, then closing ink, last and selective:** about 125 strokes: broken fragments on the lower-right (shadow) side of
   the dark crowns, the oak's trunk, fork and limbs (hand-placed from an enlarged crop of the target), short dashes along
   the track edges. None on the lit grass, none as fills.

## Moisture, load, edges
- Everything wet on dry on a fully dry sheet; light washes watery, dark masses medium. Hard edges where grass meets
  canopy and along the tracks; lost edges inside the dark masses; pen edges broken, not outlines.
- No wet-in-wet: this reference has no soft transitions.

## Protected lights
Only the painter's own near-white holds (0.1 % of the sheet). The tracks are not held any more (`--whitefloor 0.15`);
they take a thin ochre wash so they read as dirt, not as holes.

## What would show failure
- Grass olive/khaki rather than lime; tracks white or pink; blue pigment in the grass.
- Canopy as hundreds of equal patches (camouflage), or a flat grey blanket under it.
- Whole sheet uniformly tinted at the first frames (the "faded in" tell); a late dump of darks.
- Paper-white holes inside the dark masses; ink lines floating off the painted edges.

## What I changed from try 2, and why (V5 try 3)
1. **Every wash family is `precise-watercolor`; only the global style stays `ink-and-wash`.** Try 2 painted the canopy
   families in `ink-and-wash`, whose weights are 0.42 wash / 0.58 glaze, and for cells outside the shadow mask the
   glaze share is moved into the first wash. I traced this in `light-to-dark.mjs`: the canopy got its whole colour in one
   early wash, which is the "whole sheet at one faint value / faded in" tell (named 4 times) and the flat camouflage look
   in my own review (point 3). The `precise-watercolor` ladder gives a pale foundation, four nested mid layers and two
   glazes. The global style stays `ink-and-wash` because the pen nib and ink concentration are read from the global style
   (nib 0.6 vs 0.14, concentration 3.0 vs 0.7): precise-watercolor everywhere would draw a hairline.
   I added a whole-sheet catch-all family so no cell falls back to the heavy ink-and-wash weights (assignment is by
   intersection over union, so tighter families still win their own regions).
2. **Palette without burnt sienna** (`hansa, sapgreen, cerulean, ultramarine, ochre`). Try 2's grass was olive (meadow
   value 139 against 168); sienna and the extra blues brown it. The target's darks are blue-green, not brown, and ochre
   alone carries the track.
3. **Tracks painted** (`--whitefloor 0.15`, was 0.5): by my reading of the code the floor holds every cell with a
   total planned pigment under 0.06 as bare paper, which would include the pale peach track. This is point 2 of my
   review. It is inferred from the code, not measured on the try-2 render; the new planning log holds 973 cells (0.1 %).
4. **Mid gain 0.9**: the grass came out about 29 levels too dark in try 2.
5. **Ink drawn from the target's own edges at pen length, and a heavier opening** (pressure 0.5, was 0.35): in try 2 only
   21 of 26 long lines were drawn, as scattered hooks. Short pieces are re-dipped by the pen, and the closing set now
   has the oak's trunk and limbs and 120-odd crown-edge fragments (try 2: 180 fragments, no trunk).
6. Kept from try 2: `--skyblue 0` (no sky in the crop), `--layersmooth 0.7`, `--minshapecells 60` (clump-scale shapes),
   base `_lay4`, dark gain 1.3.

## Critique points I rejected
- Classic edge 9.35 and classic marks 7.11: pixel statistics that reward hard polygon edges; the two judge scores
  (4.0, 3.0) and my own 3/10 agree more with each other. I did not tune toward them.
- The 4.5 at 100 % is the finished image and says nothing about process; the honest process mean is about 1.6 over the
  first four stages.
