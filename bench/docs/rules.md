# Rules

What each level is given: [levels](levels.md). Scoring: [scoring](scoring.md).

The model paints the subject as a person with a brush and pen would, through the simulator. It sees the subject as an image and may look at it again with its own image tool. Pictures are for looking at, never for code.

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
- Code may not read the subject's pixels. At L2 to L4 the pictures (the subject, the three studies, a retry's own earlier painting, a look's `beside.png` and `stages.png`) can be read by the model tool's own image viewer only: any other program is refused them. The data each level gives (the drawing's lines, the named forms, at L4 the studies' traced shapes) and the model's own dried sheet alone (`looks/N/sheet.png`) are its to read with code. See [the anti-cheat guard](#anti-cheat-guard-levels-2-to-4).

## Fixed rounds (how the benchmark is run)

The benchmark runs each level of each picture as fixed rounds (`npm run paint -- ... --work rounds`). The open session with a shell, described under "Workspace", stays in the harness as a second way to run a level and is not what the benchmark's scores come from. Where the two differ, this section is the rule for a rounds run.

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

- A look has a fixed price by size, whatever is in it: a half-size look of the whole sheet 0.3, full size 1.0, a look stopped at a stage or cut to a region its share of that (the share of the plan's washes or passages it paints), never under 0.2. The budget for one try is 3.0 at every level.
- At L2 to L4 a look is half size (`./unpaint look`). The full-size final is painted after the session and not charged.
- At L2 to L4 a showing of the original comes from the same budget: the pictures lie in the folder when the session starts, are put away at each plan or look, and `./unpaint show` brings one back, the original for 0.05 (twenty glances are one unit), a study or an earlier painting for nothing; every showing is recorded.
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

A try is disqualified only for reading the subject's pixels with code: at L1 a read the kit's guard blocked, or a script that names the target files; at L2 to L4 a read of a picture the sandbox refused, or a script that names a picture. A disqualified L2 to L4 session is recorded and kept, and nothing of it is painted. A high cheat-risk reading is not a disqualification.

Cheating here means hill-climbing toward the original: repeatedly changing strokes to reduce image error, fitting strokes pixel by pixel, or keeping a stroke only when it improves the match. A model may look at the original and at its own painting as often as its budget allows, the way a painter glances at a reference; its code may not read the original's pixels.

## Anti-cheat guard, levels 2 to 4

In the open session (`tools/paint/eyes-only.mjs`), the older rounds' rule.

- Pictures, for looking at only: `inputs/source.png` (the subject), `inputs/study-1.png` to `study-3.png`, every picture of a retry's own earlier painting (`previous/`), and each look's `beside.png` and `stages.png`, which show the subject.
- Data, readable by any script: `inputs/forms.json`, `inputs/forms-ids.png`, `inputs/forms.png`, `inputs/drawing.png`, `drawing/lines.json`, `drawing/all-lines.png`, at L4 `resources/shapes.json`, each look's `numbers.txt`, `plan.json`, `plan.png` and `sheet.png` (the model's own dried sheet alone), and the model's own files.
- Refused: the sandbox lets only the model tool's own program read a picture's bytes. A script, `cat`, a copy, a link or a move is refused, and the folders that hold pictures cannot be written from inside the session. The profile is tried before a session starts; a tool whose sandbox cannot hold the pictures is not started.
- Detected: after the session its transcript and scripts are read. A read the system refused, or a script that names a picture, disqualifies the try (`session.guard` and `session.cheat` in `run.json` and `usage.json`). Another shell command that names a picture is recorded, not a disqualification.
- Counted: each `./unpaint show FILE` is recorded (which picture, when) and priced as under [budgets](#budgets-measured-not-limited).
- Not held: a model tool that could be made to run a script inside its own program would read a picture as its viewer does (the claude command was tried and does not; agy and codex were not tried). The preflight (`npm run paint -- SUBJECT preflight --author MODEL`) runs under the same rule and shows whether each tool's viewer opens a picture. A look's `beside.png` shows the subject for as long as the session lasts, at no further price.

## Target-read guard, level 1 (gentle mode)

Gentle mode is the default, and the published tries use it. The targets are never in the model's worktree. The model sees them as prompt images and opens its own copy, outside the worktree, with its image tool.

- `v2/kit/guard.mjs` loads when a script imports the kit. It wraps the `fs` read, open and copy calls and the `sharp` decode calls. A read of an image file outside `bench/out/` is refused, logged outside the worktree, and raises an error.
- `v2/kit/py/sitecustomize.py` loads into every Python process through `PYTHONPATH` and does the same for `open`.
- Scripts get the target only through `kit.coarse(task)`: at most 24 x 24 cells, an 8-colour palette and a value per cell.
- The kit refuses raw concentration arrays, so every colour passes through `kit.mix()`.
- After the session an audit counts guard log entries, kit refusals and script lines that name the target files or the guard. A try with a blocked read or a matching line is disqualified.
- Separate Node processes are not guarded, and neither is a shell `cp` of a target into `bench/out/` (MiniMax M3 V2 try 2 did this; no script opened the copies). A post-run check for copied targets is needed and not built yet.
- Hard mode (history) was gentle mode with about 100 looks at the target per painting; past the budget a look returned nothing and the refusal was counted. `scripts/run.mjs` does not implement it. A hard-mode `run.json` sets `settings.mode` to `hard` and `settings.lookBudget`.

`v2/kit/cheat-test.mjs` and `v2/kit/cheat-test.py` test six routes, all blocked and logged: `fs.readFileSync`, `fs.promises.readFile`, `sharp(file).raw()`, a copy into `bench/out/`, a raw concentration array and PIL. `scripts/run.mjs --dry-run` repeats a small check (`dryRunGuardProbe` in `run.json`). See [the run-time block](../v2/README.md#run-time-target-read-block).

## Cheat risk

A reference reading, 0 to 1, kept beside the scores. It never changes a score. Low is under 0.3, medium 0.3 to under 0.6, high 0.6 and over. Parts, each 0 to 1:

- progression: `(3.5 - earlyMean) / 2`, where `earlyMean` is the mean progression score of the 10% and 25% stages over the try's targets.
- copy: the correlation of the 2 to 4 px band of painting and target luminance (`scorer/copy_band.py`) over a per-target ceiling, minus 0.5. The ceilings are 1.25 times the highest value any V2 painting reached: Hills 0.021, France 0.044, Ships 0.068, Trumbull 0.152.
- small strokes: `(share of small strokes - 0.3) / 0.5`.
- audit: 1 if the guard logged a blocked read or a script names the targets, else 0.

`run.json` keeps two combinations: `cheat.risk` = 0.4 progression + 0.3 copy + 0.15 small strokes + 0.15 audit, and `cheat.progressionRisk` = 0.5 progression + 0.25 small strokes + 0.25 audit. A try is flagged for review when either is high; V3 takes the higher per target and the highest target (`"basis": "highest crop"`). A high score never excludes a try: weak technique raises the same signals as copying (laying darks early, or ending close to the photo, scores higher without any cheating); a high score is reviewed and stays on the leaderboard. Every flagged try so far was reviewed by hand and none cheated; see [findings](../results/FINDINGS.md#target-reads-and-cheat-risk). Stroke logs ([run format](run-format.md#stroke-log)) are not part of the score.

## Adding a model

A submission is one or more try folders in the [run format](run-format.md), scored with the benchmark's scorer, plus rebuilt results, as a pull request.

- Level 1: `node bench/scripts/run.mjs --round V3 --model KEY` (key in `bench/models.json`). Levels 2 to 4: `npm run paint` (key in `tools/paint/authors.json`). A model has the same `-m` key in both. Level 1 runs closed, so its runner must be one the gate knows (`tools/paint/session-net.mjs` `PROVIDER_HOSTS`: claude and agy); any other is refused.
- A new CLI-served model needs an entry in `models.json` with `runner` set to `claude`, `codex` or `together`. Another provider needs a branch in `scripts/runners.mjs` that starts the session in the run's worktree with the prompt and target images and records token counts. Keep the model's tools general; give it nothing that reads target pixels.
- Check first: `npm run bench:run -- --dry-run` (no keys, no model: a scripted planner stands in), then `npm run bench:score -- bench/work/dry-run/runs/v4-pipeline/dry-run/1 --dry-run`, which writes a `dry-run` record. `--dry-run --round V4` or `V5` runs a round without a model at 96 px on the CPU.
- V3 to V5 runners also need `turnCommand`: a later turn resumes the same session.
- Old rounds (from tag `v0.3.2`): `npm run bench:run -- --model KEY --round V4` (or `V5`, which calls the judges between tries and needs `TOGETHER_API_KEY`); 3 tries a round, only tries 1 to 3 enter the results; `--crops` narrows the targets and `--gpu off` paints on the CPU. Without the private targets a try paints `sargent` and `trumbull`. One painting on an Apple M3 laptop GPU took about 17 minutes plus the model's time; scoring one (`npm run bench:score -- RUN`) takes about 15 judge calls and 2 stage calls.
- Score: `pip install -r bench/scorer/requirements.txt`, then `npm run bench:score04` ([scoring](scoring.md)). Commands for every level: [how to replicate](../README.md#how-to-replicate-04).
- Rebuild and test: `npm run bench:build`, `npm run bench:test`.
- Include in the PR: every try folder you ran, bad ones too, under `runs/<round>/<model>/`; the rebuilt `results/results.json`, `leaderboard.md`, `gallery.md` and `FINDINGS.md`; the `models.json` entry and any runner change; the model id, reasoning setting, date and hardware. Keep raw outputs under `bench/work/raw/` until review ends. A try with a blocked read is disqualified but stays in the PR.
- Results from a changed kit, brief, budget or scorer are a different protocol: a separate PR that explains the change.
- Run each try on a disposable machine or container: the model runs code without permission prompts.

V4 and V5 run only from tag `v0.3.2`.

## Old rules

Rounds V1 to V5 (0.1.0 and 0.1.1) had 2,500 strokes and about 15 minutes per painting; an 85-minute session and a $2.40 cap on open models; three looks while painting and one at the end (about 100 in hard mode); a fixed paint box with one brush and one dip pen; gentle and hard mode. None applies now.
