# Rules (0.4)

Updated 23 November 2026 for 0.4 rc7. The 15-minute and 85-minute rules of rounds V1 to V5 are history; see [the end of this page](#history). For what each level is given, see [levels](levels.md).

## The task

Paint the subject as a person with a brush and pen would, through the simulator. The model sees the subject as an image and may look at it again with its own image tool. Pictures are for looking at, never for code.

## What a model may change

More freedom than before, and mistakes are allowed.

- Its own drawn lines.
- The drawing medium: pen, pencil or none.
- Pen ink: waterproof or soluble, a choice at every level (`kit.open(task, { ink })` at L1, soluble when it says nothing; `"ink"` beside its script at L2 to L4, waterproof when it says nothing).
- Erasing: the kit's eraser at L1; an erase passage in its own script at L2 to L4.
- The prepared drawing (L2 to L4) is offered, not required: each of its lines may be drawn before the washes, with a stage of the washes, after them, or not at all. No drawing is a normal choice.
- At every level: a whole script of its own (at L2 to L4 planned from the same inputs as Auto), and the paints (up to 14 at L2 to L4). Auto's plan, planner and settings are given at no level: a hand-in of settings, or of the code's plan, is refused, and a session that hands in no script of its own has handed in nothing (a failed painting).
- At L1 the paper's colour: white or an `[r, g, b]` tone (each 1 to 255) (`kit.open(task, { paper })`); paint only darkens it.
- At L4 also: the studies' traced shapes as regions its script may name, change or ignore. Nothing of Auto at any level.
- Where a choice only risks a worse painting, the harness gives a warning, not a refusal. It refuses only to protect the sheet or the rules.

## What is fixed

- The same area of paper for every picture (a quarter sheet, in the picture's proportions); the original's real size is told to the model as a fact, not reproduced. The simulator, the paint box and the brush physics.
- The subject and, at each level, the inputs listed in [levels](levels.md).
- The judges and the scoring.
- A model is never given a score, a verdict or an outside critique.

## The session's workspace

- Every attempt and retry has its own fresh folder and branch. Earlier ones are handed over as read-only reference.
- The model has a shell in its own folder and may write and run any code it likes.
- It cannot reach outside its folder. The one exception is the model tool's own sign-in, which the owner accepted for the first run on his machine. The container for replication is planned, not in 0.4's first run.
- The shell has no internet and one fixed, pre-installed toolbox, the same for every model. Only the model tool itself reaches its own provider, through a gate on the machine that passes the provider's hosts and refuses every other. Installs fail. Each attempt is recorded.
- The model may not read the subject's pixels with code. At L2 to L4 the pictures (the subject, the three studies, a retry's own earlier painting, a look's `beside.png` and `stages.png`) can be read by the model tool's own image viewer only: any other program is refused them. The data each level gives (the drawing's lines, the named forms, at L4 the studies' traced shapes) and the model's own dried sheet alone (`looks/N/sheet.png`) are its to read with code. See [anti-cheat](anti-cheat.md#levels-2-to-4-eyes-only).

## Fixed rounds (how the benchmark is run)

The benchmark runs each level of each picture as fixed rounds (`npm run paint -- ... --work rounds`). The open session with a shell, described under "The session's workspace", stays in the harness as a second way to run a level and is not what the benchmark's scores come from. Where the two differ, this section is the rule for a rounds run.

- A level is a short conversation with no shell, no tools and no files. The model looks at the pictures and writes.
- **No code reads a picture.** There is no code on the model's side at all, so the subject, the drawing and the studies are for its eyes only. The harness never measures a model's sheet against the subject or a study for the model.
- What the model loses: it cannot compute stroke positions, sample a colour or generate geometry with a program. It writes a wash as a shape and a way of laying it (`region`, `kind`, `handling`), and the painter fills the shape with strokes.
- Round 0: the brief, the level's data and the pictures go out once and stay in the conversation. Showing them is recorded, not priced. The model answers with its whole painting script.
- A script or an edit that cannot be read or compiled is returned once, free, with the reason. A second such answer in a row ends the try when there is no script yet (a failed painting); otherwise the last script that compiled is painted.
- A look returns the model's own sheet as it dried, on the millimetre grid, with numbers about the sheet and the script. It never includes the subject or a study, or a number measured against them.
- After a look the model answers with edits to its script (`set`, `add`, `remove`, `replace`, `move`, `drawing`), names its next look (whole, stopped after a stage, or a region) or says it is done. A whole new script is allowed.
- Looks are priced as below: 0.3 a whole half-size look, a stage or a region its share, never under 0.2, budget 3.0 a level. The full-size final, with its full film, is not charged.
- Every level is a fresh conversation with its own budget. Level 3 is handed what level 2 gets, plus its own level 2 painting and script. Level 4 is handed the same from level 3, plus the studies' traced shapes as a numbered picture and list; a passage may name a shape by number, and the share of a script's washes that do is recorded. Level 1 is handed the subject alone: no drawing, study or named form, and nothing is on the sheet before it starts.
- Named forms at levels 2 to 4 are names and boxes, not a mask picture.
- Recorded for each round: seconds, tokens (fresh, cached, output, where the command reports them) and look units. The transcript is kept with the run.
- Screening: every model of the roster first paints two core pictures at level 2. The top half by mean combined score, and at least one model of each family, go on to the remaining pictures and levels (`bench/run-sets.json`, `rounds`).

## Budgets: measured, not limited

- Looks A look has a fixed price by size, whatever is in it: a half-size look of the whole sheet 0.3, full size 1.0, a look stopped at a stage or of a region its share of that (the share of the plan's washes or passages it paints), never under 0.2. At L2 to L4 a look is painted at half size; at L1 each run of the script is a full-size painting (1.0). The budget for one try is 3.0 at every level. At L2 to L4 a showing of the original comes from the same budget: the pictures lie in the folder when the session starts, are put away at each plan or look, and `./unpaint show` brings one back, the original for 0.05 (twenty glances are one unit), a study or an earlier painting for nothing; every showing is recorded. At L2 to L4 the full-size final is not charged; at L1 the painting is its last completed run. How a model paints is never charged: water, strokes, waits and dryings are free; simulation work (cell-steps), sweeps, dryings, seconds, tokens (fresh, cached, output) and steps are recorded in `usage.json` beside the charge. One guard only, as resource management: a painting whose water steps pass ten times those of Auto's painting of the subject is stopped with a plain message, reported as a stop and not scored. The model chooses where and when to look: to a stage, or in a region.
- L1: one attempt; the budget is 3 runs of its script (each run that lays a mark costs 1.0; a fourth is refused before it lays a mark). No limit on strokes. Its clock is the same six-hour safety stop (`BENCH_V3_ATTEMPT_MIN` states a shorter one for a trial; the brief tells the model the limit in force). A level 1 target without its rendering unit has no runaway guard and is not run.
- Steps (1,000) and the clock (six hours) are runaway guards only. A return to a choice the model had left is counted, and refused past 20 (`--reverts`). The harness records the actual terms in each run's record.
- Not counted on the model's clock: the prepared inputs, the filmed full-size final, and judging.

## What is recorded

- Usage: tokens (fresh input, cached input and output, where the command reports them), provider cost, machine minutes, look units, the work of each look and of the final (sweeps, dryings, water steps, cell-steps), steps.
- Tool use: shell commands, scripts written and run, pictures opened, plan and look calls, refusals met, attempts to reach outside the folder or the internet.
- Film: snapshots of the painting in progress, taken at many stops, and the replay.
- How much each attempt changed from the last, and a flag when it is identical or nearly so.
- The budget terms in force.

## Disqualification

A try is disqualified only for reading the subject's pixels with code: at L1 a read the kit's guard blocked, or a script that names the target files; at L2 to L4 a read of a picture the sandbox refused, or a script that names a picture. A disqualified L2 to L4 session is recorded and kept, and nothing of it is painted. A high anti-cheat reading is not a disqualification; see [anti-cheat](anti-cheat.md).

## History

Rounds V1 to V5 (releases 0.1.0 and 0.1.1) had these rules. They no longer apply.

- 2,500 counted strokes per painting, and about 15 minutes per painting.
- A session stopped after 85 minutes (V3 to V5), and open models after a $2.40 cap.
- A look count: three looks while painting and one at the end in V4 and V5; about 100 in hard mode.
- A fixed paint box with `kit.mix()` limits, one brush, one dip pen, and `kit.coarse()` as the only way to read the target.
- Gentle and hard mode.
