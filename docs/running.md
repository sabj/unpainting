# Running the painter

You need [Node.js](https://nodejs.org/en/download) 25 or later; check with `node --version`. Install ffmpeg with your package manager to write the animation, or pass `--video 0` to paint without it. The painter uses WebGPU when an adapter is available and falls back to the CPU otherwise. Install the dependencies in the repository root with `npm ci`.

## Examples

Each image example needs an empty output folder. On a repeat run, move the previous folder aside or pass a fresh `--out`.

| Command | Input |
|---|---|
| `npm run example` / `npm run quick-start` / `npm run example:plan` | the stroke plan `examples/plans/graded-wash.json` |
| `npm run example:animal` | Tiepolo, Punchinello Riding a Camel: the drawing `examples/drawings/tiepolo-punchinello-camel` and the study `examples/studies/tiepolo-punchinello-camel-study.png`, with `--inkrecipe wash` |
| `npm run example:portrait` | Sargent, A Tramp: the study `examples/studies/sargent-a-tramp-study.png` and no drawing (`--drawing none`) |

The stroke plan is the small, reproducible demonstration of brushwork and drying. The paintings in the README come from older whole-painting plans; see [Painting sequences](examples.md).

The stroke-plan example writes `result.png` and `run.json` to `work/plan-graded-wash/`, with no animation. To choose its output folder:

```sh
node tools/run-plan.mjs examples/plans/graded-wash.json --out work/plan-graded-wash
```

It uses five paths: one clean-water preparation and four paint strokes in one connected wet wash, followed by drying. It checks the paper before each command. ffmpeg is not needed.

## Your own image

A painting takes three things: the target image, a drawing file and one or more block-in studies.

- The drawing file is a prepared drawing. An image model draws a clean line drawing of the subject. `tools/seg/trace-drawing.py` traces it and `tools/seg/order-strokes.mjs` orders the strokes as a hand draws them (`tools/seg/pencil-hand.mjs` for pencil). [tools/seg/README.md](../tools/seg/README.md) has the commands.
- A block-in study is an image of the whole subject simplified to flat shapes by an image model. It must have the target's proportions.

```sh
node tools/paint-plate.mjs --image path/to/picture.jpg --width 540 --mode fast \
  --drawingfile work/lines/picture --inkrecipe wash \
  --washplan path/to/study.png --out work/my-picture --video 0
```

Open `work/my-picture/painting.png`. Choose a fresh output folder for each run. The painter refuses to run from uncommitted source changes unless you pass `--allowdirty 1`.

The pen or pencil draws the file's lines as they are. Nothing cuts, smooths or re-measures them. The painter reads only the target's line darkness, to set the pen's load (`--inkdarkmatch`, `--inkdarkcap`, `--inkwidthfloor`). With no drawing file the log prints `!!! NO LINE` and no line is drawn. A closing pen needs its own file (`--drawinglast`) or a finish stage (`--stages prepink,finishink`).

`--washplan STUDY.png[:MIN[:glaze]],...` lists the studies, coarse to fine. `MIN` is the least shape in mm² that layer lays. `glaze` makes the layer a few connected dark glazes. Each later study adds only what is darker than the layers before it. `flat:` before the list lays the same studies as plain flat fills; the tests use it. A painting with no study stops. `--drawingonly 1` lays the drawing alone.

The painter decides the rest from the study, by its own rules: the shapes, the mixes, the brush for each shape, wet or dry, charging in and drying ([How it paints](how-it-paints.md)).

The default physical sheet fits the target inside a 6 x 4 in postcard turned to its orientation. `--sheetmm 152.4` fixes the width at 152.4 mm instead. `--width` sets the grid width in cells. The painter does not paint from an enlarged source: a `--width` above the source's width in pixels stops the run, and so does the default 700 on a narrower source. Paint at the source's width or less, or state the enlargement with `--sourcescale` (the most cells for each source pixel, default 1). The paper is cold-press, with a textured surface and physical fibres; `--paper flat` and `--paperphysical 0` turn them off.

An image run writes:

- `painting.jpg` and `painting.png`: the dried sheet
- `painting.mp4` and `f0000.jpg` onward: the animation
- `plan.jpg`: the plan
- `ink.jpg` and `wash.jpg`: the drawing snapshot and its positive difference from the final sheet
- `frames.json` and JSON records of what the brush did
- `target-guard.json` and `cheat-risk.json`: blocked target-pixel reads and the cheat-risk score ([honesty.md](honesty.md))

`examples/output/` holds saved outputs made with release 0.1.0 (painter V096, sim 100).

## One command for a registered subject

`npm run paint` paints a subject by name from the subject list (`SUBJECTS.json`, found through `UNPAINT_SUBJECTS`).
The record gives the source, the sheet, the opening drawing, the three studies and the painter options. Every pinned
input is checked against its sha256 before anything starts. The code is in `tools/paint/`.

```sh
npm run paint -- <subject[,subject...]> plan|paint [--author auto|<model key>[,...]] [--studies locked|author]
                 [--set key=value ...] [--jobs N] [--out <dir>] [--dry-run] [--no-open]
```

`plan` makes the wash plan only, on the CPU, in minutes. `paint` makes the whole painting on the GPU; one painting
asked for by itself refuses to start when `--jobs` GPU paintings (default 2) are already running. Before a run the command prints the subject, source, sheet, drawing,
studies, named forms, author, mode, every setting that differs from its default, the commit and the exact
`paint-plate` command. Every run ends with one labelled picture, `<out>/sheet.jpg` (source, opening drawing, studies,
named forms, wash plan, painting, and the stage strip when painted), and `<out>/run.json`. The painter's own files are
in `<out>/plate/`. Several subjects or authors also make one grid, subjects down and authors across.

```sh
# the wash plan of one picture, to look at before painting
npm run paint -- kasha-watercolor plan

# two pictures painted, one grid at the end
npm run paint -- mittens-closeup,beach paint

# the approved Rosewalk reference (a named variant in tools/paint/variants.json): print the command, start nothing
npm run paint -- h36:approved paint --dry-run
```

Settings for one run are `--set key=value`: `drawing=<stem>`, `width=<cells>`, `sheetmm=<mm>`, `floors=6,4,2` (the
least shape of each study, mm2), `study2.clusters=20` (a wash-plan setting of one study), `masks=<receipt.json>` or
`masks=none`, `heapmb=<MB>`, or any `paint-plate` option by its name (`threads=2`; `outlinemedium=default` leaves an
option of the record out). A run that differs from the record says so in its printed block and on its sheet.

Named forms (a reviewed SAM id map with its receipt) are found in this order: `--set masks=`, then
`<forms folder>/<subject id>/receipt.json`, then none. The forms folder is `UNPAINT_FORMS`, else `named-forms` beside
`SUBJECTS.json`. The receipt must name the subject's source by its sha256. The code planner reads the forms; an author
is shown them.

### A queue of paintings

`all` stands for every registered subject not already named, in the list's order, so `a,b,all` paints `a` and `b`
first and then the rest. `--jobs N` is the number of GPU paintings at once. Paintings started by anyone else on the
machine count against the same places, and a queue waits for a free place instead of refusing. Each run reads the code
state when its turn comes: its sheet and `run.json` carry the commit it painted with, and a checkout that is dirty by
then gets `--allowdirty 1` and says so. A painting that fails, or whose `backend.json` does not say `backend gpu,
fallback false`, is recorded as failed in its cell, and a subject whose pinned inputs are missing is listed as NOT RUN;
the rest of the queue goes on and the command ends with exit 1. Writing a number into `<out>/jobs` changes the places
of a queue that is already running.

```sh
npm run paint -- all paint --jobs 6 --out work/paint/all-r1 --no-open

# source | wash plan | painting, one row a subject, and the table of numbers
node tools/paint/contact.mjs work/paint/all-r1 work/paint/all-r1/contact.jpg --table work/paint/all-r1/table.md

# one subject by several authors: the source and each painting large, stage strips under
node tools/paint/author-sheet.mjs sheet.jpg <run folder of auto> <run folder of a model> ...
```

Measured on the M5 Max (18 cores) on 21 Nov 2026, 25 full-size paintings: none failed and none left the GPU with 4 to
16 at once. One picture took 21 minutes with 4 places and 28 with 8 to 16, so more places still finished more
paintings an hour; but GPU utilisation is already near 90% with three paintings in their GPU phase, and the gain is the
CPU part of each painting (the plan and the stroke geometry) running side by side. With a batch of CPU plans on the
same machine (load average about 50) ten paintings together laid fewer strokes a minute than four had. Use `--jobs 6`
on an otherwise idle machine, and do not run a plan batch beside a paint queue. The default stays 2.

### A model as the author

`--author auto` is the code planner, the control. `--author <key>` asks a model (`tools/paint/authors.json`, else
`bench/models.json`) to write the wash plan as a painting script ([painting-script.md](painting-script.md)); the same
engine paints it. `--author script:FILE.json` paints a kept script. Several authors make a benchmark grid:

```sh
npm run paint -- mittens-closeup,morisot-face plan --author auto,opus,astra,argon,neon
```

The model gets the brief `tools/paint/AUTHOR-BRIEF.md` with the run's sheet, kit and paints written in, and the
source, the opening drawing, the three studies and the named forms as pictures with a millimetre grid. It is called
once, read-only (`claude --allowedTools Read`, `codex exec -s read-only`, `agy --mode plan --sandbox`), in a temporary
folder that holds only those pictures. Its answer is checked against the script format, the sheet and the paint box.
A refused answer, or a script the painter cannot plan, goes back to the model once with the reason. After that the
failure is the result: it is written in that cell of the grid and in `run.json`, and the other cells are unaffected.
Each call's prompt, answer, time, tokens and cost (where the command reports them) are kept in `<out>/author/`. The
target guard stays in gentle mode.

`--studies author` (open tools) lets a model brief its own block-in studies before it writes: it answers with up to
three briefs, the local image model (Qwen Image Edit through mflux, `tools/paint/assisted-studies.py`) makes them one
at a time, and they take the place of the registered studies of those roles in what the author sees. It needs the
local route (the driver, the `one-model` launcher, the mflux python, the model and its Lightning LoRA in the Hugging
Face cache) and refuses with the missing pieces named when one is absent. A study run needs most of this machine's
memory for several minutes.

## Main command-line controls

Flags use `--name value`. The last repeated flag wins. The default recipe (`src/paint/recipe.mjs`) puts its flags first, and flags you type win.

| Flag | Values | Default |
|---|---|---|
| `--image` | target image path | required |
| `--drawingfile` | line-file stem: `STEM-lines.json` or `.json.gz` | none: no line |
| `--drawinglast` | line-file stem for the closing pen | none |
| `--washplan` | `STUDY.png[:MIN[:glaze]],...` | required unless `--drawingonly 1` |
| `--drawingonly` | `0`, `1`: lay the drawing alone | `0` |
| `--inkrecipe` | `none`, `wash` (pen and wash), `v2` | `none` |
| `--drawing` | `first`, `last`, `both`, `none` | `first` |
| `--outlinemedium` | `graphite`, `ink`, `auto` | `graphite` |
| `--inkprofile` | `sepia-ink`, `black-ink` | sepia |
| `--inkdarkmatch`, `--inkdarkcap`, `--inkwidthfloor` | the pen's load from the target's line darkness; the thinnest line in target pixels | off |
| `--paints` | box keys, comma separated | the painter's own pick |
| `--out` | output directory | `work/plate` |
| `--width` | grid width in cells, at most the source's width in pixels | 700 |
| `--sourcescale` | the most cells for each source pixel | 1 |
| `--sheetmm` | physical width in mm | postcard fit |
| `--seed` | integer | 0 |
| `--mode` | `fast`, `full` | `fast` |
| `--gpu` | `auto`, `on`, `off` | `auto` |
| `--runcache` | `0`, `1`: reuse matching preparation | `1` |
| `--video` | `0`, `1` | `1` |
| `--marks` | `0`, `1`: write the full stroke tape | `1` |
| `--canarystop` | a pass number N: save `canary-pass-N.png` after pass N and stop | `0` |
| `--notargetlooks` | `0`, `1`: no look at the target after planning | `0` |
| `--valueplan` | JSON path; see [plan-format.md](plan-format.md#value-plan-file) | none |

`fast` approximates the final part of ordinary drying; `full` keeps the full drying schedule. They need not give the same pixels. There is no complete reference for every flag; each module's header comment documents the flags it reads ([techniques.md](techniques.md)). A removed option stops the run with its reason (`src/paint/removed-options.mjs`).

Use `--gpu on` when a GPU is required. Check the adapter in `backend.json`: the word `gpu` alone does not exclude a software adapter such as llvmpipe. [Cloud rendering](CLOUD.md#cpu-or-gpu) covers NVIDIA and Vulkan setup.

## Agent skills

The [painting-planner](../.agents/skills/painting-planner/SKILL.md) and [watercolor-technique](../.agents/skills/watercolor-technique/SKILL.md) skills live in `.agents/skills/`. Claude Code reads the same files through the `.claude/skills` symlink.

## Tests

```sh
npm test
```

CI runs the Node suite and `npm run bench:test`. Both fail on any test failure.

One test is skipped for a known defect: the study plan's charged-in wet washes fail the wet-bed check on 64 to 96 cell test sheets (`src/paint/study-wet-bed.test.mjs`).

## Paint Lab

Paint Lab is the browser version of the paper, brushes, pen and pencil. It is a static page in [demos/lab/](../demos/lab/), live at <https://sabj.github.io/unpainting/demos/lab/>. Serve `demos/` with any static server:

```sh
python3 -m http.server 8000 --directory demos
# Open the server address printed in the terminal.
```

The picker offers blank paper, technique demonstrations and recorded paintings. Live mode replays a stroke tape recorded by the current pipeline, the Tiepolo camel, in the simulator, and Carry on painting keeps that sheet. No image upload is offered. `?example=<id>` opens an example. `?physics=cpu` or `?nowebgpu=1` uses the CPU sheet instead of WebGPU.

Paint Lab paints with the painter's own paper, sheet, brush, pen and pencil: `node tools/lab/sync-site-media.mjs` copies them from `src/media/` into `demos/lab/media/`. Run it after changing `src/media/`; `npm test` fails while the copy is stale. [demos/lab/README.md](../demos/lab/README.md) says how the tape is rebuilt.

## Unused-code checks

Run `npx knip` from the repository root. The configuration includes the benchmark commands copied into temporary worktrees.

Paint Lab copies `src/media` through `tools/lab/sync-site-media.mjs`. The source `permeability` export is used by the browser GPU sheet through that copy. Generated `cpu-stroke-dirty.js` keeps the source exports for synchronization. The generated sheet's optional `sheet-par.mjs` import is Node-only; Paint Lab does not enable CPU threads. `ffmpeg` and `codex` are external executables, not npm dependencies.

## Removed in 0.4

Release 0.4 deleted these methods. A command line or plan that names one of their options stops with the reason. `git show COMMIT:FILE` shows the last version.

- Touch-up rounds (`--touchpoints`) and final darks (`--finaldarks`): last at commit 49447027.
- Thin darks, surface and coat marks and final-light gouache: last at commit 49447027.
- The texture pass (`--texture`) and fur marks (`--fur`): last at commit 49447027.
- The painter's own line extraction (`--linesource`, `--linework`, copy-lines, the line models, the graphite pool, finish hatching): last at commit 49447027.
- The light-to-dark value plan, its style profiles (`styleSelection`) and the squinted-subject wash plan: last at commit 49447027.
- The pen-and-wash recipe (`--penwash`, `--recipe penwash`): last at commit 49447027.
- The area plan (`--areaplan`, `--areaplanonly`, `--areahelp`, `--finishareaplan`, `--areastop`, semantic calibration, `--majorintent` and its checkpoints): last at commit ad4a1e3e.
- The numeric ladder (`--order` with its `ladder` and `legacy-painter` orders, mixes, puddles, first washes `--firstwash` and `--firstfloor`, figure values, curls, `--modulate`, `--bgfirst`, technique inference from the source): last at commit ad4a1e3e.
- Holding a line file to the subject (`--linesupport`, `--linesmooth`, `--linemeasure`, `--inkdecide` and the region-label ink decision, `--inkjoin`, `--inkeconomy`): last at commit 8ce5518a.
- The pen walker that traced the subject (`--penfrom`, `--inktiers`, the `--outline` faint pass, `--penoutline`, `--joingap`, `--dumpgestures`, the fine pen pass): last at commit 8ce5518a.
- The stroke budget (`--strokebudget`) and the 250 and 2,500 stroke Paint Lab paintings: last at commit cabee29f.
- The V4 and V5 benchmark tasks and the bench's area-plan route (`--planform area`): tag v0.3.2 replays them.
