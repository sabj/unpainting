# Preparing a picture

What a picture needs before Auto or a model can paint it, and the scripts that make it. Each script stops with a plain message when a setting is missing.

| Input | Made by |
|---|---|
| source picture `studio/img/ID.jpg` | you: the museum's file, trimmed of its mount |
| line class `classify/ID.json` (ink, pencil or none) | `tools/seg/classify-medium.py` |
| three colour studies and a pencil lay-in, at three seeds; for pen-and-wash, the ink line | the image model, `studies.sh` |
| the chosen lay-in and ink line, cleaned; the study seed, by one automatic rule | `choose_layin.py`, `pick.py`, `seedchoice.py` |
| thing labels `labels/ID.json` | a local vision model, `labels.py` |
| named forms `named-forms/ID/` | `named_forms.py`: the labels' boxes and SAM |
| the drawing as vector strokes, fitted in millimetres of the sheet | `vectors.sh`, then `tools/seg/tag-medium.py` |
| the record in `SUBJECTS.json`, every file pinned by sha256 | `register.py` |

## Settings

| Variable | What |
|---|---|
| `UNPAINT_PREP` | the preparation folder (required): `SUBJECTS.json` and the folders above |
| `UNPAINT_SUBJECTS` | the subject list the painter reads: `$UNPAINT_PREP/SUBJECTS.json` |
| `UNPAINT_PREP_PYTHON` | Python with numpy, pillow, scipy, scikit-image and opencv (default `.venv-seg`) |
| `UNPAINT_STUDY_PYTHON`, `UNPAINT_STUDY_LORA` | Python with `mflux`, and the Lightning 8-step LoRA file |
| `PAINTER_SAM_CHECKPOINT` | `sam_vit_b_01ec64.pth` |
| `UNPAINT_LABEL_MODEL`, `UNPAINT_LABEL_URL` | local vision model server for thing labels (default `http://127.0.0.1:11434`, configurable for any local model server) |

The image model is Qwen-Image-Edit 2511, 8-bit MLX (`mlx-community/qwen-image-edit-2511-8bit`, run by `mflux`) with the Lightning 8-step LoRA: 8 steps, guidance 1, seeds 42, 7 and 11. It needs 36 GB on disk and 54 GB of memory. The prompts are in `prompts/`. The same seed on another machine gives the same kind of study, not the same pixels.

## On a smaller machine

The studies are made by an open image model, Qwen-Image-Edit 2511. The default set-up uses about 54 GB of memory. These are the ways to use less, or to skip the step.

| Option | What it costs | Tested |
|---|---|---|
| Use the studies of a shipped picture | Nothing. You can only paint the pictures that ship | Yes |
| Make the model smaller by quantizing it. `mflux-generate-qwen-edit --quantize 4` (or `-q 4`) stores it at 4 bits instead of 8 | Uses less memory. Expect softer, less exact studies (`study_model.py` does not pass this option yet) | No |
| Make the working size smaller. The fourth field of a job in `study_model.py` is a scale. Under 1 makes the picture smaller before the model sees it | Uses less memory. Fine lines in the pencil lay-in are lost first | No |

## A new picture

```sh
export UNPAINT_PREP=<the preparation folder> UNPAINT_SUBJECTS=$UNPAINT_PREP/SUBJECTS.json
# 1 copy the true-size file to $UNPAINT_PREP/studio/img/ID.jpg
# 2 measure its line, from the preparation folder
$UNPAINT_PREP_PYTHON <repo>/tools/seg/classify-medium.py studio/img/ID.jpg --id ID --out classify
# 3 the image model's pictures and the labels: about an hour
tools/prepare/studies.sh ID
# 4 add the picture's row to SPEC in tools/prepare/subjects-table.json (name, id, role, source, provenance, note)
#   and its id to RULE_IDS there; for a benchmark picture, also a row in bench/run-sets.json as ID-qs
# 5 everything after the model: lay-in, vectors, study seed, tags, named forms, pins
tools/prepare/finish.sh ID
# 6 the quarter-sheet record ID-qs, with its drawing fitted at that sheet
tools/prepare/rule.sh ID
# 7 is it ready?
node tools/paint/run-sets.mjs check extended
```

Then, on a machine with a GPU, Auto's plan, the traced shapes and Auto's painting, once a commit: `npm run unpaint -- prepare ID-qs --pool local`.

## Checking a copy

`node tools/prepare/manifest.mjs verify bench/inputs-manifest.json --root <folder>` prints one line for each file that is missing or differs. `node tools/prepare/manifest.mjs write extended --out bench/inputs-manifest.json` writes the manifest again.
