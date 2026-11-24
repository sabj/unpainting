# Level 1 inputs

Level 1: the picture, the toolkit and the tips, nothing prepared. One session paints one target freehand through `bench/kit.mjs`. [scripts/v3.mjs](../scripts/v3.mjs) runs it. The toolkit, guard and technique guides are the [V2 ones](../v2/README.md).

- [BRIEF.md](BRIEF.md): the brief; `{CROP}`, `{SIZE}`, `{STYLE}`, `{TARGET}`, `{ATTEMPTS}` and `{LIMIT_MIN}` are filled in per session.
- [prompts.json](prompts.json): the first prompt (`first`, `attemptsOne`).
- [crops.json](crops.json): level 1's targets, each with picture, coarse map and rendering unit (the automatic painting's water steps, for the runaway guard).
- [TIPS.md](TIPS.md) and [tips/](tips/): the tips.

Rules:

- One attempt, in a fresh session and worktree. The script may run 3 paintings (each run that lays a mark is one; a fourth is refused before it lays anything). The painting of the last completed run counts.
- No limit on strokes. Strokes, water steps, dryings, waits and seconds are measured and recorded, never charged.
- One guard: a painting with more than 10 times the water steps of the automatic painting of the subject is stopped as a runaway (recorded, not scored). A target without that unit is not run.
- The session has 60 minutes on the clock, its paintings' running time included (`BENCH_V3_ATTEMPT_MIN` states another, 10 to 360). Six hours is the most any session may run.
- The session is closed as levels 2 to 4 are ([closed.mjs](../scripts/pipeline/closed.mjs)): it reads and writes its attempt's folder only, has no network but the model's own service, and one fixed toolbox. A runner the gate does not know (Together) is refused.
- Paper seed 1.
