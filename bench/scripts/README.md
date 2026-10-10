# bench/scripts

The scripts that run, score and publish unpaint-bench. Run them from the repository root through `npm run bench:*`.

- `run.mjs` (`npm run bench:run`): runs one model through a benchmark version and writes its try folders: one try of V1 or V2, or tries 1 to `--tries` of V3, V4 or V5. `--dry-run` uses `dry-painter.mjs` (V1 to V3) or `pipeline/dry-planner.mjs` (V4, V5) in place of a model.
- `v3.mjs`: V3, one session per target in attempts.
- `pipeline/`: V4 and V5. `round45.mjs` runs the tries, `session.mjs` answers the model's paint commands and keeps its clock, `painting.mjs` drives the painter across revisions, `plan-args.mjs` and `check.mjs` turn a plan into painter settings and check it, `feedback.mjs` writes V5 feedback, `harness.mjs` holds the worktree and turn helpers, and `tokens.mjs` writes `v4v5/TOKENS.md`.
- `runners.mjs`: how each kind of model is launched, and how its token use is read back.
- `score.mjs` (`npm run bench:score`): scores a try folder and updates its `run.json`.
- `build-results.mjs`, `build-leaderboard.mjs` and `build-findings.mjs` (`npm run bench:build`): rebuild `results.json`, the leaderboard, the gallery and the findings from `bench/runs/`.
- `findings-data.mjs`, `images.mjs` and `lib.mjs`: shared code for the numbers, the images and the run records.
- `lib.test.mjs` and `kit-log.test.mjs`: check the saved data for every run, that `results/` regenerates unchanged, and that writing the stroke log does not change the painting.
- `rounds.test.mjs`: checks the V4 and V5 plan rules and briefs, and dry-runs V3, V4 and V5 on one target.

Try the benchmark runner without provider API keys:

```sh
npm run bench:run -- --dry-run
```

[bench/README.md](../README.md) lists the benchmark versions and docs. [Adding a model](../docs/adding-a-model.md) walks through a new run.

`import-aware.mjs` imports only subjects listed in `v4v5/subjects.json` and replaces local paths in published text. Set `UNPAINTING_PRIVATE_SUBJECTS` to a comma-separated list of additional names that must cause an import to fail. Keep that list outside the repository.
