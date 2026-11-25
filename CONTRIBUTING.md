# Contributing

Open an issue before a large change. Branch from `integration/0.4`; one change per pull request. A physics change needs a measurement and a before and after picture.

```sh
npm ci
npm test              # unit and tool tests
npm run bench:test    # the scorer and the benchmark's records
npx knip              # unused code
```

- The painter refuses to paint from uncommitted changes. Commit first, or pass `--allowdirty 1` for a scratch run, which is recorded as dirty.
- No new default-off flags: a painting change is proven and on, or it stays on a branch. `npm test` checks painter options against `src/paint/option-ledger.json`. Never add names to that file; remove a name when its option is deleted.
- A pipeline change updates [how it paints](docs/how-it-paints.md) in the same pull request.
- GPU tests need a WebGPU adapter; on the CPU they do not validate the GPU path. For a GPU change, check Metal and NVIDIA/Vulkan and record the adapter and driver. `GPU_REQUIRED=1 node --test src/media/gpu/device-health.test.mjs` makes missing hardware a failure.
- The Python line-tool tests are reported skipped, not passed, without numpy and OpenCV (`tools/cloud/setup-lines.sh` installs them).
- After editing `src/media/`, run `node tools/lab/sync-site-media.mjs` (`npm test` detects a stale copy), paint and dry something in Paint Lab, and run the mushroom suite: `node --test demos/fungi/mushrooms.test.mjs`.
- Release and benchmark comparisons follow [AGENTS.md](AGENTS.md#release-and-benchmark-comparisons).
- Add only images you may distribute, and record source and rights in [NOTICE](NOTICE) and [examples/SOURCES.md](examples/SOURCES.md). Code is MIT; image rights are separate. Keep credentials in ignored `.env` files.

A worktree has no `node_modules`. Link the main checkout's, from the main checkout (`ln -sfn`, since a plain `ln -s` onto an existing link writes inside the linked folder):

```sh
git worktree add ../unpainting-fix -b fix/name
ln -sfn "$PWD/node_modules" ../unpainting-fix/node_modules
```
