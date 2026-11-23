# Rules (0.4)

Updated 23 November 2026 for 0.4 rc7. The 15-minute and 85-minute rules of rounds V1 to V5 are history; see [the end of this page](#history). For what each level is given, see [levels](levels.md).

## The task

Paint the subject as a person with a brush and pen would, through the simulator. The model sees the subject as an image and may look at it again with its own image tool.

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

- One standard sheet for every picture; the original's real size is told to the model as a fact, not reproduced. The simulator, the paint box and the brush physics.
- The subject and, at each level, the inputs listed in [levels](levels.md).
- The judges and the scoring.
- A model is never given a score, a verdict or an outside critique.

## The session's workspace

- Every attempt and retry has its own fresh folder and branch. Earlier ones are handed over as read-only reference.
- The model has a shell in its own folder and may write and run any code it likes.
- It cannot reach outside its folder. The one exception is the model tool's own sign-in, which the owner accepted for the first run on his machine. The container for replication is planned, not in 0.4's first run.
- The shell has no internet and one fixed, pre-installed toolbox, the same for every model. Only the model tool itself reaches its own provider, through a gate on the machine that passes the provider's hosts and refuses every other. Installs fail. Each attempt is recorded.
- The model may not read the subject's pixels with code. See [anti-cheat](anti-cheat.md).

## Budgets: measured, not limited

- Looks A look has a fixed price by size, whatever is in it: a half-size look of the whole sheet 0.3, full size 1.0, a look stopped at a stage or of a region its share of that (the share of the plan's washes or passages it paints), never under 0.2. At L2 to L4 a look is painted at half size; at L1 each run of the script is a full-size painting (1.0). The budget for one try is 3.0 at every level. At L2 to L4 the full-size final is not charged; at L1 the painting is its last completed run. How a model paints is never charged: water, strokes, waits and dryings are free; simulation work (cell-steps), sweeps, dryings, seconds, tokens (fresh, cached, output) and steps are recorded in `usage.json` beside the charge. One guard only, as resource management: a painting whose water steps pass ten times those of Auto's painting of the subject is stopped with a plain message, reported as a stop and not scored. The model chooses where and when to look: to a stage, or in a region.
- L1: the budget is 3 runs of its script (each run that lays a mark costs 1.0; a fourth is refused before it lays a mark). The L1 kit also stops a painting at 2,500 strokes, a guard it keeps from the earlier rounds. Its runner's clock is `BENCH_V3_ATTEMPT_MIN` minutes: run it with 360, the six-hour stop, and the brief tells the model that limit.
- Steps (1,000) and the clock (six hours) are runaway guards only. A return to a choice the model had left is counted, and refused past 20 (`--reverts`). The harness records the actual terms in each run's record.
- Not counted on the model's clock: the prepared inputs, the filmed full-size final, and judging.

## What is recorded

- Usage: tokens (fresh input, cached input and output, where the command reports them), provider cost, machine minutes, look units, the work of each look and of the final (sweeps, dryings, water steps, cell-steps), steps.
- Tool use: shell commands, scripts written and run, pictures opened, plan and look calls, refusals met, attempts to reach outside the folder or the internet.
- Film: snapshots of the painting in progress, taken at many stops, and the replay.
- How much each attempt changed from the last, and a flag when it is identical or nearly so.
- The budget terms in force.

## Disqualification

A try is disqualified only for reading the subject's pixels with code. A high anti-cheat reading is not a disqualification; see [anti-cheat](anti-cheat.md).

## History

Rounds V1 to V5 (releases 0.1.0 and 0.1.1) had these rules. They no longer apply.

- 2,500 counted strokes per painting, and about 15 minutes per painting.
- A session stopped after 85 minutes (V3 to V5), and open models after a $2.40 cap.
- A look count: three looks while painting and one at the end in V4 and V5; about 100 in hard mode.
- A fixed paint box with `kit.mix()` limits, one brush, one dip pen, and `kit.coarse()` as the only way to read the target.
- Gentle and hard mode.
