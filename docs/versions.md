# Versions

Every painting records release, painter and sim versions and a commit. Benchmark results also record the judge version. The release says which release made it. The painter and sim versions say what changed the paintings.

## The four versions

- Release: plain semver in `package.json`, such as `0.1.0`. Each release gets an annotated git tag, `v<release>`, on the main commit that ships it. [CHANGELOG.md](../CHANGELOG.md) lists what each release changed.
- Painter: the internal V number, such as `V096`. It covers planning, the recipe, methods and techniques (`src/paint`). A painter change takes the next V number. Development candidates may append `-dev`, such as `V097-dev`.
- Judges: `judgeVersion`, starting at `J1`. A new panel, rubric or image protocol gets a new J number. Scores from different J versions are not compared. J1 uses Kimi-K3, GLM-5.3-Flash and Qwen3.5-9B, rubric `bench-v3-median5`, five calls per judge with the median, and native-size images. All published scores are J1. J2 keeps the J1 panel, rubric and images, but every judge needs all five calls valid, and a reply repaired from text does not count ([scoring](../bench/docs/scoring.md)). J2 is used for test gates; no published score is J2.
- Sim: a plain number, such as `100`. It covers the physics and simulation of paper, water, pigment, brush and pen (`src/media`). A simulation change takes the next sim number.

`PAINTER_VERSION`, `SIM_VERSION` and `JUDGE_VERSION` in [src/painter-version.mjs](../src/painter-version.mjs) hold the painter, sim and judge versions.

| Release | Painter | Sim | Judges |
|---|---|---|---|
| 0.1.0, 0.1.1 | V096 | 100 | J1 |
| 0.2.0 | V100 | 102 | J1 |

V100 draws in pencil by default and uses ink only on request. Sim 102 makes brush water volume consistent across resolution and prepares wet beds before wet-in-wet passages. Each render's own record names the commit that made it. Benchmark scores keep their original version stamps. Sim 100 is the first sim number; it was estimated from earlier simulation revisions.

## What each result records

- `tools/paint-plate.mjs` prints `painter V100 · sim 102 · release 0.2.0 at <commit>`. It writes `release`, `painterVersion`, `simVersion` and `commit` into `frames.json` and `backend.json`. The commit ends in `-dirty` when tracked files differ from it, and is null outside a git checkout.
- Every benchmark run.json records the same four fields plus `judgeVersion`. The published runs record `commit: null`, because they were painted outside this repository.
- results.json groups each round's tries by painter, sim and judge version and labels each group with its release. Two painter, sim or judge versions never share a mean. The leaderboard and gallery show all four versions for each round.

| Rounds | Painter | Sim | Judges | Release | How it painted |
|---|---|---|---|---|---|
| V1 to V3 | V096 | 100 | J1 | 0.1.0, 0.1.1 | The models' own toolkit on this simulator |
| V4 and V5 | V096 | 100 | J1 | 0.1.0, 0.1.1 | The V096 pipeline and recipe |

## Benchmarking a newer painter or sim

Rounds V1 to V5 are benchmark conditions: they set what the model gets. The painter and sim are a separate axis. To benchmark a newer painter or sim:

1. Release it: bump the V number or sim number in `src/painter-version.mjs`, bump `package.json`, add a CHANGELOG entry and tag it.
2. Rerun V4 or V5 with it (`npm run bench:run`, [bench/README.md](../bench/README.md#reproduce)), then score the tries and run `npm run bench:build`.
3. The new tries land next to the old ones in the same round, as a separate group labelled with their painter, sim, judges and release. Earlier groups keep their scores.

## Reproducing published results

Check out the release tag a result names, such as `git checkout v0.1.0`, then follow [bench/README.md](../bench/README.md#reproduce).
