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

## Images and licenses

Only add images you have permission to distribute. Record the source and rights in [NOTICE](NOTICE) and [examples/SOURCES.md](examples/SOURCES.md). Code contributions are MIT licensed. Image rights are separate, and NOTICE sets the terms for the bundled photographs and their derivatives.

Keep credentials in ignored `.env` files. See [docs/CLOUD.md](docs/CLOUD.md) for the optional cloud tools.

[tools/README.md](tools/README.md) maps the command-line tools. [docs/README.md](docs/README.md) maps the painter.
