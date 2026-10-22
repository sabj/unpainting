# 0.2.1 compared with 0.2.0

By default, 0.2.1 scores the same as 0.2.0 on the published Opus 5.5 V5 plans (J1 6.18 against 6.15) and 3% lower on the pen-and-wash set. The pen-and-wash recipe is opt-in and scores 6% above 0.2.0 on that set. Both releases painted the same targets with the same settings and seeds, and every painting was scored with J1. Each cell is the mean of 3 seeds, and each painting was judged 3 times.

## Default settings: pencil drawing

### Published Opus 5.5 V5 plans

The five benchmark targets, replayed from the published plans with the pencil drawing the harness uses by default.

| Target | 0.2.0 J1 | 0.2.1 J1 | Score change |
|---|---:|---:|---:|
| White Ships | 6.06 | 6.17 | +1.9% |
| Hills | 6.38 | 6.41 | +0.6% |
| Mittens | 6.66 | 6.68 | +0.3% |
| South France | 5.62 | 5.62 | 0.0% |
| Trumbull | 6.02 | 6.00 | -0.3% |
| All five | 6.15 | 6.18 | +0.5% |

Gaps under 0.2 J1 (about 3%) are judge noise. Identical images have scored up to 0.33 apart. The standard error of each target's mean is 0.04 to 0.06.

### Pen and wash set

Eight targets: seven pen drawings and pen-and-wash sketches, and one brush-only control (Fragonard). Sources and licences are in [bench/ink-heavy](../bench/ink-heavy/README.md). Each painting is 1200 px wide, except the camel at 880 px. 0.2.0's automatic stage choice adds ink stages on these pictures. 0.2.1 draws pencil only, so it scores lower on seven of the eight.

| Target | 0.2.0 J1 | 0.2.1 J1 | Score change |
|---|---:|---:|---:|
| Fragonard, Rinaldo (brush only) | 4.76 | 4.94 | +3.8% |
| Tiepolo, Burial of Punchinello | 5.35 | 5.32 | -0.5% |
| Tiepolo, Bacchus and Ariadne | 5.19 | 5.08 | -2.2% |
| Yale (h34-a) | 5.99 | 5.82 | -2.9% |
| Rembrandt, Woman Reading | 5.79 | 5.53 | -4.5% |
| Tiepolo, Punchinello on a camel | 5.67 | 5.39 | -5.1% |
| Yale gateway (h36-a) | 5.91 | 5.59 | -5.3% |
| Guardi, A Colonnade | 6.01 | 5.50 | -8.5% |
| All eight | 5.58 | 5.40 | -3.1% |

## Opt-in: the pen-and-wash recipe

`--inkrecipe wash` draws the source's own pen lines in ink, with no pencil. `--inkrecipe auto` uses the recipe only when the source shows at least 0.5% pen line, scaled to 1200 px wide, and otherwise draws pencil. The table shows `--inkrecipe auto` on the same eight targets. It chose the recipe for seven of them and pencil for Fragonard and Rembrandt.

| Target | 0.2.0 J1 | 0.2.1 `--inkrecipe auto` J1 | Change from 0.2.0 | Change from 0.2.1 pencil |
|---|---:|---:|---:|---:|
| Yale gateway (h36-a) | 5.91 | 6.71 | +13.6% | +19.9% |
| Yale (h34-a) | 5.99 | 6.64 | +10.9% | +14.2% |
| Tiepolo, Punchinello on a camel | 5.67 | 6.18 | +9.0% | +14.8% |
| Tiepolo, Bacchus and Ariadne | 5.19 | 5.56 | +7.2% | +9.6% |
| Tiepolo, Burial of Punchinello | 5.35 | 5.71 | +6.6% | +7.2% |
| Guardi, A Colonnade | 6.01 | 6.27 | +4.4% | +14.0% |
| Fragonard, Rinaldo (pencil chosen) | 4.76 | 4.92 | +3.4% | -0.4% |
| Rembrandt, Woman Reading (pencil chosen) | 5.79 | 5.53 | -4.5% | 0.0% |
| All eight | 5.58 | 5.94 | +6.3% | +9.9% |

Without a plan, on the five standard targets, 2 seeds, `--inkrecipe wash` against pencil was neutral: Hills -0.02, Mittens +0.08, South France +0.06, White Ships +0.11, Trumbull -0.06. The mean is +0.03 +/- 0.04.

On the published plans with their ink drawing, which a plan asks for with `--outlinemedium ink --drawing both`:

| Target | 0.2.0 J1 | 0.2.1 J1 | Score change |
|---|---:|---:|---:|
| South France | 6.30 | 6.41 | +1.8% |
| Mittens | 7.05 | 7.11 | +0.8% |
| White Ships | 6.14 | 6.17 | +0.6% |
| Trumbull | 5.91 | 5.95 | +0.6% |
| Hills | 6.20 | 6.20 | 0.0% |
| All five | 6.32 | 6.37 | +0.8% |

## Opt-in: colour flags

Each was tested against 0.2.0 on the plans with a pencil drawing, 3 seeds, and on the two Yale studies against 0.2.1's pencil drawing. None was positive beyond noise.

| Flag | Mean J1 change | Worst target |
|---|---:|---|
| `--paintguard 2` | 0.00 over five targets (+0.1%) | Trumbull -0.17 (-2.8%), one run |
| `--techcal 1` | +0.02 over seven targets (+0.4%) | South France -0.22 (-3.8%) |
| Removing Trumbull's forced paint box (`bench:run --no-base-palette`) | -0.29 on Trumbull (-4.8%), 3 seeds | Trumbull |

## Known limits

- The pen-and-wash recipe is not the default. A default run draws pencil for every source, so it scores 3.1% lower than 0.2.0 on the pen-and-wash set.
- Guardi is 8.5% lower than 0.2.0 by default, and 4.4% higher with `--inkrecipe auto`.
- The pen-line share that `--inkrecipe auto` reads depends on picture size, so it reads every source scaled to 1200 px wide.
- Four paintings that ran on the CPU instead of the GPU were left out and painted again on the GPU.
