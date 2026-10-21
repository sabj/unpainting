# unpainting docs

The [project README](../README.md) has the quick start.

## Use it

- [Running the painter](running.md): commands, outputs, tests and Paint Lab
- [Painting sequences](examples.md): recorded paintings, stage by stage
- [Cloud rendering](CLOUD.md): optional batch rendering on rented machines
- [Versions](versions.md): releases, painter and sim versions, tags, and how to benchmark a newer painter or sim

## How it paints

- [Overview](how-it-paints.md): paper, ink, paint, and the pipeline from plan to review
  - [Pigments and paper](pigments-and-paper.md): pigment optics and layers, the paint box, water and drying
  - [Ink](ink.md): the dip pen, pencil, line finding and drawing order
  - [Brush and wash techniques](techniques/README.md): each wash, lifting and line technique and its code
- [Methods, techniques and tuned settings](techniques.md): which modules and preset flags are generic, which target one kind of problem, and which were fitted to benchmark images
- [What a plan is](plans.md): painting decisions, plan formats, the automatic planner and benchmark plans
- [Plan format](plan-format.md): the JSON stroke plan

## Checking the work

- [Judging](judging.md): repeatable image measurements, stage checks and AI image judges
- [Honesty](honesty.md): the check that blocks target-pixel reads, and its records
- The benchmark has its own docs in [bench/](../bench/README.md)

## Background

- [Prior work and credits](reading-list.md): the papers and projects the painter builds on
- [Open problems](future-ideas.md): untested ideas and known defects

Paint Lab, the browser version, is [index.html](index.html) with its code in [lab/](lab/). Images are in [img/](img/), with rights in [NOTICE](../NOTICE).
