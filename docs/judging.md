# Judging

Judges and measurements score a finished painting and its saved stages. They are advisory: no verdict is fed back into the painter. Per-pixel metrics such as `colour.mjs` are for post-run diagnosis only ([honesty.md](honesty.md)).

## Classic measurements

`src/eval/` returns the same numbers for the same images:

- `values.mjs`: tone levels, uniform dark areas, untouched paper between marks (painting alone).
- `fidelity.mjs`: tone over about 16 px cells and line recall within 2 cells (regions).
- `colour.mjs`: CIEDE2000 mean and 90th percentile (pixels).
- `stages.mjs`: whether saved frames follow a human painting order.

`src/eval/score.mjs` maps seven dimensions to 0 to 10 against curves from real watercolours; `src/eval/composite.mjs` keeps related groups separate. Runners in `tools/judge/`:

- `node tools/judge/judge-plate.mjs --image <target> --painted <painting.jpg>`: composite measurements on one plate.
- `node tools/judge/stage-check.mjs <run-dir>`: stage progression flags.
- `node tools/judge/concert-judge.mjs`: all metric groups across painter configurations.
- `node tools/judge/judge.mjs`: calibrate and check discrimination against reference scans in `$JUDGE_REFS`.

## Stage checks

`src/eval/stages.mjs` flags: big shapes under half their final value a third of the way in; speckle in the first half; over 70% of final tone down a quarter of the way in; steps backward, colour drift, or too little line early in line-first work.

## Stroke sizes

`tools/stroke-stats.mjs` and `tools/stroke-gate.mjs` flag broad low-detail wash interiors filled with tiny dabs (median contact under 1 mm wide or path under 3 mm long) or narrow wiper sweeps (region over 4 brush widths, at least 6 aligned overlapping passes):

```sh
node tools/stroke-stats.mjs <run-dir> --out <panel>
node tools/stroke-gate.mjs <run-dir> --mode reject
node tools/run-plan.mjs plan.json --stroke-gate reject --out work/plan
node tools/paint-plate.mjs --image target.jpg --marks 1 --strokegate reject --out work/plate
```

Each broad interior has a 30% ceiling on tiny-mark carried area (`maxBroadAreaTinyAreaShare`), tiny-mark visible paint (`maxBroadAreaTinyVisibleShare`) and wiper coverage (`maxBroadAreaWiperShare`). Detail passages, pen lines and 1 mm edge bands are exempt.

## Vision judges

- Benchmark: `npm run bench:score04` scores human-ness from the film under the [rubric](../bench/docs/human-ness-rubric.md) and quality against the original ([scoring](../bench/docs/scoring.md)).
- Blind stage rounds (`tools/judge/rounds/`): `run.mjs` packs a candidate, a control, a duplicate control, a known good and a known bad run under shuffled letters for Claude or Codex judges; `tally.mjs` drops any judge that misranks the controls or scores the duplicates more than 1 point apart. A candidate wins with at least 4 valid judges and two thirds of valid votes.
