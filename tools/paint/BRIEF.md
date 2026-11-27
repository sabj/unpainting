# Watercolour painting script: the brief (BRIEF_VERSION)

## The task

Write a painting script for the subject: a JSON list of passages that a simulated painter lays, in order, on a sheet
of cold-press paper, with simulated water, pigment, a loaded brush and drying. The finished sheet is painted at full
size, filmed, and judged as a watercolour of the subject.

LEVEL_GIVEN

## The sheet, the paints, the brushes

- Sheet: `SHEET_W` by `SHEET_H` mm. Every position is in sheet millimetres, x to the right, y down. Every picture you
  are given carries the same millimetre grid (red numbers across: x; blue numbers down: y).
- Paints: `palette` names up to PAINTS_MOST keys from the box (Appendix C).
- Brushes: `brushes` names your own brushes. `widthMm` is the loaded belly's width at full pressure. The kit's widths
  (name: mm) are KIT_LIST; a brush may be any width from the narrowest to the widest of these.

## What you answer: the script

One JSON object and nothing else (no words around it, no code fence). Fields, one line each; Appendix A says how
the painter lays each one.

The script:

```
format     "painting-script 2"
sheet      {"widthMm": SHEET_W, "heightMm": SHEET_H}
palette    ["<paint key>", ...]                         at most PAINTS_MOST
brushes    {"<name>": {"shape": "round" | "flat", "widthMm": <mm>}, ...}
lights     [{"what": "<text>", "region": [[x, y], ...]}, ...]          optional; paper kept under every passage
passages   [<passage>, ...]                              laid in this order
subject, author, approach, plan                          optional; text for people, not read by the painter
```

A passage:

```
id         "<unique>"
kind       "wash" | "strokes" | "touches" | "lines" | "erase"
stage      1 | 2 | 3 | 4 | 5
region     [[x, y], ...]         or  regions [[[x, y], ...], ...]
paths      [[[x, y], ...], ...]                          kind "lines": the polylines the point follows
strokes    [<stroke>, ...]                               strokes written one by one (any kind but erase)
paint      {"pigments": {"<key>": <parts>, ...}, "dilution": "very pale" | "pale" | "medium" | "strong" | "rich" | "dark", "swatch": "#rrggbb"}
brush      "<name from brushes>"                         required except for a wash
paper      "dry" | "damp" | "wet"
into       "<id of the passage immediately before>"
wait       "dry" | "damp" | "none"                       default "dry"
edges      "lost" | "found" | "mixed"
handling   {<handling>}
count      <number>                                      strokes or touches the painter places in the region
character  {"size": "even" | "varied", "spread": "clustered" | "scattered" | "along a line", "denser": "top" | "bottom" | "left" | "right" | "edges" | "middle" | "none"}
charges    [{"pigments": {...}, "dilution": "...", "at": [[x, y], ...], "brush": "<name>"}, ...]
shapes     [<n>, ...]                                    traced shapes as the region (levels with traced shapes)
reserve    [<n>, ...]                                    traced shapes this passage is laid round (same levels)
widthMm    <0.5 to 10>                                   kind "erase": the eraser's width
what, why, glaze, dryFirst                               optional; text for people, not read by the painter
```

Unless a passage says otherwise, it is laid on dry paper after everything before it has dried (`paper: "dry"`,
`wait: "dry"`).

Handling:

```
mark       "<one of the 26 marks in Appendix B>"
pressure   [<0..1>, ...] | "light" | "medium" | "firm" | "swell" | "taper" | "fade" | "press"    along each stroke, start to end
path       "straight" | "curved" | "s-curve" | "zigzag" | "flick" | "wobble"
direction  <degrees> | "form"                            0 left to right, 90 down, -45 up to the right; a wash: default "form"
lengthMm   <mm>
hold       "upright" | "side"
start      "point" | "belly"
speed      "slow" | "medium" | "fast"
load       "flooded" | "loaded" | "damp" | "dry"
look       "<text>"                                      for people
```

A stroke (one of these forms; any of them may add `"brush": "<name>"` and `"pressure"`, a list or a word):

```
{"points": [[x, y, pressure], [x, y, pressure, speed], [x, y], ...]}   2 or more points; speed in mm/s, optional
{"from": [x, y], "direction": <deg>, "lengthMm": <mm>, "pressure": [...], "path": "..."}    from its start
{"at": [x, y], "direction": <deg>, "lengthMm": <mm>, "pressure": [...], "path": "..."}      from its middle
{"along": <n>}                                                   down traced shape n's long axis (levels with traced shapes)
```

The drawing, beside the script (where it goes: "How you answer", in your level's block):

```
medium     "pencil" | "pen" | "none"                     the drawing laid before the washes
ink        "waterproof" | "soluble"                      the pen's ink
lines      {"format": "lines-edit 1", "own": [{"points": [[x, y], ...], "medium": "pen" | "pencil", "widthMm": <mm>, "dark": <0..1>, "when": "before" | "after"}, ...]}
```

## Two example passages

Neutral examples of the format, not of this subject: every field is one the painter reads.

1. Broad wet-in-wet sky/background with a `38 mm` flooded mop, followed immediately by a damp `into` colour drop (no dry overlap stripes, soft luminous transitions):

```json
[
  { "id": "p01", "what": "example: broad flooded mop wet sky wash", "stage": 1, "kind": "wash",
    "brush": "mop", "paper": "wet", "edges": "lost",
    "region": [[6, 6], [274, 6], [274, 96], [6, 96]],
    "paint": { "pigments": { "cerulean": 2, "ultramarine": 1 }, "dilution": "pale", "swatch": "#b9cfe3" },
    "handling": { "direction": 0, "load": "flooded", "speed": "fast", "hold": "side", "start": "belly" } },
  { "id": "p02", "what": "example: soft cloud shadow dropped wet-in-wet into p01", "stage": 1, "kind": "wash",
    "brush": "flat", "into": "p01", "wait": "damp", "paper": "damp", "edges": "lost",
    "region": [[90, 32], [230, 28], [225, 68], [85, 72]],
    "paint": { "pigments": { "ultramarine": 2, "rose": 1, "sienna": 1 }, "dilution": "medium", "swatch": "#8b8ca6" },
    "handling": { "direction": -6, "load": "loaded", "speed": "medium", "hold": "side" } }
]
```

2. Shaped dry strokes (written point by point, placed by start/direction, or along a traced shape):

```json
{ "id": "p07", "what": "example: three strokes in one passage", "stage": 3, "kind": "strokes",
  "brush": "r10", "paper": "dry", "wait": "dry", "edges": "found",
  "paint": { "pigments": { "ultramarine": 2, "sienna": 1 }, "dilution": "medium", "swatch": "#6f7a8c" },
  "handling": { "mark": "comma", "path": "curved", "load": "loaded", "speed": "medium", "hold": "upright", "start": "point" },
  "strokes": [
    { "points": [[60, 40, 0.1], [66, 46, 0.5, 40], [70, 54, 0.9, 30], [71, 63, 0.8, 50], [68, 71, 0.4, 90], [62, 76, 0.05, 140]] },
    { "from": [90, 50], "direction": 70, "lengthMm": 18, "brush": "r4" },
    { "along": 12, "brush": "r4" }
  ] }
```

In Example 1, `p01` wets its own footprint first and glides across in broad flooded passes (`mop` at `38 mm`), and `p02` drops into the still-damp sheet (`into: "p01"`, `wait: "damp"`) so the two hues merge softly without hard stripes. In Example 2, the first stroke is written point by point with pressure and speed, the second is placed by start/direction/length as a `comma` mark with `r4`, and the third runs down traced shape 12's long axis (only where traced shapes are given). `mop`, `flat`, `r10` and `r4` are brushes the script names in `brushes`.

## Budget and rules

- Looks: LOOKS_MOST look units for this try, enough for LOOKS_WHOLE looks of the whole script. A look paints your
  script for real on a small sheet (the same millimetres, half the cells across), dries it, and shows you your own
  sheet. A whole look costs 0.3 units; a look stopped after a stage, or cut to a region, costs its share, and never
  less than 0.05. The full-size final is not charged. Water, strokes, passages, waits and dryings are not charged.
- Time: WALL_MINUTES minutes on the clock for the whole try, replies and looks included. When they are up, the
  script as it then stands is painted.
- A script that cannot be read or laid is refused with the reason: a paint not in the box, more than PAINTS_MOST
  paints, a brush not in `brushes`, a `kind` or `paper` not listed above, a passage with no region, strokes or paths,
  a traced shape where none are given. Everything else is laid as written.
- Pictures are for your eyes only: no code may read their pixels. No score, judgment or measurement against the
  subject or a study is shown to you at any point.

<!-- PAINTING TIPS -->
## Painting tips

The tips are painters' practice, given at every level alike. None of it is checked; any of it may be set aside.

Brushes and wet-in-wet washes:

- Broad connected areas (sky, background, ground, water, or an initial light veil across a large passage): reach for the
  `38 mm` mop or `25.4 mm` flat where it fits, laid on wet paper (`paper: "wet"`, `edges: "lost"`, `load: "flooded"`).
  A narrow brush on dry paper turns a big sky or background into visible stripes and hard seams; a flooded mop on wet
  paper lays one seamless, luminous wash.
- Wet-in-wet gradients and colour shifts: instead of one flat monotone wash, immediately chain a second wash or shaped
  strokes into it while damp (`into: "<prev id>"`, `wait: "damp"`, `paper: "damp"`, `edges: "lost"`). This is the
  cleanest way to build soft clouds, atmospheric depth, sunlit-to-shadow transitions, and glowing fur or foliage masses.
- Match brush width to the passage, not the subject label: a broad cheek, chest, or animal base wash can use a `17–25 mm`
  round or flat; use smaller rounds (`13, 10, 7 mm`) for modelling and damp drops, and `3 mm` or the rigger for crisp
  accents.
- Preserving bright whites (blank-paper highlights, clouds, white fur, sunlit walls): declare key white areas in the
  top-level `lights` array (`"lights": [{"what": "white bib", "region": [[x,y], ...]}]`) or shape your base wash
  polygon cleanly around them — never flood a broad wash blindly over the picture's bright whites.
- Light freehand sketch on blank paper (optional): when no prepared drawing is on the sheet, you may lay a few light
  placement lines of your own before the washes using `lines.own`, e.g.
  `{"format": "lines-edit 1", "own": [{"points": [[105, 160], [122, 156], [134, 162]], "medium": "pencil", "widthMm": 0.35, "dark": 0.35, "when": "before"}]}`.

One way to paint a soft form (a face, fur, an animal, hair, a figure, clothing; the sky or background as one form):

1. One connected base wash over the whole form, its lights reserved, hard only at the form's outer silhouette: its
   lightest painted value, `paper: "wet"`, `edges: "lost"`, flooded, direction along the form's long axis.
2. Darker shapes dropped in while it is damp: the form's darker masses as their own shapes with lost edges, written
   straight after the base wash (`into`, `wait: "damp"`), a step darker, following the form (fur growth, round a
   cheek, the fall of hair or cloth).
3. After drying, feathered glazes, each smaller than the last (`wait: "dry"`, `edges: "lost"`), to bring the shadow
   side to its value.
4. Crisp marks kept for the eyes, nostrils, the mouth and the few darkest accents of the whole picture (`paper:
   "dry"`, `edges: "found"`, the 3 mm round or the rigger, strokes placed point by point).

Order and edges:

- Each layer darkens what is under it: write each swatch as that one layer on white paper, and check that the layers
  together reach the darkest value wanted at that spot.
- The usual order over the whole sheet: reserve the lights and lay the broad washes, then mid-values and shadow
  glazes, then the selected darks. Light to dark, because a dark cannot be taken back.
- Hard at the outer silhouette of a figure or animal against the background; soft or lost across internal borders
  (cheek to hair, face to neck, muzzle to cheek). A cloud's lit top is usually reserved as paper, not outlined.
- What tends to read as made by a machine: a hard dark shape per feature; a mix per little patch; outline-and-fill;
  rows, grids or even spacing; thousands of specks; blobs that belong to nothing; a flat, evenly toned patch standing
  in for a form.

Shaping a form with the brush:

- A brush is as wide as it is pressed, and a stroke changes as it travels: one stroke, or two or three, can make a
  form. Write the points along the form, with the pressure low where the brush lands on its point or lifts off, high
  where it presses onto its belly.
- A leaf or a petal: land on the point, press through the middle, lift back to the point, along a slight curve
  (`"pressure": "swell"`, or the points written out). A wet belly and a dry, broken tail: slow where it is pressed,
  fast as it lifts (a speed at each point).
- A wedge of shadow: `"mark": "wedge"`. A comma or a hook: `"comma"`, `"hook"`. A fold of cloth: `"ribbon"`. Paper
  sparkling through a dry stroke: `"drag"` or `"flying-white"` with `"load": "dry"`, `"speed": "fast"`.
- A rock: a pale stroke over its top, a darker one along its middle, the darkest along its foot, pressed on the shadow
  side and lifted out along the ground as its cast shadow, the later ones `into` the earlier with `wait: "none"`. A
  mass of foliage: four or five leaf strokes fanned from the root (`"mark": "leaf-group"`). A sleeve: two or three
  strokes down the arm, each following a fold.
- A wash for what is big, flat and quiet (sky, ground, water, a wall, the first light over a whole figure); shaped
  strokes for anything with a shape of its own (a leaf, a fold, a rock, a hull, a sleeve, the wedge of a shadow), for
  shadows and for darks. Strokes in the order a hand travels: one area before the next, long strokes before short.
<!-- END PAINTING TIPS -->

## Appendix A: how the painter lays each field

Kinds and strokes:

- `kind: "wash"`: overlapping lanes over the region, with the passage's `brush`, or, when it names none, the brush of
  `brushes` nearest a third of the region's width across the lanes. `handling.direction` in degrees: the lanes run
  parallel that way. `"form"`, or no direction: the lanes run along the shape's own flow, its long axis bent along its
  middle line, narrowing where the shape narrows. `handling.path` bends every lane the same way. A `handling.pressure`
  list, or the words `swell`, `taper`, `fade`, `press`, runs along each lane; otherwise the lanes are even, at the
  highest value of the pressure (at least 0.6). With no pressure list, `handling.mark` lays each lane as that mark.
- `kind: "strokes"` / `"touches"`: `count` strokes or short touches placed in the region by `character`, each along
  `handling.direction`, `lengthMm` long (when not given, set by the mark and the brush), bent by `handling.path`.
- `kind: "lines"`: the brush's point along each of `paths`.
- `strokes` in a passage of any kind are laid as written, in place of the strokes the kind would place.
- A stroke given by `points` is laid as written: its width follows the pressure at each point, its pace the speed
  where given (about 20 mm/s slow, 60 usual, 150 and over fast), with a round belly of its brush's width. A point
  without a pressure takes it from the stroke's `pressure` (by its length along the stroke), else 0.7.
- A stroke given by `from` or `at` takes its own `direction`, `lengthMm`, `pressure` and `path`, else the passage's.
- `handling.mark` gives each stroke the painter places (a stroke given by `from` or `at`, and the strokes of
  `count`) the mark's own pressure, speed, blade and water. It is not used for strokes given by `points`, or when the
  passage gives a `handling.pressure` list (then that list is laid). A wash: see `kind: "wash"`. A flat's blade is laid by the marks
  `sweep`, `wedge`, `ribbon`, `drag` and `edge`.
- Pressure words, start to end: `light` 0.2, 0.45, 0.4, 0.15; `medium` 0.25, 0.7, 0.6, 0.15; `firm` 0.35, 0.95,
  0.85, 0.2; `swell` 0.15, 0.6, 1, 0.6, 0.15; `taper` 1, 0.8, 0.5, 0.15; `fade` 0.6, 0.5, 0.35, 0.15; `press` 0.15,
  0.5, 0.85, 1.
- `{"along": n}` becomes points down shape n's long axis, at pressure 0.6.
- `region`, `regions` and `shapes` place the strokes; they guide the hand and are not a clip.
- `handling.hold: "side"` lays the belly, its width steadier. `start`: where the brush lands. `speed: "slow"` adds
  points and a waver.
- Every stroke has a small seeded irregularity of place, angle, length and pressure.

Water, paper and layers:

- `paper: "dry"`: the paper and everything under it dry.
- `paper: "wet"` with no `into`: clean water over the passage's own footprint first, then the paint.
- `paper: "wet"` with `into`: the paint goes into the passage just before while it still shines.
- `paper: "damp"` with `into`: laid beside or into the passage just before as it loses its shine.
- `into`: only the passage immediately before can still be wet; every earlier passage is dry.
- `wait`: how far the sheet dries before this passage: `dry` (everything dried), `damp` (the passage before has lost
  its shine), `none` (straight on).
- `edges: "lost"` on dry paper: laid into a damp bed of clean water under its own footprint, all its edges soft.
  `"found"` and `"mixed"`: all its edges as laid. One side alone cannot be softened.
- `charges`: a dab of its own mix dropped into the passage while wet, one at each `at`, with its own brush if named.
- `handling.load`: the brush's water: `flooded`, `loaded`, `damp`, `dry` (dry brush).
- `glaze: [i, n]`: recorded as glaze i of n; a stage-3 passage on dry paper is laid as a glaze.
- `paint.swatch`: the mix as one wash on white paper; its lightness sets the strength (else `dilution`). A passage
  over dried paint darkens it: paint cannot lighten what is under it.
- `lights`: polygons kept as paper under every passage for the whole painting: no wash lane runs through one and no
  touch is set in one. A light cannot be painted later. `reserve` keeps paper round one passage only.
- Lifting paint out: not available. `kind: "erase"` rubs out pencil only: no paint, brush or wet paper; `widthMm` the
  eraser (default 3), and either `strokes` of `points` (pressure 1 a firm rub) or a `region` rubbed in lanes at one
  `handling.pressure`. Before any wash a firm rub takes most of the pencil off; under a dried wash far less.
- `stage`: 1 to 5, the order of the replay's value steps. A look `{"until": n}` stops after stage n.
- The drawing: `medium` `none` lays no drawing. `lines` of your own are drawn where you put them, `before` the first
  wash or `after` the washes, at the width and darkness given.

## Appendix B: the marks (`handling.mark`)

- `sweep`: a loaded flat held square, even pressure, slow, carrying a bead along its lower edge
- `taper`: lands on the point, swells on the belly, eases, swells again, lifts off to a point
- `reverse`: pressed down where it lands, drawn out and lifted to a fine point
- `leaf`: lands on the point, presses to the belly through the middle, lifts back to the point
- `comma`: pressed round head, then the tail pulled off round a curve, thinning as it speeds up
- `teardrop`: the belly pressed and held a moment, then pulled straight back to a point
- `dot`: the point set down and pressed while the hand turns a little, then lifted
- `touch`: a short stroke laid on the belly, a little drag, lifted blunt
- `line`: the brush upright and light, the pressure breathing a little, drawn steadily
- `edge`: the blade drawn along its own length, a line as thin as the blade
- `wedge`: a flat held at a slant and pulled a short way, pressed at the start and eased off
- `swell`: the pressure rises and falls three times along a long turning stroke, the last lift to a hair
- `ribbon`: a flat held at one angle along an S, broad where the path crosses the blade, thin where it runs along it
- `contour`: the belly run along a curved edge, pressed at both ends and eased between, leaving a crisp rim
- `hook`: drawn down, paused and pressed at the turn, then flicked out sharply to a point
- `bar`: the tip hidden by a small reverse at the landing, pressed at both ends, lighter between
- `hatch`: a few short strokes side by side in one direction, each landed with a press and lifted quick
- `scumble`: one scrubbing stroke of a half-dry brush, turning back on itself, the pressure rising and falling
- `drag`: a nearly dry flat pulled fast across the tooth, catching only the hills of the paper
- `flying-white`: a round with little water swept fast round a curve, the hairs streaking apart as it empties
- `grass`: pressed at the root and flicked upward, curving, fast enough to lift to a hair
- `leaf-stem`: the point drawing the stem, then pressed into the leaf and lifted to its tip
- `branch`: heavy at the butt, eased and pressed again at each joint; twigs drawn off the joints, each lighter
- `s-stroke`: bends one way then the other, swelling on each bend and thinning where it changes
- `ring`: one turn of the arm, pressed at the start, breathing round, running dry and breaking up as it closes
- `leaf-group`: three belly-first leaves from one point, fanned, each its own length and press

## Appendix C: the paint box

PAINT_LIST
LEVEL_DATA
