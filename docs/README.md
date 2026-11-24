# unpainting docs

The [project README](../README.md) has the quick start. The [0.3.0 release notes](../CHANGELOG.md#030--2026-11-07) show measured runtime changes and visual comparisons, followed by implementation details.

## Use it

- [Running the painter](running.md): commands, outputs, tests and Paint Lab
- [Painting sequences](examples.md): recorded paintings, stage by stage
- [Cloud rendering](CLOUD.md): optional batch rendering on rented machines
- [Versions](versions.md): releases, painter and sim versions, tags, and how to benchmark a newer painter or sim

## How it paints

- [How it paints](how-it-paints.md): the pipeline contract, stage by stage from subject to finished plate
  - [Pigments and paper](pigments-and-paper.md): pigment optics and layers, the paint box, water and drying
  - [Ink](ink.md): the dip pen, pencil, the drawing file and drawing order
  - [Brush and wash techniques](techniques/README.md): each wash, lifting and line technique and its code
- [Methods, techniques and tuned settings](techniques.md): an index of the modules and recipe flags
- [Plan format](plan-format.md): the JSON stroke plan, line files and the V6 draft plan
- [Painting script](painting-script.md): how a model writes passages (shape, paint, brush, paper, strokes), with a real passage

## Checking the work

- [Judging](judging.md): repeatable image measurements, stage checks and AI image judges
- [How Auto paints, and how a model's script differs](auto-vs-model.md): Auto's method on one cat, step by step, and how a model's own script differs in kind
- [Honesty](honesty.md): the check that blocks target-pixel reads, and its records
- The benchmark has its own docs in [bench/](../bench/README.md)

## Background

- [Prior work and credits](reading-list.md): the papers and projects the painter builds on
- [Open problems](future-ideas.md): untested ideas and known defects

Paint Lab, the browser version, is [demos/lab/](../demos/lab/), live at <https://sabj.github.io/unpainting/demos/lab/>. Images are in [img/](img/), with rights in [NOTICE](../NOTICE).
