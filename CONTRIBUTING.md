# Contributing

Open an issue before a large change. One change per pull request. A physics change needs a measurement and a before and after picture.

```sh
npm ci
npm test
npm run bench:test
npm run quick-start
```

Needs Node.js 25 or later. `npm run bench:test` checks the benchmark records and that the published tables regenerate from them. GPU checks need a WebGPU adapter; without one they run on the CPU, which does not validate the GPU path. The Python line-tool tests (`tools/seg/*-test.py`, `tools/judge/*-test.py`) use the line python (`tools/cloud/setup-lines.sh` installs it); without numpy and OpenCV they are reported skipped, not passed.

The mushroom suite is separate: `node --test demos/fungi/mushrooms.test.mjs`. A change to shared media also needs a real Paint Lab painting and drying check and representative mushroom renders. After editing mirrored media run `node tools/lab/sync-site-media.mjs`; the normal suite detects a stale copy.

For GPU changes, check Metal and NVIDIA/Vulkan, record the adapter name and driver, and confirm the fused-path tests exercise the fused pipelines. `GPU_REQUIRED=1 node --test src/media/gpu/device-health.test.mjs` makes missing hardware a failure. Keep reference and candidate commands, seeds, output sizes and modes with image hashes. A dry run or software adapter is not a hardware pass.

For release and benchmark comparisons run `node tools/doctor.mjs --strict`, then validate every run directory with `verifyComparisonRun` and `verifyTearsheetContract` (`bench/scripts/preflight.mjs`). Baseline and candidate must both run on hardware GPU (`backend: "gpu", fallback: false`), be painted at source scale, and include SAM segmentation (`.venv-seg` and `sam_vit_b_01ec64.pth`). Compare `painting.png` plates, not `.webp` thumbnails. The painter stops on a `--width` above the source's pixel width unless `--sourcescale` states the enlargement.

The painter refuses to paint from uncommitted changes. Each run writes `code-state.json` (commit, changed files, diff hash). Commit first, or pass `--allowdirty 1` for a scratch run, which is recorded as dirty.

## No new default-off flags

A painting change is proven and on, or it stays on a branch. `npm test` enforces this (`src/paint/option-ledger.test.mjs`): `src/paint/option-ledger.json` lists the options that existed when the rule was made, and an option outside it fails if it has no default, a default of zero, an empty or negative word, or a default the check cannot read. Never add names to the list; remove a name when its option is deleted. A new setting with a real default, such as a width in millimetres, passes.

## Worktrees

A worktree has no `node_modules`. Link the main checkout's, from the main checkout:

```sh
git worktree add ../unpainting-fix -b fix/name
ln -sfn "$PWD/node_modules" ../unpainting-fix/node_modules
```

Use `ln -sfn`; a plain `ln -s` onto an existing link writes inside the linked folder. Run `npm ci` in the main checkout when `package-lock.json` changes; a worktree whose lock differs needs its own.

## Images and licences

Add only images you may distribute. Record source and rights in [NOTICE](NOTICE) and [examples/SOURCES.md](examples/SOURCES.md). Code is MIT; image rights are separate. Keep credentials in ignored `.env` files ([cloud tools](docs/running.md#cloud-rendering)). [tools/README.md](tools/README.md) maps the tools.
