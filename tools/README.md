# tools

Command-line tools, run from the repository root.

- `unpaint.mjs`: `npm run unpaint`, one command for painting, preparing, benchmark runs, pods and scoring ([getting started](../docs/running.md)).
- `paint-plate.mjs` (the image painter), `run-plan.mjs` (stroke plans), `doctor.mjs`, `stroke-stats.mjs`, `stroke-gate.mjs`.
- `paint/`: registered pictures and model sessions, `npm run paint`: `cli.mjs`, `levels.mjs`, `rounds.mjs`, `session.mjs`, `run-benchmark.mjs`, `run-sets.mjs`, `render-pool.mjs`.
- `plate/`, `painter/`: the stages and helpers of `paint-plate.mjs` ([how it paints](../docs/how-it-paints.md)).
- `prepare/`: preparing a picture ([README](prepare/README.md)). `seg/`: tracing and ordering a drawing, SAM regions ([README](seg/README.md)).
- `guard/`, `judge/`: the target-read guard, cheat risk, measurements and blind judge rounds ([honesty](../docs/honesty.md), [judging](../docs/judging.md)).
- `cloud/`: rented GPU pods for the render pool.
- `lab/`: Paint Lab builders and the `src/media/` browser copy (`sync-site-media.mjs`). `readme/`: builders for the figures in `docs/img/`.
- `speed/`: `compare.mjs BASE.png CANDIDATE.png OUT` compares two paintings; `run-pair.py CONFIG.json` times a pair of commits.
