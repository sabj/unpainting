# Rules (protocol v2)

Every round, a benchmark version from V1 to V5, has the same rules. The painting toolkit given to models is in [../v2/kit/](../v2/kit/). Its guard, a check that blocks image reads, enforces the read rules.

## The task

Paint each target as a person with a brush and pen would, using only the simulator's marks through `bench/kit.mjs`. The model sees the targets as images in its prompt and may look at them again with its own image tool.

## Budget

- 2,500 counted strokes per painting, brush and pen together. The toolkit refuses the stroke after the budget.
- About 15 minutes per painting, stated in the brief.
- The session is stopped after 85 minutes (5,100 s), so a model must finish each painting before the next.
- Open models also stop at a $2.40 spend cap.
- One GPU job at a time. The toolkit takes the GPU when it is free and runs on the CPU otherwise.

## Materials

- Paper: cold press (textured), one sheet cell per target pixel, 0.259 mm a cell. The paper seed, the number that controls repeatable texture, is the try number. A try is one model session that paints the requested targets.
- Brush paints: ultramarine, cerulean, hansa, ochre, sienna, umber, rose and sap green, mixed through `kit.mix()`. The sum of pigment concentrations in a brush mix may be at most 2.
- Pen inks: sepia and lamp black, pen only. The sum of pigment concentrations in a pen mix may be at most 8.
- One adjustable brush (radius, bristles, flat, belly, feed, give, splay, stiffness) and one dip pen. Masking fluid and blotting are available.
- Water moves only when the simulation advances. `kit.dryAll` dries the sheet.

## What a script may read

- No image file, except the frames the toolkit wrote under `bench/out/`. Node scripts are guarded only after importing the toolkit or guard. The benchmark runner configures the Python guard through `PYTHONPATH`; a separate Node process is not automatically guarded.
- For planning, `kit.coarse(task)`: at most 24 x 24 cells, an 8-color palette and a lightness value per grid cell.
- Any source file in the worktree, to learn how the brush, pen and sheet behave.

## What is recorded

- Approximate stage frames at 10, 25, 50 and 75% of counted strokes, using the next available snapshot taken every 25 counts. These snapshots are taken before the counted stroke executes. Runs under 25 strokes have no early stages. The 100% stage is the final image.
- The share of small strokes (radius under 1.5 mm), short strokes (under 3x the brush width) and dots (under the brush width). The toolkit records these and does not refuse them.
- Every blocked image read, every toolkit refusal, and the scripts the model wrote.

## Disqualification

A try is disqualified only for reading target pixels: a blocked read in the guard log, or a script that names the target files or the guard. No published try was disqualified. A high cheat-risk score is not a disqualification; see [anti-cheat.md](anti-cheat.md).

## Modes

Gentle mode is the default and the mode in the published results. Hard mode adds a look budget. See [anti-cheat.md](anti-cheat.md).
