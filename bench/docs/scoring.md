# Scoring

```sh
npm run bench:score04 -- RUN_FOLDER... --out DIR      # or one manifest.json in place of the folders
npm run bench:summary04 -- DIR/results.json --set core|extended
```

`bench:score04` runs `bench/scorer/score04.py` under `BENCH_SCORE_PYTHON` (else `python3`), which needs `bench/scorer/requirements.txt`. It writes `DIR/results.json` and `DIR/SCORES.md` and keeps every judge reply in `DIR/readings/`. `bench:summary04` writes `DIR/SUMMARY.md`.

## Inputs

- A run folder from `npm run paint`, for Auto and for every level. It holds `run.json`, the painting, its video frames (`frames.json`) and `usage.json`.
- Or a manifest. This is a JSON list, or `{"runs": [...]}`, of folders or of `{folder, subject, level, author}`. `npm run unpaint -- score RUN_DIR` writes one for a benchmark run. `{subject, level, author, failed: "why"}` with no folder stands for a scheduled run that left nothing.

A failed run is a row marked FAILED, with its reason. It counts as the lowest score.

Before any judge is called, the scorer refuses a bad input and names it. Bad inputs are a folder that is not a run, a missing original, a missing video, a video with fewer than ten frames after its first wash, or a hosted route without its key. These exit with code 2. Exit code 1 means the results were written, but a judge is missing a reading. That figure is left empty, and a smaller panel never stands in.

## What is scored

- Human-ness is the main score. Does the painting, and its video stopped at any point, look made by a person?
- Quality is how good the painting is as a watercolour, judged alone. The original is judged the same way. A painting's quality is its share of the original's score. If the original scores 9 and the painting 4.5, the quality is 50%. It can go over 100%.
- Combined is two parts human-ness to one part quality (`WEIGHTS` in `bench/scorer/s04_table.py`). Both parts stay visible.
- Likeness has its own column and is not in the combined figure. Is it a painting of its original?
- Adjusted for Auto is (painting - Auto) / max(top - Auto, top / 5), shown beside the raw figure. 0 means level with Auto. It needs exactly one Auto painting of the picture among the inputs.

## Human-ness

The judges see, in order:

1. The video's first frame, the untouched paper. It gives context and is not scored.
2. The drawing frame, the last one before the first wash. It is scored and reported but is not in the figure. It is missing when nothing was drawn first.
3. Ten stills of the painting in progress, from the first wash to nine tenths of the way to the finish. Their average, as a percentage of 5, is the figure.
4. The finished sheet. It is scored and reported but is not in the figure.

The ten stills are spaced at equal steps of progress, not by frame number. A frame's progress is how much of the finished picture is on the sheet, which is 1 - |frame - finished| / |paper - finished| (`bench/scorer/s04_readings.py`). Each still is labelled only with its percentage. The judge never sees the original.

Each judge says whether this is the order and kind of mark a person would use. Then it scores each still from 1 to 5 by the [rubric](human-ness-rubric.md) and names the tells by letter. A tell is a sign that a machine made the painting. The rubric's hash is written into the results. Editing the rubric starts a new series.

## Quality and likeness

Quality: the judge sees one picture alone and scores it from 0 to 10 as a watercolour. It is not told whether this is an original or a painting.

Likeness: the judge sees the original, then the finished painting. It scores from 1 to 5 how well the painting matches the original in subject, composition, light and dark, and colour. A 5 is unmistakably this picture. A 3 has the subject and composition, but the tones or colours plainly differ, or a main part is missing. A 1 is a different picture. An average of 1.5 or less is flagged.

Pictures are shown at 640 px on the long side for human-ness, and 768 px for quality and likeness.

## Judges

- There is one panel, `open3`. It has three models, GLM-5.3-Flash, Qwen3.8-27B and Gemma-4-31B, set to low reasoning (`bench/scorer/s04_judge.py`). `JUDGE_PANEL` names another panel.
- `JUDGE_ROUTE` says where the judges run. `local` is the default and uses Ollama at `JUDGE_LOCAL_URL`, with the model tags in `JUDGE_LOCAL_TAGS`. `openrouter` uses providers that keep no data and needs `OPENROUTER_API_KEY`. `together` needs `TOGETHER_API_KEY`.
- Each judge gives three readings, at temperature 0. A judge's figure is the middle one of its three. The panel's figure is the average of the judges' figures. A judge never sees a painter's name or level.
- A saved reply is reused only if nothing that could change it has changed. `--fresh` reads again. `--repeat N` scores the same paintings again without sharing any reading, so two repeats measure how much the judges' scores wobble.
- Every results file names its panel, route and judge label (`open3-local-3x`). Results with different labels are not compared.

## The summary

`SUMMARY.md` lists every model's levels against Auto, then each model's pictures (`bench/scripts/levels.mjs`).

- A level's score is the average of the combined figure (0 to 100) over the pictures that [run-sets.json](../run-sets.json) schedules at that level. A failed run, or a scheduled picture with no painting, counts as 0 and is listed with the reason.
- The adjustment divides a model's gain over Auto by the room left above Auto, with a minimum of a fifth of the scale. The interval comes from resampling the pictures (a bootstrap).
- L3 against L2, and L4 against L3, are shown for the pictures that both levels painted.
- It stops with a reason instead of a number in four cases. One is when Auto's records differ in commit, judge label or scheme. Another is when a model was scored by a different judge than Auto. Another is when a model painted a picture Auto did not. The last is when a painting was judged but has no figure.

## Beside the score

These are never blended into the score. They are the painter's [cheat risk](rules.md#cheat-risk), a measure computed by code against the original (`bench/scorer/classic.py`, which rates tone shapes, edges and marks from 0 to 10), and each run's usage (look units, steps, tokens, cost and minutes).

0.4 scores never share a table with rounds V1 to V5 ([older rounds](older-rounds.md)).
