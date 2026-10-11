# Ink toolbox coverage

Recorded for collapse. “Unit” is a code-level check, not a successful painting. No visual benefit is claimed for unrendered tools. Paths abbreviated under `src/paint/` in the guide retain that convention here.

| Tool | Where / access | Exercised in this task |
|---|---|---|
| Pencil preparation | `drawing.stages.prep`; `drawing-stages.mjs`, `paint-plate.mjs: drawPrepStage` | GPU: held-out France and Trumbull; three h36-a stage checks. Unit: drawing-stages, pencil-stage, material-profiles. |
| Prep ink linked to pencil | `stages.prepInk.from: prep`, keep/add/deviate; `drawing-stages.mjs` | GPU: h36-a linked check. Unit: linked stages keep/add/drop and deviations. |
| Sparse finish ink | `stages.finishInk`, restate 0..1, select edges/darks/both; `drawing-stages.mjs` | GPU: France, Trumbull, h36-a stage checks. Unit: drawing-stages sparse default and zero share. |
| Opening ink delivery and waterproofing | `drawing.ink.waterproof`; `draw.mjs`, `pen.mjs`, `paint-plate.mjs` | GPU: h36-a and Guardi. Unit: material-profiles reservoir, concentration and width checks. |
| Source-ink copying with observed widths | `drawing.source: source-ink`; `tools/seg/copy-lines.py`, `linework-plan.mjs` | Main h36-a and Guardi; six Python copier tests. |
| Photo sketch | `drawing.source: photo-sketch`; `tools/seg/sketch-lines.py`, optional `sketch-map.py` | Held-out France and Trumbull; ten Python sketch tests. Classical evidence, no downloaded learned model. |
| Structure lines | `drawing.source: structure-lines`; `tools/seg/structure-lines.py`, `structure/` | Sixteen Python structure tests. Not selected by Sonnet for the six paintings. |
| Structure plus detail | `drawing.source: structure-combine`; `tools/seg/structure-combine.py` | Python structure suite includes combination tests. Not rendered in this task. |
| Map smoothing | `drawing.source: line-map`, map, mapSmoothing; `copy-lines.py` | Python copier map tests. Not rendered from a learned map in this task. |
| Graphite start, ink finish | prep plus finishInk.from prep; `drawing-stages.mjs` | Held-out France and Trumbull; h36-a pressure A/B. The old trumbull-values-graphite.json artifact was not located, so its reported 0.33% to 0.93% result is not claimed as reproduced. |
| Contour and connected gestures | prepInk.method contour/connected; `drawing-rank.mjs`, `drawing-logic.mjs` | Contour stage GPU checks; drawing-logic unit suite. Connected method not selected for a main render. |
| Scribble and lit-edge breaks | prepInk.method scribble or finishInk.masses scribble; `drawing-scribble.mjs`, `drawing-file.mjs` | Unit drawing-plan and drawing-logic coverage. No hair or fur subject in the rendered six; not visually validated here. |
| Architecture closing pen | finishInk.method architecture; `drawing-stages.mjs`, `drawing-plan.mjs` | Held-out Trumbull; drawing-plan flag checks. No post-holdout tuning. |
| Pencil from declared values | prep.weight; `paint-plate.mjs: drawPrepStage` | GPU stage checks and held-outs; no target drawing keyframe used. |
| Staged growth and prep fade | prep.frames, prep.fade; `pencil-stage.mjs` | GPU stage snapshots; pencil-stage unit suite; prep keep mask compiled before seal. |
| Flow-line hatching | finishInk.hatch `{bounds,budget,spacing,minDensity}`; `crop/hatch.mjs`, `finish-texture.mjs` | Pipeline unit: bounded paths and light gaps. Not GPU-rendered or judged here. |
| Fur locks and light gaps | finishInk.fur `{bounds,budget,spacing,minDensity,reserveBelow}`; `finish-texture.mjs` | Pipeline unit: bounded oriented paths and light gaps. Generic recovery, not the fitted q-route result; not GPU-rendered here. |
| Fur light reserves | `washes.furReserves: {bounds,reach,drop,dark,maxDensity,minCells}`; `finish-texture.mjs: furLightReserves` | Pipeline unit: grouped local highlights retained, singleton glints rejected. Not rendered here. |
| Fine ink sheet | drawing.resolution 2; `methods/ink-res.mjs`, `fine-material.mjs` | Final-commit GPU drawing-only at 2x; unit: physical measured width, dry gate, pigment transfer. Not scored as a main painting. |
| Dip-pen physics | `media/pen.mjs`, `draw.mjs` | Full Node suite and GPU physical pen audits. |
| Dry pencil physics | `media/pencil.mjs`, `methods/pencil-line.mjs` | Full Node suite and GPU prep snapshots. |
| Ink fidelity diagnostics | `tools/ink-judge.mjs`, `src/eval/ink.mjs`, `linequality.mjs`, `tools/judge/line-study.py`, `tools/judge/ink-wash-consistency.mjs` | Post-render diagnostics on all main arms and stage checks; three Python line-fidelity tests. Historical line-study runner ported, not run on its unavailable historical study layout. |
| Ridge walker | `src/media/draw.mjs`, drawing source none | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Line-length budget | `draw.mjs`, `--inkbudget` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Ink gate | `draw.mjs`, `--inkgate` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Ink tiers | `src/crop/inktiers.mjs`, `--inktiers` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Ink filter | `src/crop/inkfilter.mjs`, `--inkfilter` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Segment outlines and ground lines | `methods/seg-ink.mjs`, `--segink` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Learned line evidence | `methods/ml-lines.mjs`, `tools/seg/lines.py`, `--mllines`; prepared maps through `drawing.source: line-map` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Authored line selection | `methods/drawing-file.mjs`, `tools/seg/select-drawing.py`, `--drawingfile` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Per-segment model extraction | `tools/seg/drawing/` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Fitted revision-4 map rules | Historical `paint/tools/seg/drawing-from-maps.py` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Region ranking | `drawing.lines: regions`, `drawing-plan.mjs` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Form versus tone split | `methods/drawing-logic.mjs`, `--drawinglogic 1` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Hand order and taper | `methods/drawing-hand.mjs` through drawing logic | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Hybrid walker | `methods/drawing-hybrid.mjs`, prepInk.method connected | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Pencil erase / prep fade | `methods/pencil-stage.mjs`, `--pencilerase`, prep.fade | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Dark-mass budget | `methods/mass-budget.mjs`, `--massbudget` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Region exclusions | `--inkoffbox`, `--inkoffoutline`, `--inkofffoliage`, `--inkofftrees`, `--inkskin`, `--penface`, `--facedetail` in `paint-plate.mjs` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Opening and closing caps | `methods/material-profiles.mjs`, drawing.amount/maxLines/weight/closingLines | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Graphite outlines | `--penoutline`, `paint-plate.mjs` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Photo versus artwork declaration | Separate prepared drawing file and `src/paint/styles/` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Practice style proportions | `methods/practice-style.mjs`, `tuned/style-cuts.mjs`, `--practice` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Reload and dip cadence | `media/draw.mjs`, `media/pen.mjs` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Pressure, speed and dwell | `media/draw.mjs`, prepared point weights/widths | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Lit-edge taper | `methods/drawing-scribble.mjs`, scribble | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Simplify, chains and pen blur | `--pensimplify`, `--penfrom chains`, `--penblur` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Separate soluble ink | `--inkcolour sep`, drawing.ink | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Damp-sheet ink | `media/pen.mjs` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Glaze-aware pen colour | `--penwant glaze`, `paint-plate.mjs` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Ink/wash separation | `src/crop/inkwash.mjs`, `wash-ink-free.mjs` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Closing cleanup | Historical `--closeclean` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Curls and dark-mass curls | `techniques/dark-mass.mjs`, `--darkmasscurls` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Dog scribble route | `methods/dog-scribble.mjs`; generic finishInk.masses scribble | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Fur flicks and dry brush | `src/crop/fur.mjs`, `src/media/brush.mjs`; legacy `--fur` path | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Target-keyframe tracing and timing | Historical stage-trace and `--timeline target` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Ruled 60-degree hatch | Historical rejected drawing variant | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Original fitted mass-lock brush route | Historical V072 `experimental/mass-locks.mjs` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Ink measure and legibility | `src/eval/ink.mjs`, `linequality.mjs`, `tools/ink-judge.mjs` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Stage, length and pen-box audit | `tools/judge/line-study.py`, stage snapshots, `pen-state-audit.json` | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
| Ink lab and house demo | Historical paint repository `tools/ink-lab.mjs` and house demos | Not separately exercised in this task. Retained legacy tool or historical evidence; see guide for availability and limits. |
