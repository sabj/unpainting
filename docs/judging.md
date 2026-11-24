# Judging

Judges and measurements score a finished painting and its saved stages. They are advisory: no vision judge's verdict is fed back into the painter.

## Classic measurements

Repeatable image measurements live in `src/eval/` and return the same numbers every time for the same images:

| Module | Measures | Compares at |
|---|---|---|
| `values.mjs` | Tone levels, uniform dark areas, untouched paper between marks | Painting alone |
| `fidelity.mjs` | Tone over ~16 px cells and line recall within 2 cells | Regions |
| `colour.mjs` | CIEDE2000 colour difference (mean and 90th percentile) | Pixels (diagnosis only) |
| `stages.mjs` | Whether saved frames follow a human painting order | Stages |

`src/eval/score.mjs` maps seven dimensions to 0–10 against calibration curves from real watercolours. `src/eval/composite.mjs` keeps related metric groups separate. CLI runners in `tools/judge/`:

- `node tools/judge/judge-plate.mjs --image <target> --painted <painting.jpg>`: run composite measurements on one plate.
- `node tools/judge/stage-check.mjs <run-dir>`: check stage progression flags.
- `node tools/judge/concert-judge.mjs`: run all metric groups across a set of painter configurations.
- `node tools/judge/judge.mjs`: calibrate and check discrimination against reference scans in `$JUDGE_REFS`.

Under the [honesty rules](honesty.md), target comparisons during painting happen only at shape scale; per-pixel metrics such as `colour.mjs` are for post-run diagnosis only.

## Stage checks

`src/eval/stages.mjs` flags non-human progression in saved frames:

- Big shapes still under half their final value a third of the way in.
- Speckle in the first half.
- More than 70% of final tone down a quarter of the way in (too dark too early).
- Steps backward, colour drift, or too little line early in line-first work.

## Stroke sizes

`tools/stroke-stats.mjs` and `tools/stroke-gate.mjs` check whether broad low-detail wash interiors were filled with tiny dabs (median contact < 1 mm wide or path < 3 mm long) or narrow windshield-wiper sweeps (region/brush width > 4, at least 6 aligned overlapping passes):

```sh
node tools/stroke-stats.mjs <run-dir> --out <panel>
node tools/stroke-gate.mjs <run-dir> --mode reject
node tools/run-plan.mjs plan.json --stroke-gate reject --out work/plan
node tools/paint-plate.mjs --image target.jpg --marks 1 --strokegate reject --out work/plate
```

Each broad interior defaults to a 30% ceiling on tiny-mark carried area (`maxBroadAreaTinyAreaShare`), tiny-mark visible paint (`maxBroadAreaTinyVisibleShare`) and narrow-brush wiper coverage (`maxBroadAreaWiperShare`). Detail passages, pen lines and 1 mm edge bands are exempt.

## Vision judges

- **Benchmark scoring**: `npm run bench:score04` scores **human-ness** from the film under the [human-ness rubric](../bench/docs/human-ness-rubric.md) and **quality** against the original; see [bench/docs/scoring.md](../bench/docs/scoring.md).
- **Blind stage rounds** (`tools/judge/rounds/`): `run.mjs` packs the stages of a candidate, a control, a duplicate control, a known good and a known bad run under shuffled letters for Claude or Codex judges; `tally.mjs` drops any judge that misranks the controls or scores the duplicates > 1 point apart. A candidate wins with at least 4 valid judges and two thirds of valid votes.
