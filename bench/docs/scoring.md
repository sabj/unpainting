# Scoring

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

Every painting is scored at its target's native size (for example 306 x 242 for Hills): V1 to V3 paintings are already that size, and the 1224 px V4 and V5 renders are Lanczos-downscaled to it, so all five rounds share one scale and nothing is upscaled. Some V4 and V5 records keep an older 720 px upscaled score as `scoreOld`; results do not use it.

Score from the toolkit's own `final.png`, not from a compressed thumbnail. The marks metric is sensitive to compression: a 600 px WebP of a published painting gave a marks score 2.4 points lower than the PNG it was made from.

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
