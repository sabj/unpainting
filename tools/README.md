# tools

Command-line tools. Run each from the repository root with `node tools/<path>`. Most print usage from their header comment.

| folder | what it holds | start with |
|---|---|---|
| `tools/` | the painter and the stroke-plan runner | `paint-plate.mjs --image FILE --out DIR`, `run-plan.mjs PLAN.json` |
| `painter/` | the modules `paint-plate.mjs` imports: area plans, brush paths supplied by a plan, calibration, production checks | `semantic-areas.mjs` (`paint-plate.mjs --areahelp` prints its contract) |
| `aware/` | stops at passage boundaries (`--pausedir`) and the take-over of a saved painting by a fresh process (`--resumestate`), used by benchmark versions V4 and V5 | `pause.mjs` (the pause folder's files), `aware.test.mjs` |
| `guard/` | the target guard (a check that blocks target-pixel reads), the cheat-risk score, the deliberate-cheat test and the source lint | `cheat-test.mjs`, `promote-check.mjs RUNDIR` |
| `judge/` | classic measures against a target, stage checks, the wash scorer, and blind evaluations of saved stages with model judges in `rounds/` | `judge-plate.mjs`, `stage-check.mjs`, `wash-score.mjs --dir DUMP` |
| `lab/` | builds Paint Lab's recorded examples in `demos/lab/examples/`, copies `src/media/` into the lab, builds the site, and records the lab's demo animation | `build-live-examples.mjs`; `sync-site-media.mjs`; `build-site.mjs`; `record-demo.mjs` |
| `readme/` | builds the README figures and the demo animations in `demos/thumbs/` | `build-readme-media.mjs`; `demo-animations.mjs` |
| `gpu/` | the batch painter (many sheets on one GPU) and CPU-against-GPU checks | `paint-batch.mjs --config FILE`, `step-check.mjs` |
| `cloud/` | render batches on rented machines (optional; needs a paid account) | `render-batch.py`; see [docs/CLOUD.md](../docs/CLOUD.md) |
| `seg/` | figure masks and line extraction in Python (u2net, SAM and line models) | [seg/README.md](seg/README.md) |

`npm test` runs the `.test.mjs` files under `src/` and `tools/`. `npm run bench:test` runs the tests in `bench/scripts/`.

## Readme figures

`readme/build-readme-media.mjs` builds the Trumbull overview image, both example animations and both progress rows:

```sh
node tools/readme/build-readme-media.mjs --trumbull /path/to/y1 --luce /path/to/y4
```

Each input folder contains `photo.png`, `source.jpg` (the stylized target), `painting.png`, saved `fNNNN.jpg` frames and a `frames.json` whose first frame is blank paper. The photos stay outside the repository; the script includes them only inside the comparison images. The inputs and outputs are covered by [NOTICE, section 1](../NOTICE).

MAD is mean absolute color difference. Progress is `MAD(frame, paper) / MAD(painting.png, paper)` at the simulation's original resolution in sRGB (the standard image color space), clipped to 0–1. The script picks the nearest saved frame for each of 30 evenly spaced progress values, in chronological order. A repeated frame holds when the source animation has a gap; no intermediate painting is synthesized. The loop starts on paper and holds the final PNG for 2.2 seconds. The static rows use the nearest frames at 20/40/60/80/100%.

The outputs go to `docs/img/`, or to `--out DIR`: a 1020 px overview image under 3 MB, two 720 px animations under 1.5 MB each, two 720 px static rows, and `readme-media.json` with source hashes, measured progress, selections and encoder versions. The approved painting runs are listed in [docs/examples.md](../docs/examples.md).

The space around and between panels is transparent, and captions are mid grey, so each figure reads on GitHub's light and dark themes.

`readme/animations.mjs` builds two more animations from files already in the repository: White Ships painting with an outline of the brush following each stroke, and a target-to-painting wipe on White Ships. Each stays under 3 MB.

```sh
node tools/readme/animations.mjs
```

`readme/pipeline-map.mjs` builds the pipeline map, `docs/img/pipeline-map.png`. The planning, painting and review cards (01, 03 and 04) use the beach study pictures from the [Part 1 post](https://samjackson.org/writing/whats-a-painting-anyway-part-1/)'s `images/pipeline` folder. The preparation card (02) uses one painter run: its blank paper frame, its frisket (the watercolor term for masking fluid) laid over the target, and its last drawing frame before any wash. Paint the run with `--marks 1` so the frisket comes from the stroke record. Rendering needs Playwright and Chrome.

```sh
node tools/readme/pipeline-map.mjs --site /path/to/images/pipeline \
  --run /path/to/run --fonts /path/to/fonts --playwright /path/to/playwright-project
```

`--site` is the Part 1 post's `images/pipeline` folder. `--fonts` is a fonts folder with regular and italic faces. `--playwright` is a folder with Playwright installed.

`readme/paper-figure.mjs` builds `docs/img/paper-texture.webp`: a flat wash and a graded wash painted and dried on the painter's default cold-press paper, beside a crop of a real wash by Winslow Homer at the same 0.08 mm a pixel. Each simulated pixel is one sheet cell. The header gives the reference crop's URL and scale. It runs the sheet physics on the CPU for about a minute.

```sh
node tools/readme/paper-figure.mjs --ref /path/to/homer-crop.png --refmm 0.04602
```

`readme/clear-gutters.mjs` makes the background of an existing figure transparent without running its original builder.
