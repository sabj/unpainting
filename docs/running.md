# Running the painter

Requires [Node.js](https://nodejs.org/en/download) 25 or later (`node --version`). Run `npm ci` in the repository root. Install `ffmpeg` for MP4 animations (or pass `--video 0`), and Python 3 for drawing tracing, SAM segmentation and scoring. The painter uses WebGPU when an adapter is available and falls back to the CPU when `--gpu auto` is set.

## Examples

Each run needs an empty `--out` folder.

| Command | Input |
|---|---|
| `npm run quick-start` / `npm run example` / `npm run example:plan` | Stroke plan `examples/plans/graded-wash.json` (writes `work/plan-graded-wash/result.png` and `run.json`, no `ffmpeg` needed) |
| `npm run example:animal` | Tiepolo, *Punchinello Riding a Camel*: drawing `examples/drawings/tiepolo-punchinello-camel`, study `examples/studies/tiepolo-punchinello-camel-study.png`, `--inkrecipe wash` |
| `npm run example:portrait` | Sargent, *A Tramp*: study `examples/studies/sargent-a-tramp-study.png`, `--drawing none` |

To run a stroke plan directly into a chosen folder:

```sh
node tools/run-plan.mjs examples/plans/graded-wash.json --out work/plan-graded-wash
```

`examples/output/` holds saved outputs from release 0.1.0 (painter V096, sim 100), and `docs/img/example-trumbull.webp`, `docs/img/example-luce.webp` and `docs/img/wipe-white-ships.webp` show recorded 0.1.0 stage sequences. Model paintings and stage strips are in the [benchmark gallery](../bench/results/gallery.md).

## Painting your own image

A painting takes three inputs: the target image, a prepared drawing file and one or more block-in studies.

- **Drawing file**: an image model makes a clean line drawing of the subject; `tools/seg/trace-drawing.py` traces it and `tools/seg/order-strokes.mjs` orders the strokes as a hand draws them (`tools/seg/pencil-hand.mjs` for pencil). See [tools/seg/README.md](../tools/seg/README.md).
- **Block-in studies**: flat-shape simplifications of the subject at the target's proportions, coarse to fine.

```sh
node tools/paint-plate.mjs --image path/to/picture.jpg --width 540 --mode fast \
  --drawingfile work/lines/picture --inkrecipe wash \
  --washplan path/to/study.png --out work/my-picture --video 0
```

The painter refuses uncommitted source changes unless `--allowdirty 1` is passed.

- **Lines**: the pen or pencil draws the file's lines as they are. Before painting, the painter reads only the target's line darkness to set the pen's load (`--inkdarkmatch`, `--inkdarkcap`, `--inkwidthfloor`). Without `--drawingfile` it logs `!!! NO LINE` and draws no line. A closing pen needs `--drawinglast` or `--stages prepink,finishink`.
- **Studies**: `--washplan STUDY.png[:MIN[:glaze]],...` lists studies from coarse to fine. `MIN` is the smallest shape in mm² that layer lays; `glaze` makes the layer a few connected dark glazes. Each later study adds only what is darker than earlier layers. Prefixing with `flat:` lays plain flat fills for tests. `--drawingonly 1` lays the drawing alone.
- **Sheet and scale**: by default the sheet fits a 6 × 4 in postcard (`--sheetmm 152.4` sets a custom width in mm; `--width` sets grid width in cells). The painter refuses `--width` above the source image's pixel width (including the default 700 on a narrower source) unless `--sourcescale` states the allowed enlargement. Cold-press paper relief is on by default (`--paper flat --paperphysical 0` turns it off).

Outputs in `--out`:

- `painting.png` and `painting.jpg`: the dried sheet
- `painting.mp4` and `f0000.jpg` onward: animation frames and `frames.json`
- `plan.jpg`, `ink.jpg`, `wash.jpg`: wash plan, drawing snapshot and wash difference
- `target-guard.json` and `cheat-risk.json`: guard and copy-risk records ([honesty.md](honesty.md))

## Registered subjects (`npm run paint`)

`npm run paint` (code in `tools/paint/`) runs subjects registered in `SUBJECTS.json` (located via `UNPAINT_SUBJECTS`), checking every pinned input's SHA-256 before starting. Named forms come from `--set masks=`, `<UNPAINT_FORMS>/<subject>/receipt.json`, or `named-forms/<subject>/receipt.json` beside `SUBJECTS.json`.

```sh
npm run paint -- <subject[,subject...]> plan|paint|prepare|look|preflight [--author auto|<model key>[,...]]
                 [--studies locked|author] [--work session|reply] [--level L2|L3|L4] [--retries N] [--try N]
                 [--previous <dir>] [--looks U] [--steps N] [--wallminutes N] [--from <dir>]
                 [--set key=value ...] [--jobs N] [--out <dir>] [--dry-run] [--no-open]
```

- `plan`: builds the wash plan on the CPU.
- `paint`: renders the full painting on the GPU (`backend: "gpu", fallback: false` required). Writes `<out>/run.json`, `<out>/plate/` and, for a full-size painting, `<out>/sheet.jpg`.
- `prepare`: builds the subject's prepared inputs once (Auto plan, traced study shapes, unit look) before model sessions run.
- `look`: renders one half-size look of a kept choice (`--author choice:<folder>`), optionally with `--until N` or `--region`.
- `preflight`: runs a two-minute check that each `--author` model can open an image, run `./unpaint plan` and write a file in the sandbox.
- `--set key=value`: overrides a setting for one run (`drawing=<stem>`, `width=<cells>`, `sheetmm=<mm>`, `floors=6,4,2`, `study2.clusters=20`, `masks=<receipt>|none`, `heapmb=<MB>`, or any `paint-plate` flag).
- `--jobs N`: concurrent GPU paintings (default 2; up to 6 on an idle machine). `all` expands to every registered subject; write a new number to `<out>/jobs` to resize a running queue. Summarize a batch with `node tools/paint/contact.mjs` or `node tools/paint/author-sheet.mjs`.

Subjects registered under the 0.4 one-area rule paint on a quarter sheet (27.9 × 38.1 cm at 0.26 mm a cell) in the picture's proportions (`node tools/paint/sheet-rule.mjs` lists sizes).

The painter's files are in `<out>/plate/`. Every run writes `<out>/run.json`. `<out>/sheet.jpg` (source, opening drawing, studies, named forms, wash plan, painting, stage strip) is written for a full-size painting and every Auto run only; a look, and a model's plan alone, write none. Several subjects or authors also make one grid, subjects down and authors across.

### Model authors

`--author auto` (default) runs the code planner alone. `--author <key>` names a model from `tools/paint/authors.json` or `bench/models.json`. `--author choice:FOLDER`, `script:FILE.json` or `edit:FILE.json` replays a kept submission without calling a model (pass `--lines standard` or `--lines FILE.json` when a kept script or edit lies outside a session folder).

**Working session** (`--work session`, default; `tools/paint/session.mjs`):

- The model gets an isolated folder outside the repository and a sandboxed shell (`sandbox-exec` seatbelt profile on macOS; no repository or home-directory reads except the CLI's own binary and login credentials; network gated by `tools/paint/session-net.mjs` to the provider's hosts only; a fixed Python toolbox with numpy, pillow, scipy, scikit-image and opencv).
- The folder holds `inputs/` (gridded source, opening drawing, three studies, named forms picture and ID map), `drawing/lines.json`, `TASK.md` (from `tools/paint/SESSION-BRIEF.md`), `README.md` (from `tools/paint/SESSION-README.md`), `own-script-brief.md` (from `tools/paint/AUTHOR-BRIEF.md`), `choice.json` and `./unpaint`.
- At every level (L2, L3, L4) the model hands in its own painting script (`choice.json` naming `script.json`, plus optional `"medium"`, `"ink"` and `"lines"`). Auto's plan, planner and settings are never handed over or accepted. L3 and L4 take `--previous <run-dir>`; L4 also adds `resources/shapes.json` (traced study shapes, offered and possibly wrong).
- `./unpaint plan` checks compilation and counts for free. `./unpaint look` paints a half-size preview on the GPU and writes `looks/N/beside.png`, `stages.png`, `numbers.txt`, `plan.json` and `plan.png`.
- Budget per try: `--looks 3` look units (0.3 half-size whole look, 1.0 full-size, partial `--until` or `--region` look its share, floor 0.2; final render free). Runaway guards: water steps > 10× Auto, `--steps 1000` tool calls, `--reverts 20` returns to an earlier choice, and `--wallminutes 360` wall-clock stop.
- A finished session's full-size final waits up to 6 hours for a GPU slot (`tools/paint/final-wait.mjs`), retries up to 3 times on worker failure, and on timeout exits 4 with the `--from` command to paint the kept session later.

**One reply** (`--work reply`): calls the model once read-only with `tools/paint/AUTHOR-BRIEF.md` and the gridded inputs (plus one retry if the JSON or plan check fails). `--studies author` (with `--work reply` only) lets the model brief up to three custom studies for the local Qwen-Image-Edit model (`tools/paint/assisted-studies.py`) before writing its script.

## Main `paint-plate.mjs` flags

Flags use `--name value`; the last repeated flag wins over the default recipe (`src/paint/recipe.mjs`). Options removed in 0.4 stop the run with the reason (`src/paint/removed-options.mjs`).

| Flag | Values | Default |
|---|---|---|
| `--image` | target image path | required |
| `--drawingfile` | line-file stem (`STEM-lines.json` or `.json.gz`) | none |
| `--drawinglast` | line-file stem for closing pen | none |
| `--washplan` | `STUDY.png[:MIN[:glaze]][@name=value][@name#FORM=value],...` or `script:SCRIPT.json` | required unless `--drawingonly 1` |
| `--drawingonly` | `0`, `1` | `0` |
| `--inkrecipe` | `none`, `wash`, `v2` | `none` |
| `--drawing` | `first`, `last`, `both`, `none` | `first` |
| `--outlinemedium` | `graphite`, `ink`, `auto` | `graphite` |
| `--inkprofile` | `sepia-ink`, `black-ink` | `sepia-ink` |
| `--inkdarkmatch`, `--inkdarkcap`, `--inkwidthfloor` | match or cap pen load from target line darkness; minimum width in target px | off |
| `--paints` | comma-separated box keys (`src/crop/box.mjs`) | auto-picked |
| `--out` | output folder | `work/plate` |
| `--width` | grid width in cells (at most source width × `--sourcescale`) | `700` |
| `--sourcescale` | maximum cells per source pixel | `1` |
| `--sheetmm` | physical sheet width in mm | postcard fit |
| `--seed` | integer | `0` |
| `--mode` | `fast`, `full` | `fast` |
| `--gpu` | `auto`, `on`, `off` | `auto` |
| `--runcache` | `0`, `1` | `1` |
| `--video` | `0`, `1` | `1` |
| `--marks` | `0`, `1` (write full stroke tape) | `1` |
| `--canarystop` | stop after pass N and save `canary-pass-N.png` | `0` |
| `--notargetlooks` | `0`, `1` (no target reads after planning) | `0` |
| `--valueplan` | value plan JSON path ([plan-format.md](plan-format.md#value-plan-file)) | none |

## Versions

Every run records `release` (`package.json`), `painterVersion` (`V107-dev`), `simVersion` (`105`), `judgeVersion` ([src/painter-version.mjs](../src/painter-version.mjs)) and the git `commit` in `frames.json`, `backend.json` and `run.json`. Benchmark result tables group runs by painter, simulator and judge version so different versions never share a mean.

## Skills and tests

Agent skills live in [`.agents/skills/painting-planner/SKILL.md`](../.agents/skills/painting-planner/SKILL.md) and [`.agents/skills/watercolor-technique/SKILL.md`](../.agents/skills/watercolor-technique/SKILL.md) (symlinked at `.claude/skills`).

```sh
npm run doctor        # verify clean git state, Python envs, SAM checkpoint and disk space
npm test              # unit and integration tests across src/ and tools/
npm run bench:test    # benchmark record and scorer tests
npx knip              # unused-code check
```

## Paint Lab

Paint Lab ([demos/lab/](../demos/lab/), live at <https://sabj.github.io/unpainting/demos/lab/>) runs the simulator's paper, brushes, pen and pencil in the browser. Serve `demos/` locally:

```sh
python3 -m http.server 8000 --directory demos
```

Use `?example=<id>` to open a preset, or `?physics=cpu` / `?nowebgpu=1` for the CPU sheet. After editing `src/media/`, sync the browser copy with `node tools/lab/sync-site-media.mjs` (`npm test` checks that the copy is current).

## Cloud rendering

`UNPAINT_RENDER=pool` dispatches a session's looks and final render to the render pool (`tools/paint/render-pool.mjs`, `tools/cloud/render-pool-pods.py`). For standalone batch jobs on rented RunPod GPUs:

```sh
export RUNPOD_API_KEY=...   # or set in .env (mode 600); also supports UNPAINTING_ENV_FILE, UNPAINTING_SSH_KEY, RUNPOD_IMAGE
python3 tools/cloud/render-batch.py TREE JOBS --pods 1 --per-pod 4 --hard-limit 40 --input <path>
```

WebGPU on Linux/RunPod requires an NVIDIA Vulkan driver (`libegl1`, `libgl1`, `libvulkan1` and an NVIDIA ICD JSON in `/etc/vulkan/icd.d/` or `/usr/share/vulkan/icd.d/`). Check with `vulkaninfo --summary`, run with `DAWN_FLAGS=backend=vulkan --gpu on`, and verify the hardware adapter in `backend.json` (software adapters such as `llvmpipe` do not count as GPU runs).
