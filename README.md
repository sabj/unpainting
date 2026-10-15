# Unpainting: It's All a Pigment of Your Imagination

`unpainting` is a Node.js watercolor and ink simulator. It paints an input image one brushstroke at a time. It specializes in the rather obscure and somewhat useless goal of making incomplete paintings.

* It does not use a black-box neural net or pixel-by-pixel hill climbing... to actually implement the brushstrokes.[^nn]
* It combines watercolor physics with planning and execution tools for large language models (LLMs) to make transparent paintings. Models with vision and reasoning do best. This is not efficient!!!
* You can stop or rewind a painting at any point between blank page and finished product. At every point it should look as if a human painted it, in the painting behavior as well as the pixels. In theory.
* It doesn't actually make the painting! It only unmakes them, so you can't start with a photo. It will almost always make something worse than where you started, but it's about the journey.

Want to help? The [open problems](docs/future-ideas.md) need work: linework, washes, judging and more. Issues and pull requests welcome.

<p align="center"><img src="docs/img/hero-trumbull.webp" alt="Trumbull College: original photo, stylized target, and the painting building from blank paper to the finished painting"></p>


<a href="https://sabj.github.io/unpainting/layers/"><img src="docs/img/layers-thumb.webp" width="200" align="right" alt="The Trumbull painting and its layers as small tiles"></a>

Try the [quick start](#try-it), paint by hand in [Paint Lab](https://sabj.github.io/unpainting/), or take a painting apart [layer by layer](https://sabj.github.io/unpainting/layers/). This is just a side experiment, so caveat emptor. And apologies for some Git repo slop, stale claims, or weird overfittings -- this is 99.9% AI code and 99% AI documentation so, you know, good luck.

## Why model paint drying

<p align="center">Why not.</p>

<div align="center">

<table>
<tr>
<td align="center" width="33%"><a href="https://samjackson.org/writing/whats-a-painting-anyway-part-1/"><img src="docs/img/thumb-blog.webp" width="220" alt="The Mona Lisa painted several ways, from the blog post's header"><br>Blog post on the motivations</a></td>
<td align="center" width="33%"><a href="https://sabj.github.io/unpainting/"><img src="docs/img/thumb-heart.webp" width="220" alt="A heart with an arrow through it, painted in Paint Lab"><br>Paint Lab, to try it</a></td>
<td align="center" width="33%"><a href="docs/reading-list.md"><img src="docs/img/thumb-reading.webp" width="220" alt="Titles of papers from the literature review"><br>Literature review, to see more</a></td>
</tr>
</table>

</div>

## What's included

```text
unpainting/
├── docs/           guides, plan format, and the browser Paint Lab
├── bench/          unpaint-bench: protocol, run records, scores, gallery
├── examples/       public-domain targets and runnable stroke plans
├── src/
│   ├── media/      paper, water, pigment, brush, pen and pencil physics (CPU + WebGPU)
│   ├── paint/
│   │   ├── methods/     generic watercolor methods: washes, glazes, layers, drawing order
│   │   ├── techniques/  techniques for a kind of problem: faces, dark fur, foliage, skies, sea, buildings
│   │   └── tuned/       settings fitted to specific benchmark images
│   └── crop/       target analysis: regions, value masses, palette fitting
├── tools/
│   ├── paint-plate.mjs   paint an image with target-pixel reads blocked
│   ├── run-plan.mjs      execute a JSON stroke plan
│   └── seg/              line and contour proposals (Python)
├── .agents/skills/ watercolor technique and painting planner, for agents
└── .claude/skills  symlink to ../.agents/skills for Claude Code
```

## How does it work

The pipeline has seven steps: instructions, planning tools, plan execution, tool preparation, tool use, judgment and practice between attempts. It takes a painting-style image and prepares paper, colors and brushes. It plans the painting, executes the plan, then judges the result and improves on it.

A drawing goes down first, in pencil or ink, and dries before any wash, a layer of diluted paint. Washes then build from light to dark, and a closing pen can sharpen the lines at the end. Each subject's plan chooses the drawing's medium and weight.

<p align="center"><a href="docs/how-it-paints.md"><img src="docs/img/pipeline-map.png" alt="The painting pipeline: plan, prepare the sheet, paint, review. Cards 1, 3 and 4 show the Part 1 beach study; card 2 shows a White Ships run"></a></p>

The Part 1 post walks through the [full painting pipeline](https://samjackson.org/writing/whats-a-painting-anyway-part-1/#suffering-xl-pipeline) with pictures of each stage. Locally, [how it paints](docs/how-it-paints.md) covers the materials, and [the plan format](docs/plan-format.md) defines the commands a planner can issue. While a painting runs, the guard blocks reads of the target's pixels. The painter works from its plan and what it sees on the sheet.

[Rules, records and limits](docs/honesty.md).

<p align="center"><img src="docs/img/cheat-white-ships.webp" width="912" alt="Sargent's White Ships four times: the target; cheat #1, a hill-climber that keeps random dabs only when they match the photo better; cheat #2, the painter's own strokes replayed with their paint taken from the photo's pixels, with an inset heat map of where it read the photo; and the painter's run building up stroke by stroke. The same brush outline moves over cheat #2 and the painter, and rings mark each new hill-climb dab. Both cheats get a red X near the end."></p>

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
npm run example:portrait    # Sargent, A Tramp
node tools/paint-plate.mjs --image path/to/painting.jpg --width 540 --mode fast --out work/mine
```

<p align="center"><img src="docs/img/build-white-ships.webp" width="560" alt="Sargent's White Ships beside a benchmark painting by Sol, built from blank paper with the brush outline following each recorded stroke, then rewound"></p>

Sargent's White Ships, left, and Sol's benchmark painting, right. The outline is the brush; paint shows up at the next saved frame.

Unless told otherwise, the painter runs its default recipe, a preset of painter settings (`src/paint/recipe.mjs`). [Methods, techniques and tuned settings](docs/techniques.md) lists every part of the painter, which settings were fitted to benchmark images, and how to turn each one off. The default has some known overfitting risks; making it generalize is on the [to-do list](docs/future-ideas.md#5-making-the-default-generalize). When does a harness become an overfitting machine? Good question.

[Running the painter](docs/running.md) covers the recipe, sheet size, saved stages, animations and Paint Lab. Supporting tools need more:

- `ffmpeg` on your `PATH` for animations of the painting. Pass `--video 0` to skip them.
- Python 3 for the optional scoring and segmentation tools. The scorer lists its packages in [bench/scorer/requirements.txt](bench/scorer/requirements.txt).

Everything runs on a basic machine. A GPU, including a local one through WebGPU, runs faster and in parallel. That helps when you steer towards an outcome.

## Benchmark

[unpaint-bench](bench/README.md) tests how well AI models paint, in five rounds that give the model more help each time.

- **V1 to V3: the model paints.** It writes its own scripts that lay every brush and pen stroke through the toolkit. Each painting gets about 15 minutes and at most 2,500 strokes. V2 adds technique guides; V3 adds the model's own earlier attempts.
- **V4 and V5: the model directs a painting harness.** It writes a plan (regions, layering, brushes and lines), and the harness's painter turns the plan into strokes, with no stroke limit. At set points the model can stop, look at the painting and revise the rest of the plan. V5 adds feedback from the previous try. These rounds measure how well a model directs the harness, not how well it lays strokes itself. The harness does much of the work, which is why V4 and V5 scores sit closer together.

All results use painter V096, sim 100 and judges J1. Release 0.1.0 holds the original models. Release 0.1.1 adds Gemini 4 Argon, Gemini 3.8 Flash and the Muse models, and changes two harness rules in V4 and V5 (see the [changelog](CHANGELOG.md)). Results are labelled by round, painter, sim, judge version and release. To reproduce, check out tag `v0.1.0` or `v0.1.1` ([versions](docs/versions.md)).

Models ran at their highest reasoning setting: xhigh where offered. Gemini 4 Argon and Gemini 3.8 Flash top out at high; Argon also ran at medium for comparison. Haiku 4.5, DeepSeek V4.1 Flash and MiniMax M3 have no reasoning setting.

| Benchmark version | What the model gets | Subjects | Top model | Score (% of target) | Raw / 10 |
|---|---|---:|---|---:|---:|
| V1 | Tools | 5 | [Gemini 4 Argon](bench/models.json) | 64.1% | 5.50 |
| V2 | Tools and technique guides | 5 | Gemini 4 Argon | 64.5% | 5.53 |
| V3 | Tools, guides, and practice between tries | 3 | Codex Astra | 67.5% | 5.77 |
| V4 | Full pipeline: planner, painter presets and scoring tools | 5 | Gemini 4 Argon | 70.9% | 6.09 |
| V5 | Full pipeline and practice between tries | 5 | Opus 5.5 | 71.0% | 6.10 |

A try is one model session that paints the requested targets. Scores are a percentage of each target scored against itself. V1 to V5 are benchmark versions with different tools or feedback. V3 is compared on three subjects, without Mittens and Trumbull, so compare it with V1 and V2 on the [shared subjects](bench/results/FINDINGS.md).

Gemini 4 Argon is the best model at painting on its own: it ranks first in V1 and V2. With the harness it is level with Opus 5.5. Argon leads V4 and Opus narrowly edges it in V5, both within the margin of error. Google cooked.

<p align="center"><a href="bench/results/leaderboard.md"><img src="docs/img/bench-chart.svg" width="800" alt="Mean score per model and round as a percentage of each target's own score, with 95% intervals"></a></p>

<p align="center"><a href="bench/results/gallery.md"><img src="docs/img/benchmark-overview.webp" width="1200" alt="Two rows of paintings. Top: each model's best painting from any round, sorted by score, with the five targets at left. Bottom: each model's best Ships painting from V1 to V3, with the Ships target at left."></a></p>

The harness helped Sonnet, Haiku and Luna the most: they trailed with only the tools and caught up with the full pipeline.

Scores are relative, very coarse, and open to improvement. [Leaderboard](bench/results/leaderboard.md), [gallery](bench/results/gallery.md), [scoring](bench/docs/scoring.md).

## Credits and references

- [The essay about how this was built](https://samjackson.org/writing/whats-a-painting-anyway-part-1/)
- [The docs](docs/README.md): paints, paper, ink, stroke plans and code
- [Prior work and credits](docs/reading-list.md)
- [Working on the code](CONTRIBUTING.md)

## License

Code: MIT ([LICENSE](LICENSE)). Painter output from public-domain inputs: CC BY 4.0. My photos: noncommercial use. Details: [NOTICE](NOTICE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

[Image sources](NOTICE)

[^nn]: Pretrained models are used only to guide painting: optional prep tools use them to find lines and regions in the target. See the [reading list](docs/reading-list.md).
