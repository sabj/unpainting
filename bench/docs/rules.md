# Rules (0.4)

Updated 22 November 2026. The 2,500-stroke, 15-minute and 85-minute rules of rounds V1 to V5 are history; see [the end of this page](#history). For what each level is given, see [levels](levels.md).

## The task

Paint the subject as a person with a brush and pen would, through the simulator. The model sees the subject as an image and may look at it again with its own image tool.

## What a model may change

More freedom than before, and mistakes are allowed.

- Its own drawn lines.
- The drawing medium: pen, pencil or none.
- Pen ink: waterproof or soluble, a choice at every level (`"ink"` beside its script at L2 to L4; waterproof when it says nothing).
- Erasing: the kit's eraser at L1; an erase passage in its own script at L2 to L4.
- At L2 to L4: a whole script of its own (the model plans the painting itself from Auto's inputs), the pencil lines Auto keeps, and the paints (up to 14). Auto's plan and planner are given at no level: a settings choice or a plan edit is refused, and a session that hands in no script of its own has handed in nothing (a failed painting).
- At L4 also: the studies' traced shapes as regions its script may name, change or ignore. Nothing of Auto at any level.
- Where a choice only risks a worse painting, the harness gives a warning, not a refusal. It refuses only to protect the sheet or the rules.

## What is fixed

- The paper, the simulator, the paint box and the brush physics.
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

- Looks (owner, 23 Nov: "I dont want to penalize a model for choosing more water"). A look has a fixed price by size and by the share of the sheet or script it paints, whatever is in it: a half-size look of the whole sheet 0.3, full size 1.0, a look stopped at a stage or of a region its share of that, never under 0.2. The budget for one try is 3.0 at every level. The final is not charged. How a model paints is never charged: brush sweeps, dryings, water steps, cell-steps, seconds, tokens and steps are recorded in `usage.json` beside the charge. One guard only, as resource management: a painting whose water steps pass ten times those of Auto's painting of the subject is stopped with a plain message, recorded as a stop and never scored. The model chooses where and when to look: to a stage, or in a region.
- Steps: 1,000, as a runaway guard.
- The clock is a safety stop only: six hours.
- The target for resource management is about 60 minutes per session, covering the model's thinking and its looks. A session that reaches it hands in what it has and is marked so. The owner wants to tighten this. The harness records the actual terms in each run's record.
- Not counted on the model's clock: Auto's prepared inputs and plan (they are free), the filmed full-size final, and judging.

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
