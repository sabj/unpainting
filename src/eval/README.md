# src/eval

Repeatable image measurements: code that measures a painting and gives the same numbers every time for the same images. Judges are advisory. No score here is fed back into a painting while it runs.

- `measure.mjs`: one picture in, raw measurements out. `score.mjs` turns them into 0 to 10 scores, calibrated on real watercolors.
- `composite.mjs`: groups of related scores kept separate, each with its own measurements and flags.
- `values.mjs`, `paper.mjs`, `wash.mjs` and `washes.mjs`: value structure, untouched paper and how washes behave.
- `linequality.mjs`, `legibility.mjs`, `ink.mjs`, `strokes.mjs` and `marks.mjs`: line continuity and whether the subject is recognizable.
- `fidelity.mjs` and `colour.mjs`: similarity to the reference image, and color difference in CIEDE2000, a standard color-distance measure.
- `stages.mjs`: process checks on the saved frames, such as darks arriving too early.
- `synthetic.mjs` and `discriminate.mjs`: deliberately bad pictures, and whether the measures tell them apart from good ones.
- `bench/`: image loading for the benchmark measures.

Score one painting with `node tools/judge/judge-plate.mjs --image <target> --painted <painting.jpg>`. [tools/judge/judge.mjs](../../tools/judge/judge.mjs) runs calibration, ranking and the discrimination check.

[Judging](../../docs/judging.md) describes each measure and the stage checks.
