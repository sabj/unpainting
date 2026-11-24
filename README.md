# Unpainting: It's All a Pigment of Your Imagination

`unpainting` is a Node.js watercolor and ink simulator. It paints an input image one brushstroke at a time and specializes in making incomplete paintings.

* No black-box neural net or pixel-by-pixel hill climbing implements the brushstrokes.[^nn]
* It pairs watercolor physics with planning and execution tools for vision-language models to make transparent paintings. This is not efficient.
* You can stop or rewind a painting anywhere between blank paper and the finished sheet. At every point it should look as if a person painted it, in the stroke order as well as the pixels.
* It unmakes paintings rather than making them from photos. Start with a watercolor or ink-and-wash image.

<p align="center"><img src="docs/img/hero-rosewalk.webp" alt="Yale Rosewalk: original photo, stylized target, and the painting building from blank paper through ink drawing and washes to the finished painting"></p>

<p align="center">Yale Rosewalk.</p>

Try the [quick start](#try-it), paint by hand in [Paint Lab](https://sabj.github.io/unpainting/demos/lab/), watch mushrooms paint themselves in [Spore Studies](https://sabj.github.io/unpainting/demos/fungi/), or take a painting apart [layer by layer](https://sabj.github.io/unpainting/demos/layers/). The code and docs are AI-written.

<div align="center">

<table>
<tr>
<td align="center" width="25%"><a href="https://sabj.github.io/unpainting/demos/lab/"><img src="demos/thumbs/lab.webp" width="180" alt="A heart with an arrow through it, painted in Paint Lab"><br>Paint Lab</a></td>
<td align="center" width="25%"><a href="https://samjackson.org/writing/whats-a-painting-anyway-part-1/"><img src="docs/img/thumb-blog.webp" width="180" alt="The Mona Lisa painted several ways, from the blog post's header"><br>Part 1 essay</a></td>
<td align="center" width="25%"><a href="docs/reading-list.md"><img src="docs/img/thumb-reading.webp" width="180" alt="Titles of papers from the literature review"><br>Reading list</a></td>
<td align="center" width="25%"><a href="https://sabj.github.io/unpainting/demos/"><img src="demos/thumbs/fungi-paint.webp" width="180" alt="A mushroom plate painting itself from blank paper"><br>More demos</a></td>
</tr>
</table>

</div>

## How it works

A painting takes a target image, a prepared drawing and one or more block-in studies. An image model draws a clean line drawing, which is traced and ordered as a hand draws it. Another simplifies the subject into flat colour studies, coarse to fine. The drawing goes down first and dries; diluted washes then build from light to dark.

<p align="center"><a href="docs/how-it-paints.md"><img src="docs/img/pipeline-map.png" alt="The painting pipeline: plan, prepare the sheet, paint, review. Cards 1, 3 and 4 show the Part 1 beach study; card 2 shows a White Ships run with a pencil drawing"></a></p>

While a painting runs, a guard blocks reads of the target's pixels. See [How it paints](docs/how-it-paints.md), [Plan format](docs/plan-format.md) and [Honesty](docs/honesty.md).

<p align="center"><img src="docs/img/cheat-white-ships.webp" width="912" alt="Sargent's White Ships four times: the target; cheat #1, a hill-climber that keeps random dabs only when they match the photo better; cheat #2, the painter's own strokes replayed with their paint taken from the photo's pixels, with an inset heat map of where it read the photo; and the 0.4 painter building up stroke by stroke."></p>

## Try it

Requires [Node.js](https://nodejs.org/en/download) 25 or later.

```sh
git clone https://github.com/sabj/unpainting.git
cd unpainting
npm ci
npm run quick-start
```

Open `work/plan-graded-wash/result.png`: a blue wash fading from dark to light, in about five seconds.

To paint the bundled public-domain examples:

```sh
npm run example:animal      # Tiepolo, Punchinello Riding a Camel: drawing and study
npm run example:portrait    # Sargent, A Tramp: study only
```

<p align="center"><img src="docs/img/build-white-ships.webp" width="840" alt="Sargent's White Ships beside two paintings building from blank paper and rewinding: 0.3 and prior (middle) beside 0.4 onwards (right)"></p>

[Running the painter](docs/running.md) covers your own images, sheet size, saved stages and animations. Optional:

- `ffmpeg` on `PATH` for MP4 animations (pass `--video 0` to skip).
- Python 3 for tracing a drawing, SAM segmentation and scoring ([bench/scorer/requirements.txt](bench/scorer/requirements.txt)).
- WebGPU uses a local or cloud GPU when available and falls back to the CPU when `--gpu auto` is set.

### One CLI for jobs and benchmarks

`npm run unpaint -- <command>` wraps painting jobs, Auto preparation, cloud GPU pods, benchmark runs, status checks, and scoring in one entry point (dry-run by default for benchmark launches):

```sh
npm run unpaint -- --help

# Paint or plan a subject
npm run unpaint -- paint mittens-closeup-qs plan

# Prepare Auto plans, traced shapes, and Auto paintings once per commit (local or pooled)
npm run unpaint -- prepare core --pool local --jobs 3 --dry-run

# Inspect or control cloud GPU pods (optional; Mac mini works without pods)
npm run unpaint -- pods status
npm run unpaint -- pods dry-run

# Plan a full benchmark run (prints every session; add --start to launch, --with-pods to start the pod renter)
npm run unpaint -- benchmark --out work/bench-04 --set core

# Check pool + run progress, then refresh the manifest and score finished paintings
npm run unpaint -- status work/bench-04
npm run unpaint -- score work/bench-04 --manifest-only
```

## Time and memory

On a Mac mini (M4, 16 GB) a full-size Auto painting with film (Mittens, 1,086 x 1,448 cells) takes 13 minutes and peaks at 11 GB; a half-size look takes 4 to 7. A rented RTX 4090 pod takes 30 minutes for the same painting (planning runs on its CPU); pods are for many paintings at once. Studies for a new picture need about 100 GB of memory for an hour; shipped pictures come with theirs.

## Benchmark

[unpaint-bench](bench/README.md) tests how well AI models paint with the simulator's brush and pen, scored against Auto (the code planner alone). 0.4 is a new series; its scores do not compare with rounds V1 to V5.

Fifteen works in four museum groups of three (figural, architectural, landscape, abstract or loose) and a bonus group of three generated pictures ([bench/PICTURES.md](bench/PICTURES.md)). Five core pictures run Auto and levels 1 to 4; the other ten run Auto and level 2.

Every level is one fresh, independent session (all levels and pictures can run at once) that hands in the model's own painting script, with the anti-cheat guard on (code may not read the original's pixels), no judge feedback, a 3.0 look-unit budget, and a 60-minute clock:

- **L1** (fixed rounds): the picture, the script format, and painting tips.
- **L2** (fixed rounds): adds the prepared drawing, colour studies, named forms, and the studies' traced shapes (nothing of Auto).
- **L3** (fixed rounds): adds Auto's plan (in numbers, to read) and Auto's finished painting, to improve on.
- **L4** (open session with tools): L3's inputs in a sandboxed workspace with a shell, Python toolbox, and painter commands — same tools and budget for every model family.

Handing in planner settings or Auto's plan as a choice is refused at every level.

- Drawing: pencil, pen (waterproof or soluble) or none, the model's choice.
- Sheet: a quarter sheet (27.9 × 38.1 cm, 0.26 mm a cell) in the picture's proportions.
- Looks: 0.3 for a half-size whole look, 1.0 full-size, partial looks (by stage or region) their share, minimum 0.05; the final render is free. How a model paints is free and recorded. Water steps over 10× Auto's and 1,000 tool steps only stop a runaway.
- Scores: an open-weight panel (GLM-5.3-Flash, Qwen3.8-27B, Gemma-4-31B) scores human-ness from the film (the paper as context, the drawing before the first wash scored beside, then 10 frames from the first wash to the finished sheet) and quality against the original. Combined weights human-ness 2:1 over quality.

<p align="center"><a href="docs/auto-vs-model.md"><img src="docs/img/auto-vs-model-auto-cut.webp" width="720" alt="Mittens: a study, the outline of every wash Auto cuts from it, and a close up of the head"></a></p>

[Auto vs model script](docs/auto-vs-model.md), [painting script format](docs/painting-script.md), [levels, rules and replication](bench/README.md), [scoring](bench/docs/scoring.md), [changelog](CHANGELOG.md).

### History: rounds V1 to V5

Rounds V1 to V5 (2,500 strokes or 85 minutes, judges J1) are kept as a record. Tag `v0.3.2` replays V4 and V5.

V1 gave tools; V2 added technique guides; V3 added practice between tries; V4 the full pipeline of planner, presets and scoring tools; V5 that plus practice. Top scores, as a share of each target's own: V1 Gemini 4 Argon (High) 64.1%, V2 Argon 64.5%, V3 Codex Astra 67.5%, V4 Argon 70.9%, V5 Opus 5.5 71.0%.

<p align="center"><a href="bench/results/leaderboard.md"><img src="docs/img/bench-chart.svg" width="800" alt="Mean score per model and round as a percentage of each target's own score, with 95% intervals"></a></p>

<p align="center"><a href="bench/results/gallery.md"><img src="docs/img/benchmark-overview.webp" width="1200" alt="Two rows of paintings. Top: each model's best painting from any round, sorted by score, with the five targets at left. Bottom: each model's best Ships painting from V1 to V3, with the Ships target at left."></a></p>

See the [leaderboard](bench/results/leaderboard.md), [gallery](bench/results/gallery.md) and [findings](bench/results/FINDINGS.md).

## References and license

- [Part 1 essay](https://samjackson.org/writing/whats-a-painting-anyway-part-1/)
- [Reading list](docs/reading-list.md)
- [Contributing](CONTRIBUTING.md)
- Code: MIT ([LICENSE](LICENSE)). Painter output from public-domain inputs: CC BY 4.0. Bundled photos and third-party credits: [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

[^nn]: Pretrained models are used only before painting starts: image models make the line drawing and block-in studies, and SAM finds regions in the target ([reading list](docs/reading-list.md)).
