# Findings

Generated from the run records by `scripts/build-findings.mjs`. Scores are automated scores out of 10. The rounds are V1 to V5. A try is one model session that paints the requested targets. [Scoring](../docs/scoring.md) says how far to trust them; [statistics](../docs/statistics.md) explains the intervals.

## Technique guides made no clear difference on average (V1 and V2)

- 13 models have at least five scored paintings in both rounds: Gemini 4 Argon (High), Gemini 4 Argon (Medium), Codex Astra, Gemini 3.8 Flash, Haiku 4.5, Codex Luna, MiniMax M3, Opus 5.5, Codex Sol, Sonnet 5.5, Muse Spark 1.3, Muse Wonder and Muse Wonder Full. DeepSeek V4.1 Flash is left out because it has fewer than five scored V2 paintings.
- Paired by model over all scored paintings of tries 1–3, V1 averaged 4.36 and V2 4.28. The difference is −0.08, 95% confidence interval (CI) −0.26 to +0.11.
- Each model counts once. The interval comes from repeatedly resampling model means (a percentile bootstrap, 10,000 resamples).

| Model | V1 | V2 | Difference | V1 paintings | V2 paintings |
|---|---:|---:|---:|---:|---:|
| Sonnet 5.5 | 4.35 | 5.06 | +0.70 | 10 | 9 |
| Opus 5.5 | 4.94 | 5.08 | +0.14 | 10 | 8 |
| Gemini 4 Argon (Medium) | 5.37 | 5.49 | +0.11 | 15 | 13 |
| Gemini 3.8 Flash | 3.97 | 4.01 | +0.05 | 5 | 5 |
| Muse Spark 1.3 | 3.63 | 3.68 | +0.05 | 5 | 5 |
| Gemini 4 Argon (High) | 5.50 | 5.53 | +0.03 | 15 | 15 |
| Codex Sol | 4.99 | 4.97 | −0.02 | 15 | 15 |
| Haiku 4.5 | 2.21 | 2.16 | −0.05 | 10 | 10 |
| Codex Astra | 5.28 | 5.21 | −0.07 | 15 | 15 |
| Muse Wonder Full | 4.75 | 4.39 | −0.36 | 5 | 5 |
| Muse Wonder | 4.11 | 3.68 | −0.43 | 5 | 5 |
| Codex Luna | 4.22 | 3.76 | −0.45 | 15 | 15 |
| MiniMax M3 | 3.33 | 2.64 | −0.69 | 15 | 15 |

## Feedback between attempts (V3): it helped Codex Sol, Muse Wonder Full, Codex Astra, Muse Wonder and Muse Spark 1.3

V3 painted Hills, France and Ships, and each try saw the earlier ones. The V2 column uses V2 paintings of the same three targets.

| Model | V2, same targets | V3 | Difference | 95% CI | V3 try 1 | V3 tries 2–3 | Minutes / try | Tokens / try |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Codex Sol | 4.96 | 5.63 | +0.66 | +0.32 to +0.98 | 5.75 | 5.57 | 67 | 23.2M |
| Muse Wonder Full | 4.29 | 4.94 | +0.66 | +0.41 to +0.90 | 4.90 | 4.96 | 76 | 8.8M |
| Codex Astra | 5.15 | 5.77 | +0.62 | +0.29 to +0.92 | 5.51 | 5.90 | 62 | 21.0M |
| Muse Wonder | 3.87 | 4.45 | +0.58 | +0.28 to +0.85 | 4.54 | 4.40 | 23 | 6.2M |
| Muse Spark 1.3 | 3.79 | 4.15 | +0.36 | +0.03 to +0.65 | 3.88 | 4.28 | 24 | 7.1M |
| Opus 5.5 | 5.15 | 5.32 | +0.18 | −0.36 to +0.77 | 5.16 | 5.40 | 24 | 4.0M |
| Gemini 4 Argon (Medium) | 5.59 | 5.75 | +0.16 | −0.09 to +0.43 | 5.70 | 5.80 | 58 | 1.2M |
| Sonnet 5.5 | 5.03 | 5.10 | +0.07 | −0.32 to +0.41 | 4.60 | 5.35 | 18 | 5.0M |
| Gemini 4 Argon (High) | 5.65 | 5.38 | −0.26 | −0.58 to +0.07 | 5.23 | 5.46 | 66 | 1.4M |

- Codex Sol (+0.66), Muse Wonder Full (+0.66), Codex Astra (+0.62), Muse Wonder (+0.58) and Muse Spark 1.3 (+0.36) scored higher in V3 than in V2 on the same targets, with intervals that exclude zero. Opus 5.5 (+0.18), Gemini 4 Argon (Medium) (+0.16), Sonnet 5.5 (+0.07) and Gemini 4 Argon (High) (−0.26) have intervals that include zero.
- Try means, in order: Codex Sol 5.75, 5.42, 5.71; Muse Wonder Full 4.90, 4.88, 5.05; Codex Astra 5.51, 5.85, 5.94; Muse Wonder 4.54, 4.55, 4.26; Muse Spark 1.3 3.88, 4.43, 4.13; Opus 5.5 5.16, 5.50, 5.30; Gemini 4 Argon (Medium) 5.70, 5.80; Sonnet 5.5 4.60, 5.24, 5.45; Gemini 4 Argon (High) 5.23, 5.40, 5.51.
- Sonnet 5.5 gained most inside V3, from 4.60 on try 1 to 5.35 over tries 2–3. Codex Sol gained least: 5.75 on try 1, 5.57 over tries 2–3.

## The full pipeline (V4) and practice between tries (V5)

In V4 and V5 each model writes a painting plan for each target, paints it with the painter, may stop to look at its own sheet and revise what is not painted yet. V5 tries 2 and 3 also get feedback on the try before. V4 try 1 and V5 try 1 are the same sessions, since V5 try 1 has no feedback yet. The painter sets its own stroke count.

| Model | V4 | V4 95% CI | V4 paintings | V5 try 1 | V5 try 2 | V5 try 3 | V5 | V5 paintings |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gemini 4 Argon (High) | 6.09 | 5.87 to 6.32 | 15 | 6.03 | 6.22 | 5.94 | 6.06 | 11 |
| Opus 5.5 | 6.00 | 5.77 to 6.21 | 15 | 6.24 | 5.99 | 6.06 | 6.10 | 15 |
| Gemini 4 Argon (Medium) | 5.91 | 5.67 to 6.13 | 15 | 5.87 | 6.27 | 5.68 | 5.98 | 13 |
| Codex Astra | 5.82 | 5.62 to 5.99 | 15 | 5.83 | 6.02 | 6.20 | 6.02 | 15 |
| Codex Luna | 5.73 | 5.47 to 5.95 | 15 | 5.71 | 5.57 | 5.76 | 5.68 | 15 |
| Codex Sol | 5.70 | 5.29 to 6.03 | 15 | 5.67 | 5.29 | 6.02 | 5.69 | 14 |
| Sonnet 5.5 | 5.68 | 5.44 to 5.92 | 15 | 5.75 | 6.17 | 6.05 | 5.99 | 15 |
| Haiku 4.5 | 5.49 | 5.25 to 5.72 | 14 | 5.35 | 5.58 | 5.64 | 5.52 | 14 |

- A try mean covers the targets painted in that try, so a try with a failed painting averages fewer targets.
- 5 of 8 models scored higher on V5 try 3 than on V5 try 1: Codex Astra (5.83 to 6.20), Codex Luna (5.71 to 5.76), Codex Sol (5.67 to 6.02), Sonnet 5.5 (5.75 to 6.05) and Haiku 4.5 (5.35 to 5.64).
- 8 planned paintings have no painting: the painter refused the plan or the render failed. Each try's run.json gives the reason under `unpainted`.
- Haiku 4.5 has no painting for V5 try 3, trumbull: that session was stopped before it painted so the results could be published.
- V4 and V5 were judged through OpenRouter, by zero-data-retention providers; V1 to V3 on Together. Each V4 and V5 painting records its providers under `judgeProviders`.

## Some models laid very few strokes

In V1 to V3, each painting may use 2,500 strokes. These models used a median of fewer than 1,000 per try across all targets.

| Round | Model | Tries | Strokes / try | Strokes / painting | Paintings per try | Session minutes | Cost per try |
|---|---|---:|---:|---:|---|---|---|
| V1 | Haiku 4.5 | 2 | 86 | 15.5 | 5 of 5, 5 of 5 | 25, 2.5 | ≈$0.88, ≈$0.20 |
| V1 | MiniMax M3 | 3 | 591 | 81 | 5 of 5, 5 of 5, 5 of 5 | 58.8, 20.7, 36.2 | $1.19, $0.51, $1.05 |
| V2 | DeepSeek V4.1 Flash | 2 | 146 | 146 | 1 of 5, 0 of 5 | 62.4, 16 | $2.40, $2.40 |
| V2 | Haiku 4.5 | 2 | 106 | 15.5 | 5 of 5, 5 of 5 | 4.3, 3.8 | ≈$0.33, ≈$0.39 |
| V2 | Codex Luna | 3 | 654 | 94 | 5 of 5, 5 of 5, 5 of 5 | 32.2, 31.8, 14 | ≈$0.14, ≈$0.17, ≈$0.19 |
| V2 | MiniMax M3 | 3 | 349 | 70 | 5 of 5, 5 of 5, 5 of 5 | 73.4, 37.1, 84.1 | $1.54, $1.49, $2.36 |
| V2 | Muse Spark 1.3 | 1 | 805 | 163 | 5 of 5 | 15.5 | – |

≈$ estimates what a subscription run would cost through the API: its input and output token counts times the list prices in [api-prices.json](../api-prices.json). Per-token runs show the billed cost.

- Haiku 4.5 stopped early: its sessions lasted 2.5 to 25 of the 85 minutes allowed. The painting toolkit given to models accepted all of its calls.
- DeepSeek V4.1 Flash in V2 hit the per-run cost cap and API errors and did not finish.
- MiniMax M3 finished every painting. The toolkit refused 9, 2, 2, 5, 6 and 15 calls in its tries.
- Codex Luna's median fell from 1,655 strokes per try in V1 to 654 in V2, while its median session grew from 12 to 32 minutes.

## Target reads and cheat risk

- Over 136 tries the guard, the check that blocks image reads, blocked 1 image reads, and 1 tries were disqualified: Gemini 4 Argon (Medium) V3 try 2 (1 blocked target read(s) at paint time). The guard stopped the read, so the model never saw the pixels, but any attempt disqualifies the try, and it is left off the leaderboard.
- The cheat-risk score flagged 8 tries, and each was reviewed by hand. None of them cheated. The flags came from early stages that didn't look like a person's start. The tries: Haiku 4.5 V1 try 2, Codex Astra V2 try 3, MiniMax M3 V2 try 2, Codex Astra V3 try 1, Codex Astra V3 try 3, Codex Sol V3 try 1, Codex Sol V3 try 2 and Codex Sol V3 try 3. All stay on the leaderboard.
- MiniMax M3 V2 try 2 copied the target images into its output folder with a shell `cp`. No script opened the copies; the model only looked at them. The guard missed the copy, so it needs a post-run check for copied targets (known gap, not built yet).
