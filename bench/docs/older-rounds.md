# Older rounds (V1 to V5)

Five rounds ran on releases 0.1.0 and 0.1.1 (painter V096, sim 100). They are kept as a record, and their scores never share a table with 0.4.

V1 gave a toolkit and the targets. V2 added technique guides. V3 added the model's own earlier tries. In V4 the model wrote a plan that the painter laid. V5 added earlier tries ([table](../README.md#older-rounds)). V1 to V3 allowed 2,500 strokes. V4 and V5 allowed 85 minutes of model time and three looks. The targets were Hills, France, Ships, Mittens and Trumbull, each a whole image ([crops.json](../v2/crops.json); credits in [NOTICE](../../NOTICE)).

Scoring, judge version `J1`: Kimi-K3, GLM-5.3-Flash and Qwen3.5-9B each saw the target and the painting and gave it a score from 0 to 10. Each judge made five calls at temperature 0 and its middle score was kept. The three judges' scores were averaged, then averaged again with a score computed by code (`bench/scorer/classic.py`). A model's score is the average over its paintings, as a percentage of each target's own score, with a 95% interval from resampling. Code: `bench/scorer/`, `bench/scripts/score.mjs`.

## Files

- A try is `bench/runs/<round>/<model>/<try>/` (`v1-naive`, `v2-skill`, `v3-informed`, `v4-pipeline`, `v5-self-study`): `run.json`, each painting as `<target>.webp` and its five stage frames as `<target>-stages.webp`. `validateRun` in `bench/scripts/lib.mjs` defines the record's format (`unpaint-bench/run@2`), and `npm run bench:test` checks every committed try. The kit also wrote a stroke log, `<target>-strokes.jsonl.gz`, with one JSON object per line in painting order.
- [Leaderboard](../results/leaderboard.md), [gallery](../results/gallery.md), [findings](../results/FINDINGS.md) and `bench/results/results.json` are built by `npm run bench:build`. `npm run bench:test` fails if they are out of date. Never edit them by hand.
- Inputs: the kit, briefs and guard in [v2](../v2/README.md), the freehand session in [v3](../v3/README.md), the plan task in `bench/v4v5/`. To add a target for these rounds, run `npm run bench:add-target -- IMAGE --task ID --name NAME --style TEXT --medium pen|pencil|none --source CREDIT --licence LICENCE`.

## Running again

V4 and V5 run only from tag `v0.3.2`: check it out, then `npm run bench:run -- --model KEY --round V4` (V5 calls the judges between tries and needs `TOGETHER_API_KEY`). Score a try with `npm run bench:score -- RUN`.
