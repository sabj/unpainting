# Statistics

`scripts/build-results.mjs` computes every number from the `run.json` files.

The rounds are V1 to V5. A try is one model session that paints the requested targets.

## A model's score in a round

- The unit is one painting: one target in one try, with a complete composite score.
- Best of 3: only tries 1–3 enter any statistic, at `xhigh` (extra-high) where reasoning effort is supported. The score is the mean over every scored painting of those tries. Disqualified tries are left out. Incomplete tries count with the paintings they have.
- The interval is a 95% percentile bootstrap interval of that mean, estimated from 2,000 resamples of the paintings, with a fixed seed (7), so every rebuild gives the same interval. The leaderboard shows the half-width.
- A model with a single scored painting gets no interval.
- The main score is indexed: each painting's composite is divided by its target's self-score ([controls](scoring.md#how-far-to-trust-the-score)) and shown as a percentage, and the mean, interval and ranking above are computed on those indexed values; the raw mean out of 10 is kept beside it.

## Best try

The best try is the one with the most scored targets, then the highest indexed mean over its targets. The gallery shows, per target, the model's highest-scoring painting of that target, with its try number.

## Per-try columns

Medians over the model's tries in the round:

- Strokes: the sum of strokes over the try's paintings.
- Minutes: elapsed minutes for the session.
- Tokens: input plus output tokens as reported by the script that ran the session. A try with no token record is left out of the median.
- Cost: the billed cost for per-token runs. For subscription runs, ≈$ marks an estimate: the run's input and output token counts times the list prices in [api-prices.json](../api-prices.json).

Some V1 and V2 sessions also painted a subject that is not published. Their minutes, tokens and cost are whole-session totals.

## Comparing two rounds

[FINDINGS.md](../results/FINDINGS.md) compares rounds model by model.

- Each model's round mean is the mean of its paintings. The grand mean is the mean over models, so every model counts once.
- V1 against V2 pairs model means over all scored paintings of tries 1–3. Models need at least five scored paintings in both rounds. Its 95% interval is a percentile bootstrap over models (10,000 resamples).
- V3 against V2 uses V2 paintings of the three targets V3 painted.
- For the individual V3 against V2 comparisons, the interval resamples the paintings inside each round, 2,000 times.

## Caveats

- V1 and V2 ran 2 or 3 tries per model. The [leaderboard](../results/leaderboard.md) names the models with fewer than 3 and why. Intervals are wide for models with few paintings.
- A difference smaller than the interval is noise, and a difference larger than it may still be the scorer's taste.
