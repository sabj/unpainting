# Honesty

The guard is a check that blocks target-pixel reads during painting. It separates planning from painting. It is on by default.

## Rules

- Read the target while planning. Choose stroke paths and paint mixtures before painting.
- During painting, compare whole shapes and values. Do not read target pixels, choose a stroke's paint load from per-cell errors, or keep a stroke because it reduces pixel error.
- Mix brush colors from the 16 palette paints in `src/crop/box.mjs`.
- Keep guard and stage records beside the painting.

## Modes

| Mode | Target-pixel reads | Gallery |
|---|---|---|
| `gentle` (default) | blocked; whole-shape looks of at least 64 cells allowed | eligible |
| `hard` | as gentle, with a budget of looks (`--lookbudget N`, default 100) | eligible |
| `warn` | recorded, not blocked | excluded |
| `off` | no guard | excluded |

`strict` is an alias for `gentle`.

The painter blocks reads of the target image and its per-cell maps when painting starts. A cell is one square of the simulation grid. A blocked read is recorded and stops the run.

## Gentle against hard

Gentle is the default. It allows unlimited shape-level comparisons, which use mean color over a whole shape. It blocks and records every cell-level read of the target. Hard does the same and adds a budget of 100 looks per painting. A look past the budget returns nothing and is counted as refused.

Each run writes its look counts and refusals to `target-guard.json`. Compare modes with the same revision, target, arguments and backend, and keep both run records.

## Records and checks

| File | Contents | Read it for |
|---|---|---|
| `target-guard.json` | mode, shape looks, refusals, blocked reads, and a `painted` / `copied` / `unguarded` category | whether the run followed the rules |
| `cheat-risk.json` | stage progression, fine-detail copy correlation, small-stroke share, audit result | whether the result needs a closer look |
| `stages/strip.jpg` | saved stages | a human review of the process |

A high risk score calls for review. Weak technique can raise it without cheating. The [gallery](examples.md) requires paintings with guard records and excludes unresolved flagged benchmark runs.

```sh
node tools/guard/promote-check.mjs work/my-picture
node tools/guard/cheat-test.mjs
node tools/guard/lint-target-use.mjs
```

The promotion check requires a guarded run, no target reads and a risk score. High scores pass with `review: true`. The deliberate-cheat test checks four blocked image-read routes. The source lint checks hill-climbing patterns; reviewed exceptions are in `tools/guard/target-use-allow.json`.

## Limits

- Overlapping shape looks could recover finer detail. Gentle mode does not detect that; hard mode limits looks.
- The painter guard covers its own process. External agents must follow the same rules. The [benchmark guard](../bench/docs/anti-cheat.md) covers Node scripts that import the guard or painting toolkit given to models. The benchmark runner configures Python scripts through `PYTHONPATH`; separate Node processes are not automatically guarded.
- A detailed plan can carry target edges into every stroke. Zero blocked reads does not prove good technique. The image painter defaults to light-to-dark value planning with five bands. `--planmasses 0 --maskblur 1 --maxvalues 24` are the current image-planning defaults. Plans still need visual review. `npm run example` uses the bundled stroke plan.
- The guard blocks experimental flags that read the target. Ink color comes from `--inkprofile`, `--inkk` and `--inkkscale`, not `--inkcolour`. Optional gouache, opaque white paint, is applied outside the pigment model.
- Some [diagnostic measures](judging.md) compare pixels. Do not use them to steer painting.

Results that steered strokes from target pixels are not published. The [painting sequences](examples.md) passed the painter guard. Benchmark paintings used the benchmark's own guard; see its [anti-cheat rules](../bench/docs/anti-cheat.md).
