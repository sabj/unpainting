# Honesty

Planning may read the target. Painting may not. A guard blocks reads of the target's pixels while the painter paints. It is on by default.

- While painting, the painter may only compare whole shapes with the target. It never reads the target's pixels. It never sets a stroke's paint from the error at a single cell. It never nudges strokes to shrink the pixel error, which is called hill climbing.
- Brush colours are mixed from the 16 paints in `src/crop/box.mjs`.
- The guard's records are kept beside the painting.

| `--targetguard` | Reads of the target's pixels while painting |
|---|---|
| `gentle` (default) | blocked; looks at a whole shape are allowed |
| `hard` (also `strict`) | as `gentle`, with a limit of `--lookbudget N` looks at a shape (default 2,500) |
| `warn` | recorded, not blocked; for diagnosis |
| `off` | no guard |

When painting starts, the painter seals the target and every map made from it (`tools/guard/no-target.mjs`, `tools/guard/seal-maps.mjs`). A read of a single cell is recorded and stops the run.

The guard writes two files. `target-guard.json` holds the mode, the looks at shapes, the refusals, the blocked reads and a verdict of `painted`, `copied` or `unguarded`. `cheat-risk.json` holds the [cheat risk](../bench/docs/rules.md#cheat-risk).

```sh
node tools/guard/promote-check.mjs work/my-picture   # a guarded run has no reads of the target and a recorded risk
node tools/guard/cheat-test.mjs                      # four deliberate ways to read the image are blocked
node tools/guard/lint-target-use.mjs                 # looks in the code for hill climbing and for reads while painting; runs in npm test
```

The benchmark has its own guard for a model's code. It is in the [rules](../bench/docs/rules.md#the-open-session-l4).

Measurements of a finished painting: [judging](judging.md).
