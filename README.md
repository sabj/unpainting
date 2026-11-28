# Unpainting: It's All a Pigment of Your Imagination

`unpainting` is a Node.js watercolor and ink simulator. It paints an input image one brushstroke at a time. It specializes in the rather obscure and somewhat useless goal of making incomplete paintings.

* It does not use a black-box neural net or pixel-by-pixel hill climbing... to actually implement the brushstrokes.[^nn]
* It combines watercolor physics with planning and execution tools for large language models (LLMs) to make transparent paintings. Models with vision and reasoning do best. This is not efficient!!!
* You can stop or rewind a painting at any point between blank page and finished product. At every point it should look as if a human painted it, in the painting behavior as well as the pixels. In theory.
* It doesn't actually make the painting! It only unmakes them, so you can't start with a photo. It will almost always make something worse than where you started, but it's about the journey.
* It is designed so that you can run it and its associated benchmarks locally (or with cheap open source model calls to help if needed)

<p align="center"><img src="docs/img/hero-rosewalk.webp" alt="Yale Rosewalk: original photo, stylized target, and the painting building from blank paper through ink drawing and washes to the finished painting"></p>

<p align="center">Yale Rosewalk.</p>

Try the [quick start](#try-it), paint by hand in [Paint Lab](https://sabj.github.io/unpainting/demos/lab/), watch mushrooms paint themselves in [Spore Studies](https://sabj.github.io/unpainting/demos/fungi/), or take a painting apart [layer by layer](https://sabj.github.io/unpainting/demos/layers/). This is just a side experiment, so caveat emptor. And apologies for some Git repo slop, stale claims, or weird overfittings -- this is 99.9% AI code and 99% AI documentation so, you know, good luck.

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

## How it works

Auto, the built-in painter, works from a line drawing and simplified colour studies. An image model makes the studies, from broad shapes to fine detail. Code traces the drawing and orders the lines. Auto draws them, then builds up thin washes from light to dark. A model can also write its own script and start on blank paper.

<p align="center"><a href="docs/how-it-paints.md"><img src="docs/img/pipeline-map.png" alt="The 0.5 painting pipeline on Yale Rosewalk: block-in studies and SAM named forms, cold-press paper and ordered ink lay-in, WebGPU wet-in-wet painting stages, and side-by-side open2 judging"></a></p>

While a painting runs, a guard stops the code from reading the target's pixels: [how it paints](docs/how-it-paints.md), [the guard](docs/honesty.md).

<p align="center"><img src="docs/img/cheat-white-ships.webp" width="912" alt="Sargent's White Ships four times: the target; cheat #1, a hill-climber that keeps random dabs only when they match the photo better; cheat #2, strokes replayed with paint sampled from the photo's pixels; and Fair Mode (0.5), building up stroke by stroke with zero target pixel reads."></p>

## Try it

Start with a picture already in watercolor or ink-and-wash style. A photo gives poor results. Requires [Node.js](https://nodejs.org/en/download) 25 or later.

```sh
git clone https://github.com/sabj/unpainting.git
cd unpainting
npm ci
npm run quick-start
```

Open `work/plan-graded-wash/result.png`: a blue wash fading from dark to light, in about five seconds. Then the bundled public-domain examples:

```sh
npm run example:animal      # Tiepolo, Punchinello Riding a Camel: a drawing and one simplified picture
npm run example:portrait    # Sargent, A Tramp: one simplified picture, no drawing
```

<p align="center"><img src="docs/img/build-white-ships.webp" width="560" alt="Sargent's White Ships beside Auto’s 0.5 painting building from blank paper through pencil and washes, then rewinding"></p>

[Getting started](docs/running.md) covers your own image, the benchmark's pictures and model painters. `ffmpeg` is needed for MP4 videos (`--video 0` skips them). Python 3 is needed for tracing a drawing, finding regions and scoring.

`npm run unpaint` is one command for painting, benchmark runs, cloud GPUs and scoring ([benchmark](bench/README.md#run-it)):

```sh
npm run unpaint -- --help
npm run unpaint -- paint mittens-closeup-qs plan              # plan or paint a prepared benchmark picture
npm run unpaint -- benchmark --out work/bench-05 --set core   # lists every session; --start runs them
npm run unpaint -- status work/bench-05                       # progress of the runs
```

## Benchmark

[unpaint-bench](bench/README.md) hands AI models the simulator's brush and pen across **15 pictures** (5 Core at `L1–L4`, 10 Extended at `L2`; [credits](bench/PICTURES.md)). Models can look at the target, never read its pixels, and are graded by two open-weight vision judges (`open2`: **Qwen 3.8 27B + Gemma 4 31B**, identical locally on Apple Silicon MLX or via OpenRouter) on craft vs Auto 0.5 and human-ness across ten progress frames (`Q × min(1, H / 65)`).

| Level | Inputs given to the model | Mode |
|---|---|---|
| **L1** | Source picture + script format | Fixed rounds |
| **L2** | L1 + three colour block-in studies | Fixed rounds |
| **L3** | L2 + opt-in drawing, named forms, traced shapes, Auto plan | Fixed rounds |
| **L4** | Same inputs as L3 | Isolated shell (`python3` + `./unpaint`) |

<p align="center"><a href="docs/what-the-model-gets.md"><img src="docs/img/auto-vs-model-inputs.webp" width="900" alt="The four pictures a model sees at L2 (Mittens and three colour studies), followed by its finished painting"></a></p>

<p align="center"><a href="bench/README.md"><img src="docs/img/bench-chart.svg" width="920" alt="Unpainting 0.5.1 overall benchmark ranking: All 15 pictures at L2 and Core 5 across autonomy levels L1 to L4"></a></p>

<p align="center"><a href="bench/README.md"><img src="docs/img/bench-pareto.svg" width="920" alt="Unpainting 0.5.1 cost versus quality Pareto frontier on Core 5 (model API cost per painting, log scale)"></a></p>

<p align="center"><a href="bench/README.md"><img src="docs/img/benchmark-overview.webp" width="1200" alt="Two rows of 0.5.1 paintings. Top: each model's best Core 5 painting, sorted by open2 score. Bottom: Sargent's White Ships target, Auto 0.5 baseline, and each model's best 0.5.1 run."></a></p>

Full tables, findings, and setup: [unpaint-bench](bench/README.md) · [what the model gets](docs/what-the-model-gets.md) · [rules](bench/docs/rules.md) · [scoring](bench/docs/scoring.md) · [changelog](CHANGELOG.md). Older V1–V5 rounds: [leaderboard](bench/results/leaderboard.md), [gallery](bench/results/gallery.md) (tag `v0.3.2`).

## References and license

- [The essay about how this was built](https://samjackson.org/writing/whats-a-painting-anyway-part-1/)
- [Reading list](docs/reading-list.md)
- [Contributing](CONTRIBUTING.md)
- Code: MIT ([LICENSE](LICENSE)). Painter output from public-domain inputs: CC BY 4.0. Bundled photos and third-party credits: [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

[^nn]: Pretrained models are used only before painting starts: image models make the line drawing and block-in studies, and SAM finds regions in the target ([reading list](docs/reading-list.md)).
