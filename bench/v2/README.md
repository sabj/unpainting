# The freehand kit

The toolkit, briefs, technique guides and runners of rounds V1 to V3 ([older rounds](../docs/older-rounds.md)). `scripts/run.mjs` copies them into a clean worktree for each try.

- [crops.json](crops.json) and [targets/](targets/): Ships, Mittens, Trumbull, Hills and France, with coarse maps.
- [naive/BRIEF.md](naive/BRIEF.md): the V1 brief. [skill/BRIEF.md](skill/BRIEF.md) and [skill/skills/](skill/skills/): the V2 and V3 brief and technique guides.
- [kit/kit.mjs](kit/kit.mjs): brush, pen, palette and stage images. It paints on the GPU or stops.
- [runners/oss_loop.py](runners/oss_loop.py): the tool loop for open models. Claude and Codex run in their own CLIs ([runners.mjs](../scripts/runners.mjs)).

## Target-read block

The model sees each target as an image; its code cannot read target pixels. [kit/guard.mjs](kit/guard.mjs) blocks any image read outside `bench/out/` in Node and [kit/py/sitecustomize.py](kit/py/sitecustomize.py) in Python. Scripts get the target only through `kit.coarse(task)`: at most 24 x 24 cells, 8 colours and a value per cell. [kit/cheat-test.mjs](kit/cheat-test.mjs) and [kit/cheat-test.py](kit/cheat-test.py) try six ways to read a target; all are blocked and logged. After a session an audit counts blocked reads and script lines that name the target files; either disqualifies the try.
