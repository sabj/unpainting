# Preparing a picture

What a picture needs before the painter or a model can work from it, and the scripts that make them. The inputs the benchmark ships are checked against checksums in `bench/inputs-manifest.json`. Nothing here needs a credential, and each script stops with a plain message when a setting is missing.

## What a prepared picture is

| Input | Made by | Depends on sheet size |
|---|---|---|
| source picture `studio/img/ID.jpg` | you (the museum's file, trimmed of its mount) | no |
| line classification `classify/ID.json` | `tools/seg/classify-medium.py` | no |
| three colour studies at three seeds `studies/ID-study-{s3,s1,s4}L8[-s7,-s11].png` | the image model, `studies.sh` | no |
| pencil lay-in at three seeds; for pen-and-wash, the ink line | the image model, `studies.sh` | no |
| chosen lay-in and ink line, cleaned: `guides/ID-layin.png`, `guides/ID-inkprep.png` | `choose_layin.py` | no |
| study seed | `pick.py`, `seedchoice.py`: one automatic rule, never by hand | no |
| thing labels `labels/ID.json` | a local vision model, `labels.py` | no |
| named forms `named-forms/ID/` | `named_forms.py` (labels' boxes, SAM ViT-B) | no |
| drawing as vector strokes `replay/vectors/ID-std-*-{lines,vectors}.json` | `vectors.sh`, then `tools/seg/tag-medium.py` | yes: fitted in mm of the sheet |
| record in `SUBJECTS.json` | `register.py`: every file pinned by sha256, each generated file with its prompt, seed, steps and machine | yes |

## Settings

| Variable | What |
|---|---|
| `UNPAINT_PREP` | the preparation folder (required): `SUBJECTS.json`, `studio/img`, `studies`, `guides`, `replay/vectors`, `labels`, `named-forms`, `classify`, `segaudit` |
| `UNPAINT_SUBJECTS` | the subject list the painter reads; set to `$UNPAINT_PREP/SUBJECTS.json` |
| `UNPAINT_PREP_PYTHON` | Python with numpy, pillow, scipy, scikit-image, opencv (default: `.venv-seg`) |
| `UNPAINT_STUDY_PYTHON`, `UNPAINT_STUDY_LORA` | Python with `mflux`, and the Lightning 8-step LoRA file |
| `PAINTER_SAM_CHECKPOINT` | `sam_vit_b_01ec64.pth` |
| `UNPAINT_LABEL_MODEL`, `UNPAINT_LABEL_URL` | label model on Ollama (default `qwen3.8:27b-mlx` at `http://127.0.0.1:11434`) |
| `SUBJECTS_JSON` | another file for `register.py` to write: a trial, never the list in use |

The image model is Qwen-Image-Edit 2511, 8-bit MLX (`mlx-community/qwen-image-edit-2511-8bit`, run by `mflux`) with the Lightning 8-step LoRA (`lightx2v/Qwen-Image-Edit-2511-Lightning`, `Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors`): 8 steps, guidance 1, seeds 42, 7 and 11; 36 GB on disk, 54 GB of memory, one job at a time (`studies.sh` holds a lock). The five prompts are in `prompts/`. The same seed on another machine or build gives the same kind of study, not the same pixels; the manifest's checksums say which files the results were painted from. Studies made before 23 Nov 2026 used a rented GPU and the bf16 model; each file's record in the subject list says which.

## A new picture

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

Then on the painting machine (a GPU): `npm run paint -- ID-qs prepare --level L4` and `npm run paint -- ID-qs paint --author auto --set video=1 --set frames=240`.

## The fifteen pictures

Each needs step 6, since none was registered under the sheet rule, then the prepared folder and the Auto painting made again at the release tag. `node tools/paint/run-sets.mjs check extended` must print `ready` fifteen times. First, once: `python3 tools/prepare/register.py --repin-only -qs`.

- Studies, seed, lay-in and forms exist: `rule.sh ID` for mittens-closeup (the rule gives it its old sheet; nothing fitted), manet-morisot-fan-crop, homer-water-fan, turner-esseillon, sargent-tyrol (lay-in fitted and tagged again) and tiepolo-bacchus (the artist's line fitted again as ink).
- guardi: `rule.sh guardi` fits and tags, then stops. The collector's mark and the mount's number were removed by hand from the earlier fit; remove them again (boxes in `inputs.drawingVectors.removed` of the earlier record, in mm of the old sheet: multiply by 266.5 / 254.02), then `register.py --repin-only guardi-qs`.
- h36 (Rosewalk), kasha-portrait: `rule.sh ID` fits and tags, then stops. The earlier drawing is a third version (`-std-ink-v3`) whose maker is not in these scripts; make the same version at the new sheet, then repin. Kasha portrait is the one picture painted enlarged under the rule (896 px across on 1,084 cells, 1.21 times).
- prout-laundresses: `studies.sh` (3 of 9 studies existed; also makes the e6 ink line), `finish.sh`, `rule.sh`. ender-mountain-valley: `studies.sh` (4 of 9 existed), `finish.sh` (pencil by hand), `rule.sh`.
- white-ships-1488, morisot-avenue-du-bois, cezanne-bathers-bridge, bonington-french-town: `studies.sh ID` (none existed), `finish.sh ID` (Cezanne: pencil by hand), `rule.sh ID`.

Level 1 needs, for each of the five core pictures, its level 1 target on the same sheet (`npm run bench:add-target`, named in `bench/run-sets.json` "levelOne"). When all fifteen are ready: `node tools/prepare/manifest.mjs write extended --out bench/inputs-manifest.json`, committed with the tag.

## Checking a copy

`node tools/prepare/manifest.mjs verify bench/inputs-manifest.json --root <folder>` reads every file and prints one line for each that is missing or differs; exit 1 if any. The manifest also holds each picture's sheet, its study seed and why, and each generated file's prompt, seed and steps.

## Does not reproduce exactly

The image model gives the same kind of picture, not the same bytes, on another machine. `tools/seg/order-strokes.mjs`, `ink-vectors.py` and `tag-medium.py` changed after the drawings on disk were fitted (the 21 Nov 2026 versions are in tag `archive/20261121/claude/033-main`). The labels are one reply of a local vision model; the named forms added on 23 Nov were not reviewed by eye. The subject list holds the older pictures' classes as they were (`--freeze-classes`). `finish.sh`'s ink step and `rule.sh` were checked for everything that does not run a model or write the preparation folder; their first full run is still to come.
