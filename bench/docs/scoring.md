# Scoring

Updated 22 November 2026 for 0.4. Scores in 0.4 are a new series. They are not comparable with the V1 to V5 rounds, and they never share a table or an average with them. The old rules are kept under [History](#history-how-v1-to-v5-were-scored-judges-j1-and-j2).

## Running it

```sh
npm run bench:score04 -- RUN_FOLDER... --out DIR
npm run bench:score04 -- runs.json --out DIR
```

`bench/scripts/score04.mjs` runs `bench/scorer/score04.py` under `BENCH_SCORE_PYTHON` (else `python3`), which needs `bench/scorer/requirements.txt`. It writes `DIR/results.json` (every figure, every setting) and `DIR/SCORES.md` (the readable table, faults first), and keeps each judge reply in `DIR/readings/`. A reply is reused only for the same judge, prompt and pictures.

- A run folder holds `run.json` and the painting (`plate/painting.png` or `painting.png`) with its film, `frames.json`, beside it. The original is `run.json`'s `subject.sourceAbs`. The style the judges are told comes from the subject registry.
- A manifest is JSON: a list, or `{"runs": [...]}`, of folders or of `{folder, label?, subject?, target?, style?}`. Relative paths are read from the manifest's folder.
- It refuses before any judge call, naming every bad input: no painting, no original on disk, a failed run, no film or one with under 14 frames, missing frame files or no untouched-paper first frame (the opening), a missing rubric, an unknown route, or a hosted route without its key.
- Exit 0: complete. Exit 1: written, but a reading is short of a judge; the figure is left empty and named under "Faults first". A smaller panel is never used. Exit 2: refused.
- `npm run bench:test` runs its tests with a stub judge (`bench/scorer/score04-test.py`); no model is needed.

## What is scored

Each painting gets several readings. They are kept apart and shown together.

- Human-ness: does the painting, and its replay stopped anywhere, look made by a person? This is the main reading.
- Quality and likeness: a second reading, beside it.
- Combined: two parts human-ness to one part quality. The weights are a setting (`WEIGHTS` in `bench/scorer/s04_table.py`), written into the results. Both parts stay visible next to it.
- The original is scored too. A painting's quality is its share of the original's score. If the original gets 9 and Auto gets 4.5, Auto gets 50%. A model can go over 100%.
- Difficulty: the subject's Auto painting is scored the same way. Each model painting's figures are shown raw and adjusted for Auto side by side: (painting - Auto) / max(top - Auto, top / 5), so 0 is level with Auto. The adjustment needs exactly one Auto painting of the subject among the inputs; otherwise the table says so.
- Kept separate, for reference: the anti-cheat record and algorithmic measurements. They never change a score.

RESULTS: to be filled from the frozen run.

## Human-ness

- First the opening: the untouched paper the painter chose, the film's first frame, in its own colour (a toned sheet shows toned). The prompt says it is context only and not scored. Auto's films and models' films (the painter's and the level 1 kit's) all start with that frame; a film that does not is refused.
- Then twelve snapshots evenly through the painting's film, then the finished sheet, shown in order, each labelled only with its percentage complete. It does not know the method.
- It first says whether this is the order and the kind of mark a person would use (yes or no). Then it scores each snapshot 1 to 5 by the [rubric](human-ness-rubric.md): 5 is unmistakably a person's painting in progress, 1 is a finished image uncovered by a filter or wipe. Tells are named by letter (a to j).
- The figure is the mean of the twelve film snapshots, as a percentage of 5. The finished sheet is shown last but not counted: it is at its ceiling. Also shown: the means of the first, middle and last four, the tally of tells (each judge's first reading, every snapshot shown), and how many readings said yes.
- The rubric file is `bench/docs/human-ness-rubric.md`. Its sha256 is written into the results; editing it starts a new series.
- A painting with no film is refused, not scored from its finished sheet.

## Quality and likeness

- The judge sees one picture alone, at most 768 px on the long side, and scores it as a watercolour from 0 to 10. It is not told whether the picture is an original or a painting.
- The original and the painting are read the same way, independently, so the original does not score 10 by construction.
- A painting's figure is its share of its original's score.

## Judges

- One setting, `JUDGE_ROUTE`: `local` by default, `together` or `openrouter`.
- `local`: the panel `qwen3.8-flash-next:125b-mlx`, `qwen3.8:27b-mlx`, `gemma4:31b-mlx` through Ollama (`bench/scorer/local_route.py`; `JUDGE_LOCAL_URL`, `JUDGE_LOCAL_PANEL`). One model in memory at a time: every picture for one judge, then it is unloaded. The run waits while the server holds another job's model. Judge label `J3-local-3x`.
- `together` or `openrouter`: the J1 panel, hosted. Each needs its key (`TOGETHER_API_KEY`, `OPENROUTER_API_KEY`) and stops with a plain message without one. The key is never written into a result. Labels `J4-together-3x`, `J4-openrouter-3x`.
- Three readings a judge, temperature 0. A judge's figure is the median of its three and needs all three. The panel's figure is the mean of the judges'.
- The results record the route, endpoint, panel, model digests (local), the judge label, the rubric hash and the prompt hashes. Results with different labels are not compared.
- A judge never sees a painter's name or level.

## Beside the score

- Anti-cheat: the painter's own `cheat-risk.json` beside the painting (risk, fine-detail copy against its ceiling, strokes against the stroke ceiling) and its progression part. Where a level writes none, the table says "none". See [anti-cheat](anti-cheat.md).
- Algorithmic: `bench/scorer/classic.py` against the original (value shapes, edges, marks, each 0 to 10, and their mean). The larger of the two pictures is brought down to the other; nothing is enlarged.
- Usage: each run's `usage.json`: rendering units, steps, tool calls and tool use, tokens, cost where reported, wall minutes. A run without one is shown as "none". See [rules](rules.md#budgets-measured-not-limited) and the [run format](run-format.md).

# History: how V1 to V5 were scored (judges J1 and J2)

Everything below this line describes the 2025 to early 2026 rounds. It is kept as a record. 0.4 scores use the rules above and are a new series: they are not comparable with any number below.

A try is one model session that paints the requested targets. Each painting gets three things: an automated score for the finished painting, a progression check (an evaluation of saved painting stages), and a share in its try's cheat-risk score. The code is in [../scorer/](../scorer/) and [../scripts/score.mjs](../scripts/score.mjs). Rubric version: `bench-v3-median5`, with the median of five calls per judge.

The painting toolkit given to models writes each final image.

Judge version: `J1`. All published scores are J1. A new panel, rubric or image protocol gets a new J number; scores from different J versions are not compared. `JUDGE_ROUTE` picks the judge route: `together` (default, needs `TOGETHER_API_KEY`) or `openrouter` (zero-data-retention providers, needs `OPENROUTER_API_KEY`). Results group by painter, sim and judge version. See [versions](../../docs/versions.md).

## The finished painting

`scorer/score_painting.py` scores one painting against its target, 0 to 10.

- AI image judges: Kimi-K3, GLM-5.3-Flash and Qwen3.5-9B. Each sees the target and the painting, blind, with a short description of the target's painting style. Each gives 0 to 10 for `composition_values`, `edges_detail` and `marks_texture`, and one overall.
- Combined judge score: each judge is called 5 times at temperature 0 (the least random sampling setting). Its score is the median of its valid calls, and it needs at least 3. The vision score is the mean of the three judges' medians. If a judge has fewer than 3 valid calls, the painting's score is incomplete and stays empty. No average over a smaller panel is made.
- Judge J2, for internal gates only (`score_painting.py --judge J2`): the same panel, prompt, images and medians as J1, but every judge needs all 5 calls valid. A call that fails, is cut off at the token limit or does not parse is made again with both images; a reply rewritten into JSON from text alone does not count. Each result records `judgeVersion`, `minValidCalls`, `callCounts` and, for J2, every attempt with its HTTP status and finish reason (`visionAttempts`). Published scores stay J1, and J2 scores are not compared with them.
- Repeatable image measurements: value shapes, edges and marks, each normalized to 0 to 10, from `scorer/classic.py`. Their mean is the classic score. No metric uses pixel error.
- Composite: the mean of the vision score and the classic score. A try's score is the mean of its targets' composites and needs every target.

The judges are told not to reward pixel similarity, and that blur and smear are failures. "5 is a competent amateur; 9-10 is close to the target's quality."

### J2 sampling profiles

The judge version identifies the rules; the profile identifies the sampling budget. These profiles keep the existing J2 panel, prompt, image preparation, median aggregation and strict response validation:

| Profile | Required valid calls per judge | Initial panel calls | Use |
|---|---:|---:|---|
| `J2-lite` | 1 | 3 | Routine development screening |
| `J2-standard` | 3 | 9 | Closer comparisons |
| `J2-full` | 5 | 15 | Release decisions; the existing J2 default |

```sh
python3 bench/scorer/score_painting.py --target target.png --image painting.png --judge J2 --profile lite --out score.json
```

Omitting `--profile` retains full J2 unless `BENCH_SCORE_CALLS` explicitly selects 1, 3 or 5 calls, which records the corresponding profile. A conflicting explicit profile and environment override is refused. Other J2 call counts are refused. J1 keeps its own default and call-count overrides. J2 profiles cannot be applied to J1. The V1 to V3 toolkit runs use J1. New explicit V4 benchmark profiles select J2-lite or J2-full; see [profiles](profiles.md).

Every profile requires all three judges. A missing judge leaves the composite incomplete; it never produces a score from a smaller panel. Failed, truncated and malformed responses use the existing bounded J2 retries with both images: up to three judgement attempts, each with up to three HTTP attempts, followed by at most two top-up rounds for still-missing samples. A top-up round requests only the missing samples. Lite reduces initial calls by 80% versus full; actual cost and latency depend on retries and provider behavior.

Results record `judgeProfile`, the requested and required counts and panel in `sampling`, actual valid counts in `callCounts`, valid scores in `visionSamples`, and HTTP attempts in `visionAttempts` (including top-up round and sample slot). Retain those samples for paired lite/full calibration without paying for the same responses again. Different profiles must remain distinguishable in comparisons; neither ranking agreement nor interchangeable scores have been established.

With one valid call per judge, repeatability is unmeasured: `pm` is null and `repeatabilityMeasured` is false. `judgeSpread` is the range of the judges' overall scores and measures panel disagreement, not repeatability. Repeated profiles retain the existing `pm` dispersion calculation; it is not a calibrated confidence interval. Escalate both sides of an ambiguous comparison to the same profile. Changes to the artistic rubric or image protocol require a new judge version, rather than a cheaper J2 profile.

Every painting is scored at its target's native size (for example 306 x 242 for Hills): V1 to V3 paintings are already that size, and the published V4 and V5 renders, painted 1200 to 1224 px wide, are Lanczos-downscaled to it, so all five rounds share one scale and nothing is upscaled. From 0.3.3 V4 and V5 paint at the target's own size and need no resampling. Some V4 and V5 records keep an older 720 px upscaled score as `scoreOld`; results do not use it.

Score from the toolkit's own `final.png`, not from a compressed thumbnail. The marks metric is sensitive to compression: a 600 px WebP of a published painting gave a marks score 2.4 points lower than the PNG it was made from.

## Deciding a painting change

J1 scores are the published history and stay comparable with it. They do not decide whether a change to the painter is kept: J1 reads a painting at its target's size, about 300 px, and cannot see edges, fills or brush marks at the size they are painted.

A painting change is decided by a blind comparison at full size, together with the copy checks:

```sh
node bench/scripts/pair-judge.mjs --manifest pairs.json --out DIR [--sheet] [--no-vision]
```

`pairs.json` lists pairs of painter output folders: plate A from the painter as it is, plate B from the change, same subject and plan. At least one pair must be a subject that was not looked at while the change was developed (`"heldOut": true`).

- Look: `scorer/pairs.py` cuts both plates into the same tiles, 64 mm of paper each, sent at their own pixels. The three J1 judges see the two crops of a tile and must pick the one that looks more like a hand-painted watercolour. They never see the target and are not told which plate is which. Each judge sees each tile in both orders and votes only when it picks the same plate both times, so a judge that favours the first or second image casts no vote. A tile goes to the plate with more judge votes. The verdict is an exact two-sided sign test over the tiles at 0.05, for each plate and for all plates pooled. Tiles of one plate overlap a little and share its faults, so the test is somewhat easier to pass than its number says.
- Copy checks, on each plate's own records (`scripts/copy-limits.mjs`). Each is an absolute ceiling on the plate itself, and none compares it with an earlier build:
  - the paint step ran under the target guard with no blocked read;
  - the painter took no look at the target while painting, so plates are painted with `--notargetlooks 1`;
  - the fine-detail correlation with the target (`hfCorr`) is at or under the ceiling for the plate's width: 0.645 at 1,000 px and wider, 0.53 below;
  - paint strokes are at or under the sheet's stroke ceiling: the number of marks 1.5 mm by 4.5 mm, the smallest mark the cheat-risk record does not count as small, that cover the sheet once. A 280 mm by 375 mm sheet may carry 15,563. The painter writes the ceiling into `cheat-risk.json` as `strokeCeiling`.

  A run without these records is an error, not a pass.
- Cost, reported and never a pass or fail: strokes, strokes per 100 cm² of sheet, the share of the stroke ceiling used, the small-stroke share and render seconds for each plate, and B's strokes and seconds as a multiple of A's.
- The change is accepted when every pair was judged completely, the pooled verdict is for B, no single plate is decided for A, and every B plate passes the copy checks. The look test never accepts a change alone, because a copy of the target looks hand-painted.

`--sheet` also writes each pair as a blind contact sheet for a person: JPEG pages with the two crops side by side in shuffled order, `answers.txt` to fill in with `L`, `R` or `=`, and `key.json`. `python3 scorer/pairs.py --answers answers.txt --key key.json` gives that person's verdict by the same sign test. `--no-vision` makes no judge call; it runs the copy checks and writes the sheets.

## How far to trust the score

The published scorer has these checks.

- Scores are relative, very coarse, and open to improvement.
- Agreement between judges (Kendall tau, a measure of ranking agreement, 156 paintings): Kimi-K3 and GLM-5.3-Flash 0.849, Kimi-K3 and Qwen3.5-9B 0.805, GLM-5.3-Flash and Qwen3.5-9B 0.759.
- Controls: for every subject the target itself beats a blurred and a posterized copy (reduced to a few colors) of it.
- Indexed score: the leaderboard ranks by each painting's composite as a percentage of its target's own score in the Target column below, the same ceiling for every round. The target is scored against itself on the paintings' path at native size, 3 runs of 5 calls per judge, and the column is the mean of the 3 runs.
- The target self-score is not a perfect 10. Shown the same image twice, Qwen3.5-9B answers 10 on nearly every call, Kimi-K3 gives 8 to 9, and GLM-5.3-Flash gives 5 to 6. A few single calls answer 1 or 3; the median of 5 calls absorbs them.

| Subject | Target | Runs | Blurred | Posterized |
|---|---:|---|---:|---:|
| Hills | 8.43 | 8.54, 8.38, 8.38 | 3.48 | 5.10 |
| France | 8.43 | 8.38, 8.21, 8.71 | 3.38 | 5.05 |
| Ships | 8.76 | 9.04, 8.70, 8.54 | 3.74 | 4.77 |
| Trumbull | 8.57 | 8.57, 8.57, 8.57 | 3.31 | 5.08 |

The Blurred and Posterized columns come from a controls run with one call per judge. They check that each target beats its degraded copies.

- Retest: 10 paintings scored twice differed by 0.14 on average and 0.34 at most.
- Cost: scoring the published runs took 4,189 judge calls and $19.95.

## The progression check

`scorer/progression.py` shows the judges one row of images: the target, then the painting at 10, 25, 50, 75 and 100% of its strokes. Each judge first asks whether this is the order and the kind of mark a person with a brush and pen would use, then scores each stage 1 to 5:

- 5: unmistakably a person's painting in progress
- 4: convincing with one small tell (a sign of machine rendering)
- 3: plausible but a tell a viewer would notice
- 2: mostly not, two or more tells
- 1: a finished image being uncovered by a filter, mask, wipe or dissolve

The tells it names include speckle trails, cut or scalloped wash edges, flat slabs standing in for a form, a region arriving finished while its neighbour is untouched, a travelling front or wipe, dark before light, and fine detail in the first 25%. The published runs used GLM-5.3-Flash and Qwen3.5-9B for this check. The mean of the 10% and 25% stages (`earlyMean`) feeds the cheat-risk score.

## The cheat-risk score

See [anti-cheat.md](anti-cheat.md#the-cheat-risk-score). A high score means a person reviews the try. It does not exclude it.

## Explicit benchmark profiles

The scoring CLI reads the requested judge version/profile and route from the run record, unless explicitly overridden.
Final-score caches require identical target and native-size image hashes, style, rubric, judge version/profile and route.
Progression caches also require identical stage sheets, style and declared panel. `--force` bypasses caches.

For explicit profiles, both progression judges must each supply all five valid stage scores. The wrapper retains each
judge's response; a missing stage or judge leaves progression incomplete and its aggregate empty. A run is complete
only when every planned target has complete final and progression scores. Failed/incomplete scoring is saved before
the CLI returns failure. `--judges-only` preserves progression and still requires it for a complete result.

Explicit profiles with missing targets or tries keep their planned denominator and receive no aggregate ranking.
Partial per-target scores remain inspectable. J1 aggregation and published runs use their own rules.
Sampling profiles keep the artistic rubric. The progression rubric does not judge technique well enough to gate
an ink-first painting automatically, so a person reviews the process before a release.
