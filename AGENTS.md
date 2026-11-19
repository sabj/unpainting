# Agent notes

Two skills in `.agents/skills/` cover painting work. `.claude/skills` is a relative symlink to `../.agents/skills` for Claude Code:

- `watercolor-technique`: read before planning, coding or judging a painting step. It sets the default order (ink drawing, let it set, then washes) and the checks to run on each stage.
- `painting-planner`: read before planning a whole painting. Use it with `watercolor-technique`.

Run `npm test` and `npm run bench:test` before handing back code changes.

A new worktree links the main checkout's `node_modules` with `ln -sfn` (CONTRIBUTING.md, Worktrees). The painter refuses uncommitted changes unless `--allowdirty 1` is given.

## Authoritative Release & Benchmark Comparison Rules

Before generating or presenting any release tear sheet, A/B comparison, or benchmark evaluation (`verifyComparisonRun` and `verifyTearsheetContract` in `bench/scripts/preflight.mjs`):

1. **Preflight First (`npm run doctor -- --strict`):** Never render benchmark or comparison plates with `--segments off` or missing SAM (`sam_vit_b_01ec64.pth`, `.venv-seg`) or missing lineart models (`.venv-lines`, `work/line-models/hf`) unless reproducing an archived plan's exact recorded command.
2. **Hardware Parity (`backend === "gpu"`):** Always verify `paint-speed-summary.json` / `run-card.json` confirms `backend: "gpu"` and `fallback: false` on both baseline and candidate runs. Never compare GPU wall times against CPU fallback runs.
3. **Source Scale (render width never exceeds the source width):** Never paint from an enlarged source, and compare plates at source scale. Pass the subject's width from `bench/v4v5/subjects.json`, which is the crop's own width (`--width 300` / `304` / `306` on a sheet of that width at 0.259 mm a cell): a 300 px crop in `bench/v2/targets/*.png` is a detail about 78 mm wide, and a whole plate is painted from a full-size original at or under its width. `paint-plate` stops when `--width` (times `--scale`) exceeds the source's pixel width, and its default width of 700 stops on a narrower source, unless the run states the enlargement it accepts with `--sourcescale` (`tools/plate/source-scale.mjs`). `verifyComparisonRun` refuses a run that records no source width, was painted wider than its source, or was not painted at its subject's width; there is no least width. Compare `painting.png`/`painting.jpg` plates rather than `.webp` gallery thumbnails. Plates painted before 0.3.3 were 1200 to 1224 px wide from these 300 px crops; do not judge detail from them.
4. **All Model Families & Stage Playback:** Every benchmark comparison must include the best runs across **Argon (`argon`, `argonmed`)**, **Astra (`astra`)**, and **Opus (`opus`)**, along with progressive stage playbacks (`10%, 25%, 50%, 75%, 100%` and dried band checkpoints).
5. **Independent Model Review:** Have both Opus (`claude`) and Astra (`codex`) audit engine/planner diffs and verify full-resolution A/B plates before clearing a release.
