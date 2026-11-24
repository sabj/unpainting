# Protocol v2 inputs

The toolkit, briefs, technique guides and runners given to models. `scripts/run.mjs` copies them into a clean worktree for each try.

- [crops.json](crops.json): size, planning grid and style of each target ([scale](../crops/README.md)).
- [targets/](targets/): Ships, Mittens, Trumbull, Hills and France, with coarse maps.
- [naive/BRIEF.md](naive/BRIEF.md): the V1 brief. [skill/BRIEF.md](skill/BRIEF.md) adds a "Skills" section for V2 and V3.
- [skill/skills/](skill/skills/): the V2 and V3 technique guides. The runner copies them into `.agents/skills/` and links `.claude/skills` to it. Current guides: [.agents/skills/](../../.agents/skills/).
- [kit/kit.mjs](kit/kit.mjs): brush, pen, palette, stroke budget and stage images. It paints on the GPU or stops; the CPU only when asked (`kit.open(task, { gpu: false })`).
- [runners/oss_loop.py](runners/oss_loop.py): the tool loop for open models. Claude and Codex run in their own CLIs ([runners.mjs](../scripts/runners.mjs)).

## Target-read block

The model sees each target as an image; its code cannot read target pixels.

- [kit/guard.mjs](kit/guard.mjs) blocks any image read outside `bench/out/` in Node.
- [kit/py/sitecustomize.py](kit/py/sitecustomize.py) does the same for Python.
- [kit/cheat-test.mjs](kit/cheat-test.mjs) and [kit/cheat-test.py](kit/cheat-test.py) try six ways to read a target; all are blocked and logged.

[Anti-cheat](../docs/rules.md#target-read-guard) covers the audit and the cheat-risk score.
