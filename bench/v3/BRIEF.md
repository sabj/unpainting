# Paint one crop with the watercolour simulator, in attempts (protocol v2)

You are in a fresh git worktree of a watercolour painting simulator (Node 25, ES modules). Paint the target crop as a
person with a brush and pen would, using only the simulator's marks through `bench/kit.mjs`.

Task `{CROP}`: {SIZE} px. Style: {STYLE}. The target is attached to the first message. You may look at it again with
your own image viewing tool at `{TARGET}`.

## Attempts

{ATTEMPTS} Every attempt starts from a fresh sheet (`kit.open` gives one). Your scripts, your notes and the earlier
attempts stay: the harness copies each attempt's final image, frames, stats and scripts to `bench/attempts/a<N>/`, with
`compare.png` (target left, your painting right) to look at with your own eyes. Keep your own notes in `bench/NOTES.md`.
When an attempt is painted (it ends with `kit.finish`), stop and wait for the next message.

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
- Budget per attempt: at most 2,500 strokes (brush and pen together). About 30 minutes per attempt, including your
  thinking; each attempt is stopped after 30 minutes. One painting run at a time: do not run several in parallel.
- End each attempt with `await kit.finish(note)`. Outputs land in `bench/out/{CROP}/` (`final.png`, `frames/`,
  `stats.json`). Rerunning overwrites them, so the last run in an attempt is the one that counts.
- Work only inside this worktree. Do not commit, push or touch anything outside it.

## Skills

Two skills written for this painter are in `bench/skills/`: `watercolor-technique/SKILL.md` (with its `references/`)
and `painting-planner/SKILL.md`. Read both before you plan, and plan and paint the way they say. Where they name repo
tools you were told not to use, take the technique and apply it with the kit.

## Simulator in brief

- `const { sheet, O, W, H } = await kit.open('{CROP}')`: a fresh cold-press sheet, one cell per target pixel,
  0.259 mm a cell.
- `kit.createBrush({ radius, bristles, capacity, flat, belly, feed, give, splay, stiffness, seed })` (radius in
  cells), `kit.dip(brush, { water: 0..1, conc: kit.mix({ sapgreen: 0.4, ochre: 0.1 }) })`. A brush runs out: dip again.
- `kit.stroke(brush, sheet, [{ x, y, p }...], { between: s => { if (s % 6 === 0) kit.step(sheet, O); } })`; water
  moves only when the sheet steps. `kit.dryAll(sheet, O)` dries the sheet; strokes on a wet sheet run together, on a
  dry sheet they keep their edges.
- Pen: `kit.createPen({ nib, flex })`, `kit.dipPen(pen, kit.mix({ sepia: 3 }))`, `kit.penStroke(pen, sheet, [{ x, y, p, v }...])`.
- Masking: `kit.applyResist(sheet, mask)`, `kit.liftResist(sheet)`. `kit.look()` returns your sheet as RGB bytes;
  `await kit.frame(name)` saves an extra frame.
- Run a script with `node bench/<file>.mjs`.
