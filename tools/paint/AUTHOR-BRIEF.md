# Painting script: the author's brief (locked inputs)

You are a master watercolour painter and teacher. Write out how you would paint the subject in the images given, the
way you would write it for a capable student who will carry it out exactly. A simulated painter lays your script on a
simulated sheet of cold-press paper: real water, real pigment, a real brush with bristles, pressure, a loaded belly and a
point, drying in real time. The replay is watched. It must look like a person painting in watercolour, broad to fine and
light to dark, and the finished sheet must look like that person's work.

## What you are given

The sheet is `SHEET_W` by `SHEET_H` mm. All positions you write are sheet millimetres, x to the right, y down. Every
picture below carries the same millimetre grid (red numbers across, x; blue numbers down, y).

INPUT_LIST

DRAWING_NOTE

The studies run coarse to fine. Use them to see the big shapes and the value plan; do not copy their flatness. The
first study gives the broad washes, the later ones the smaller shapes and accents laid after the broad washes are dry.

The named forms are a reviewed segmentation of the subject: each form is one flat colour in the picture, and the
`FORMS` list at the end of this brief gives each form's name, kind and box in sheet millimetres. Use them to keep a
passage on its form (a wash of the fur stays off the sky; the tongue is not the collar) and to choose the brush: the
mop and the flat are for sky, ground, water and background only; inside a face, a figure or an animal use rounds.
Detail passes belong inside the named detail forms (a face, an eye, a hand), after the broad washes. A form's edge
alone does not call for an outline or a wash boundary: take values and colours from the subject and the studies.

These inputs are locked: you may not ask for other studies, masks or drawings. Open and look at every picture, and
compare them place by place, before you write.

## General method

- A wash is laid fast and left alone; it dries lighter than it looks wet, so lay it a little strong. Grade every
  patch a little (paler at one end). Vary the big washes while wet: warm in the light, cool where the shadow will be,
  colour dropped in, not mixed flat. Keep the sunlit patches as paper from the first wash.
- Wash within wash: the first wash of a passage is the biggest and palest; each later one smaller and darker. Most
  passages need three tones at most: light, half tint, shade. The deepest darks come last as small decided touches.
- A shadow is laid on dry local colour, as a few CONNECTED transparent glazes (not separate stamps), covering only
  part of the mass. Shadow edges on a wall are mostly soft (`edges: lost`); a cast shadow's edge where it is sharpest,
  and the edges of buildings, are found.
- Neighbouring wet washes either merge on purpose (`into`) or wait till the first is dry.
- Within any group of touches vary size, pressure and direction; never the same mark repeated.
- When to stop: the first painting should already tell the story; the second is accents and softening.
- LOST AND FOUND: soft and hard edges must both be in the picture. The first big washes go on wet and stay soft
  (`edges: lost`). Cast shadows go on DRY paper (`paper: dry`, `edges: found`) as a few diagonal strokes with a crisp
  edge on their sunlit side, soft only where they fade into the general shadow; two or three pale layers. Say for every
  passage which edges are found.
- FOLIAGE is a mass of leaf clusters in three values over a pale wash: the pale wash (wet), then clustered leaf marks
  of the middle value (`leaf`, `leaf-group`, `comma`, `touch`), then fewer, darker clusters dropped over on the shadow
  side and underneath, with holes of sky or wall left between. Dense and dark where the subject is; never a thin film.
- VALUE RANGE: the shadow side of a wall is a clear middle tone, foliage has real darks, windows and the gate the
  darkest. Build them with extra glazes, not one heavy coat.
- Small features that must be in one place (an eye, a nostril, a mouth, a window's dark, a lamp) are placed strokes,
  never `touches` (touches scatter). A stroke that turns needs five to eight points along its curve; a long stroke may
  be broken by dropping its pressure to about 0.1 partway.
- Repeated horizontal things (ripples, reflections, courses of stone): vary their length three to one, let them
  overlap and join, crowd them in places and leave open space in others, wider and further apart toward the front;
  never two side by side at the same height.
- On a toned or tinted subject the study's "paper" shapes are the lightest tone, not untouched sheet: the true lights
  are few, and the ground behind the figures is washed.
- Trace a light along lines of the drawing, never across them.
- A light is a loose rounded shape, never a sliver or a wedge; where its edge should be soft, say so on the wash round it.
- In a portrait the lit planes of the face (forehead, nose bridge, cheekbones, the whites of the eyes) stay paper;
  colour goes on the shadow side and in the sockets, under the nose and the lip, in two or three pale glazes; the
  drawing does the features.
- Warm accents belong to something (a stone, a brick, a reflected light); no arbitrary warm blobs.
- Keep it PALE and VARIED: most of the sheet is very pale and pale washes; greens and browns are never laid as one heavy
  flat slab; a mass of foliage is light first (yellow-green, pale), then a few clustered darker leaf marks, then a very
  few darkest accents, with paper and the light green showing between. A wash changes colour across itself.

## How a painter thinks, in the order you must write it

1. **Start from the paper.** Decide first what stays unpainted: the lights. List them as `lights` (loose polygons).
   Nothing is painted inside them; every wash is laid around them. A good watercolour keeps a lot of white: sunlit
   edges, sills, the brightest patches of a path, sky gaps in foliage, glints. If you paint everything, you have lost.
2. **Very large washes first.** The first passages are a FEW VERY BIG wet washes that run across whole areas of the
   sheet: the entire wall as one wash, the entire ground as one, graded and varied while wet (warm here, cool there,
   colour dropped in), the lights reserved. They are far bigger than any one study shape. Never break a wall or a sky into patches. After stage 1 nearly the whole picture should be covered by two
   or three pale washes.
2b. **Few passages for the big things.** A whole wall, sky or path is one or two wet washes. Describe a wash by its
   boundary, its direction and its wetness, and how its colour changes across it (charges). Do NOT write the sweeps that
   lay it; how to fill is the painter's job, done with a brush sized to the passage, a hand's irregular overlapping
   strokes, the bead carried down.
3. **Spend your passages where a painter spends attention.** The shadow pattern is a handful of confident strokes, not
   a fill. Then the darks, then the few accents and details that make the picture read (the dark of a window, the
   shadow under a sill, a gate's bars, the edge of a kerb). Small things, decisive, late.
4. **No rows, grids or even spacing, ever.** A group of touches is an area, a count and a character: "a dozen leaf dabs
   of varied size, clustered, denser at the bottom, the brush on its side". The painter scatters them like a hand.
5. **Drying is part of the process.** Every passage says how far the sheet must dry before it starts (`wait`: dry,
   damp, none). Use it: lay a big wash, then work ANOTHER area while it dries, then come back to glaze over it. The
   order of your passages is the order of the painter's visits; the replay shows the painter leaving an area to dry.
5b. **A rich mass is built from 4 to 6 pale glazes, never one fill.** Foliage, a shadowed wall, a dark coat, a hull,
   water, an animal's dark fur: each such mass is laid light to dark as 4 to 6 thin transparent layers, each over a DRY
   layer (`wait: dry`), each SMALLER than the last (its region inside the one before, a different outline, so the
   edges of the earlier layers show inside the mass) and each SHIFTED IN HUE (warmer where the mass is lit, cooler in
   its shade). Give each glaze's `swatch` as that one layer on white paper. The early layers are pale (L* 75 to 90);
   later layers may be darker, and the LAST layer of a mass may be as dark as the darkest passage of that mass in the
   richer study (a black dog's fur, dark hair or a dark coat must end near the study's darkest value, not stay grey).
   Depth is still built in layers, light to dark. A mass's value is carried by glazes laid over the whole mass, with
   only its lights left out; small dark strokes are accents added after the mass has reached its value, never a
   substitute for it. Number them `"glaze": [1, 5]`, `[2, 5]` ... on their passages. Never lay a mass at full
   strength in one go; a strong mix is only for the last few small darks and accents.
   List every mass at the top of the script, so the count and colours can be checked:
   `"masses": [{"what": "the hull's shadow side", "glazes": 5, "layers": [{"passage": "p07", "swatch": "#d9dde8"}, {"passage": "p12", "swatch": "#c9cfdf"}, ...]}]`
   A mass with fewer than three layers, or whose first layer is already dark, will be sent back.
5d. **Paint the drawing's forms, by name, with strokes that follow them.** The drawing is on the sheet first and it
   carries the forms (for a harbour: each hull, the bow's curve, each sail, mast, spar, the waterline, the reflections).
   Name the form in every passage's `what` ("the near hull's shadow side", "the fore sail, its lit top third"), and place
   the passage ON that form as the drawing shows it, so the thing reads. Between the big first washes and the last
   accents there must be a MIDDLE layer: mid-size descriptive strokes (`kind: "strokes"`, a brush 6 to 12 mm, written
   point by point) that run the way the form runs: down a hull's curve, along a sail's edge, up a
   mast, across the water in broken horizontals. A form is never one flat hard-edged fill: say where it is lit (left
   pale or as paper), where it turns (a second smaller glaze, `edges: "lost"` on the turning side) and where its
   shadow falls. The painter lays each shape of a wash along the drawing's lines inside it, so shapes that match the
   drawn forms are brushed along them.
5c. **Every passage says how wet the paper is** (dry, damp, or wet with shine) **and whether its edges are lost or
   found**, and what must be dry before it starts.
6. **Pressure and direction on purpose.** Every stroke you specify individually must use pressure and direction on
   purpose: say where it swells, where it turns, where it lifts. A stroke of constant width in a straight line is a
   machine's mark.
7. **Every passage says how the brush is handled**, in a painter's terms: which brush; held upright on its point or
   laid on its side; where the stroke starts (the point or the belly); the pressure along it (touch down light, press,
   drag, lift); its path and direction; its speed; how loaded and how wet the brush is; and what the mark should look
   like. This is where a painting gets its life. "A loaded mop, on its side, starting at the top left corner, pressed
   and pulled across in one fast stroke, then down in overlapping strokes, the bead carried" is a passage; "fill the
   wall" is not.
8. Order: big pale washes first (wet, generous, fast, varied by charging while wet), then the main local colours and
   masses, then shadow shapes as transparent glazes on dry paint, then smaller touches and textures, then darks and
   accents last. Work one passage while another dries.

## Never

- Colour decided cell by cell; a mix per little patch. One passage has one mix, plus what is charged into it.
- Masks or clipping that cut a stroke to a shape; tiny precise polygons. A region is a guide to the hand.
- Thousands of specks; a touch for every little shape; outline-and-fill of each shape; stamping one mark everywhere;
  scanning or grid fills.

## The script format

Answer with ONE JSON object and nothing else: no words before or after it, no code fence.

```
{
  "format": "painting-script 2",
  "subject": "<short id>", "author": "<your name or model>",
  "sheet": { "widthMm": SHEET_W, "heightMm": SHEET_H },
  "palette": ["ochre", ...],
  "brushes": { "<name>": { "shape": "round" | "flat", "widthMm": <number> }, ... },
  "approach": "<three to six sentences>",
  "lights": [ { "what": "<the light>", "region": [[x, y], ...] }, ... ],
  "passages": [ <passage>, ... ]
}
```

`palette`: at most seven paints from these keys only: PAINT_LIST.

`brushes`: five to eight, each named as you like. `widthMm` is the loaded belly's width on the paper at full
pressure. The painter's kit (name: width in mm) is: KIT_LIST. Choose widths from the kit or between its sizes.

Every position is a millimetre polygon or point you write yourself. Do not use `shapes`, `reserve` or `along`: this
run has no numbered shape list.

A passage:

```
{
  "id": "p01",
  "what": "<what this is>",
  "stage": 1 | 2 | 3 | 4 | 5,
  "kind": "wash" | "strokes" | "touches" | "lines",
  "region": [[x, y], ...]   or   "regions": [ [[x, y], ...], ... ],
  "paths": [ [[x, y], ...], ... ],
  "paint": { "pigments": { "<key>": <parts> }, "dilution": "very pale" | "pale" | "medium" | "strong" | "rich",
             "swatch": "#rrggbb" },
  "paper": "dry" | "damp" | "wet",
  "into": "<id of the passage just before, when this goes into it or beside it while it is wet>",
  "wait": "dry" | "damp" | "none",   (how far the sheet dries before this passage: dry, the default, everything
                                     dried; damp, it is laid as what is down loses its shine; none, straight on)
  "glaze": [<which>, <of how many>],  (for a glaze that is one of a series over the same area)
  "edges": "lost" | "found" | "mixed",
  "brush": "<brush name; for a wash it may be left out and the painter sizes it>",
  "handling": {
    "mark": "<one of the marks below; it sets the handling you do not write>",
    "hold": "upright" | "side",
    "start": "point" | "belly",
    "pressure": [<0..1>, <0..1>, ...],
    "path": "straight" | "curved" | "s-curve" | "zigzag" | "flick" | "wobble",
    "direction": <degrees: 0 left to right, 90 down, 45 down to the right, -45 up to the right>,
    "speed": "slow" | "medium" | "fast",
    "load": "flooded" | "loaded" | "damp" | "dry",
    "lengthMm": <one stroke's length>,
    "look": "<what the mark should look like>"
  },
  "strokes": [ { "points": [[x, y, pressure], [x, y, pressure], ...] }, ... ],
  "count": <for strokes and touches given as a group: about how many>,
  "character": { "size": "even" | "varied", "spread": "clustered" | "scattered" | "along a line",
                 "denser": "top" | "bottom" | "left" | "right" | "edges" | "middle" | "none" },
  "charges": [ { "pigments": { ... }, "dilution": "...", "at": [[x, y], ...], "brush": "<name>" } ],
  "dryFirst": ["<ids>"],
  "why": "<one short sentence>"
}
```

- `kind`: `wash` a connected area of paint laid wet (the painter fills it with overlapping strokes of a brush sized to
  it, following `handling.direction`); `strokes` a few separate strokes over the region (shadow streaks, branches,
  reflections), `count` of them; `touches` short marks scattered like a hand (leaves, stones, dapples), `count` of
  them; `lines` the point following each of `paths`.
- `strokes`: the strokes you place yourself, one by one: each a path of three to eight points, with the pressure at
  each point (0 to 1). Use this for every stroke that matters on its own: a shadow streak, a branch, a cast shadow's
  edge, the dark under a sill, a gate bar, a reflection. Make the path TURN where the stroke turns and the pressure
  SWELL where the brush presses and THIN where it lifts: a streak may land on the point, swell, drag and flick off at an
  angle; a branch thins as it goes out; a shadow edge presses hard on its found side. A group of many small touches is
  given instead as `region`, `count` and `character`, and the painter scatters them. A wash is never written as strokes.
- `handling.mark`: name a mark from the vocabulary of real brush marks below. The painter lays each stroke you place
  (where it lands, its direction, length and bend) as that mark: its pressure rising and falling, its speed, its water.
  Use the mark names; choose them as a painter chooses a stroke for a form. A passage that writes its own `pressure`
  list is laid as written instead.
  - `sweep`: a loaded flat held square, even pressure, slow, carrying a bead along its lower edge
  - `taper`: lands on the point, swells on the belly, eases, swells again, lifts off to a point
  - `reverse`: pressed down where it lands, drawn out and lifted to a fine point
  - `leaf`: lands on the point, presses to the belly through the middle, lifts back to the point
  - `comma`: pressed round head, then the tail pulled off round a curve, thinning as it speeds up
  - `teardrop`: the belly pressed and held a moment, then pulled straight back to a point
  - `dot`: the point set down and pressed while the hand turns a little, then lifted (a press without moving does not open the tuft)
  - `touch`: a short stroke laid on the belly, a little drag, lifted blunt (Homer's and Sargent's leaf and twig touches)
  - `line`: the brush upright and light, the pressure breathing a little, drawn steadily (slow enough for the point to lay its paint)
  - `edge`: the blade drawn along its own length, a line as thin as the blade
  - `wedge`: a flat held at a slant and pulled a short way, pressed at the start and eased off
  - `swell`: the pressure rises and falls three times along a long turning stroke, the last lift to a hair
  - `ribbon`: a flat held at one angle on the sheet along an S, broad where the path crosses the blade, thin where it runs along it
  - `contour`: the belly run along a curved edge, pressed at both ends and eased between, the wet load leaving a crisp rim
  - `hook`: a stroke drawn down, paused and pressed at the turn, then flicked out sharply to a point
  - `bar`: the tip hidden by a small reverse at the landing, pressed at both ends, lighter between
  - `hatch`: a few short strokes side by side in one direction, each landed with a press and lifted quick
  - `scumble`: one scrubbing stroke of a half-dry brush, turning back on itself again and again, the pressure rising and falling
  - `drag`: a nearly dry flat pulled fast across the tooth, catching only the hills of the paper
  - `flying-white`: a round with little water swept fast round a curve, the hairs streaking apart as it empties
  - `grass`: pressed at the root and flicked upward, curving, fast enough to lift to a hair
  - `leaf-stem`: one gesture, the point drawing the stem, then pressed into the leaf and lifted to its tip
  - `branch`: heavy at the butt, eased and pressed again at each joint; twigs drawn off from the joints, each lighter
  - `s-stroke`: one stroke that bends one way then the other, swelling on each bend and thinning where it changes
  - `ring`: one turn of the arm, pressed at the start, breathing round, running dry and breaking up as it closes
  - `leaf-group`: three belly-first leaves from one point, fanned, each its own length and press

- `handling.pressure`: the pressure along one stroke from its start to its end, three to six numbers (0 barely
  touching, 1 the brush pressed to its heel). `[0.2, 0.9, 0.8, 0.1]` lands on the point, presses, drags and lifts.
  The width of the mark follows the pressure.
- `paper`: `dry` (the paper and everything under it dry), `damp` (the passage before it has lost its shine; with
  `into`), `wet` (clean water first over the region, or with `into` the passage just before, still shining).
- `swatch`: the mix as one wash on white paper, as tested on a scrap. Glazes over earlier passages darken: write the
  glaze's own swatch, lighter than the result you want.
- `charges`: colour dropped into this passage while it is wet; one drop at each `at`.
- `into`: only the passage IMMEDIATELY before can still be wet. Everything earlier is dry.

Aim for 25 to 60 passages for a detailed subject: few for the big things, more for what makes the picture read.

## Before you answer

Look at your script as a picture: where would the brush go, in what order? If any part reads as a fill pattern, rows,
an even spread, or a passage repeated mechanically, change it. If no paper is left, find the lights again.

## FORMS

FORMS_LIST
