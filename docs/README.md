# Documentation

Start with the [project README](../README.md) or [Running the painter](running.md).

## Running

- [Running the painter](running.md): examples, painting your own image, `npm run paint`, CLI flags, tests, Paint Lab and cloud rendering.

## How it paints

- [How it paints](how-it-paints.md): the stage-by-stage pipeline contract, recipe flags and techniques.
- [Pigments and paper](pigments-and-paper.md): Kubelka-Munk layering, the 16-pigment box, cold-press paper relief and drying.
- [Ink](ink.md): dip-pen physics, pencil and ink drawing stages, `--inkrecipe wash` and drawing order.

## Scripts and plans

- [Auto vs model script](auto-vs-model.md): how the code planner ("Auto") cuts washes from studies on Mittens, and how a model's script differs.
- [Painting script](painting-script.md): the `painting-script 2` format models write, with a real passage.
- [Plan format](plan-format.md): low-level JSON stroke plans (`tools/run-plan.mjs`), line files and value plans.

## Judging and benchmark

- [Judging](judging.md): repeatable image measurements, stage checks, stroke-size gates and blind vision-judge rounds.
- [Honesty](honesty.md): the runtime guard that blocks target-pixel reads during painting.
- [Benchmark](../bench/README.md): pictures, L1–L4 ladder, budgets, replication and [scoring](../bench/docs/scoring.md).
- [Reading list](reading-list.md): papers and projects the simulator builds on.

Paint Lab lives in [demos/lab/](../demos/lab/) and at <https://sabj.github.io/unpainting/demos/lab/>. Image credits are in [NOTICE](../NOTICE).
