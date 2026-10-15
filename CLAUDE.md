# Unpainting Repository Guide

## Core Rules
- Single trunk: branch from `integration/0.2` and merge back the same day once tests and `npx knip` pass.
- No silent fallbacks: missing Python environments, SAM checkpoints, line files, or GPU errors must fail the run loudly.
- Run `npm run doctor` before benchmark or canary runs to verify clean git state, line and segmentation Python environments, SAM checkpoint, and the 20 GiB free disk floor.
- Target guard: never read target pixels during the paint step or add per-subject IDs or hand-placed boxes in painting code.
- Modularity: place new logic in small modules under `src/` or `tools/` with unit tests rather than expanding `tools/paint-plate.mjs`.
- Commit hygiene: never include absolute home-directory paths in committed files.

## Common Commands
- `npm run doctor`: check environment health before painting.
- `npm test`: run unit and integration tests across `src/` and `tools/`.
- `npm run bench:test`: run benchmark suite unit tests.
- `npx knip`: check for unused files, exports, and dependencies.
