# Honesty

The target guard blocks target-pixel reads during painting, separating planning from execution. It is on by default.

## Rules

- Read the target while planning; choose stroke paths and paint mixtures before painting starts.
- During painting, compare only whole shapes (`>= 64` cells). Never read target pixels, set a stroke's load from per-cell errors, or hill-climb strokes against pixel error.
- Mix brush colours from the 16 palette paints in `src/crop/box.mjs`.
- Keep guard and stage records beside the painting.

## Modes

| Mode | Target-pixel reads | Gallery |
|---|---|---|
| `gentle` (default, alias `strict`) | Blocked; whole-shape looks (`>= 64` cells) allowed | Eligible |
| `hard` | As `gentle`, capped at `--lookbudget N` looks (default 100) | Eligible |
| `warn` | Recorded, not blocked | Excluded |
| `off` | No guard | Excluded |

When painting starts (`TARGET_GUARD.beginPaint()` in `tools/plate/drawing.mjs`), the painter seals the target image and every per-cell map derived from it (`tools/guard/seal-maps.mjs`, `tools/guard/no-target.mjs`). Any cell-level read is recorded and stops the run.

## Records and checks

| File | Contents |
|---|---|
| `target-guard.json` | Guard mode, shape looks, refusals, blocked reads and `painted` / `copied` / `unguarded` verdict |
| `cheat-risk.json` | Stage progression, fine-detail copy correlation (`hfCorr`), small-stroke share and audit result |
| `stages/strip.jpg` | Saved stage progression strip |

```sh
node tools/guard/promote-check.mjs work/my-picture
node tools/guard/cheat-test.mjs
node tools/guard/lint-target-use.mjs
```

- `promote-check.mjs`: verifies a guarded run has zero target-pixel reads and a recorded risk score.
- `cheat-test.mjs`: verifies four deliberate image-read routes are blocked.
- `lint-target-use.mjs`: static check for hill-climbing patterns and paint-step target reads (run by `npm test`; reviewed exceptions live in `tools/guard/target-use-allow.json`).

For the benchmark's runtime guard and cheat-risk formula, see [bench/docs/scoring.md](../bench/docs/scoring.md#anti-cheat).
