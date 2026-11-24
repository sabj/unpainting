# Scoring

0.4 scores are a new series. They never share a table or average with V1 to V5; those are under [History](#history-how-v1-to-v5-were-scored-judges-j1-and-j2).

## Running it

```sh
npm run bench:score04 -- RUN_FOLDER... --out DIR
npm run bench:score04 -- runs.json --out DIR
npm run bench:summary04 -- DIR/results.json --set core|extended   # writes DIR/SUMMARY.md, see levels
```

`bench/scripts/score04.mjs` runs `bench/scorer/score04.py` under `BENCH_SCORE_PYTHON` (else `python3`), which needs `bench/scorer/requirements.txt`. It writes `DIR/results.json` (every figure and setting) and `DIR/SCORES.md` (the table, faults first), and keeps each judge reply in `DIR/readings/`. A reply is reused only when everything that could change it is the same; `--fresh` reads everything again. `--repeat N` scores the same paintings again, sharing no reading with another repeat (`results-repeat-N.json`, `SCORES-repeat-N.md`); two repeats give the judges' noise.

Inputs, every level together, as its runner leaves them:

- Auto and L2 to L4: a painter run folder (`npm run paint`) holding `run.json`, the painting (`plate/painting.png` or `painting.png`), its film `frames.json`, and `usage.json`. The original is `run.json`'s `subject.sourceAbs`; the style the judges are told comes from the subject registry.
- L1: a try folder (`bench/scripts/run.mjs --round V3`) with the try's `run.json`. Each target the try painted is one painting, read from `out/<target>/final.png` and its film in `film/`. A benchmark picture's target is scored under that picture's id, so all levels stand in one table. L1's target is its own file of the picture, read as an original of its own.
- A manifest is JSON: a list, or `{"runs": [...]}`, of folders or `{folder, label?, subject?, level?, author?, target?, style?}`. Relative paths are read from the manifest's folder. `{subject, level, author, failed: "why"}` with no folder stands for a scheduled run that left nothing.

A failed run is never refused or dropped: a painter run with a `failure`, an L1 target with no painting (or stopped as a runaway, or disqualified), a scheduled run with no folder. It is a row marked FAILED with its reason, under "Failed runs", and counts as the bottom of the scale in the summary.

It refuses before any judge call, naming every bad input: a folder that is not a run, no original, no film, a film that does not say where its first wash is or has under ten frames from it to just before the finish, missing frame files or no untouched-paper first frame, a missing rubric, an unknown route, a hosted route without its key. Exit 0: complete. Exit 1: written, but a reading is short of a judge; the figure is left empty and named under "Faults first", and a smaller panel is never used. Exit 2: refused.

`npm run bench:test` tests it with a stub judge (`bench/scorer/score04-test.py`).

## What is scored

Each painting gets readings, kept apart and shown together.

- Human-ness, the main reading: does the painting, and its film stopped anywhere, look made by a person?
- Quality: the painting alone as a watercolour.
- Likeness, in its own column: is it a painting of its original? Not in the combined figure. A painting at the bottom of the scale is flagged.
- Combined: two parts human-ness to one part quality (`WEIGHTS` in `bench/scorer/s04_table.py`, written into the results). Both parts stay visible.
- The original is scored for quality too (no film, so no human-ness). A painting's quality is its share of the original's score: original 9, Auto 4.5, Auto 50%. A model can go over 100%.
- Difficulty: Auto's painting of the subject is scored the same way. Each model painting is shown raw and adjusted: (painting - Auto) / max(top - Auto, top / 5), so 0 is level with Auto. It needs exactly one Auto painting of the subject among the inputs, or the table says so.

## Human-ness

The judges see, in order:

1. The opening: the film's first frame, the untouched paper in its own colour. Context, not scored. A film that does not start with it is refused.
2. The drawing frame: the last frame before the first wash. Scored and reported beside the result, not in the figure. Absent when nothing was drawn first.
3. Ten stills of the painting in progress, from the first wash to just before the finish. These ten are the figure.
4. The finished sheet. Scored and reported beside the result, not in the figure.

The ten are placed by progress, not by frame number. A frame's progress is the share of the finished picture on the sheet: 1 - |frame - finished| / |paper - finished|, never below an earlier frame's. The ten are at equal steps of it: the first is the first wash's own frame, the tenth nine tenths of the way to the finished sheet. Film density and strokes that leave no mark cannot move which moments are judged (`bench/scorer/s04_readings.py`: `progress`, `stills`). Frames are shown in order, labelled only "N% of the finished picture on the sheet"; the judge never sees the original.

Where the first wash is comes from the film's record (`frames.json`: each frame's stage, or the stroke count in the L1 kit's film). It is never guessed. A painting with no film is refused.

Each judge says whether this is the order and kind of mark a person would use (yes or no), then scores each snapshot 1 to 5 by the [rubric](human-ness-rubric.md) (5 unmistakably a person's painting in progress, 1 a finished image uncovered by a filter or wipe), naming tells by letter (a to j). The figure is the mean of the ten as a percentage of 5. Also shown: the drawing frame's and finished sheet's scores, the means of stills 1 to 3, 4 to 7 and 8 to 10, the tally of tells, and the yes votes. The rubric's sha256 is written into the results; editing it starts a new series.

This scheme is `progress10`, the default. `--snapshots film13` scores an old film the old way: the opening, twelve snapshots evenly by frame number, then the finished sheet. `progress10` scores are not comparable with `film13`, nor with `wash10` (23 November, gone and refused by name). Every results file names its scheme.

## Quality

The judge sees one picture alone and scores it as a watercolour from 0 to 10, not told whether it is an original or a painting. The original and the painting are read the same way, independently. It never sees the original of a painting it scores.

## Likeness

The judge sees the original, then the finished painting and scores 1 to 5 how well the second is a painting of the first: subject, composition, light and dark, colour. It is told the painting need not match mark for mark and not to judge how well it is painted, and gives one short reason. 5: unmistakably this picture. 3: subject and composition are there, tones or colour plainly differ, or a main part is missing. 1: a different picture. The figure is the mean of the judges' medians; 1.5 or under is flagged.

## Picture sizes

Human-ness pictures are 640 px on the long side; quality and likeness 768 px. A larger picture is brought down (Lanczos, then JPEG quality 88); one under 384 px is brought up to 384. A full-size sheet is about 1,450 by 1,100 cells, so judges see about half size. The same pictures go to every route.

## Judges

- One panel by default on every route: `open3`: GLM-5.3-Flash, Qwen3.8-27B and Gemma-4-31B, one reasoning setting, low (with reasoning off one hosted provider refuses the call) (`bench/scorer/s04_judge.py`: `PANELS`, `REASONING`).
- `JUDGE_ROUTE` picks where: `local` (default), `openrouter` or `together`. The judge label names panel and route: `open3-local-3x`.
- `openrouter`: `z-ai/glm-5.3-flash`, `qwen/qwen3.8-27b`, `google/gemma-4-31b-it`, zero-data-retention providers only, effort `none`; needs `OPENROUTER_API_KEY`. A judge that reasons anyway is named under "Faults first".
- `local`: Ollama (`bench/scorer/local_route.py`; `JUDGE_LOCAL_URL`), thinking off: `qwen3.8:27b-mlx`, `gemma4:31b-mlx`, and GLM-5.3-Flash under the tag in `JUDGE_LOCAL_TAGS` (`zai-org/GLM-5.3-Flash=<tag>`). Without it the local route refuses the panel by name. One model in memory at a time.
- Another panel is asked for by name with `JUDGE_PANEL`: `j1` (Kimi-K3, GLM-5.3-Flash, Qwen3.5-9B; hosted, the only panel `together` serves; needs `TOGETHER_API_KEY`), `local3` (Qwen3.8-Flash-Next in GLM-5.3-Flash's place), or `custom` with `JUDGE_LOCAL_PANEL`.
- A hosted route without its key stops before any work. The key is never written into a result.
- Three readings a judge, temperature 0. A judge's figure is the median of its three and needs all three. The panel's figure is the mean of the judges'.
- Every results file records the panel, models and served names, reasoning setting, route, endpoint, model digests (local), judge label, rubric hash and prompt hashes. Results with different labels are not compared. A judge never sees a painter's name or level.

## Beside the score

- Anti-cheat: the painter's `cheat-risk.json` beside the painting; "none" where a level writes none ([cheat risk](rules.md#cheat-risk)).
- Algorithmic: `bench/scorer/classic.py` against the original: value shapes, edges, marks, each 0 to 10, and their mean. The larger picture is brought down to the other.
- Usage: each run's `usage.json`: look units, the work of each look, steps, tool use, tokens, cost where reported, wall minutes. "none" without one ([rules](rules.md#budgets-measured-not-limited)).

None of these changes a score.

# History: how V1 to V5 were scored (judges J1 and J2)

Rounds V1 to V5 only. Scores below are never comparable with 0.4. A try is one model session that paints the requested targets. Code: [../scorer/](../scorer/), [../scripts/score.mjs](../scripts/score.mjs). Rubric `bench-v3-median5`.

Judge version `J1` scored all published results. A new panel, rubric or image protocol gets a new J number. `JUDGE_ROUTE` is `together` (default; `TOGETHER_API_KEY`) or `openrouter` (zero-data-retention; `OPENROUTER_API_KEY`). Results group by painter, sim and judge version ([versions](../../docs/running.md#versions)).

## The finished painting

`scorer/score_painting.py` scores a painting against its target, 0 to 10, at the target's native size (V4 and V5 renders are Lanczos-downscaled to it; nothing is upscaled). Score from the kit's own `final.png`: a 600 px WebP gave a marks score 2.4 lower.

- Judges Kimi-K3, GLM-5.3-Flash and Qwen3.5-9B each see the target and the painting, blind, with a short description of the painting style, and give 0 to 10 for `composition_values`, `edges_detail`, `marks_texture` and an overall. They are told not to reward pixel similarity and that blur and smear are failures.
- Each judge is called 5 times at temperature 0; its score is the median of its valid calls and needs at least 3. The vision score is the mean of the three medians. A judge with under 3 valid calls leaves the score empty; no smaller panel is averaged.
- J2, for internal gates (`--judge J2`): the same panel, prompt, images and medians, but every judge needs all 5 calls valid; a failed, truncated or unparsed call is made again with both images. Profiles `J2-lite` (1 valid call per judge, 3 initial calls), `J2-standard` (3, 9) and `J2-full` (5, 15; the J2 default) are chosen with `--profile` or `BENCH_SCORE_CALLS`. All three judges are always required. Published scores stay J1.
- Classic score: value shapes, edges and marks from `scorer/classic.py`, each 0 to 10; the mean is the classic score. No metric uses pixel error.
- Composite: the mean of the vision and classic scores. A try's score is the mean of its targets' composites and needs every target.

## The progression check

`scorer/progression.py` shows the judges the target, then the painting at 10, 25, 50, 75 and 100% of its strokes. Each says whether this is the order and kind of mark a person would use, then scores each stage 1 to 5: 5 unmistakably a person's painting in progress; 4 convincing with one small tell; 3 plausible but a tell a viewer would notice; 2 mostly not, two or more tells; 1 a finished image uncovered by a filter, mask, wipe or dissolve. Tells include speckle trails, scalloped wash edges, flat slabs standing in for a form, a region arriving finished beside an untouched one, a travelling front, dark before light, and fine detail in the first 25%. GLM-5.3-Flash and Qwen3.5-9B ran it. The mean of the 10% and 25% stages (`earlyMean`) feeds [cheat risk](rules.md#cheat-risk).

## Deciding a painting change

J1 reads at about 300 px and cannot see edges or brush marks at the size they are painted, so it does not decide whether a painter change is kept. A blind full-size comparison and the copy checks do:

```sh
node bench/scripts/pair-judge.mjs --manifest pairs.json --out DIR [--sheet] [--no-vision]
```

`pairs.json` lists pairs of painter output folders (plate A as it is, plate B with the change; same subject and plan). At least one pair must be a subject not looked at during development (`"heldOut": true`).

- Look: `scorer/pairs.py` cuts both plates into the same 64 mm tiles. The three J1 judges see both crops of a tile, never the target, and pick the more hand-painted one, each in both orders; a vote counts only if the same plate wins both. A tile goes to the plate with more votes. The verdict is an exact two-sided sign test over tiles at 0.05, per plate and pooled.
- Copy checks on each plate's own records (`scripts/copy-limits.mjs`), absolute ceilings: the paint step ran under the target guard with no blocked read; the painter took no look at the target (`--notargetlooks 1`); fine-detail correlation `hfCorr` at or under 0.645 at 1,000 px and wider, 0.53 below; strokes at or under the sheet's ceiling (the number of 1.5 by 4.5 mm marks that cover the sheet once; 15,563 for 280 by 375 mm), written to `cheat-risk.json` as `strokeCeiling`. A run without these records is an error.
- Cost is reported, never pass or fail: strokes, share of the ceiling, small-stroke share, render seconds.
- Accepted when every pair was judged completely, the pooled verdict is for B, no plate is decided for A, and every B plate passes the copy checks. The look test never accepts alone, because a copy looks hand-painted.

`--sheet` writes blind contact sheets for a person (`answers.txt`, `key.json`); `python3 scorer/pairs.py --answers answers.txt --key key.json` gives the verdict. `--no-vision` makes no judge call.

## Statistics

`scripts/build-results.mjs` computes every number from the `run.json` files. The unit is one painting with a complete composite; only tries 1 to 3 count, at `xhigh` where supported, and disqualified tries are left out. A model's score is the mean over its scored paintings, with a 95% percentile bootstrap interval (2,000 resamples, seed 7; none for a single painting). The main score is indexed: each composite divided by its target's self-score, as a percentage; the raw mean out of 10 is kept beside it. [FINDINGS.md](../results/FINDINGS.md) compares rounds: V1 against V2 by model means (at least five scored paintings in both, 10,000 bootstrap resamples over models); V3 against V2 on the three targets V3 painted. A difference smaller than the interval is noise. The [leaderboard](../results/leaderboard.md) names models with fewer than 3 tries.

Judge agreement (Kendall tau, 156 paintings): Kimi-K3 with GLM-5.3-Flash 0.849, with Qwen3.5-9B 0.805; GLM-5.3-Flash with Qwen3.5-9B 0.759. Each target beats a blurred and a posterized copy of itself. Target self-scores: Hills 8.43, France 8.43, Ships 8.76, Trumbull 8.57 (3 runs of 5 calls per judge, native size).
