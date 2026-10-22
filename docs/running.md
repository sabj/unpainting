# Running the painter

You need [Node.js](https://nodejs.org/en/download) 25 or later; check with `node --version`. Install ffmpeg with your package manager to write the animation, or pass `--video 0` to paint without it. The painter uses WebGPU when an adapter is available and falls back to the CPU otherwise. Install the dependencies in the repository root with `npm ci`.

## Examples

Each image example needs an empty output folder. On a repeat run, move the previous folder aside or pass a fresh `--out`.

| Command | Input |
|---|---|
| `npm run example` / `npm run quick-start` / `npm run example:plan` | the stroke plan `examples/plans/graded-wash.json` |
| `npm run example:drawing` | Tiepolo, Punchinello's Children Begging for Sweets, 360 px |
| `npm run example:portrait` | Sargent, A Tramp, 360 px |
| `npm run example:animal` | Tiepolo, Punchinello Riding a Camel, 360 px |
| `npm run example:architecture` | Trumbull College, 360 px |

The image planner is experimental. The stroke plan is the small, reproducible demonstration of brushwork and drying. The paintings in the README come from separate whole-painting plans; see [Painting sequences](examples.md).

The default recipe, a preset of painter settings, opens with a light pencil drawing and has no closing pen. If the target is a pen drawing, `--inkrecipe auto` swaps in the pen-and-wash recipe ([Ink](ink.md#pen-and-wash-ink)). `--outlinemedium ink|graphite|auto` sets the medium; `auto` picks ink when the target shows its own pen line (0.5% of cells or more, `--penfirst`). `--drawing first|last|both|none|detect` sets the order.

Line models extract candidate lines. The trained line models in `tools/seg/` are optional: without them the painter finds lines with its own ink separator and line tracer ([ink.md](ink.md#where-the-lines-come-from)). The plan chooses whether and how to draw them. A value plan, which describes regions and painting styles, has a `drawing` section that sets the medium, ink colour, amount, line set, weight and closing lines ([plan-format.md](plan-format.md#value-plans-the-drawing-section)), and a flag on the command line still overrides it.

The default physical sheet fits the target inside a 6 x 4 in postcard turned to its orientation. Width and height follow the target's proportions within that box. `--sheetmm 152.4` explicitly fixes the width at 152.4 mm instead. `--width` sets the planning grid width in cells, the simulation grid squares. A larger export does not change the physical paper size. The paper is cold-press, with a textured surface and physical fibers by default; `--paper flat` and `--paperphysical 0` turn them off.

The image examples write to ignored `work/<name>/` folders:

- `painting.jpg` and `painting.png`: the dried sheet
- `painting.mp4` and `f0000.jpg` onward: the animation
- `plan.jpg`: the plan
- `ink.jpg` and `wash.jpg`: the drawing snapshot and its positive difference from the final sheet; with `--drawing both`, closing ink remains in `wash.jpg` ([ink.md](ink.md))
- `frames.json` and JSON records of what the brush did
- `target-guard.json` and `cheat-risk.json`: the record of blocked target-pixel reads and the cheat-risk score ([honesty.md](honesty.md))

The stroke-plan example writes `result.png` and `run.json` to `work/plan-graded-wash/`, with no animation. To choose its output folder:

```sh
node tools/run-plan.mjs examples/plans/graded-wash.json --out work/plan-graded-wash
```

`npm run example`, `npm run quick-start` and `npm run example:plan` paint the same plan:

```sh
node tools/run-plan.mjs examples/plans/graded-wash.json
```

It uses five paths: one clean-water preparation and four paint strokes in one connected wet wash, followed by drying. It checks the paper before each command and writes no animation; ffmpeg is not needed.

## Your own image

Use a JPEG or PNG as the target:

```sh
node tools/paint-plate.mjs --image path/to/picture.jpg --width 540 \
  --mode fast --out work/my-picture --video 0
```

Open `work/my-picture/painting.png`. Choose a fresh output folder for each run. To save an animation too, install ffmpeg and remove `--video 0`.

The painter runs its default recipe unless told otherwise: light-to-dark value planning with shaped marks, a pencil drawing first, and two passes of touch-up glazes on physical cold-press paper. `--recipe none` paints with the settings used without a preset. A value plan (`--valueplan`) names the subject and its regions; Trumbull's is `examples/plans/trumbull-values.json`. The default uses no setting fitted to one benchmark image. A plan opts into fitted settings with `"presets"`, for example `["architecture"]`; Trumbull's plan names `architecture`, `glaze-gains` and `trumbull`, which also picks its fixed palette of seven paints. `--recipe default+architecture` does the same from the command line. `--recipe v096` is painter V096's recipe, which runs the fitted settings on every subject. A plan selecting `ink-and-wash` uses a lean fitted palette, source-toned paper and nested value washes. [Tuned settings](techniques.md#tuned-settings) lists every preset and fitted item.

`tools/paint-plate.mjs` has many experimental flags documented in the modules that read them. `--areahelp` prints only the area-plan contract. The main controls are listed below. Try `--width 240` for a quick run. `examples/output/` holds saved outputs from the examples, made with an earlier painter than V100, which paints them differently.

## Main command-line controls

Flags use `--name value`. The last repeated flag wins. Recipe flags come first, value-plan drawing flags next, and explicit command-line flags last. `--recipe none` removes recipe flags but still applies the plan's drawing section. An area plan with no named recipe also uses bare defaults.

| Flag | Values | Bare default | Default recipe |
|---|---|---|---|
| `--image` | target image path | required | required |
| `--out` | output directory | `work/plate` | same |
| `--width` | planning width in cells | 700 | same |
| `--mode` | `fast`, `full` | `fast` | same |
| `--recipe` | `default`, `v096`, `person`, `none`, each optionally followed by `+<preset>` | omitted selects `default` | `default` |
| `--order` | `painter` (light-to-dark shapes), `ladder` (successive value layers), `legacy-painter` (region-by-region order) | `painter` (value planner) | same |
| `--valueplan` | JSON path; see [plan-format.md](plan-format.md#value-plan-input) | none | none |
| `--areaplan` | JSON path; `--areahelp` prints its contract | none | none |
| `--drawing` | `first`, `last`, `both`, `none`, `detect` | `first` | `first`; `--recipe v096` uses `both` |
| `--outlinemedium` | `auto`, `ink`, `graphite`, or a material profile name | `graphite` | same; plan may override |
| `--inkprofile` | `sepia-ink`, `black-ink` | style ink or sepia | same; plan may override |
| `--inkk`, `--inkkscale` | three positive comma-separated absorption values; scale factor | profile absorption; scale 1 | same; plan may override |
| `--sheetmm` | physical width in mm | 152.4; physical brushes fit to postcard if omitted | postcard fit if omitted |
| `--physical` | `0`, `1` | `0` | `1` |
| `--gpu` | `auto`, `on`, `off` | `auto` | same |
| `--gpustrokes` | `0`, `check`; omit for normal GPU dispatch | normal dispatch | same; see [CLOUD.md](CLOUD.md#cpu-or-gpu) |
| `--video` | `0`, `1` | `1` | same |
| `--frames` | target wash frame count | 40 | 8 |
| `--marks` | `0`, `1` | `0` | `1` |
| `--canarystop` | `0`, or a planned pass number N: save `canary-pass-N.png` and `canary.json` after pass N and stop before `painting.png` | `0` | same |
| `--notargetlooks` | `0`, `1`: paint with the charges frozen at planning and no painting-time reference look ([plan-format.md](plan-format.md)) | `0` | same |
| `--washinkfile` | line-file base: the target's own ink removed from wash demand under `--washinkfree 1`, when the pen draws a different (cleaner) file | the `--drawingfile` | same |
| `--paintguard` | dE00 threshold; `0` is off. It checks a box forced with `--paints` or `washes.paints`. A box this much worse than the painter's own pick is changed as `--paintguardmode` says. `run-card.json` records the decision | `0` | same |
| `--paintguardmode` | `add` (add the own pick's paints; merge if that cannot close the gap), `merge` (the own pick plus the forced paints that still fit), `replace` (the own pick) | `add` | same |
| `--paintguardmax` | most paints after `add` or `merge` | `8` | same |
| `--techcal` | `0`, `1`: charge each technique in the dark bands for what the sheet showed it lays | `0` | same |
| `--techcalfrom`, `--techcalmax`, `--techcalmin` | first value band calibrated; factor clamp | `4`, `2.5`, `0.8` | same |
| `--deliveryreport` | `0`, `1`: write `delivery-by-band.json`, pigment delivered over booked by booked amount | `0` | same |

`fast` approximates the final part of ordinary drying; `full` keeps the full drying schedule. They need not produce the same pixels. [techniques.md](techniques.md) lists the other recipe flags and off switches. There is no complete reference for every experimental flag. Unknown recipe names add no recipe flags.

Source-line extraction is an explicit choice (`--linesource auto` or `source-ink`), and final darks need `--finaldarks 1`. Without a prepared drawing or these options, the bounded drawing path runs.

## Agent skills

The [painting-planner](../.agents/skills/painting-planner/SKILL.md) and [watercolor-technique](../.agents/skills/watercolor-technique/SKILL.md) skills live in `.agents/skills/`. Read both before planning a painting. Claude Code reads the same files through the `.claude/skills` symlink.

## Tests

```sh
npm test
```

CI runs the Node suite and `npm run bench:test`. Both fail on any test failure.

## Paint Lab

Paint Lab is the browser version of the paper, brushes, pen and pencil. It is a static page in [demos/lab/](../demos/lab/), live at <https://sabj.github.io/unpainting/demos/lab/>. Serve `demos/` with any static server:

```sh
python3 -m http.server 8000 --directory demos
# Open the server address printed in the terminal.
```

Paint Lab opens with recorded paintings that replay stroke by stroke; `demos/lab/examples/recorded.json` lists them. Loading your own picture makes a quick sketch with the browser planner in `demos/lab/targets/targets.js`, and you can keep painting on that sheet. Your picture is never uploaded. `?example=<id>` opens an example. `?nowebgpu=1` forces the CPU fallback.

Paint Lab paints with the painter's own paper, sheet, brush, pen and pencil: `node tools/lab/sync-site-media.mjs` copies them from `src/media/` into `demos/lab/media/`. Run it after changing `src/media/`; `npm test` fails while the copy is stale.

## Unused-code checks

Run `npx knip` from the repository root. The configuration includes benchmark commands copied into temporary worktrees: `bench/v4v5/paint.mjs`, `bench/v4v5/tools/*.mjs`, and `bench/scripts/pipeline/dry-planner.mjs`.

Paint Lab copies `src/media` through `tools/lab/sync-site-media.mjs`. The source `permeability` export is used by the browser GPU sheet through that copy. Generated `cpu-stroke-dirty.js` keeps the source exports for synchronization. The generated sheet's optional `sheet-par.mjs` import is Node-only; Paint Lab does not enable CPU threads. `ffmpeg` and `codex` are external executables, not npm dependencies.

### Complete stroke-budget studies

`--strokebudget 250` (or `2500`) plans a complete picture within that many
physical brush, pen and graphite strokes, including clean-water brush marks.
The default is `0` (off).
Budgets must be integers of at least 25. Use `--marks 1 --video 0` to save the
full material tape and stage frames without encoding a movie.

The planner reduces drawing share and value layers, keeps the colour channels
of each selected passage together, and covers passages with fewer, broader
lanes. Optional touch-ups and edge-softening marks yield to that budget.
It does not stop an ordinary painting after its first N marks. Small passages
and exhausted drawing candidates can finish slightly below the requested limit.
`stroke-budget.json` records the actual counts; exceeding the limit fails the run.

Paint Lab's complete study tapes retain native resolution, physical paper,
pigments, full-precision geometry, flow timing and drying/fixing. The final
checkpoint includes trailing drying and mask removal. Rebuild with
`tools/lab/build-live-examples.mjs` (four run directories) followed by
`tools/lab/build-live-checkpoints.mjs`. `tools/lab/compare-live.mjs RUN OUT`
compares the shared Live executor to the painter's `painting.png` in RGB units
from 0 to 255, writing numerical results and a side-by-side PNG.
