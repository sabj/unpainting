# tools

Command-line tools, run from the repository root with `node tools/<path>`.

- `tools/`: `paint-plate.mjs` (image painter), `run-plan.mjs` (stroke plans), `doctor.mjs`, `stroke-stats.mjs`, `stroke-gate.mjs`.
- `paint/`: registered subjects and model sessions, `npm run paint` ([running](../docs/running.md#registered-subjects-npm-run-paint)): `cli.mjs`, `run-sets.mjs`, `contact.mjs`, `author-sheet.mjs`.
- `plate/`, `painter/`: stage modules and helpers imported by `paint-plate.mjs` ([how it paints](../docs/how-it-paints.md)).
- `seg/`: tracing and ordering a drawing, SAM regions ([README](seg/README.md)).
- `prepare/`: preparing a picture ([README](prepare/README.md)).
- `guard/`: target-read guard, cheat risk, `cheat-test.mjs`, `promote-check.mjs`, `lint-target-use.mjs` ([honesty](../docs/honesty.md)).
- `judge/`: image measurements, stage checks, blind judge rounds: `judge-plate.mjs`, `stage-check.mjs`, `concert-judge.mjs`, `rounds/` ([judging](../docs/judging.md)).
- `lab/`: Paint Lab builders and the `src/media/` browser sync (`sync-site-media.mjs`, `build-live-examples.mjs`, `build-site.mjs`).
- `speed/`: `compare.mjs BASE.png CANDIDATE.png OUT` compares pixels and hashes; `run-pair.py CONFIG.json` times a pair of commits.
- `cloud/`: RunPod batch rendering and render-pool pods ([running](../docs/running.md#cloud-rendering)).
- `readme/`: builders for the figures in `docs/img/` (`build-readme-media.mjs`, `animations.mjs`, `pipeline-map.mjs`, `paper-figure.mjs`).
- `aware/`: `pause.mjs`, pause and resume (`--pausedir`, `--resumestate`) from retired rounds.

`npm test` runs unit and tool tests; `npm run bench:test` the benchmark tests.
