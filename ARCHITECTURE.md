# Unpainting Architecture

Unpainting renders watercolour, ink and graphite paintings by simulating paper fibres, surface and pore water transport, pigment settling, and Kubelka-Munk optical compositing.

## Pipeline Stages

| Stage | Primary Modules | Key Flags | Outputs |
|---|---|---|---|
| Environment & Code Check | `src/paint/doctor.mjs`, `src/paint/code-state.mjs`, `tools/doctor.mjs` | `--allowdirty` | `code-state.json` |
| Prep & Segmentation | `src/crop/segment-prep.mjs`, `src/crop/segments.mjs`, `tools/seg/segments.py`, `tools/seg/sam_regions.py` | `--segments`, `--segpython`, `--samcheckpoint`, `--segcache` | `segments.json`, cached SAM region maps |
| Line Extraction & Registration | `src/paint/methods/line-python.mjs`, `src/paint/methods/linework-stage.mjs`, `src/paint/methods/drawing-registration.mjs`, `src/crop/lines.mjs` | `--linework`, `--linesource`, `--drawingfile`, `--sketchpython`, `--linejoin` | `linework.json`, registered line files |
| Palette & Value Planning | `src/paint/recipe.mjs`, `src/paint/plan-keys.mjs`, `src/paint/methods/light-to-dark.mjs`, `src/paint/methods/subject-washes.mjs`, `src/paint/techniques/passage-plan.mjs` | `--valueplan`, `--sheetmm`, `--seed`, `--subjectwash`, `--washplanpng` | `value-plan.json`, `wash-plan.png`, `planned-wash.png` |
| Drawing Execution | `src/paint/methods/drawing-file.mjs`, `src/paint/methods/pencil-stage.mjs`, `src/media/pen.mjs` | `--drawing`, `--outlinemedium`, `--inkprofile`, `--inkres`, `--drawstroke` | `ink.jpg`, `preparation-graphite.jsonl` |
| Wash & Brush Execution | `tools/paint-plate.mjs`, `src/media/brush.mjs`, `src/media/brush-density.mjs`, `src/media/sheet.mjs`, `src/paint/methods/wetdry.mjs` | `--gpu`, `--mode`, `--physical`, `--wetgate` | `painting.png`, `painting.jpg`, `value-commands.jsonl`, `marks.json` |
| Verification & Run Card | `src/paint/run-card.mjs`, `tools/guard/no-target.mjs`, `tools/guard/cheat-risk.mjs`, `tools/stroke-composition.mjs` | `--targetguard`, `--strokegate` | `run-card.json`, `target-guard.json`, `cheat-risk.json`, `backend.json` |
