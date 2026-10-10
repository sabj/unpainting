# bench/runs

Each published try is one model session that paints the requested targets, stored in one folder: `<round>/<model>/<try>/`.

- Rounds (benchmark versions): `v1-naive` (V1), `v2-skill` (V2), `v3-informed` (V3), `v4-pipeline` (V4) and `v5-self-study` (V5).
- Models: the `key` of each entry in [models.json](../models.json), such as `opus` or `astra`. V3 ran four of the eight models, and V4 and V5 ran six.
- Tries: `1` to `3`.

Each try folder holds `run.json` and, per target, the final painting and its stage strip as WebP. V4 and V5 folders also hold `<target>-plan/`, the plan the model painted. [Run format](../docs/run-format.md) defines both.

`npm run bench:build` rebuilds `bench/results/` from these folders, and this check validates every `run.json`:

```sh
npm run bench:test
```
