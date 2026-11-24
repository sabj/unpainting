# Agent notes

Two skills in `.agents/skills/` cover painting work (`.claude/skills` links to them):

- `watercolor-technique`: read before planning, coding or judging a painting step. It sets the default order (ink drawing, let it set, then washes) and the checks for each stage.
- `painting-planner`: read before planning a whole painting, together with `watercolor-technique`.

Run `npm test` and `npm run bench:test` before handing back code. A new worktree links the main checkout's `node_modules` with `ln -sfn` ([CONTRIBUTING.md](CONTRIBUTING.md#worktrees)). The painter refuses uncommitted changes unless `--allowdirty 1`.

## Release and benchmark comparisons

Before a release tear sheet, A/B comparison or benchmark evaluation (`verifyComparisonRun`, `verifyTearsheetContract` in `bench/scripts/preflight.mjs`):

1. Run `npm run doctor -- --strict` first. Never render comparison plates with `--segments off`, missing SAM (`sam_vit_b_01ec64.pth`, `.venv-seg`) or missing lineart models (`.venv-lines`, `work/line-models/hf`), unless reproducing an archived plan's exact command.
2. Both runs record `backend: "gpu"` and `fallback: false` in `paint-speed-summary.json` or `run-card.json`. Never compare GPU times with CPU fallback times.
3. Paint at source scale: never from an enlarged source, never wider than the source. `paint-plate` stops when `--width` (times `--scale`) exceeds the source's pixel width, and its default 700 stops on a narrower source, unless `--sourcescale` states the enlargement (`tools/plate/source-scale.mjs`). `verifyComparisonRun` refuses a run with no recorded source width, one painted wider than its source, or one not at its subject's width (`bench/v4v5/subjects.json`; there is no least width). Compare `painting.png` or `painting.jpg`, not `.webp` thumbnails. Plates before 0.3.3 were 1200 to 1224 px wide from 300 px crops; do not judge detail from them.
4. Include the best runs of Argon (`argon`, `argonmed`), Astra (`astra`) and Opus (`opus`), with stage playbacks at 10%, 25%, 50%, 75%, 100% and dried-band checkpoints.
5. Have Opus (`claude`) and Astra (`codex`) audit engine and planner diffs and check full-resolution A/B plates before clearing a release.
