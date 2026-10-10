# Paint five small crops (sections of target images) with the watercolour simulator (protocol v2)

You are in a fresh git worktree, a separate checkout, of a watercolour painting simulator (Node.js 25, ECMAScript modules). Paint each of the five
target crops as a person with a brush and pen would, using only the simulator's marks through `bench/kit.mjs`, the painting toolkit given to models.

| task | size | style |
| --- | --- | --- |
| `hills` | 306 x 242 | very loose ink and wash: groups of oak trees on green hills with a dirt trail |
| `south-france` | 304 x 249 | urban sketch, pen plus light wash: Provence trees, cypresses and a few stone houses |
| `sargent` | 300 x 244 | pure watercolor, no ink: a white ship's hull against water, with rigging (after Sargent) |
| `mittens` | 300 x 259 | watercolor portrait sketch, fine lines and light washes |
| `trumbull` | 300 x 263 | precise architectural watercolor: a stone college facade with windows |

The five targets are attached to this prompt in that order. You may look at them again with your own image viewing
tool at `TARGET_DIR/<task>.png`. Do them in the order above.

## Rules (protocol v2)

- Look at the targets with your own eyes only. No script may read a target or any other image file: the toolkit's guard, a check that blocks image reads,
  rejects it and logs it. For planning you may use `kit.coarse(task)`: at most 24 x 24 cells with an 8-colour
  palette and a lightness value per grid cell. Your own frames under `bench/out/` are readable.
- Paint only from the box: colours come from `kit.mix()` over the brush paints in `kit.BRUSH_PAINTS`; the pen takes
  `sepia` or `lampblack` under the protocol. The toolkit enforces mixtures made by `kit.mix()` and a total concentration
  limit of 8 for the pen; it does not enforce the protocol's ink choices.
- Import only `bench/kit.mjs` in your painting scripts (it wraps `src/media/`); you may read any source to learn how
  the brush, pen and sheet behave.
- Paint like a person: light before dark, broad before detail, washes and strokes rather than pixel fills. Stage
  frames use the next available snapshot for 10%, 25%, 50% and 75% of counted strokes, plus the final image.
  Snapshots occur every 25 counts, before that stroke executes. Runs under 25 strokes have only the final stage.
  Stages are judged for painting order. Brush size, stroke length and dots are recorded.
- Budget per painting: at most 2,500 strokes (brush and pen together). About 15 minutes per painting; the session is
  stopped after 85 minutes, so finish each painting before starting the next. One GPU job at a time: the toolkit takes
  the GPU when it is free and otherwise runs on the CPU, so do not run several paintings in parallel.
- End each painting with `await kit.finish(note)`. Outputs land in `bench/out/<task>/`. Rerunning a task overwrites
  it; the last run counts. Work only inside this worktree. Do not commit or push.

## Simulator in brief

- `const { sheet, O, W, H } = await kit.open('hills')`: a fresh cold-press sheet with a textured surface, one cell per target pixel,
  0.259 mm a cell.
- `kit.createBrush({ radius, bristles, capacity, flat, belly, feed, give, splay, stiffness, seed })` (radius in
  cells), `kit.dip(brush, { water: 0..1, conc: kit.mix({ sapgreen: 0.4, ochre: 0.1 }) })`. A brush runs out: dip again.
- `kit.stroke(brush, sheet, [{ x, y, p }...], { between: s => { if (s % 6 === 0) kit.step(sheet, O); } })`; water
  moves only when the simulation advances. `kit.dryAll(sheet, O)` dries the sheet; strokes on a wet sheet run together, on a
  dry sheet they keep their edges.
- Pen: `kit.createPen({ nib, flex })`, `kit.dipPen(pen, kit.mix({ sepia: 3 }))`, `kit.penStroke(pen, sheet, [{ x, y, p, v }...])`.
- Masking: `kit.applyResist(sheet, mask)`, `kit.liftResist(sheet)`. `kit.look()` returns your sheet as RGB bytes;
  `await kit.frame(name)` saves an extra frame.
- Run a script with `node bench/<file>.mjs`.

When all five paintings are finished, write `bench/out/NOTES.md`: two or three lines per painting on what you did.

## Skills

Two skills written for this painter are in `.agents/skills/`: `watercolor-technique/SKILL.md` (with its `references/`)
and `painting-planner/SKILL.md`. Read both before you plan, and plan and paint each crop the way they say. Where they
name repo tools you were told not to use, take the technique and apply it with the toolkit.
