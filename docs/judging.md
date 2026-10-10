# Judging

A judge scores a finished painting and its saved stages. Judges are advisory. No vision judge's verdict is fed back into the painter. A few repeatable image measurements, such as color difference, are also used inside planning.

## Classic measures

The repeatable image measurements are code in `src/eval/`. They give the same numbers every time for the same images.

| module | measures | compares at |
|---|---|---|
| `values.mjs` | how many tone levels, large areas of uniform darkness, paper left between marks | the painting alone |
| `linequality.mjs` | line continuity, steadiness and placement | lines |
| `legibility.mjs` | silhouette at a blur of about 4 cells, and recall of form edges | shapes |
| `fidelity.mjs` | tone over cells about 16 px wide, and line recall within 2 cells | regions |
| `ink.mjs` | ink precision and recall within 2 cells | lines |
| `colour.mjs` | color difference (CIEDE2000, a standard color-difference measure), mean and 90th percentile | pixels |
| `stages.mjs` | the frames in order (see below) | stages |

`score.mjs` scores seven dimensions from 0 to 10, such as line quality, value structure and tone agreement. Its scoring curves join fixed calibration points from a collection of real watercolors. They do not map every median or percentile to an exact score. `composite.mjs` keeps groups of related measures apart and never averages them. `tools/judge/judge-plate.mjs` runs the composite on one painting.

Some measures compare pixel by pixel, such as `colour.mjs` and the end-result group of measurements in `composite.mjs`. Under the [honesty rules](honesty.md), comparisons with the target are made at the shape level. Use per-pixel scores only for diagnosis.

## Stage checks

`src/eval/stages.mjs` checks that the frames follow the order a person paints in. It reads them in order and flags:

- big shapes still under half their final level a third of the way in;
- speckle in the first half;
- more than 70% of the final tone already down a quarter of the way in, which is too dark too early;
- steps backward, color that drifts, and, for line-first styles, too little line early.

`tools/judge/stage-check.mjs` and `tools/judge/concert-judge.mjs` print these flags.

## Vision judges

Vision judges, AI models that score images, are optional. `tools/judge/rounds/` runs a blind evaluation of saved stages:

- It packs the stages of five runs: the candidate, a control (a comparison run with known settings), a duplicate of the control, a known good example and a known bad example.
- Each judge sees its own shuffled letters, and scores each stage from 1 to 5 plus process and finish.
- Claude judges are fresh agents you start by hand. GPT judges run through `codex exec`.
- `tools/judge/rounds/tally.mjs` drops a judge that ranks the known bad example above the known good one, or scores the duplicates more than 1 point apart.
- A candidate wins when at least 4 valid judges prefer it and those votes make up at least two thirds of all valid judges.

The benchmark scores paintings with its own judges; [bench/docs/scoring.md](../bench/docs/scoring.md) describes them.

## Why advisory

Judges disagree with each other and with people. A judge gives a fast first read, and the person looking at the painting decides.
