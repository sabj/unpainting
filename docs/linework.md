# Choosing linework

The planner chooses the marks for the job. A drawing can combine three stages from one prepared line set:

- `prep` places the hard geometry in light pencil.
- `prepInk` follows it in pen.
- `finishInk` restates chosen edges after the washes.

Omit any stage that has no job. Inspect the executed opening drawing before spending time on washes.

## The universal linework stage

`--linework auto` (plan `"drawing": { "linework": "auto" }`) runs one linework stage that every style uses. It runs
before the first mark and before the target guard seals the target (`src/paint/methods/linework-stage.mjs`). It writes
an ordinary drawing file and points the pens at it. Linked stages, the pen-and-wash prune and both pens then read it as
they read any prepared drawing. Its record is `linework-stage.json` in the run folder.

1. Source, the first that holds. A target the separator reads as at least 2.5% pen line is a pen source and tries its
   own lines first.
   - Its own lines (`copy-lines.py` at the plan grid). For a pen source they lose only specks, shadow outlines and
     near repeats.
   - An image model's pen sketch from `--sketchcache`. `tools/seg/sketch-target.mjs` makes it beforehand with one
     fixed prompt, keyed by the target's SHA-256. It is used only if it passes the geometry check (`sketch-check.mjs`).
     The check registers the sketch to the target's own edges. A line with no matching edge within 2.5 mm is invented
     and dropped, and kept lines are snapped onto their edges. The whole sketch falls back when under 55% of its ink
     matches, over 30% is invented, or it covers under half of the strongest edges.
   - The sketch planner (`sketch-lines.py`), else the JavaScript trace when python lacks NumPy and OpenCV.
2. Cleanup (`line-cleanup.mjs`) removes specks and lines that only trace a shadow or value step. Such a line has two
   sides that differ in lightness while every channel scales alike; long straight lines stay. A photograph's trace
   also passes the structure filter. Repeated small marks are pruned into a rhythm, lit areas losing most
   (`pen-wash-lines.mjs`).
3. Gate (`line-gate.mjs`), per image. Built structure is drawn in ink: two or more vanishing points carrying 12% of
   the long edges (`tools/seg/perspective.py`). A checked sketch is also drawn in ink. A soft subject gets a light
   graphite construction. Too little line after cleanup draws nothing. `--linemedium ink|graphite|none`, a plan's
   `drawing.medium` or `--outlinemedium` fixes the medium instead.
4. Styles keep their own use of the lines. Pen and wash draws them dominant with its economy prune. Combined draws
   them under its value plan's caps.

Python with NumPy and OpenCV runs the copier, the sketch planner and the perspective measure. The painter picks
`--sketchpython`, else `PAINTER_LINES_PYTHON`, else `$PAINTER_LINES_VENV/bin/python`, else the repo's
`.venv-lines/bin/python`, else `python3`. `tools/cloud/setup-lines.sh` installs `.venv-lines` by default. The skeleton
thinning it has (OpenCV contrib, scikit-image or NumPy) changes the traced paths, so the stage records it.

| Job | Tool | What to inspect |
|---|---|---|
| Copy an existing pen drawing or ink-led sketch | `copy-lines.py`, then a prepared drawing file | Short marks, curved contours and measured widths survive. Inspect the extracted ink mask: dark wash texture can look like ink. |
| Draw architecture from a photo | `sketch-lines.py` with a learned map | Recognizable silhouette, openings and structural junctions. Avoid turning every stone or leaf into ink. |
| Preserve a prepared photo line map | `copy-lines.py --kind line-map` | Connected pale model strokes survive, and confidence corridors get restrained pen widths. This reads declared model confidence, never raw photo brightness. Inspect dark clusters. |
| Establish perspective, arches and repeated openings | `structure-lines.py` | Correct vanishing directions and repeated units. Reject unsupported regularity. |
| Add facade description to a sparse scaffold | `structure-combine.py` with the photo sketch | Uncovered frames, mouldings and ornaments, with no double tracing along the scaffold. |
| Place difficult proportions | `prep` pencil, then linked `prepInk` | Most pen lies over pencil, and some construction stays visible. Use less pencil for simple silhouettes. |
| Restate a few softened edges after washes | `finishInk` with `accent`; `architecture` for whole frames and sills | Selective reinforcement, not a second complete drawing. |
| Dark hair or curly coats | `scribble` method, only when the subject calls for it | Open lit edges and form-following marks. Dark surface value is still a paint job. |

For existing artwork, start with pen only. A prepared drawing is already a selection. The default linked pen keeps it
whole, with its coordinates and widths. Do not add artificial wobble to a master's marks. For a photograph, select
structure and detail before execution, because a photo has no true ink layer.

`drawing.source: "source-ink"` uses the observed-width copier when NumPy and OpenCV are available. Otherwise it logs a
narrow-ridge fallback. `photo-sketch` uses the structural sketch planner. `auto` uses the measured share of narrow dark
lines as a heuristic. Review its decision, because masonry and foliage can also produce that signal. An explicit
prepared file wins.

For a declared photo map, `--map-tolerance .75` is optional smoothing. It reduces tiny contour kinks and keeps every
path. Keep the .25 default for observed ink. Map smoothing does not select which architectural marks deserve ink.

A pen-only plan:

```json
{"drawing":{"stages":{"prepInk":true}}}
```

A sparse placement drawing under the complete prepared ink set:

```json
{"drawing":{"stages":{
  "prep":{"amount":0.35},
  "prepInk":{"from":"lines","amount":1,"deviate":0}
}}}
```

This recipe keeps short ink accents while pencil places the longer structures. Pencil is not needed when a source
already supplies placement. Use `from: "prep"` with explicit `keep` and `add` when the job is to select and interpret
the pencil drawing. That selection can omit short ink marks. After washes, a selective finish stage can use
`{"from":"prepInk","select":"both","restate":0.2}`.

The pencil share is measured by path length. Keep, add and finish restatement are shares of path counts. Prep ink from
the pencil makes small bounded deviations. Prep ink taken directly from the line set keeps its geometry. Zero shares
mean zero marks. Keep finish ink out of a drawing-only comparison, because its job shows only after the washes.

Use waterproof black ink for an opening drawing that must survive washes. Soluble sepia suits a brown ink drawing that
should soften. The flexible `drawing-ink` nib spans hairlines and emphatic outlines, and keeps prepared point widths.
Fine lines need enough native cells; upscaling an export does not recover them.

Judge the executed sheet at 100%, beside the source, the extraction mask and public-domain references. Fidelity
measures transfer of a frozen line estimate. Consistency measures agreement with a frozen wash estimate. Neither
certifies artist-quality selection. Record the commit, native size, seed, plan source, preparation, settings and guard
report on every comparison.

See [plan format](plan-format.md#stages) for the schema.

## Dry drawing measurements

`tools/judge/drawing-stats.py` measures reference scans and executed drawing checkpoints with the same analysis
settings. It needs NumPy and OpenCV:

```sh
python tools/judge/drawing-stats.py reference.jpg drawing-opening.png --out stats.jsonl
python tools/judge/drawing-stats-test.py
```

The tool scales the long edge to 1000 pixels. It reports:

- path fragments per area, and width and length distributions
- open endpoints and line density by local value
- a corner extension estimate, and optical tone against width

Millimetres refer to a common 152.4 mm display width, not the reference's original sheet. Use `--sheetmm` to change
that display size. Keep original images and their hashes outside Git so a measurement can be repeated.

These are raster proxies. Crossings split paths, and scans can include wash or paper texture. Local darkness does not
identify a semantic shadow. A scan shows neither actual pressure nor directional graphite sheen. The corner estimate
is ambiguous and must not gate acceptance. Inspect the whole drawing and native crops beside real references, then
check landmarks against the target. Fewer fragments or closer median statistics do not justify invented windows,
rigging or lost anatomy.

Graphite is a dry material: the HB and 2B profiles vary pressure, tone and width on the paper's tooth.

## Hand handling and pen dynamics

Gaps, tapers and width offsets are nominal at 1080 cells on a 152.4 mm sheet. They keep their physical size at other
densities.

- `--drawinghand 1` draws a prepared file as a hand would, without changing its selection. It is off by default.
  - Facing continuations are joined within one role, kind, object and region (`--drawjoingap 4`, `--drawjoincos .8`,
    `--drawjoinaim .7`).
  - Strokes are ordered from the last pen lift, and each presses in and lifts off (`--drawtaperin 3`,
    `--drawtaperout 5`, `--drawtaperstart .45`, `--drawtaperend .3`).
  - `--drawlit .04` to `.10` also breaks a contour where both its sides are light (`--drawlitreach 2`).
- `--penstarve 1` lets a gesture run down to its own refill threshold, for an intended dry tail.
- `--finishinkdamp 1` lets the closing pen draw on the paper's existing moisture; it adds no water. A finish line
  placed before the sheet dries can then feather.
- `--penreservoir` sets the nib's capacity: 250 in model units before cell scaling.
- A pen with no ink always dips first. Speed, pause, dip and refill controls on a gesture survive the conversion to
  the sheet. A finer ink sheet (`--inkres`) scales speed as it scales width, so a pause lasts as long.
- `--drawinglogic 2` keeps the walker's longest monotone visit to each contour instead of out-and-back knots. Its
  width-to-pressure inversion uses the declared nib's width range and pressure exponent. `--hybridland 1.2`,
  `--hybridlift .6` and `--hybriddwell .5` set its pauses.
- `tools/judge/drawing-audit.mjs RUN ... --out audit.jsonl` summarizes a run's pen audit: contact widths, pressure,
  speed, pauses, reservoir and paper state.
- `--materialstudy 1 --width 1080 --out DIR` renders dry and damp, speed, pressure, starvation, graphite and brush
  swatches on a fixed 152.4 mm sheet.

The audit and the material swatches are diagnostics, not a quality gate.
