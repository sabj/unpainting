# Paint one crop with the watercolour simulator (protocol v2)

You are in a fresh git worktree of a watercolour painting simulator (Node 25, ES modules). Paint the target crop as a
person with a brush and pen would, using only the simulator's marks through `bench/kit.mjs`.

Task `{CROP}`: {SIZE} px. Style: {STYLE}. The target is attached to the first message. You may look at it again with
your own image viewing tool at `{TARGET}`.

## One attempt, up to 3 paintings

{ATTEMPTS} You are in a fresh folder and a fresh session. Each run of your painting script that lays a mark is one
painting on a fresh sheet (`kit.open` gives one); after a run you may look at its frames and final image under
`bench/out/{CROP}/` and change your script. The fourth run is refused before it lays anything. When the painting you
want is the last one completed (it ended with `kit.finish`), stop.

## Rules (protocol v2)

- Look at the target with your own eyes only. No script may read a target, a compare.png or any other image file: the
  kit's guard rejects it and logs it, and a logged attempt disqualifies the run. For planning you may use
  `kit.coarse('{CROP}')`: at most 24 x 24 cells with an 8-colour palette and a value per cell. Your own frames under
  `bench/out/` are readable.
- Paint only from the box: colours come from `kit.mix()` over the brush paints in `kit.BRUSH_PAINTS`; the pen takes
  `sepia` or `lampblack`. The kit rejects anything else.
- Import only `bench/kit.mjs` in your painting scripts (it wraps `src/media/`); you may read any source to learn how
  the brush, pen and sheet behave. Do not use the repo's existing painting pipeline (`tools/`, `src/paint/`,
  `src/plan.js`, `src/painter.js` and similar).
- Paint like a person: light before dark, broad before detail, washes and strokes rather than pixel fills. Stage frames
  are saved automatically at 10%, 25%, 50%, 75% and 100% of your strokes and are judged for a human-like progression.
- Paintings: each run of your script that lays a mark is one painting of the whole sheet, whatever is in it, and
  counts against your budget of 3 paintings; the run past it is refused before it lays anything.
  `kit.work()` says which painting this is and how many are left. Nothing else is budgeted: strokes, water, waits and
  dryings are measured and recorded beside your score, never charged. A painting that takes more than 10 times the
  water steps of the code's own painting of this subject is stopped as a runaway, with a message.
- At most 2,500 strokes a painting (brush, pen, pencil and eraser together). About 30 minutes in all, including your
  thinking; the session is stopped after 30 minutes. One painting run at a time: do not run several in parallel.
- End each painting with `await kit.finish(note)`. Outputs land in `bench/out/{CROP}/` (`final.png`, `frames/`,
  `stats.json`). Rerunning overwrites them, so the last completed run is the one that counts.
- Work only inside this worktree. Do not commit, push or touch anything outside it.

## Skills

Two skills written for this painter are in `bench/skills/`: `watercolor-technique/SKILL.md` (with its `references/`)
and `painting-planner/SKILL.md`. Read both before you plan, and plan and paint the way they say. Where they name repo
tools you were told not to use, take the technique and apply it with the kit.

## Tips: worked examples

`bench/TIPS.md` shows how to get each basic thing out of this kit: a flat wash, a graded wash, wet into wet, a glaze, a
soft edge beside a hard one, dry brush, paper white, a pen line over a wash, and how to render a shape with a brush
(fill it along its long axis, taper to a point, go round a white, meet another shape along an edge, how long a dip
lasts), how the pen draws (nib, pressure, speed, hatching, soluble and waterproof ink under a wash), and the pencil and eraser (pressure, grade, under and over a wash, hatching, rubbing out before and after paint). Each has a few lines of kit code that run as they stand (`bench/tips/N-name.mjs`) and a picture of the dried
result on blank paper (`bench/tips/N-name.png`; the shape examples also `-arrows.png`, the stroke paths). Read it, and
look at the pictures, before you write your first stroke.

## Simulator in brief

- `const { sheet, O, W, H } = await kit.open('{CROP}')`: a fresh cold-press sheet, one cell per target pixel,
  0.259 mm a cell.
- `kit.createBrush({ radius, bristles, capacity, flat, belly, feed, give, splay, stiffness, seed })` (radius in
  cells), `kit.dip(brush, { water: 0..1, conc: kit.mix({ sapgreen: 0.4, ochre: 0.1 }) })`. A brush runs out: dip again.
- `kit.stroke(brush, sheet, [{ x, y, p }...])`. The kit moves the water while the brush is on the paper; strokes
  laid while the sheet is wet run together, on a dry sheet they keep their edges. `kit.wait(sheet, moments)` lets the
  water run with the brush off the paper (default 20); `kit.dryAll(sheet)` dries the sheet.
- Pen: `kit.createPen({ nib, flex })`, `kit.dipPen(pen, kit.mix({ sepia: 3 }))`, `kit.penStroke(pen, sheet, [{ x, y, p, v }...])`.
- Pencil: `kit.createPencil({ grade: 'HB' | '2B', width })`, `kit.pencilStroke(pencil, sheet, [{ x, y, p }...])`: dry graphite, darker and wider with pressure and with 2B; washes over it barely move it and cover it as they darken.
- Eraser: `kit.erase(sheet, [{ x, y, p }...], { width })`: rubs pencil off dry paper, far less of it under dried paint, no ink worth seeing; it refuses a wet sheet.
- Masking: `kit.applyResist(sheet, mask)`, `kit.liftResist(sheet)`. `kit.look()` returns your sheet as RGB bytes;
  `await kit.frame(name)` saves an extra frame.
- Run a script with `node bench/<file>.mjs`.
