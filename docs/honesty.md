# Honesty

Auto can read the target while it plans. Once painting starts, the guard seals the pixels and maps. In the default mode Auto can still ask for a whole shape’s average. In strict no-look mode (`--notargetlooks 1`) the plan fixes the paint before the first stroke.

An authored script gets no automatic masking fluid from the source’s white pixels. The model has to paint around the whites it sees or mark them in `lights`. Its code cannot sample the target or keep strokes based on whether they reduce pixel error.

| `--targetguard` | Reads of the target's pixels while painting |
|---|---|
| `gentle` (default) | blocked; looks at a whole shape are allowed |
| `hard` (also `strict`) | as `gentle`, with a limit of `--lookbudget N` looks at a shape (default 2,500) |
| `warn` | recorded, not blocked; for diagnosis |
| `off` | no guard |

In a blocking mode the guard records an attempted read of a single cell and stops the run. [Target guard](../tools/guard/no-target.mjs) and [map guard](../tools/guard/seal-maps.mjs).

The guard writes two files. `target-guard.json` holds the mode, the looks at shapes, the refusals, the blocked reads and a verdict of `painted`, `copied` or `unguarded`. `cheat-risk.json` holds the [cheat risk](../bench/docs/rules.md#cheat-risk).

```sh
node tools/guard/promote-check.mjs work/my-picture   # a guarded run has no reads of the target and a recorded risk
node tools/guard/cheat-test.mjs                      # four deliberate ways to read the image are blocked
node tools/guard/lint-target-use.mjs                 # looks in the code for hill climbing and for reads while painting; runs in npm test
```

The benchmark has its own guard for a model's code. It is in the [rules](../bench/docs/rules.md#the-open-session-l4).

Measurements of a finished painting: [judging](judging.md).
