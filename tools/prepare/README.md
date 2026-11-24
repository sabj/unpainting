# Preparing a picture

What a picture needs before the painter or a model can work from it, and the scripts that make it. Until 0.4 rc7 these
scripts lived outside the repository; they are here so that anyone can prepare a picture, and so that the inputs the
benchmark ships can be checked against a list of checksums (`bench/inputs-manifest.json`).

Nothing here needs a credential. Nothing here guesses a path: each script stops with a plain message when a setting is
missing.

## What a prepared picture is

| Input | Made by | Depends on the sheet's size |
|---|---|---|
| the source picture, `studio/img/ID.jpg` | you (the museum's file, trimmed of its mount) | no |
| the line classification, `classify/ID.json` | `tools/seg/classify-medium.py` (a measurement) | no |
| three colour studies at three seeds, `studies/ID-study-{s3,s1,s4}L8[-s7,-s11].png` | the image model, `studies.sh` | no |
| the pencil lay-in at three seeds, and for a pen-and-wash picture the ink line | the image model, `studies.sh` | no |
| the chosen lay-in (and ink line), cleaned: `guides/ID-layin.png`, `guides/ID-inkprep.png` | `choose_layin.py` (the drawing-fidelity check) | no |
| the study seed | `pick.py`, `seedchoice.py`: one automatic rule, never by hand | no |
| the thing labels, `labels/ID.json` | a local vision model, `labels.py` | no |
| the named forms, `named-forms/ID/` | `named_forms.py` (the labels' boxes, SAM ViT-B) | no (the source's pixels) |
| the drawing as vector strokes, `replay/vectors/ID-std-*-{lines,vectors}.json` | `vectors.sh`, then `tools/seg/tag-medium.py` | **yes**: fitted in millimetres of the sheet |
| the record in the subject list, `SUBJECTS.json` | `register.py`: every file pinned by its sha256, each generated file with its prompt, seed, steps and machine | **yes**: it holds the sheet |

## Settings

| Variable | What |
|---|---|
| `UNPAINT_PREP` | the preparation folder: it holds `SUBJECTS.json`, `studio/img`, `studies`, `guides`, `replay/vectors`, `labels`, `named-forms`, `classify`, `segaudit`. Required. |
| `UNPAINT_SUBJECTS` | the subject list the painter reads; set it to `$UNPAINT_PREP/SUBJECTS.json` |
| `UNPAINT_PREP_PYTHON` | a Python with numpy, pillow, scipy, scikit-image and opencv (default: the repository's `.venv-seg`) |
| `UNPAINT_STUDY_PYTHON`, `UNPAINT_STUDY_LORA` | the image model: a Python with `mflux`, and the Lightning 8-step LoRA file (below) |
| `PAINTER_SAM_CHECKPOINT` | the SAM ViT-B checkpoint, `sam_vit_b_01ec64.pth` |
| `UNPAINT_LABEL_MODEL`, `UNPAINT_LABEL_URL` | the label model on Ollama (default `qwen3.8:27b-mlx` at `http://127.0.0.1:11434`) |
| `SUBJECTS_JSON` | another file for `register.py` to write: a trial, never the list in use |

### The image model

Qwen-Image-Edit 2511, 8-bit MLX (`mlx-community/qwen-image-edit-2511-8bit`, run by `mflux`), with the Lightning 8-step
LoRA (`lightx2v/Qwen-Image-Edit-2511-Lightning`, file `Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors`),
8 steps, guidance 1, seeds 42, 7 and 11. About 36 GB on disk and 54 GB of memory; one job at a time (`studies.sh` holds
a lock). The five prompts are in `prompts/`. The same seed on another machine or another build of the model gives the
same kind of study, not the same pixels: the checksums in the manifest say which files the results were painted from.
The studies of the older pictures (before 23 Nov 2026) were made on a rented GPU with the bf16 model; each file's
record in the subject list says which.

## A new picture, in order

```
export UNPAINT_PREP=<the preparation folder> UNPAINT_SUBJECTS=$UNPAINT_PREP/SUBJECTS.json
# 1 the source: copy the true-size file to $UNPAINT_PREP/studio/img/ID.jpg
# 2 measure its line (ink, pencil or none); from the preparation folder:
$UNPAINT_PREP_PYTHON <repo>/tools/seg/classify-medium.py studio/img/ID.jpg --id ID --out classify
# 3 the image model's pictures and the labels (about an hour a picture)
tools/prepare/studies.sh ID
# 4 a row for the picture in the table SPEC of tools/prepare/register.py (id, role, source, provenance, the museum's line);
#   for a benchmark picture also its id in RULE_IDS there, and its row in bench/run-sets.json as ID-qs
# 5 everything after the model: lay-in, vectors, study seed, tags, an ink picture's ink line, named forms, pins
tools/prepare/finish.sh ID
# 6 the standard sheet: the record ID-qs, its drawing fitted at that sheet
tools/prepare/rule.sh ID
# 7 is it ready?
node tools/paint/run-sets.mjs check extended
```

Then, on the machine that paints (a GPU): `npm run paint -- ID-qs prepare --level L4` and
`npm run paint -- ID-qs paint --author auto --set video=1 --set frames=240`.

## The fifteen of 0.4: what to run for each, as they stood on 23 Nov 2026

Every one of the fifteen needs step 6 (no picture was registered under the sheet rule), then the prepared folder and the
Auto painting made again at the release tag. `node tools/paint/run-sets.mjs check extended` is the test: it must print
`ready` fifteen times. First, once: `python3 tools/prepare/register.py --repin-only -qs` (the fifteen `-qs` records
appear, their vectors "to fit").

| Picture | Before `rule.sh` | `rule.sh` | After |
|---|---|---|---|
| mittens-closeup | nothing | `rule.sh mittens-closeup`: the rule gives it the sheet it had (1086 cells), nothing is fitted | prepare, Auto |
| manet-morisot-fan-crop, homer-water-fan, turner-esseillon, sargent-tyrol | nothing (studies, seed, lay-in, forms are done) | `rule.sh ID`: the lay-in fitted and tagged again | prepare, Auto |
| tiepolo-bacchus | nothing | `rule.sh tiepolo-bacchus`: the artist's own line fitted again as ink | prepare, Auto |
| guardi | nothing | `rule.sh guardi` fits and tags, then STOPS: the collector's mark and the mount's number were removed from the earlier fit by region, by hand; remove them again (the boxes are in the earlier record, `inputs.drawingVectors.removed`, in mm of the old sheet: multiply by 266.5 / 254.02), then `register.py --repin-only guardi-qs` | prepare, Auto |
| h36 (Rosewalk), kasha-portrait | nothing | `rule.sh ID` fits and tags, then STOPS: the earlier drawing is a third version (`-std-ink-v3`) and what made it is not in these scripts; make the same version at the new sheet, then repin. Kasha portrait is the one picture painted ENLARGED under the rule (896 px across on 1,084 cells, 1.21 times) | prepare, Auto |
| prout-laundresses | `studies.sh prout-laundresses` (3 of 9 studies existed; it also makes the e6 ink line: the classifier says ink), then `finish.sh prout-laundresses`, which now does the ink step | `rule.sh prout-laundresses` | prepare, Auto |
| ender-mountain-valley | `studies.sh` (4 of 9 existed), `finish.sh` (pencil by hand: no ink line) | `rule.sh ender-mountain-valley` | prepare, Auto |
| white-ships-1488, morisot-avenue-du-bois, cezanne-bathers-bridge, bonington-french-town | `studies.sh ID` (none existed), `finish.sh ID` (Cezanne: pencil by hand) | `rule.sh ID` | prepare, Auto |

Level 1 needs, for each of the five core pictures, its level 1 target on the same standard sheet
(`npm run bench:add-target`, named in `bench/run-sets.json` "levelOne").

When all fifteen are ready: `node tools/prepare/manifest.mjs write extended --out bench/inputs-manifest.json` and
commit it with the tag.

## Checking a copy of the inputs

`node tools/prepare/manifest.mjs verify bench/inputs-manifest.json --root <folder>` reads every file and compares it with
the manifest: one line for each file that is missing or differs, exit 1 if any. The manifest also holds each picture's
sheet, its study seed with the reason it was chosen, and each generated file's prompt, seed and steps.

## What is known not to reproduce exactly

- The image model: the same seed gives the same kind of picture, not the same bytes, on another machine.
- Three line tools changed after the drawings on disk were fitted (`tools/seg/order-strokes.mjs`, `ink-vectors.py`,
  `tag-medium.py` differ from the versions of 21 Nov 2026 that made them, kept in the tag `archive/20261121/claude/033-main`).
  A drawing fitted again is fitted with the versions in this repository.
- The labels are one reply of a local vision model; the named forms of the pictures added on 23 Nov were not reviewed
  by eye, those before were.
- The subject list in use was written with the classes of the older pictures held as they were (`--freeze-classes`):
  writing it afresh from the table reads today's classification files, which differ for some of them.
- `finish.sh`'s ink step and `rule.sh` were written for this release from the handover's description and checked for
  everything that does not run a model or write the preparation folder; their first full run is the preparation
  engineer's.
