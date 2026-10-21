# Contributing

Open an issue before a large change. Keep a pull request to one change. A physics change needs a measurement and a before/after picture.

Use Node.js 25 or later. From the repository root:

```sh
npm ci
npm test
npm run bench:test
npm run quick-start
```

`npm test` fails on any failing test. `npm run bench:test` checks the benchmark records and confirms the published tables regenerate from them.

Tests use bundled inputs or recorded expectations. GPU checks need a WebGPU adapter; the rest run on the CPU.

`npm test` also runs the Python line-tool tests (`tools/seg/*-test.py`, `tools/judge/*-test.py`) with the line python the painter uses (`tools/cloud/setup-lines.sh` installs it). Without numpy and OpenCV, and without a WebGPU adapter for the GPU checks, those tests are reported as skipped, not passed.

The painter refuses to paint from uncommitted changes. Each run writes `code-state.json` with the commit, the changed files and a hash of the diff. Commit first, or pass `--allowdirty 1` for a scratch run; the run is then recorded as dirty.

## Worktrees

A git worktree has no `node_modules` of its own. Link the main checkout's install, never another worktree's link:

```sh
git worktree add ../unpainting-fix -b fix/name
ln -sfn "$PWD/node_modules" ../unpainting-fix/node_modules
```

Run this from the main checkout. Use `ln -sfn`: a plain `ln -s` onto an existing link writes the new link inside the linked folder. Run `npm ci` in the main checkout when `package-lock.json` changes. A worktree whose `package-lock.json` differs from the main checkout's needs its own `npm ci`.

## Images and licenses

Only add images you have permission to distribute. Record the source and rights in [NOTICE](NOTICE) and [examples/SOURCES.md](examples/SOURCES.md). Code contributions are MIT licensed. Image rights are separate, and NOTICE sets the terms for the bundled photographs and their derivatives.

Keep credentials in ignored `.env` files. See [docs/CLOUD.md](docs/CLOUD.md) for the optional cloud tools.

[tools/README.md](tools/README.md) maps the command-line tools. [docs/README.md](docs/README.md) maps the painter.
