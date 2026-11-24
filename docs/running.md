# Running the painter

Needs [Node.js](https://nodejs.org/en/download) 25 or later and `npm ci`. Optional: `ffmpeg` for MP4 (or pass `--video 0`); Python 3 for drawing tracing, SAM segmentation and scoring. WebGPU is used when an adapter exists; `--gpu auto` falls back to the CPU.

## Examples

Each run needs an empty `--out` folder.

- `npm run quick-start` (also `example`, `example:plan`): stroke plan `examples/plans/graded-wash.json` into `work/plan-graded-wash/` (`result.png`, `run.json`; no `ffmpeg`).
- `npm run example:animal`: Tiepolo, *Punchinello Riding a Camel*: drawing `examples/drawings/tiepolo-punchinello-camel`, study `examples/studies/tiepolo-punchinello-camel-study.png`, `--inkrecipe wash`.
- `npm run example:portrait`: Sargent, *A Tramp*: study `examples/studies/sargent-a-tramp-study.png`, `--drawing none`.
- `node tools/run-plan.mjs examples/plans/graded-wash.json --out work/plan-graded-wash`: a stroke plan into a folder you choose.

Saved outputs are in `examples/output/`; model paintings and stage strips are in the [benchmark gallery](../bench/results/gallery.md).

## Your own image

A painting takes the target image, a drawing file and one or more block-in studies. An image model makes a clean line drawing; `tools/seg/trace-drawing.py` traces it and `tools/seg/order-strokes.mjs` orders the strokes ([tools/seg/README.md](../tools/seg/README.md)). The studies are flat-shape simplifications at the target's proportions, coarse to fine.

```sh
node tools/paint-plate.mjs --image path/to/picture.jpg --width 540 --mode fast \
  --drawingfile work/lines/picture --inkrecipe wash \
  --washplan path/to/study.png --out work/my-picture --video 0
```

The painter refuses uncommitted source changes unless `--allowdirty 1`.

- Lines: the pen or pencil draws the file's lines as they are. Only the target's line darkness is read, to set the pen's load (`--inkdarkmatch`, `--inkdarkcap`, `--inkwidthfloor`). Without `--drawingfile` it logs `!!! NO LINE` and draws no line. A closing pen needs `--drawinglast` or `--stages prepink,finishink`.
- Studies: `--washplan STUDY.png[:MIN[:glaze]],...`, coarse to fine. `MIN` is the smallest shape in mm² that layer lays; `glaze` makes the layer a few connected dark glazes; each later study adds only what is darker. `flat:` lays plain fills for tests; `--drawingonly 1` lays the drawing alone.
- Sheet: a 6 × 4 in postcard by default; `--sheetmm 152.4` sets a width in mm, `--width` the width in cells. `--width` above the source's pixel width (default 700) is refused unless `--sourcescale` allows it. Cold-press relief is on (`--paper flat --paperphysical 0` turns it off).

Outputs in `--out`: `painting.png` and `painting.jpg`; `painting.mp4`, `f0000.jpg` onward and `frames.json`; `plan.jpg`, `ink.jpg`, `wash.jpg`; `target-guard.json` and `cheat-risk.json` ([honesty.md](honesty.md)).

## Registered subjects (`npm run paint`)

`npm run paint` (`tools/paint/`) runs subjects registered in `SUBJECTS.json` (found through `UNPAINT_SUBJECTS`), checking every pinned input's SHA-256 first. Named forms come from `--set masks=`, `<UNPAINT_FORMS>/<subject>/receipt.json` or `named-forms/<subject>/receipt.json` beside `SUBJECTS.json`.

```sh
npm run paint -- <subject[,subject...]> plan|paint|prepare|look|preflight [--author auto|<model key>[,...]]
                 [--studies locked|author] [--work rounds|session|reply] [--level L2|L3|L4] [--retries N] [--try N]
                 [--previous <dir>] [--looks U] [--steps N] [--wallminutes N] [--from <dir>]
                 [--set key=value ...] [--jobs N] [--out <dir>] [--dry-run] [--open]
```

- `plan`: the wash plan, on the CPU.
- `paint`: the full painting on the GPU (`backend: "gpu", fallback: false`). Writes `<out>/run.json`, `<out>/plate/` and, for a full-size painting or an Auto run, `<out>/sheet.jpg`; a look, and a model's plan alone, write none. Several subjects or authors also make one grid.
- `prepare`: the subject's prepared inputs, once, before model sessions.
- `look`: one half-size look of a kept choice (`--author choice:<folder>`), optionally `--until N` or `--region`.
- `preflight`: a two-minute check that each `--author` model can open an image, run `./unpaint plan` and write a file in the sandbox.
- `--set key=value`: one-run override (`drawing=<stem>`, `width=<cells>`, `sheetmm=<mm>`, `floors=6,4,2`, `study2.clusters=20`, `masks=<receipt>|none`, `heapmb=<MB>`, or any `paint-plate` flag).
- `--jobs N`: concurrent GPU paintings (default 2; up to 6 on an idle machine). `all` is every registered subject. Write a number to `<out>/jobs` to resize a running queue. `tools/paint/contact.mjs` and `tools/paint/author-sheet.mjs` summarize a batch.

Subjects registered under the 0.4 one-area rule paint on a quarter sheet (27.9 × 38.1 cm at 0.26 mm a cell) in the picture's proportions; `node tools/paint/sheet-rule.mjs` lists sizes.

### Model authors

`--author auto` (default) is the code planner alone. `--author <key>` is a model from `tools/paint/authors.json` or `bench/models.json`. `choice:FOLDER`, `script:FILE.json` and `edit:FILE.json` replay a kept submission without calling a model (add `--lines standard` or `--lines FILE.json` when a kept script lies outside a session folder).

Working session (`--work session`, default; `tools/paint/session.mjs`):

- The model gets an isolated folder outside the repository and a sandboxed shell: a `sandbox-exec` profile on macOS, no repository or home reads except the CLI's own binary and login credentials, network gated to the provider's hosts (`tools/paint/session-net.mjs`), a fixed Python toolbox (numpy, pillow, scipy, scikit-image, opencv).
- The folder holds `inputs/` (gridded source, opening drawing, three studies, named forms picture and ID map), `drawing/lines.json`, `TASK.md` (from `tools/paint/SESSION-BRIEF.md`), `README.md` (from `tools/paint/SESSION-README.md`), `own-script-brief.md` (from `tools/paint/AUTHOR-BRIEF.md`), `choice.json` and `./unpaint`.
- At L2, L3 and L4 the model hands in its own painting script (`choice.json` naming `script.json`, plus optional `"medium"`, `"ink"`, `"lines"`). Auto's plan, planner and settings are never handed over or accepted. L3 and L4 take `--previous <run-dir>`; L4 adds `resources/shapes.json`.
- `./unpaint plan` checks compilation and counts for free. `./unpaint look` paints a half-size preview on the GPU and writes `looks/N/beside.png`, `stages.png`, `numbers.txt`, `plan.json`, `plan.png`.
- Budget per try: `--looks 3` units (0.3 half-size whole look, 1.0 full-size, a partial look its share, floor 0.2; final render free). Runaway guards: water steps over 10× Auto's, `--steps 1000`, `--reverts 20`, `--wallminutes 360`.
- A finished session's full-size final waits up to 6 hours for a GPU slot (`tools/paint/final-wait.mjs`), retries up to 3 times on worker failure, and on timeout exits 4 with the `--from` command to paint it later.

One reply (`--work reply`): one read-only call with `tools/paint/AUTHOR-BRIEF.md` and the gridded inputs, plus one retry if the JSON or plan check fails. `--studies author` (with `--work reply`) lets the model brief up to three custom studies for the local Qwen-Image-Edit model (`tools/paint/assisted-studies.py`) before writing its script.

## `paint-plate.mjs` flags

`--name value`; a repeated flag beats the default recipe (`src/paint/recipe.mjs`). Required: `--image`, and `--washplan` (`STUDY.png[:MIN[:glaze]][@name=value][@name#FORM=value],...` or `script:SCRIPT.json`) unless `--drawingonly 1`. Others, with defaults:

- Lines: `--drawingfile STEM`, `--drawinglast STEM` (closing pen), `--drawing first|last|both|none` (`first`), `--outlinemedium graphite|ink|auto` (`graphite`), `--inkrecipe none|wash|v2` (`none`), `--inkprofile sepia-ink|black-ink` (`sepia-ink`).
- Size: `--width` cells (`700`, at most source width × `--sourcescale`), `--sourcescale` (`1`), `--sheetmm` (postcard fit).
- Run: `--out` (`work/plate`), `--seed` (`0`), `--mode fast|full` (`fast`), `--gpu auto|on|off` (`auto`), `--runcache`, `--video`, `--marks` (all `1`), `--recording full|medium|light` (`medium`: native frames only at the film's frames; `full` a frame after every stroke; `light` a film of at most 40 frames), `--canarystop N` (save `canary-pass-N.png` and stop), `--notargetlooks 1` (no target reads after planning), `--paints` box keys (`src/crop/box.mjs`; auto-picked), `--valueplan` ([plan-format.md](plan-format.md#value-plan-file)).

## Versions

Every run records `release` (`package.json`), `painterVersion` (`V107-dev`), `simVersion` (`105`), `judgeVersion` and the git `commit` in `frames.json`, `backend.json` and `run.json` ([src/painter-version.mjs](../src/painter-version.mjs)). Benchmark tables group runs by painter, simulator and judge version, so versions never share a mean.

## Tests

```sh
npm run doctor        # clean git state, Python envs, SAM checkpoint, disk space
npm test              # unit and integration tests
npm run bench:test    # benchmark record and scorer tests
npx knip              # unused code
```

Agent skills: [`.agents/skills/painting-planner/SKILL.md`](../.agents/skills/painting-planner/SKILL.md) and [`.agents/skills/watercolor-technique/SKILL.md`](../.agents/skills/watercolor-technique/SKILL.md).

## Paint Lab

[demos/lab/](../demos/lab/) runs the paper, brushes, pen and pencil in the browser (live at <https://sabj.github.io/unpainting/demos/lab/>). Locally: `python3 -m http.server 8000 --directory demos`. `?example=<id>` opens a preset; `?physics=cpu` or `?nowebgpu=1` uses the CPU sheet. After editing `src/media/`, run `node tools/lab/sync-site-media.mjs` (`npm test` checks the copy).

## Cloud rendering

`UNPAINT_RENDER=pool` sends a session's looks and final render to the render pool (`tools/paint/render-pool.mjs`, `tools/cloud/render-pool-pods.py`). For batch jobs on rented RunPod GPUs:

```sh
export RUNPOD_API_KEY=...   # or .env (mode 600); also UNPAINTING_ENV_FILE, UNPAINTING_SSH_KEY, RUNPOD_IMAGE
python3 tools/cloud/render-batch.py TREE JOBS --pods 1 --per-pod 4 --hard-limit 40 --input <path>
```

WebGPU on Linux needs an NVIDIA Vulkan driver (`libegl1`, `libgl1`, `libvulkan1`, an NVIDIA ICD JSON in `/etc/vulkan/icd.d/` or `/usr/share/vulkan/icd.d/`). Check with `vulkaninfo --summary`, run with `DAWN_FLAGS=backend=vulkan --gpu on`, and confirm the hardware adapter in `backend.json`; a software adapter such as `llvmpipe` is not a GPU run.
