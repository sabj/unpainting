# Agent notes

Two skills in `.agents/skills/` cover painting work. `.claude/skills` is a relative symlink to `../.agents/skills` for Claude Code:

- `watercolor-technique`: read before planning, coding or judging a painting step. It sets the default order (ink drawing, let it set, then washes) and the checks to run on each stage.
- `painting-planner`: read before planning a whole painting. Use it with `watercolor-technique`.

Run `npm test` and `npm run bench:test` before handing back code changes.

A new worktree links the main checkout's `node_modules` with `ln -sfn` (CONTRIBUTING.md, Worktrees). The painter refuses uncommitted changes unless `--allowdirty 1` is given.
