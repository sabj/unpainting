# Level 1 inputs (the V3 round)

Level 1 of the 0.4 benchmark: the picture, the toolkit and the harness tips, nothing prepared. One session paints one
target freehand, in its own process, through `bench/kit.mjs`. [scripts/v3.mjs](../scripts/v3.mjs) runs it.

- [BRIEF.md](BRIEF.md): the brief, with `{CROP}`, `{SIZE}`, `{STYLE}`, `{TARGET}`, `{ATTEMPTS}` and `{LIMIT_MIN}` filled in per session.
- [prompts.json](prompts.json): the first prompt (`first`, `attemptsOne`). The prompts between attempts are kept for the record: level 1 is one attempt.
- [crops.json](crops.json): level 1's own targets, each with its picture, its coarse map and its rendering unit (the automatic painting's water steps, for the runaway guard).
- [TIPS.md](TIPS.md) and [tips/](tips/): the harness tips.

The toolkit, guard and technique guides are the V2 ones ([../v2/](../v2/README.md)). Rules (the owner, 23 Nov 2026):

- One attempt: one fresh session in a fresh worktree. Its script may run 3 paintings (each run that lays a mark is one; a fourth is refused before it lays anything). The painting of the last completed run is the level's.
- How it paints is free: no limit on strokes. Strokes, water steps, dryings, waits and seconds are measured and recorded beside the score, never charged.
- One guard: a painting that takes more than 10 times the water steps of the automatic painting of the subject is stopped as a runaway (recorded, not scored). A target without that unit is not run.
- The session has 60 minutes on the clock, its paintings' running time included (`BENCH_V3_ATTEMPT_MIN` states another, 10 to 360). Six hours, the safety stop of levels 2 to 4, is the most any session may run.
- The session is closed as a level 2 to 4 session is ([../scripts/pipeline/closed.mjs](../scripts/pipeline/closed.mjs)): it reads and writes its attempt's folder only, has no network but the model's own service, and one fixed toolbox. A runner the gate does not know (Codex, Muse, Together) is refused.
- The paper seed is 1.
