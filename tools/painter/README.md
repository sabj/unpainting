# tools/painter

Modules that `tools/paint-plate.mjs` imports. They are not run on their own. The test files in this folder cover plan formats, calibration, paint modes and observation helpers. Some modules have no adjacent test; list the suite with `rg --files tools/painter -g "*.test.mjs"`.

- `semantic-areas.mjs`: the required area-plan format for `--areaplan`. It validates a plan of named areas and compiles it into layers. `node tools/paint-plate.mjs --areahelp` prints the contract.
- `authored-paint.mjs` and `authored-gestures.mjs`: area passes with polylines (paths of connected straight segments) supplied by the plan, converted to brush paths.
- `finishing-area.mjs`: one authored pass after automatically planned paint, for `--finishareaplan`.
- `semantic-instrument-cache.mjs`, `numeric-tuft-calibration.mjs` and `production-water-load.mjs`: brush calibration and water load.
- `native-paint-mode.mjs` and `native-body-cadence.mjs`: faster approximations of drying and of broad washes. They can change the resulting pixels.
- `value-plan-preview.mjs`: a CPU preview of the value plan's wash paths.
- `numeric-receiver-observer.mjs`, `receiver-samples.mjs`, `semantic-brush-observation.mjs` and `record-graphite.mjs`: read-only records of what the brush and pencil did.

Run the tests with:

```sh
node --test "tools/painter/*.test.mjs"
```

[Plan format](../../docs/plan-format.md#other-plan-formats-in-this-repository) describes area plans and value plans.
