# Rules

What each level is given: [levels](levels.md). Scoring: [scoring](scoring.md).

The model paints the subject as a person with a brush and pen would, through the simulator. It sees the subject as an image and may look at it again with its own image tool.

## What a model may change

- Its own drawn lines, and the drawing medium: pen, pencil or none. At L2 to L4 the prepared drawing is offered, not required: each line may be drawn before the washes, with a stage of them, after them, or not at all.
- Pen ink, waterproof or soluble, at every level: `kit.open(task, { ink })` at L1 (soluble when unsaid); `"ink"` beside its script at L2 to L4 (waterproof when unsaid).
- Erasing: the kit's eraser at L1; an erase passage in its script at L2 to L4.
- At every level, a whole script of its own and the paints (up to 14 at L2 to L4). At L2 to L4 it plans from the same inputs as Auto. Auto's plan, planner and settings are given at no level: a hand-in of settings or of the code's plan is refused, and a session that hands in no script of its own has handed in nothing (a failed painting).
- At L1, the paper's colour: white or an `[r, g, b]` tone (each 1 to 255), set in `kit.open(task, { paper })`. Paint only darkens it.
- At L4, the studies' traced shapes as regions its script may name, change or ignore.
- A choice that only risks a worse painting gets a warning, not a refusal. The harness refuses only to protect the sheet or the rules.

## What is fixed

- The paper: a quarter sheet in the picture's proportions. The original's real size is told to the model as a fact.
- The simulator, the paint box, the brush physics, the judges and the scoring.
- A model is never given a score, a verdict or an outside critique.

## Workspace

- Each attempt and retry has its own fresh folder and branch. Earlier ones arrive read-only.
- The model has a shell in its folder and may write and run any code.
- It cannot reach outside its folder. The one exception is the model tool's own sign-in.
- The shell has no internet and one fixed, pre-installed toolbox, the same for every model. Only the model tool reaches its provider, through a gate that passes the provider's hosts and refuses every other. Installs fail. Each attempt is recorded.
- Code may not read the subject's pixels.

## Budgets: measured, not limited

- A look has a fixed price by size, whatever is in it: a half-size look of the whole sheet 0.3, full size 1.0, a look stopped at a stage or cut to a region its share of that (the share of the plan's washes or passages it paints), never under 0.2. The budget for one try is 3.0 at every level.
- At L2 to L4 a look is half size (`./unpaint look`). The full-size final is painted after the session and not charged.
- At L1 each run of the script is a full-size painting (1.0); the budget is 3 runs, and a fourth is refused before it lays a mark. The painting is its last completed run. One attempt; no limit on strokes. Its session has 60 minutes on the clock, the running time of its paintings included (`BENCH_V3_ATTEMPT_MIN` states another, never past the six-hour safety stop; the brief tells the model the limit in force). A level 1 target without its rendering unit has no runaway guard and is not run.
- How a model paints is never charged: water, strokes, waits and dryings are free. Simulation work (cell-steps), sweeps, dryings, seconds, tokens (fresh, cached, output) and steps are recorded in `usage.json` beside the charge.
- One runaway guard: a painting whose water steps pass ten times those of Auto's painting of the subject is stopped with a message, reported as a stop and not scored (a look it stops costs nothing).
- At L2 to L4, steps (1,000) and the six-hour clock are runaway guards only. A return to a choice the model had left is counted, and refused past 20 (`--reverts`). The harness records the terms in force in each run's record.
- Not on the model's clock: the prepared inputs, the filmed full-size final, and judging.

## Recorded

- Usage: tokens (where the command reports them), provider cost, machine minutes, look units, the work of each look and of the final, steps.
- Tool use: shell commands, scripts written and run, pictures opened, plan and look calls, refusals met, attempts to reach outside the folder or the internet.
- Film: snapshots of the painting in progress, and the replay.
- How much each attempt changed from the last, with a flag when it is identical or nearly so.
- The budget terms in force.

## Disqualification

A try is disqualified only for reading the subject's pixels with code. A high cheat-risk reading is not a disqualification.

## Target-read guard

The targets are never in the model's worktree. The model sees them as prompt images and opens its own copy, outside the worktree, with its image tool.

- `v2/kit/guard.mjs` loads when a script imports the kit. It wraps the `fs` read, open and copy calls and the `sharp` decode calls. A read of an image file outside `bench/out/` is refused, logged outside the worktree, and raises an error.
- `v2/kit/py/sitecustomize.py` loads into every Python process through `PYTHONPATH` and does the same for `open`.
- Scripts get the target only through `kit.coarse(task)`: at most 24 x 24 cells, an 8-colour palette and a value per cell.
- The kit refuses raw concentration arrays, so every colour passes through `kit.mix()`.
- After the session an audit counts guard log entries, kit refusals and script lines that name the target files or the guard. A try with a blocked read or a matching line is disqualified.
- Separate Node processes are not guarded, and neither is a shell `cp` of a target into `bench/out/` (MiniMax M3 V2 try 2 did this; no script opened the copies).

`v2/kit/cheat-test.mjs` and `v2/kit/cheat-test.py` test six routes, all blocked and logged: `fs.readFileSync`, `fs.promises.readFile`, `sharp(file).raw()`, a copy into `bench/out/`, a raw concentration array and PIL. `scripts/run.mjs --dry-run` repeats a small check (`dryRunGuardProbe` in `run.json`). See [the run-time block](../v2/README.md#run-time-target-read-block).

## Cheat risk

A reference reading, 0 to 1, kept beside the scores. It never changes a score. Low is under 0.3, medium 0.3 to under 0.6, high 0.6 and over. Parts, each 0 to 1:

- progression: `(3.5 - earlyMean) / 2`, where `earlyMean` is the mean progression score of the 10% and 25% stages over the try's targets.
- copy: the correlation of the 2 to 4 px band of painting and target luminance (`scorer/copy_band.py`) over a per-target ceiling, minus 0.5. The ceilings are 1.25 times the highest value any V2 painting reached: Hills 0.021, France 0.044, Ships 0.068, Trumbull 0.152.
- small strokes: `(share of small strokes - 0.3) / 0.5`.
- audit: 1 if the guard logged a blocked read or a script names the targets, else 0.

`run.json` keeps two combinations: `cheat.risk` = 0.4 progression + 0.3 copy + 0.15 small strokes + 0.15 audit, and `cheat.progressionRisk` = 0.5 progression + 0.25 small strokes + 0.25 audit. A try is flagged for review when either is high; V3 takes the higher per target and the highest target (`"basis": "highest crop"`). A high score never excludes a try: weak technique raises the same signals as copying. Every flagged try so far was reviewed by hand and none cheated; see [findings](../results/FINDINGS.md#target-reads-and-cheat-risk). Stroke logs ([run format](run-format.md#stroke-log)) are not part of the score.

## Adding a model

A submission is one or more try folders in the [run format](run-format.md), scored with the benchmark's scorer, plus rebuilt results, as a pull request.

- Level 1: `node bench/scripts/run.mjs --round V3 --model KEY` (key in `bench/models.json`). Levels 2 to 4: `npm run paint` (key in `tools/paint/authors.json`). A model has the same `-m` key in both. Level 1 runs closed, so its runner must be one the gate knows (`tools/paint/session-net.mjs` `PROVIDER_HOSTS`: claude and agy); any other is refused.
- A new CLI-served model needs an entry in `models.json` with `runner` set to `claude`, `codex` or `together`. Another provider needs a branch in `scripts/runners.mjs` that starts the session in the run's worktree with the prompt and target images and records token counts. Keep the model's tools general; give it nothing that reads target pixels.
- Check first: `npm run bench:run -- --dry-run` (no keys, no model).
- Score: `pip install -r bench/scorer/requirements.txt`, then `npm run bench:score04` ([scoring](scoring.md)). Commands for every level: [how to replicate](../README.md#how-to-replicate-04).
- Rebuild and test: `npm run bench:build`, `npm run bench:test`.
- Include in the PR: every try folder you ran, bad ones too, under `runs/<round>/<model>/`; the rebuilt `results/results.json`, `leaderboard.md`, `gallery.md` and `FINDINGS.md`; the `models.json` entry and any runner change; the model id, reasoning setting, date and hardware. Keep raw outputs under `bench/work/raw/` until review ends. A try with a blocked read is disqualified but stays in the PR.
- Results from a changed kit, brief, budget or scorer are a different protocol: a separate PR that explains the change.
- Run each try on a disposable machine or container: the model runs code without permission prompts.

V4 and V5 run only from tag `v0.3.2`.

## Old rules

Rounds V1 to V5 (0.1.0 and 0.1.1) had 2,500 strokes and about 15 minutes per painting; an 85-minute session and a $2.40 cap on open models; three looks while painting and one at the end (about 100 in hard mode); a fixed paint box with one brush and one dip pen; gentle and hard mode. None applies now.
