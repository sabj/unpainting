# Judging

Measurements and judges score a finished painting and the frames saved on the way. Nothing they say is fed back to the painter ([honesty](honesty.md)). The benchmark's judges are in [scoring](../bench/docs/scoring.md).

- `node tools/judge/judge-plate.mjs --image TARGET --painted PAINTING.jpg`: measures one painting with the code in `src/eval/`. It checks tone levels and how much paper is left bare (`values.mjs`), how well tones and lines match by region (`fidelity.mjs`) and colour difference (`colour.mjs`).
- `node tools/judge/stage-check.mjs RUN_DIR`: checks whether the saved frames follow the order a painter would use (`src/eval/stages.mjs`). It flags three things. One is big shapes that are under half their final darkness a third of the way in. Another is speckle in the first half. The last is more than 70% of the final tone already down a quarter of the way in.
- `tools/judge/rounds/`: blind comparisons of stages. `run.mjs` mixes a new run with a control, a copy of the control, a known good run and a known bad run, under shuffled letters. `tally.mjs` drops any judge that ranks the controls wrongly.

## Stroke sizes

`tools/stroke-stats.mjs` and `tools/stroke-gate.mjs` flag large plain areas filled with tiny dabs or narrow sweeps. A dab is tiny if it is under 1 mm wide or 3 mm long. Tiny dabs or narrow sweeps may cover at most 30% of such an area. Detail work, pen lines and the 1 mm band along an edge are exempt.

```sh
node tools/stroke-stats.mjs RUN_DIR --out PANEL
node tools/stroke-gate.mjs RUN_DIR --mode reject
node tools/run-plan.mjs plan.json --stroke-gate reject --out work/plan
```
