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

<p align="center"><a href="docs/how-it-paints.md"><img src="docs/img/pipeline-map.png" alt="The painting pipeline: plan, prepare the sheet, paint, review. Cards 1, 3 and 4 show the Part 1 beach study; card 2 shows a White Ships run with a pencil drawing"></a></p>

While a painting runs, a guard stops the code from reading the target's pixels: [how it paints](docs/how-it-paints.md), [the guard](docs/honesty.md).

<p align="center"><img src="docs/img/cheat-white-ships.webp" width="912" alt="Sargent's White Ships four times: the target; cheat #1, a hill-climber that keeps random dabs only when they match the photo better; cheat #2, the painter's own strokes replayed with their paint taken from the photo's pixels, with an inset heat map of where it read the photo; and the painter's run building up stroke by stroke."></p>

The four-panel White Ships clip is the original guard demonstration.

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

## How long it takes

Auto took about 2–7½ minutes per picture on Apple Silicon GPUs. On an M5 Max MacBook Pro, Auto painted Turner’s fort in 2m 13s, Yale Rosewalk in 4m 14s and Mittens in 7m 06s. Those are painting times from the `e0276330` run cards. Preparing the studies and waiting for a model to write a script take extra time.

The bundled examples are ready to paint. To add your own, an open image model (Qwen-Image-Edit, run locally) first makes a few studies of it: a pencil lay-in and three simplified colour versions. The painter and the models plan from those. See [preparing a picture](tools/prepare/README.md).

## Benchmark

[unpaint-bench](bench/README.md) gives models the simulator's brush and pen. Auto paints each picture too. The clean 0.5.1 benchmark is running.

There are fifteen pictures, twelve from museums and three made with an image generator. The five core pictures get all four levels. The other ten get Auto and L2. [Picture credits](bench/PICTURES.md).

- **L1** starts with the picture, the script format and painting tips. The sheet is blank.
- **L2** adds three colour studies. The model can sketch its own lines or go straight to paint.
- **L3** adds a prepared drawing, named forms, traced shapes, and Auto’s plan and finished painting. The drawing stays off until the model asks for it.
- **L4** gives the same material in an isolated shell with Python and `./unpaint`. The model’s 60-minute clock pauses while it waits for the GPU.

Each level starts fresh with a 60-minute budget. The model hands in its own script and has 3.0 units to spend on test paintings. It can look at the picture. Its code cannot read the pixels, and it gets no scores along the way.

Three open-weight judges (`open3v2`) grade the finished watercolour beside the original, which sets the craft standard at 9/10. They judge how human the process looks from ten stills. Below 65% human-ness, the craft score takes a proportional cut. At 65% and up, craft alone sets the score.

<p align="center"><a href="docs/what-the-model-gets.md"><img src="docs/img/auto-vs-model-inputs.webp" width="900" alt="The four pictures Opus saw at L2 (Mittens and three colour studies), followed by its finished painting"></a></p>

[What the model gets](docs/what-the-model-gets.md), [script format](docs/painting-script.md), [rules](bench/docs/rules.md), [scoring](bench/docs/scoring.md), [changelog](CHANGELOG.md).

Rounds V1 to V5 are kept as a record: [leaderboard](bench/results/leaderboard.md), [gallery](bench/results/gallery.md), [findings](bench/results/FINDINGS.md). Tag `v0.3.2` replays V4 and V5.

<p align="center"><a href="bench/results/leaderboard.md"><img src="docs/img/bench-chart.svg" width="800" alt="Mean score per model and round as a percentage of each target's own score, with 95% intervals"></a></p>

<p align="center"><a href="bench/results/gallery.md"><img src="docs/img/benchmark-overview.webp" width="1200" alt="Two rows of paintings. Top: each model's best painting from any round, sorted by score, with the five targets at left. Bottom: each model's best Ships painting from V1 to V3, with the Ships target at left."></a></p>

## References and license

- [The essay about how this was built](https://samjackson.org/writing/whats-a-painting-anyway-part-1/)
- [Reading list](docs/reading-list.md)
- [Contributing](CONTRIBUTING.md)
- Code: MIT ([LICENSE](LICENSE)). Painter output from public-domain inputs: CC BY 4.0. Bundled photos and third-party credits: [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

[^nn]: Pretrained models are used only before painting starts: image models make the line drawing and block-in studies, and SAM finds regions in the target ([reading list](docs/reading-list.md)).
