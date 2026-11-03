# Frozen Experiment 7 references

Reference simulator: `41e68683a95612475be35d3d2dabb53dcd470873`.
These references establish the merged 0.3.0 starting point. They do not retroactively
prove equivalence to the historical pre-speed-switch simulator.

`fixtures.json` freezes inputs and complete argv for four small paintings (inkres,
V5 valueplan, general fast, general full), plus a forced dry-limit fixture that
checks ordinary continuation and strict abort. CPU and GPU have separate PNG
SHA-256 baselines. Same backend, mode, adapter and input hashes are mandatory.
The Ships plan is copied without changes from V5 self-study Astra attempt 1.
The 1200px census uses its actual harness-generated flags and width.

Run from the repository root after sourcing `work/env-030.sh` and exporting
`PAINTER_LINES_PYTHON="$PAINTER_LINE_PYTHON"`:

```sh
npm run parity:test
# Equivalent separate checks (useful when retaining named output directories):
node tools/speed/parity.mjs check . work/parity-candidate src/media/parity/baseline.json
node tools/speed/parity.mjs check . work/native-candidate src/media/parity/native-baseline.json src/media/parity/native-fixtures.json
```

Use new output directories. **Both checks (`npm run parity:test`) are mandatory for every Class A
optimization in Stages 4 and 5.** Any mismatch or render failure stops the item;
never update the hashes to make an optimization pass. A GPU that cannot run is
not a pass. A new adapter requires its own frozen reference render on that adapter.
Cross-backend output equality is not asserted. The full 13-development-target
540px release sweep remains an additional gate; these fixtures are not that sweep.

Baseline creation is a separate explicit `freeze` command, pointed at an archive
of the reference commit, with the frozen plan and dry-limit driver copied in.
It refuses an existing baseline file. The checker never writes baseline files.
Outputs, backend metadata and logs stay under the chosen work directory.
PNG hashes include encoder bytes: preserve the Node/sharp/libvips environment.

Native census: `node tools/speed/census-run.mjs work/census-030`, with a reference
archive at `work/census-030/reference` and its node_modules linked to this checkout.
`PAINTER_CENSUS=1` enables observation-only counters. Timings are nested; do not add
paper, carry, composition or GPU waits to wall phases. JSONL byte counts are final
on-disk sizes. Dry callsites include stacks so categories can be audited without
assuming all dry calls are pass boundaries. First mark is the first brush/pen API
call, including scrap calibration; it is not time to first visible scene mark.

The M4 adapter's separate wet-scan path is covered. The fused wet-scan kernel
requires at least 13 storage-buffer bindings; it is **skipped, not passed**, when
the adapter cannot expose those bindings. See the native profile's
`gpuStats.gpuProf.capabilities` for the measured limit and active path.

The native V5 template reports exit 3 for `--skylanes`, `--skylanemm` and
`--skylanestep` after completing its painting. The valueplan fixture explicitly
allowlists these unused template options. The checker records and compares the
exact unused-option list and exit code, and refuses any additional unused option.
