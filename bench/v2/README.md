# Protocol v2 inputs

The painting toolkit given to models, task instructions (briefs), technique guides and runners for protocol v2. `scripts/run.mjs` copies them into a clean worktree, a separate Git checkout, for each try (one painting session).

- [crops.json](crops.json): size, low-resolution planning grid and short style description of each target. [Physical scale](../crops/README.md).
- [targets/](targets/): the five distributed targets, Ships, Mittens, Trumbull, Hills and France, with their coarse maps.
- [naive/BRIEF.md](naive/BRIEF.md): the brief for round V1. [skill/BRIEF.md](skill/BRIEF.md) adds a closing "Skills" section for V2 and V3.
- [skill/skills/](skill/skills/): the technique guides for rounds V2 and V3. The runner copies these into `.agents/skills/` and creates `.claude/skills` as a relative symlink to `../.agents/skills`. Current repo skills live in [.agents/skills/](../../.agents/skills/).
- [kit/kit.mjs](kit/kit.mjs): the toolkit's brush, pen, palette, stroke budget and saved stage images.
- [runners/oss_loop.py](runners/oss_loop.py): the tool loop for open models. Claude and Codex models run in their own CLIs; see [runners.mjs](../scripts/runners.mjs).

## Prompt

Each session starts with one line, with the target image sections (called crops in the prompt) attached in order:

> Read bench/BRIEF.md in this directory and do what it says. The five target crops are attached in order: Hills, France, Ships, Mittens, Trumbull. Work without asking questions; nobody will answer.

## Run-time target-read block

The model sees each target as an image. Its code cannot read target pixels.

- [kit/guard.mjs](kit/guard.mjs) loads with the toolkit and blocks any image read outside `bench/out/` in Node.
- [kit/py/sitecustomize.py](kit/py/sitecustomize.py) does the same for every Python process.
- [kit/cheat-test.mjs](kit/cheat-test.mjs) and [kit/cheat-test.py](kit/cheat-test.py) try six ways to read a target. All six are blocked and logged.

[Anti-cheat](../docs/anti-cheat.md) covers the audit and the cheat-risk score.

The briefs and technique guides are publication copies; session inputs can differ.
