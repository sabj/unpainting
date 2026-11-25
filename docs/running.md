# Getting started

Needs [Node.js](https://nodejs.org/en/download) 25 or later and `npm ci`. `ffmpeg` makes the MP4 videos (`--video 0` skips them). The painter uses WebGPU when there is an adapter; `--gpu auto` falls back to the CPU.

## Examples

```sh
npm run quick-start        # a stroke plan: work/plan-graded-wash/result.png, five seconds, no GPU needed
npm run example:animal     # Tiepolo, Punchinello Riding a Camel: a pen drawing and one simplified picture
npm run example:portrait   # Sargent, A Tramp: one simplified picture, no drawing
```

A run does not overwrite an earlier run's folder: name a new `--out`. Finished examples are in `examples/output/`. Stroke plans are described in [plan format](plan-format.md).

## Your own image

A painting needs the picture, a line drawing file and one or more studies. A study is a simplified version of the picture in flat colours.

1. Ask an image model for a clean line drawing of the picture, black on white, at its proportions. Trace and order it ([tools/seg](../tools/seg/README.md); needs Python with numpy and OpenCV):

   ```sh
   python3 tools/seg/trace-drawing.py drawing.png --out work/lines/picture-traced --target picture.jpg --sheetmm 152 --medium ink
   node tools/seg/order-strokes.mjs work/lines/picture-traced-lines.json work/lines/picture --sheetmm 152
   ```
2. Ask an image model for the picture simplified to flat shapes at the same proportions: one study, or several from coarse to fine.
3. Paint:

   ```sh
   node tools/paint-plate.mjs --image picture.jpg --width 540 --mode fast \
     --drawingfile work/lines/picture --inkrecipe wash \
     --washplan study.png --out work/my-picture --video 0
   ```

The painter first splits the picture into regions. This needs a model called SAM and its Python ([setup](../tools/seg/README.md#segmentation)). `npm run doctor` says what is missing. That Python also runs the benchmark's scorer: `export BENCH_SCORE_PYTHON=$PWD/.venv-seg/bin/python`. The painter refuses to paint from uncommitted source changes unless `--allowdirty 1`.

- `--drawingfile STEM`: the lines, drawn as they are. Without it no line is drawn. `--inkrecipe wash` draws them in pen; the default is pencil ([ink](ink.md)).
- `--washplan STUDY.png[:MIN[:glaze]],...`: the studies, coarse to fine. `MIN` is the smallest shape in mm² that study lays; each later study adds only what is darker.
- `--width` is the sheet's width in cells, the small squares the simulator tracks. It cannot be more than the picture's width in pixels. `--sheetmm` is the sheet's width in millimetres. The default sheet is a 6 × 4 inch postcard.

`--out` gets `painting.png`, the video (`painting.mp4`, the frames `f0000.jpg` onward, and `frames.json`), `ink.jpg`, `wash.jpg` and the guard's records ([honesty](honesty.md)). Every run also records the versions and commit it used ([src/painter-version.mjs](../src/painter-version.mjs)).

## The benchmark's pictures

`npm run unpaint -- paint` (the same as `npm run paint`) paints one of the benchmark's pictures on a quarter-size sheet, on the GPU. The pictures are listed in `SUBJECTS.json`, in a folder of inputs that is not in the repository. [bench/inputs-manifest.json](../bench/inputs-manifest.json) lists every file in it with its checksum.

```sh
export UNPAINT_SUBJECTS=<inputs folder>/SUBJECTS.json
node tools/prepare/manifest.mjs verify bench/inputs-manifest.json --root <inputs folder>
npm run doctor                               # clean checkout, Python environments, SAM checkpoint, 20 GB free
node tools/paint/run-sets.mjs check core     # are all the pictures and their inputs there?

npm run unpaint -- paint mittens-closeup-qs plan                             # Auto's plan, on the CPU
npm run unpaint -- paint mittens-closeup-qs paint --out work/mittens-auto    # Auto's painting
```

A run folder holds `run.json`, `plate/` (the painting and its video), `usage.json` and `sheet.jpg`. Run `npm run paint` with no arguments to see every option. A full-size painting takes about 13 minutes on a Mac mini.

## A model as the painter

`--author KEY` names a model from [tools/paint/authors.json](../tools/paint/authors.json). The model is called through its own command-line tool (`claude`, `codex`, `agy` or `muse`), which must be installed and signed in. `--level` sets what it is given ([rules](../bench/docs/rules.md)).

```sh
npm run unpaint -- prepare mittens-closeup-qs --pool local    # once per commit: makes Auto's plan, the traced shapes and Auto's painting
S=mittens-closeup-qs M=neon-m
npm run unpaint -- paint $S paint --author $M --level L1 --work rounds --wallminutes 60 --out work/$M-L1
npm run unpaint -- paint $S paint --author $M --level L2 --work rounds --wallminutes 60 --out work/$M-L2
npm run unpaint -- paint $S paint --author $M --level L3 --work rounds --wallminutes 60 --out work/$M-L3
npm run unpaint -- paint $S preflight --author $M             # before L4: can its tool open a picture and write a file?
npm run unpaint -- paint $S paint --author $M --level L4 --wallminutes 60 --out work/$M-L4
```

- L1 to L3 are a fixed back-and-forth conversation with no shell. `--author dry-rounds` is a script that calls no model, for testing.
- L4 is an open session in a sandboxed folder, with a shell and tools. It needs macOS, for `sandbox-exec`.
- Add `--dry-run` to print what would run. The full-size final is painted after the model hands in.
- `--author script:FILE.json` paints a kept script without calling a model (add `--lines standard` to use the picture's own drawing); `--from DIR` paints what an earlier run's sessions handed in.

Scoring and the whole benchmark at once: [bench/README.md](../bench/README.md#run-it).

## Your own picture and your own model

A picture: [tools/prepare](../tools/prepare/README.md) makes its drawing, simplified versions and named parts, and adds it to the list. It then paints by its id like the others.

A model: add `{"key", "name", "id", "effort", "cli"}` to `tools/paint/authors.json`, with `cli` one of `claude`, `codex`, `agy` or `muse`. A tool of another provider needs its call in `tools/paint/rounds-call.mjs` (fixed rounds) and `tools/paint/session.mjs` (the open session), and its hosts in `tools/paint/session-net.mjs`. Run `preflight` before the first real session.

## More than one machine

`UNPAINT_RENDER=pool` sends test and final paintings to a pool of machines. The pool can be this Mac, a Mac mini over ssh or rented RunPod GPUs. Manage the rented GPUs with `npm run unpaint -- pods status|dry-run|start|stop`, which needs `RUNPOD_API_KEY`. `npm run unpaint -- status` shows the pool.

On Linux, WebGPU needs an NVIDIA Vulkan driver. Run with `DAWN_FLAGS=backend=vulkan --gpu on`. Then check that `backend.json` names a real GPU, not `llvmpipe`.

[Paint Lab](../demos/lab/README.md) runs the paper, brushes and pen in the browser: `python3 -m http.server 8000 --directory demos`.
