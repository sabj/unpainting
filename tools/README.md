# tools

Command-line tools, run from the repository root with `node tools/<path>`.

| Folder | What it holds | Entry points |
|---|---|---|
| `tools/` | Image painter, stroke-plan runner, environment doctor and stroke gates | `paint-plate.mjs`, `run-plan.mjs`, `doctor.mjs`, `stroke-stats.mjs`, `stroke-gate.mjs` |
| `paint/` | Registered subjects and model author sessions (`npm run paint`, [docs/running.md](../docs/running.md#registered-subjects-npm-run-paint)) | `cli.mjs`, `run-sets.mjs`, `contact.mjs`, `author-sheet.mjs` |
| `plate/` & `painter/` | Stage modules and helpers imported by `paint-plate.mjs` (study loading, wet beds, softening, scrap swatches) | [docs/how-it-paints.md](../docs/how-it-paints.md) |
| `seg/` | Tracing and ordering a prepared drawing, SAM regions and masks | [seg/README.md](seg/README.md) |
| `guard/` | Target-pixel read guard, cheat-risk score, deliberate-cheat test and source lint | `cheat-test.mjs`, `promote-check.mjs`, `lint-target-use.mjs` ([docs/honesty.md](../docs/honesty.md)) |
| `judge/` | Classic image measurements, stage checks and blind vision-judge rounds | `judge-plate.mjs`, `stage-check.mjs`, `concert-judge.mjs`, `rounds/` ([docs/judging.md](../docs/judging.md)) |
| `lab/` | Paint Lab live example builders and `src/media/` browser sync | `sync-site-media.mjs`, `build-live-examples.mjs`, `build-site.mjs` |
| `speed/` | Pixel/hash comparison and paired commit timing | `compare.mjs BASE.png CANDIDATE.png OUT`, `run-pair.py CONFIG.json` |
| `cloud/` | Optional batch rendering and render-pool pods on RunPod | `render-batch.py`, `render-pool-pods.py` ([docs/running.md](../docs/running.md#cloud-rendering)) |
| `readme/` | Builders for the documentation figures and animations in `docs/img/` | `build-readme-media.mjs`, `animations.mjs`, `pipeline-map.mjs`, `paper-figure.mjs` |
| `aware/` | Pause/resume helpers (`--pausedir`, `--resumestate`) from retired V4/V5 rounds | `pause.mjs` |

Run all unit and tool tests with `npm test` and benchmark tests with `npm run bench:test`.
