# Versions

Every painting records release, painter and sim versions and a commit. Benchmark results also record the judge version. The release says which release made it. The painter and sim versions say what changed the paintings.

## The four versions

- Release: plain semver in `package.json`, such as `0.1.0`. Each release gets an annotated git tag, `v<release>`, on the main commit that ships it. [CHANGELOG.md](../CHANGELOG.md) lists what each release changed.
- Painter: the internal V number, such as `V096`. It covers planning, the recipe, methods and techniques (`src/paint`). A painter change takes the next V number. Development candidates may append `-dev`, such as `V097-dev`.
- Judges: `judgeVersion`, starting at `J1`. A new panel, rubric or image protocol gets a new J number. Scores from different J versions are not compared. J1 uses Kimi-K3, GLM-5.3-Flash and Qwen3.5-9B, rubric `bench-v3-median5`, five calls per judge with the median, and native-size images. Current calls use OpenRouter zero-data-retention providers. Earlier published calls used Together; all published scores are J1. J2 is for internal gates only: the J1 panel, rubric and images, but every judge needs all five calls valid and no reply repaired from text alone counts ([scoring](../bench/docs/scoring.md)). No published score is J2.
- Sim: a plain number, such as `100`. It covers the physics and simulation of paper, water, pigment, brush and pen (`src/media`). A simulation change takes the next sim number.

`PAINTER_VERSION`, `SIM_VERSION` and `JUDGE_VERSION` in [src/painter-version.mjs](../src/painter-version.mjs) hold the painter, sim and judge versions. Releases 0.1.0 and 0.1.1 are painter V096, sim 100 and judges J1.

The current review candidate is `0.2.0-rc.6`, painter `V099-dev`, sim `102`, judges `J1`. The branch is `candidate/0.2.0-rc.6`; it is untagged pending visual acceptance. Sim 102 records the integrated physical brush-volume and wet-bed corrections. The earlier `0.2.0-rc.2` candidate used V098-dev / sim 101. `integration/0.3` is an integration branch name; it does not identify a published 0.3 release.

Candidate render metadata and the canary manifest name the actual producing commit. The archived RC5 column contains twelve renders from `d2896f4d`, Overlook from `0a68022f`, and Trumbull from `0c235dd0`; it must not be labeled as one uniform `73df184d` render set. Existing benchmark scores retain their original version stamps.

Sim numbers before this release are an estimate of past simulation revisions. The private history has no sim version number. About 100 commits changed the media modules there (102 commits touching `painter/src/media` and its earlier files, 2026-09-15 to 2026-09-30), so sim starts at 100.

## What each result records

- `tools/paint-plate.mjs` prints `painter V096 · sim 100 · release 0.1.0 at <commit>`. It writes `release`, `painterVersion`, `simVersion` and `commit` into `frames.json` and `backend.json`. The commit ends in `-dirty` when tracked files differ from it, and is null outside a git checkout.
- Every benchmark run.json records the same four fields plus `judgeVersion`. The published runs record `commit: null`, because private builds painted them outside this repo. V4 and V5 came from the unpublished benchmark build.
- results.json groups each round's tries by painter, sim and judge version and labels each group with its release. Two painter, sim or judge versions never share a mean. The leaderboard and gallery show all four versions for each round.

| Rounds | Painter | Sim | Judges | Release | How it painted |
|---|---|---|---|---|---|
| V1 to V3 | V096 | 100 | J1 | 0.1.0, 0.1.1 | The models' own toolkit on this simulator |
| V4 and V5 | V096 | 100 | J1 | 0.1.0, 0.1.1 | The V096 pipeline, from the unpublished benchmark build with the same recipe |

## Benchmarking a newer painter or sim

Rounds V1 to V5 are benchmark conditions: they set what the model gets. The painter and sim are a separate axis. To benchmark a newer painter or sim:

1. Release it: bump the V number or sim number in `src/painter-version.mjs`, bump `package.json`, add a CHANGELOG entry and tag it.
2. Rerun V4 or V5 with it (`npm run bench:run`, [bench/README.md](../bench/README.md#reproduce)), then score the tries and run `npm run bench:build`.
3. The new tries land next to the old ones in the same round, as a separate group labelled with their painter, sim, judges and release. Earlier groups keep their scores.

## Reproducing published results

Check out the release tag a result names, such as `git checkout v0.1.0`, then follow [bench/README.md](../bench/README.md#reproduce).
