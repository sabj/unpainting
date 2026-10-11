# Choosing linework

The planner chooses the marks for the job. A drawing can combine three stages
from one prepared line set: **prep** places the hard geometry in light pencil;
**prepInk** follows it in pen; **finishInk** selectively restates edges after the
washes. Omit any stage that has no job. Inspect the executed opening drawing
before spending time on washes.

## The universal linework stage

`--linework auto` (plan `"drawing": { "linework": "auto" }`) runs one linework stage that every style uses, before
the first mark and before the target guard seals the target (`src/paint/methods/linework-stage.mjs`). It writes an
ordinary drawing file and points the pens at it, so linked stages, the pen-and-wash prune and both pens read it as
they read any prepared drawing. Its record is `linework-stage.json` in the run folder.

1. Source, first that holds. A target the separator reads as at least 2.5% pen line is a pen source and tries its own
   lines first.
   - Its own lines (`copy-lines.py` at the plan grid): for a pen source they lose only specks, shadow outlines and
     near repeats.
   - An image model's pen sketch from `--sketchcache` (made beforehand by `tools/seg/sketch-target.mjs`, one fixed
     prompt, keyed by the target's SHA-256). It is used only if it passes the geometry check
     (`sketch-check.mjs`): registered to the target's own edges, a line with no matching edge within 2.5 mm is
     invented and dropped, kept lines are snapped onto their edges, and the whole sketch falls back when under 55%
     of its ink matches, over 30% is invented or it covers under half of the strongest edges.
   - The sketch planner (`sketch-lines.py`), else the JavaScript trace when python lacks NumPy and OpenCV.
2. Cleanup (`line-cleanup.mjs`): specks; lines that only trace a shadow or value step (the two sides differ in
   lightness while every channel scales alike; long straight lines stay); the structure filter on a photograph's
   trace; repeated small marks pruned into a rhythm, lit areas losing most (`pen-wash-lines.mjs`).
3. Gate (`line-gate.mjs`), per image: built structure (two or more vanishing points carrying 12% of the long edges,
   `tools/seg/perspective.py`) or a checked sketch is drawn in ink; a soft subject gets a light graphite
   construction; too little line after cleanup draws nothing. `--linemedium ink|graphite|none`, a plan's
   `drawing.medium` or `--outlinemedium` fixes the medium instead.
4. Styles keep their own use of the lines: pen and wash draws them dominant with its economy prune, Combined draws
   them under its value plan's caps.

Python with NumPy and OpenCV (`--sketchpython`) runs the copier, the sketch planner and the perspective measure.
Which skeleton thinning it has (OpenCV contrib, scikit-image or NumPy) changes the traced paths; the stage records it.

| Job | Tool | What to inspect |
|---|---|---|
| Copy an existing pen drawing or ink-led sketch | `copy-lines.py`, then a prepared drawing file | Short marks, curved contours and measured widths survive. Inspect the extracted ink mask: dark wash texture can masquerade as ink. |
| Draw architecture from a photo | `sketch-lines.py` with a learned map | Recognizable silhouette, openings and structural junctions; avoid turning every stone or leaf into ink. |
| Preserve a prepared photo line map | `copy-lines.py --kind line-map` | Connected pale model strokes survive; confidence corridors get restrained pen widths. This reads declared model confidence, never raw photo brightness. Inspect dark clusters. |
| Establish perspective, arches and repeated openings | `structure-lines.py` | Correct vanishing directions and repeated units. Reject unsupported regularity. |
| Add facade description to a sparse scaffold | `structure-combine.py` with the photo sketch | Uncovered frames, mouldings and ornaments; no double tracing along the scaffold. |
| Place difficult proportions | `prep` pencil, then linked `prepInk` | Most pen lies over pencil; some construction stays visible. Use less pencil for simple silhouettes. |
| Restate a few softened edges after washes | `finishInk` with `accent`; `architecture` for whole frames and sills | Selective reinforcement, not a second complete drawing. |
| Dark hair or curly coats | Existing `scribble` method, only when the subject calls for it | Open lit edges and form-following marks. Dark surface value is still a paint job. Not evaluated by this architectural study. |

For existing artwork, start with pen only. A prepared drawing is already a
selection: the default linked pen now keeps it whole, with its coordinates and
widths. Do not add artificial wobble to a master's marks. For a photograph,
select structure and detail before execution; a photo has no true ink layer.
`drawing.source: "source-ink"` uses the observed-width copier when NumPy/OpenCV are available, with a logged narrow-ridge fallback otherwise. `photo-sketch` uses the structural sketch planner; `auto` uses measured
narrow-dark-line share as a heuristic. Review its decision because masonry and
foliage can also produce that signal. An explicit prepared file wins.

For a declared photo map, `--map-tolerance .75` is a tested optional smoothing
choice on h36: it reduces tiny contour kinks while retaining every path. The
1.5-cell experiment made tracery angular without resolving its tangled loops.
Keep the .25 default for observed ink; map smoothing does not select which
architectural marks deserve ink, and this comparison covers only one photo.

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

This measured recipe preserves short ink accents while pencil places the longer
structures. It improved the optional pencil variants on h36-a and Guardi; it
does not make pencil necessary when a source already supplies placement.
Use `from: "prep"` with explicit `keep` and `add` when selecting and interpreting
the pencil drawing is the intended job. That selection can omit short ink marks.
After washes, a selective finish stage can use
`{"from":"prepInk","select":"both","restate":0.2}`; its appearance was not
evaluated in these opening-drawing rounds.

The pencil share is measured by path length; keep/add and finish restatement are
shares of path counts. Prep ink from the pencil makes small bounded deviations;
prep ink directly from the line set keeps its geometry. Zero shares mean zero
marks. Keep finish ink out of a drawing-only comparison: its job can be assessed
only after the washes it is meant to clarify.

Use waterproof black ink for an opening drawing that must survive washes.
Soluble sepia is useful when a brown ink drawing should soften. The flexible
`drawing-ink` nib spans hairlines and emphatic outlines and preserves prepared
point widths. Fine lines require enough native cells; upscaling an export does
not recover them.

Judge the executed sheet at 100%, alongside the source, extraction mask and
public-domain references. Fidelity measures transfer of a frozen line estimate;
consistency measures agreement with a frozen wash estimate. Neither certifies
artist-quality selection. Record the commit, native size, seed, plan source,
preparation, settings and actual guard report on every comparison.

See [plan format](plan-format.md#stages) for the schema. The original measured
opening-drawing study remains on the local `line-quality` branch under
`work/lines/LINEWORK.md`; it is separate from full-pipeline release validation.

## Dry drawing measurements

`tools/judge/drawing-stats.py` measures reference scans and executed drawing
checkpoints with the same analysis settings. It needs NumPy and OpenCV:

```sh
python tools/judge/drawing-stats.py reference.jpg drawing-opening.png --out stats.jsonl
python tools/judge/drawing-stats-test.py
```

The tool normalizes the long edge to 1000 pixels. It reports path fragments per
area, width and length distributions, open endpoints, line density by local
value, a corner extension estimate, and optical tone versus width. Millimetres
refer to a common 152.4 mm display width, not the reference's original sheet.
Use `--sheetmm` to change that display size. Retain original images and hashes
outside Git so the study can be repeated.

These are raster proxies. Crossings split paths, scans can include wash or paper
texture, local darkness does not identify a semantic shadow, and neither actual
pressure nor directional graphite sheen can be inferred from a scan. The corner
estimate is particularly ambiguous and must not gate acceptance. Inspect the
whole drawing and native crops beside real references, then check landmarks
against the target. Fewer fragments or closer median statistics do not justify
invented windows, rigging or lost anatomy.

Graphite is a dry material. The HB and 2B profiles vary pressure, tone and tooth;
the optional `graphite-2B-side` profile also allows broad contact up to 2 mm.
Freeze contours and coarse shadow gestures before painting with
`graphite-plan.py`. Keep grain out of the path extraction. Its dry smudge is a
small neighboring-cell deposit, and its sheen is a bounded flat-view cue rather
than directional reflection. The side profile is experimental: inspect broad
tone coverage and the cat or face landmarks before adding washes. An unlimited
line budget alone cannot make a poor contour plan into a good drawing.
