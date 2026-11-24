# Honesty

A guard blocks target-pixel reads during painting, on by default. Planning may read the target; painting may not.

- While planning, read the target and choose stroke paths and mixtures.
- While painting, compare only whole shapes (64 cells or more). Never read target pixels, set a stroke's load from per-cell errors, or hill-climb strokes against pixel error.
- Mix brush colours from the 16 palette paints in `src/crop/box.mjs`.
- Keep guard and stage records beside the painting.

| Mode | Target-pixel reads | Gallery |
|---|---|---|
| `gentle` (default, alias `strict`) | blocked; whole-shape looks (64 cells or more) allowed | eligible |
| `hard` | as `gentle`, capped at `--lookbudget N` looks (default 100) | eligible |
| `warn` | recorded, not blocked | excluded |
| `off` | no guard | excluded |

When painting starts (`TARGET_GUARD.beginPaint()` in `tools/plate/drawing.mjs`) the painter seals the target and every per-cell map derived from it (`tools/guard/seal-maps.mjs`, `tools/guard/no-target.mjs`). A cell-level read is recorded and stops the run.

Records: `target-guard.json` (mode, shape looks, refusals, blocked reads, a `painted`, `copied` or `unguarded` verdict), `cheat-risk.json` (stage progression, fine-detail copy correlation `hfCorr`, small-stroke share, audit result), `stages/strip.jpg`.

```sh
node tools/guard/promote-check.mjs work/my-picture   # a guarded run has zero target reads and a recorded risk
node tools/guard/cheat-test.mjs                      # four deliberate image-read routes are blocked
node tools/guard/lint-target-use.mjs                 # static check for hill-climbing and paint-step reads (in npm test; exceptions in tools/guard/target-use-allow.json)
```

The benchmark's runtime guard and cheat-risk formula: [rules](../bench/docs/rules.md) and [scoring](../bench/docs/scoring.md).
