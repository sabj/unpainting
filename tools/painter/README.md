# tools/painter

Modules that `tools/paint-plate.mjs` imports. They are not run on their own. Some modules have no adjacent test; list the suite with `rg --files tools/painter -g "*.test.mjs"`.

- `study-load.mjs`: a block-in study registered to the sheet for the study wash plan (`--washplan`).
- `wet-bed-prep.mjs` and `wet-bed-wait.mjs`: wetting a wet-into-wet bed, and waiting for the shine to go off before charging it.
- `soften-lift-run.mjs`: a clean damp brush along a wash's soft edge while it is wet.
- `passage-dry-gate.mjs`: the dry-paper gate before a wet-on-dry stroke.
- `production-water-load.mjs` and `brush-point-swatch.mjs`: brush water load and the brush point's measured width.
- `native-paint-mode.mjs` and `native-body-cadence.mjs`: faster approximations of drying and of broad washes. They can change the resulting pixels.
- `value-plan-preview.mjs` and `plan-value-check.mjs`: CPU previews of the plan's wash paths and values.
- `record-graphite.mjs`: a read-only record of what the pencil did.

Run the tests with:

```sh
node --test "tools/painter/*.test.mjs"
```

[Plan format](../../docs/plan-format.md) describes the plan files.
