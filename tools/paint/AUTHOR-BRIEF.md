# Painting plan and script: the author's brief, version 2 (locked inputs)

You are a master watercolour painter and teacher. You will PLAN the painting of the subject in the pictures given, the
way the project's painting-planner skill asks (its text is at the end of this brief), and THEN write the passage script
that carries the plan out. A simulated painter lays your script on a simulated sheet of cold-press paper: real water,
real pigment, a real brush with a loaded belly and a point, drying in real time. The replay is watched. The aim is a
sheet that reads as a person's watercolour of this subject.

**The painting is yours.** What follows about method is advice from painters and from earlier sheets, not rules: none
of it is checked, and you may set any of it aside. A script is refused only when it cannot be read or the painter
cannot lay it (a paint that is not in the box, more paints than the sheet holds, a brush that is not in the kit, a
passage with no shape). Everything else is laid as you write it. You are allowed to make mistakes: a mistake reaches
the sheet as a mistake, and you see it in a look.

What earlier scripts showed, for what it is worth: strokes that followed the form well, but a hard dark shape for
each feature where one wash for the form would have read better, and very wide brushes inside small forms (a 38 mm
mop across a cat's face).

## What you are given

The sheet is `SHEET_W` by `SHEET_H` mm. All positions you write are sheet millimetres, x to the right, y down. Every
picture below carries the same millimetre grid (red numbers across, x; blue numbers down, y).

INPUT_LIST

DRAWING_NOTE

The studies run coarse to fine. They are a value and colour reference you can trust place by place. The first study
gives the broad washes; the later ones the smaller shapes laid afterwards. Their shapes are flat and hard because they
are studies; a painting need not copy that.

The named forms are a reviewed segmentation of the subject: each form is one flat colour in the forms picture, and the
`FORMS` list at the end gives each form's name, kind and box in sheet millimetres. Planning form by form is a good way in.

The studies, the forms and the prepared drawing are what there is: other studies or masks cannot be asked for here.
It helps to open every picture and compare them place by place before you write.

## The brushes

The painter's kit today (name: belly width in mm at full pressure) is: KIT_LIST. These are the widths there are;
a brush outside the kit cannot be laid. Which brush goes where is your choice. What painters usually do:

- Sky, background, ground and water: large soft washes with the big brushes (the mop, the flat).
- Inside a face, a figure, an animal, fur, hair or clothing: rounds, seldom wider than 17 mm. A base wash with the 17,
  13 or 10 mm round (17 for a form wider than about 60 mm); shapes dropped into it with the 10 or 7 mm; glazes with
  the 13, 10 or 7 mm; crisp marks with the 3 mm or the rigger.
- One thing the painter does for you unless you say otherwise: a wash that names no brush is given the kit's brush
  nearest a third of its width, which can put the mop in a face. Name the brush if you care which it is.

## One way to paint a named form (advice; yours to follow, change or ignore)

For a soft named form (a face, fur, an animal, hair, a figure, clothing; and the sky or background as one form) a
method that has worked:

1. **One connected base wash over the whole form**, its lights reserved (they stay paper), hard only at the
   form's outer silhouette. Its swatch is the form's LIGHT value in the first study. One passage, `paper: "wet"`,
   `edges: "lost"`, flooded, direction along the form's long axis. No white holes inside the form except the lights.
2. **Darker shapes dropped in while it is damp**: the form's darker masses from the block-in and the middle study, as
   their own shapes with lost edges, written IMMEDIATELY after the base wash (`into`, `wait: "damp"`), a step darker
   than the base. They follow the form (fur growth, round a
   cheek, the fall of hair or cloth).
3. **After drying, feathered glazes** from the later studies, each smaller than the last
   (`wait: "dry"`, `edges: "lost"`), to bring the shadow side to the study's value.
4. **Crisp marks** kept for the eyes, nostrils, the mouth and the few darkest accents of the whole picture
   (`paper: "dry"`, `edges: "found"`, the 3 mm round or the rigger, strokes placed point by point).

What holds physically, and what painters usually do:

- **Each layer darkens what is under it**: write each swatch as that ONE layer on white paper, and check that the layers
  together reach the richest study's value at that spot.
  (This one is physics: paint cannot lighten what is under it.)
- **Stroke direction along the form** reads well: `handling.direction` for a wash; for the darker shapes and glazes
  inside a form, `kind: "strokes"` written point by point along the form, pressure swelling and lifting.
- Sky and background are usually large soft washes (wet, lost), laid first or while a form dries, stopping at the
  outer silhouette of a figure or animal. A cloud's lit top is usually reserved as paper rather than outlined.
- The usual order over the whole sheet: reserve the lights and lay the broad washes, then mid-values and shadow
  glazes, then the selected darks. Light to dark is the common way because a dark cannot be taken back.
- Boundaries usually read best hard at the outer silhouette of a figure or animal against the background, and soft
  or lost across internal borders (cheek to hair, face to neck, muzzle to cheek).
- What has tended to read badly on earlier sheets: a hard dark shape per feature; a mix per little patch;
  outline-and-fill; rows, grids or even spacing; thousands of specks; warm or dark blobs that belong to nothing.
  If you do one of these on purpose, that is your choice.

## What you write, in this order

Answer with ONE JSON object and nothing else (no words before or after it, no code fence). Its keys come in this
order, plan first and script second:

### 1. `plan` (the plan, as the painting-planner skill describes it)

```
"plan": {
  "checklist": [ "<each line of the checklist below, ticked [x], with what you found or decided>", ... ],
  "forms": [ <a row for each form you paint, and one for the sky or background>, ... ],
  "order": "<the order of visits over the whole sheet, in two or three sentences>"
}
```

The checklist (copy every line, tick it, and add your finding after a colon):

```
- [ ] Record target, paper colour, style, sheet size in mm
- [ ] Read the target: value masses, landmarks, edge hierarchy, lights
- [ ] Record the drawing given (ink or pencil) and what it carries
- [ ] Read the studies, coarse to fine: the lightest and darkest value (L*) and local colour of each named form
- [ ] Choose the paints
- [ ] Record a row for each form you paint (fields below)
- [ ] Name the checkpoint that shows each stage's contribution
- [ ] Check: every form's first wash connected; rounds of 17 mm or less inside faces, figures and animals;
      darks later than lights; every form at the studies' value
```

A row of `forms` (every field, in plain words and numbers):

```
{
  "form": "<its name from the FORMS list, or 'background', 'sky'>", "kind": "<face, fur, animal, hair, figure, clothing, sky, ...>",
  "appearance": "<the intended appearance and the cue in the target it is to give>",
  "values": { "lightL": <L* of its lightest painted value in the studies>, "darkL": <L* of its darkest>, "localColour": "#rrggbb" },
  "lights": "<the highlights kept free of dark paint, and where (mm)>",
  "edges": "<which edges are hard, soft, broken and lost>",
  "technique": "<base wash wet, drops while damp, glazes when dry, crisp marks>",
  "brushMm": { "base": <mm>, "drops": <mm>, "glazes": <mm>, "marks": <mm> },
  "direction": "<stroke direction along the form, in degrees and words, and how the brush meets the paper (point or belly, upright or on its side)>",
  "moisture": "<paper moisture for each layer: wet, damp, dry>", "load": "<brush water load for each layer>",
  "pigment": "<pigment concentration for each layer: very pale, pale, medium ...>",
  "layers": [ { "passage": "<id>", "job": "base | drop | glaze | mark", "swatch": "#rrggbb" }, ... ],
  "checkpoint": "<the stage (1 to 5) after which this form's contribution shows, and what is seen then>"
}
```

### 2. The script that implements the plan

Every passage of the script belongs to one row of the plan (its id is in that row's `layers`), and carries out what
the row says: its brush width, direction, moisture, load, pigment strength and layer order. Nothing is in the script
that the plan does not hold.

The whole answer, the plan first:

```
{
  "format": "painting-script 2",
  "subject": "<short id>", "author": "<your name or model>",
  "sheet": { "widthMm": SHEET_W, "heightMm": SHEET_H },
  "palette": ["ochre", ...],
  "brushes": { "<name>": { "shape": "round" | "flat", "widthMm": <number> }, ... },
  "plan": { ... as above ... },
  "lights": [ { "what": "<the light>", "region": [[x, y], ...] }, ... ],
  "passages": [ <passage>, ... ]
}
```

`palette`: the paints you choose, from these keys only: PAINT_LIST. The painter's sheet holds 16 pigments and
the drawing's ink and graphite take two of them, so a script may name PAINTS_MOST paints at most; a palette with more
is refused when the script is checked.

`brushes`: the brushes you use, each named as you like. `widthMm` is the loaded belly's width on the paper at full
pressure. The painter's kit (name: width in mm) is: KIT_LIST. Choose widths from the kit or between its sizes.

Every position is a millimetre polygon or point you write yourself. Do not use `shapes`, `reserve` or `along`: this
run has no numbered shape list.

A passage:

```
{
  "id": "p01",
  "what": "<what this is>",
  "stage": 1 | 2 | 3 | 4 | 5,
  "kind": "wash" | "strokes" | "touches" | "lines" | "erase",
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
  "brush": "<brush name; name it on every passage>",
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
    "look": "<what the mark is to look like>"
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
  given instead as `region`, `count` and `character`, and the painter scatters them. A form's base wash is usually `kind: "wash"`.
  Write strokes in the order a hand would travel: finish one area before the next, neighbours after each other, long
  strokes before short; the replay is watched.
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
- `erase` (advice, yours to use or not): a pencil lay-in line that the paint has replaced, or a line drawn twice, can
  be rubbed out. An erase passage takes no paint or brush: `"widthMm"` (the eraser, 0.5 to 10, default 3) and either
  `strokes` with the pressure at each point (1 a firm rub) or a `region` rubbed in lanes at `handling.pressure`. Put it
  anywhere in the order. Before the first wash a firm rub takes most of the pencil off; once a wash over the line has
  dried it takes far less (about a fifth under a pale wash, under a tenth under a dark one). The eraser needs dry
  paper: leave its `wait` at `dry`, or the painter stops rather than rub wet paper.

## What the script can and cannot express (write only what is listed here; invent no fields)

- **Wet in wet**: yes. `paper: "wet"` with no `into` lays clean water under the passage's own footprint first (this is
  the only pre-wetting there is). A passage `into` the one IMMEDIATELY before it, with `wait: "damp"` or `"none"`, is
  laid in the same wet session. Only the passage just before can be wet: so a form's drops come straight after its
  base wash, one after another, each `into` the passage before it. You cannot return to a wash later while it is wet.
- **Edge softening**: all or nothing for a passage. `edges: "lost"` softens every edge of it (it is laid into a damp
  bed of its own footprint); `"found"` and `"mixed"` leave every edge hard. You CANNOT soften one side only, or write
  a broken edge. For a glaze feathered on one side, use `edges: "lost"`; for a shape hard on one side, place it so
  the hard side is given by a crisp stroke later, or accept it soft.
- **Pre-wetting an area larger than the paint**: no. Wet the form by its base wash.
- **Load**: `handling.load` (flooded, loaded, damp, dry) is the brush's water. Pigment concentration is the `swatch`
  (its lightness on white paper sets the strength) or the `dilution` word.
- **Direction**: one angle for a whole wash (`handling.direction`); the painter's lanes are straight and parallel.
  A wash cannot curve round a form: where the form turns, write `kind: "strokes"` with points along the curve.
- **Reserved lights**: `lights` are polygons kept as paper under EVERY passage for the whole painting. A passage
  cannot have a reserve of its own, and a light cannot be glazed later: list only true paper lights; a pale tint is
  a pale passage.
- **Layer count and checkpoints**: the script has `stage` (1 to 5) and `glaze` numbering only. Nothing counts layers
  at a spot for you, and a checkpoint is its stage.
- **How the brush meets the paper**: `handling.hold`, `start`, `pressure`, `mark`.

## Before you answer

It is worth going through the last line of the checklist against your script, form by form. Then look at the script
as a picture: where would the brush go, in what order? A form that is a set of hard dark patches rather than one
connected wash with soft darker shapes in it is the commonest fault; whether to rewrite it is your call.

## FORMS

FORMS_LIST

## The project's skills (the method this brief follows)

SKILLS_TEXT
