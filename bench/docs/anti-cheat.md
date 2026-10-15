# Anti-cheat

Cheating here means hill-climbing toward the photo: repeatedly changing strokes to reduce image error. This includes fitting strokes pixel by pixel or keeping a stroke only when it improves the match.

- Models can look at the target and at their own painting as often as they like, the way a painter glances at a reference.
- Their code may not read the target's pixels. Node scripts that import the painting toolkit given to models or the guard (a check that blocks image reads), and Python scripts started with the benchmark runner's environment, block and log image reads. Separate Node processes are not automatically guarded. A blocked read disqualifies the run.
- Every painting also gets a cheat-risk score: how closely its fine detail copies the photo, whether its stages go light to dark and broad to fine like a person's would, and how much of it is tiny strokes.
- Gentle mode applies these checks. Hard mode adds a budget of about 100 looks per painting, so a model can't hill-climb by eye either.

## Gentle mode

Gentle mode is the default. The published tries use it. A try is one model session that paints the requested targets.

- The targets are never in the model's worktree. The model sees them as prompt images and may open its own copy, outside the worktree, with its own image tool.
- `v2/kit/guard.mjs` loads when a script imports the toolkit. It wraps the `fs` read, open and copy calls and the `sharp` decode calls. Any read of an image file outside `bench/out/` is refused and logged outside the worktree. The script raises an error.
- `v2/kit/py/sitecustomize.py` loads into every Python process through `PYTHONPATH` and does the same for `open`.
- Scripts get the target only through `kit.coarse(task)`: at most 24 x 24 cells, an 8-color palette and a value (lightness) per cell.
- The toolkit refuses raw concentration arrays, so every color passes through `kit.mix()`.
- After the session, an audit counts guard log entries, toolkit refusals and script lines that name the target files or the guard. A try with a blocked read or a matching script line is disqualified.

`v2/kit/cheat-test.mjs` and `v2/kit/cheat-test.py` test six blocked routes: `fs.readFileSync`, `fs.promises.readFile`, `sharp(file).raw()`, a copy into `bench/out/`, a raw concentration array and PIL. All six are blocked and logged. See [the run-time block](../v2/README.md#run-time-target-read-block).

`scripts/run.mjs --dry-run` repeats a small version of this check on every dry run: a script tries to read a target, and the run records whether it was blocked and logged (`dryRunGuardProbe` in `run.json`).

## Hard mode

Hard mode is gentle mode with a budget of looks: about 100 looks at the target per painting. Past the budget a look returns nothing and the refusal is counted. Hard mode is opt-in. The published tries use gentle mode. `scripts/run.mjs` does not implement hard mode; each runner needs its own look counter. A hard-mode `run.json` sets `settings.mode` to `hard` and `settings.lookBudget` to the budget.

## The cheat-risk score

The score is informational. It ranges from 0 to 1, with levels low (under 0.3), medium (0.3 to under 0.6) and high (0.6 and over).

Parts, each from 0 to 1:

- progression: `(3.5 - earlyMean) / 2`, limited to 0–1, where `earlyMean` is the mean progression score of the 10% and 25% stages over the try's targets. A try whose early stages do not look like a person's start scores high.
- copy: the correlation of the 2 to 4 px band of painting and target luminance (`scorer/copy_band.py`), over a per-target ceiling, minus 0.5, limited to 0–1. The ceilings are 1.25 times the highest value any painting in benchmark version V2 reached: Hills 0.021, France 0.044, Ships 0.068, Trumbull 0.152.
- small strokes: `(share of small strokes - 0.3) / 0.5`, limited to 0–1.
- audit: 1 if the guard logged a blocked read or a script names the targets, else 0.

Two combinations are kept in `run.json`:

- `cheat.risk` = 0.4 progression + 0.3 copy + 0.15 small strokes + 0.15 audit
- `cheat.progressionRisk` = 0.5 progression + 0.25 small strokes + 0.25 audit

A try is flagged for review when either is high. In benchmark version V3, tries are scored per target with the higher of the two combinations, and the try takes its highest target risk score (`"basis": "highest crop"`).

Stroke logs (see [run-format.md](run-format.md#stroke-log)) record each stroke's order, size, pressure and timing, and show whether a path follows the target's edges or a person's coarse-to-fine order. They are not yet part of the score.

A high score never excludes a try on its own, because weak technique raises the same signals that copying does. Laying darks early, or ending close to the photo, scores higher without any cheating. [Findings](../results/FINDINGS.md#target-reads-and-cheat-risk) lists the tries that scored high and their review status.

Every try the score flagged was reviewed by hand, and none cheated. The flags came from early stages that didn't look like a person's start.

## Known gap

MiniMax M3 V2 try 2 copied the target images into `bench/out/` with a shell `cp`. No script opened the copies, but the guard only wraps Node and Python calls, so it missed the copy. The guard needs a post-run check for copied targets. It is not built yet.
