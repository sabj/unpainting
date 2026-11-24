# Unpainting: It's All a Pigment of Your Imagination

`unpainting` is a Node.js watercolor and ink simulator. It paints an input image one brushstroke at a time. It specializes in the rather obscure and somewhat useless goal of making incomplete paintings.

* It does not use a black-box neural net or pixel-by-pixel hill climbing... to actually implement the brushstrokes.[^nn]
* It combines watercolor physics with planning and execution tools for large language models (LLMs) to make transparent paintings. Models with vision and reasoning do best. This is not efficient!!!
* You can stop or rewind a painting at any point between blank page and finished product. At every point it should look as if a human painted it, in the painting behavior as well as the pixels. In theory.
* It doesn't actually make the painting! It only unmakes them, so you can't start with a photo. It will almost always make something worse than where you started, but it's about the journey.

How the pen drawing and the washes are made, stage by stage: [How it paints](docs/how-it-paints.md), the pipeline contract.

**0.3.0: less time waiting for paint to dry.** During development, the three-workload M4 reference suite fell from 12.1 minutes on the frozen control to 4.7 minutes with warm caches. A fresh final-engine run with run caching off took 6.6 minutes. The final engine retains 98.75%–99.76% local RGB SSIM on those paintings. See the [release notes](CHANGELOG.md#030--2026-11-07) for timing charts, full images, amplified differences and the exact commits. Paint Lab and Spore Studies use different browser paths; the CLI speedup is not a browser speed claim.

Want to help? The [open problems](docs/future-ideas.md) need work: linework, washes, judging and more. Issues and pull requests welcome.

<p align="center"><img src="docs/img/hero-trumbull.webp" alt="Trumbull College: original photo, stylized target, and the painting building from blank paper to the finished painting"></p>

<p align="center">Trumbull College, painted with release 0.1.0 (painter V096, sim 100).</p>


Try the [quick start](#try-it), paint by hand in [Paint Lab](https://sabj.github.io/unpainting/demos/lab/), watch mushrooms paint themselves in [Spore Studies](https://sabj.github.io/unpainting/demos/fungi/), or take a painting apart [layer by layer](https://sabj.github.io/unpainting/demos/layers/). This is a side experiment, so caveat emptor. The code is 99.9% AI-written and the docs 99%, so expect some slop and odd overfitting.

## Why model paint drying

<p align="center">Why not.</p>

<div align="center">

<table>
<tr>
<td align="center" width="25%"><a href="https://sabj.github.io/unpainting/demos/lab/"><img src="demos/thumbs/lab.webp" width="180" alt="A heart with an arrow through it, painted in Paint Lab"><br>Paint Lab, to try it</a></td>
<td align="center" width="25%"><a href="https://samjackson.org/writing/whats-a-painting-anyway-part-1/"><img src="docs/img/thumb-blog.webp" width="180" alt="The Mona Lisa painted several ways, from the blog post's header"><br>Blog post on the motivations</a></td>
<td align="center" width="25%"><a href="docs/reading-list.md"><img src="docs/img/thumb-reading.webp" width="180" alt="Titles of papers from the literature review"><br>Literature review, to see more</a></td>
<td align="center" width="25%"><a href="https://sabj.github.io/unpainting/demos/"><img src="demos/thumbs/fungi-paint.webp" width="180" alt="A mushroom plate painting itself from blank paper"><br>More demos</a></td>
</tr>
</table>

</div>

## What's included

```text
unpainting/
├── docs/           guides and plan format
├── demos/          Paint Lab, the layers page and other browser demos
├── bench/          unpaint-bench: protocol, run records, scores, gallery
├── examples/       public-domain targets and runnable stroke plans
├── src/
│   ├── media/      paper, water, pigment, brush, pen and pencil physics (CPU + WebGPU)
│   ├── paint/
│   │   ├── methods/     generic watercolor methods: study washes, glazes, the drawing
│   │   └── techniques/  named techniques: passage moves, shaped marks, softening
│   └── crop/       target analysis: regions, line files, palette fitting
├── tools/
│   ├── paint-plate.mjs   paint an image with target-pixel reads blocked
│   ├── run-plan.mjs      execute a JSON stroke plan
│   └── seg/              tracing and ordering a drawing, SAM regions (Python)
├── .agents/skills/ watercolor technique and painting planner, for agents
└── .claude/skills  symlink to ../.agents/skills for Claude Code
```

## How does it work

The pipeline has seven steps: instructions, planning tools, plan execution, tool preparation, tool use, judgment and practice between attempts. It takes a painting-style image and prepares paper, colors and brushes. It plans the painting, executes the plan, then judges the result and improves on it.

A painting takes the target, a drawing file and one or more block-in studies. An image model draws a clean line drawing of the subject, which is traced and ordered as a hand draws it. Another makes the studies: the subject simplified to flat shapes. The drawing goes down first and dries. The washes, layers of diluted paint, then build from light to dark, read from the studies.

<p align="center"><a href="docs/how-it-paints.md"><img src="docs/img/pipeline-map.png" alt="The painting pipeline: plan, prepare the sheet, paint, review. Cards 1, 3 and 4 show the Part 1 beach study; card 2 shows a White Ships run with a pencil drawing"></a></p>

<p align="center">Card 2 is a White Ships run from release 0.1.0 (painter V096, sim 100).</p>

The Part 1 post walks through the [full painting pipeline](https://samjackson.org/writing/whats-a-painting-anyway-part-1/#suffering-xl-pipeline) with pictures of each stage. Locally, [how it paints](docs/how-it-paints.md) covers the materials, and [the plan format](docs/plan-format.md) defines the commands a planner can issue. While a painting runs, the guard blocks reads of the target's pixels. The painter works from its plan and what it sees on the sheet.

[Rules, records and limits](docs/honesty.md).

<p align="center"><img src="docs/img/cheat-white-ships.webp" width="912" alt="Sargent's White Ships four times: the target; cheat #1, a hill-climber that keeps random dabs only when they match the photo better; cheat #2, the painter's own strokes replayed with their paint taken from the photo's pixels, with an inset heat map of where it read the photo; and the painter's run building up stroke by stroke. The same brush outline moves over cheat #2 and the painter, and rings mark each new hill-climb dab. Both cheats get a red X near the end."></p>

<p align="center">The painter's run in the last panel was made with release 0.1.0 (painter V096, sim 100).</p>

More recorded paintings are in the [painting sequences](docs/examples.md).

## Try it

Start with a picture already in watercolor or ink-and-wash style. A photo gives poor results.

Requires [Node.js](https://nodejs.org/en/download) 25 or later.

```sh
git clone https://github.com/sabj/unpainting.git
cd unpainting
npm ci
npm run quick-start
```

Open `work/plan-graded-wash/result.png` to see a blue wash fade from dark to light. It takes about five seconds on an Apple M3.

To paint one of the bundled public-domain targets, or your own:

```sh
npm run example:animal      # Tiepolo, Punchinello Riding a Camel: drawing and study
npm run example:portrait    # Sargent, A Tramp: study only
```

Your own image needs a drawing file and a study; [Running the painter](docs/running.md#your-own-image) shows how.

<p align="center"><img src="docs/img/build-white-ships.webp" width="560" alt="Sargent's White Ships beside a benchmark painting by Sol, built from blank paper with the brush outline following each recorded stroke, then rewound"></p>

Sargent's White Ships, left, and Sol's benchmark painting, right, made with painter V096 and sim 100 (release 0.1.0). The outline is the brush; paint shows up at the next saved frame.

Unless told otherwise, the painter runs its default recipe, a preset of painter settings (`src/paint/recipe.mjs`). [Methods, techniques and tuned settings](docs/techniques.md) lists the parts of the painter.

[Running the painter](docs/running.md) covers the inputs, sheet size, saved stages, animations and Paint Lab. Supporting tools need more:

- `ffmpeg` on your `PATH` for animations of the painting. Pass `--video 0` to skip them.
- Python 3 for tracing a drawing, segmentation and scoring. The scorer lists its packages in [bench/scorer/requirements.txt](bench/scorer/requirements.txt).

Everything runs on a basic machine. A GPU, including a local one through WebGPU, runs faster and in parallel. That helps when you steer towards an outcome.

## Benchmark

[unpaint-bench](bench/README.md) tests how well AI models paint, and how much of that is the model and how much is the code that helps it. The reference is "Auto", the code planner alone.

**0.4 is a new series.** Its scores are not comparable with the rounds before it.

The pictures: fifteen, in four groups of three museum works (figural, architectural, landscape, abstract or loose) and a bonus group of three generated pictures. Five are the core, one from each group, and run levels 1 to 4; the other ten run Auto and level 2. [The pictures and their credits](bench/PICTURES.md).

The ladder. Every level is one try that hands in the model's own script, with a budget of 3.0 look units:

- L1: the freehand kit and its tips (technique guides and worked examples). Paper colour is its choice. One attempt; budget 3 runs of its script.
- L2: the same inputs the code planner gets (the prepared drawing, the three colour studies as pictures, the named forms). No code plan: the model plans the painting itself.
- L3: one retry of L2, after studying its own L2 painting (its finished full-size painting, film and stroke map). Fresh budget.
- L4: one more retry, from its own L3 painting, film and stroke map, now also given the studies' traced shapes as regions it may use, change or ignore (they may be wrong). Fresh budget.
- Nothing of Auto at any level: no plan, planner, painting, film or stroke map. A hand-in of planner settings or of the code's plan is refused.

How it is run and scored:

- Drawing is the model's choice: pencil, pen or none. The prepared drawing is offered, not required.
- Every picture is painted on the same area of paper, a quarter sheet, in its own proportions; the original's real size is told to the model as a fact.
- A look's price is fixed by size: a half-size whole look 0.3, full size 1.0, a partial look its share, never under 0.2. The final is not charged. How a model paints is free and measured beside the score. Steps and a six-hour clock are runaway guards only.
- Judges read how human the making looks from the film (an opening of the bare paper, the drawing before the first wash scored beside, then ten scored frames from the first wash to the finished sheet), and how good and how like the original the painting is. The original is scored for quality as well, and a painting's quality is its share of the original's.
- Judges: an open-weight panel (GLM-5.3-Flash, Qwen3.8-27B, Gemma-4-31B), hosted with zero data retention or run locally ([scoring](bench/docs/scoring.md#judges)).
- The first run: Gemini 4 Argon, Neon and Hydrogen and Claude Sonnet 5.5, all at medium effort, on subscriptions. Not in it: a container for replication and the OpenAI models.
- How to replicate: [bench/README](bench/README.md#how-to-replicate-04).

<p align="center"><a href="docs/auto-vs-model.md"><img src="docs/img/auto-vs-model-auto-cut.webp" width="720" alt="Mittens: a study, the outline of every wash Auto cuts from it, and a close up of the head"></a></p>

<p align="center">How Auto starts: a study cut into washes.</p>

- [How Auto paints, and how a model's script differs](docs/auto-vs-model.md): Auto's method on one cat, step by step.
- [Painting script](docs/painting-script.md): how a model writes its passages.
- [Levels](bench/docs/levels.md): what each level is given.
- [Rules](bench/docs/rules.md): the workspace and the budgets.
- [Scoring](bench/docs/scoring.md): human-ness in the making, and quality against the original.
- [Release notes](CHANGELOG.md#040-not-released).

Results: to be added from the release-candidate run.

### History: rounds V1 to V5

The earlier rounds (V1 to V5, 2,500 strokes or an 85-minute clock, look counts) are published as a record. They ran painter V096, sim 100 and judges J1, in releases 0.1.0 and 0.1.1, at the highest reasoning setting. They are not comparable with 0.4. V4 and V5 are retired in 0.4; tag v0.3.2 replays them.

| Round | What the model gets | Subjects | Top model | Score (% of target) | Raw / 10 |
|---|---|---:|---|---:|---:|
| V1 | Tools | 5 | [Gemini 4 Argon (High)](bench/models.json) | 64.1% | 5.50 |
| V2 | Tools and technique guides | 5 | Gemini 4 Argon (High) | 64.5% | 5.53 |
| V3 | Tools, guides, and practice between tries | 3 | Codex Astra | 67.5% | 5.77 |
| V4 | Full pipeline: planner, painter presets and scoring tools | 5 | Gemini 4 Argon (High) | 70.9% | 6.09 |
| V5 | Full pipeline and practice between tries | 5 | Opus 5.5 | 71.0% | 6.10 |

A try is one model session that paints the requested targets. Scores are a percentage of each target scored against itself. V3 uses three subjects, without Mittens and Trumbull; compare it with V1 and V2 on the [shared subjects](bench/results/FINDINGS.md).

Gemini 4 Argon paints best on its own: it ranks first in V1 and V2. With the harness it is level with Opus 5.5. Argon leads V4 and Opus edges V5, both within the margin of error.

<p align="center"><a href="bench/results/leaderboard.md"><img src="docs/img/bench-chart.svg" width="800" alt="Mean score per model and round as a percentage of each target's own score, with 95% intervals"></a></p>

<p align="center"><a href="bench/results/gallery.md"><img src="docs/img/benchmark-overview.webp" width="1200" alt="Two rows of paintings. Top: each model's best painting from any round, sorted by score, with the five targets at left. Bottom: each model's best Ships painting from V1 to V3, with the Ships target at left."></a></p>

The harness helped Sonnet, Haiku and Luna most: they trailed with only the tools and caught up with the full pipeline.

Scores are relative and coarse. [Leaderboard](bench/results/leaderboard.md), [gallery](bench/results/gallery.md), [scoring](bench/docs/scoring.md).

## Credits and references

- [The essay about how this was built](https://samjackson.org/writing/whats-a-painting-anyway-part-1/)
- [The docs](docs/README.md): paints, paper, ink, stroke plans and code
- [Prior work and credits](docs/reading-list.md)
- [Working on the code](CONTRIBUTING.md)

## License

Code: MIT ([LICENSE](LICENSE)). Painter output from public-domain inputs: CC BY 4.0. My photos: noncommercial use. Details: [NOTICE](NOTICE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

[Image sources](NOTICE)

[^nn]: Pretrained models are used only to prepare a painting: image models make the line drawing and the block-in studies, and SAM finds regions in the target. See the [reading list](docs/reading-list.md).
