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
| 0.2.1-rc.1 | V101-dev | 102 | J1 |
| 0.2.1-rc.2 | V101-dev | 102 | J1 |
| 0.2.1 | V101 | 102 | J1 |
| 0.3.0 | V102 | 103 | J1 |
| 0.3.1 candidate, not released | V104 | 104 | J1 |
| 0.3.2 candidate | V105 | 104 | J1 |

V100 sets the drawing medium to pencil by default. Ink comes from a plan, `--outlinemedium ink`, or the automatic stage choice on a run with no prepared drawing. Sim 102 makes brush water volume consistent across resolution and prepares wet beds before wet-in-wet passages. V101 adds the opt-in `--inkrecipe wash` and `auto`, and fixes the automatic stage choice so it adds ink stages only when ink is asked for. V102 and sim 103 add the full source-stroke pen-and-wash tracer, 1-pigment `--inkres` fine sheet, pass-boundary wash sessions, fingerprinted setup/value-plan caching, paper-state certificates, lower-layer compaction and 10-binding fused GPU step kernels. The 0.3.0 timing charts use development checkpoint `5e91484` against frozen control `41e6868`; that control includes post-0.2.1 changes and is not the published `v0.2.1` tag (`1cc2c08`). Final visual checks use engine commit `efbf8b7`. Each render's own record names the commit that made it. Benchmark scores keep their original version stamps. Sim 100 is the first sim number; it was estimated from earlier simulation revisions.

The 0.3.1 candidate is not released. Sim 104 scales the extra drying at a wet edge by the share of dry paper nearby and by the water depth. V104 is the candidate painter at commit `32b1bfa4`; renders from earlier 0.3.1 development commits carry V103. 0.3.1 was not released; its changes are part of 0.3.2.

The 0.3.2 candidate is not released. V105 changes the paintings: lanes in a wide wash are spaced by the brush's ragged edge, small specks of held white obey the size floor, a planned line is drawn only along a planned passage edge, a reserve box with no paper light keeps a catchlight, and a named paint box gains pans for a large hue cluster it cannot reach. The simulation is unchanged, so the sim stays at 104. The [changelog](../CHANGELOG.md) lists what was measured.

## What each result records

- `tools/paint-plate.mjs` prints a line such as `painter V102 · sim 103 · release 0.3.0 at <commit>` (the 0.3.0 values). It writes `release`, `painterVersion`, `simVersion` and `commit` into `frames.json` and `backend.json`. The commit ends in `-dirty` when tracked files differ from it, and is null outside a git checkout. The painter refuses uncommitted source changes unless `--allowdirty 1` is given, and writes `code-state.json` either way.
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
