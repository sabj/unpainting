# 0.2.1 compared with 0.2.0

On pen-and-wash works, 0.2.1 scores 6% higher than 0.2.0 by default. On the published Opus 5.5 V5 plans it scores the same within judge noise. Both releases painted the same targets with the same settings and seeds, and every painting was scored with J1. Each cell is the mean of 3 seeds, and each painting was judged 3 times.

## Pen and wash works, default settings

Eight targets: seven pen drawings and pen-and-wash sketches, and one brush-only control (Fragonard). Sources and licences are in [bench/ink-heavy](../bench/ink-heavy/README.md). Each painting is 1200 px wide, except the camel at 880 px.

| Target | 0.2.0 J1 | 0.2.1 J1 | Score change | Recipe chosen by 0.2.1 |
|---|---:|---:|---:|---|
| Yale gateway (h36-a) | 5.91 | 6.71 | +13.6% | pen and wash |
| Yale (h34-a) | 5.99 | 6.64 | +10.9% | pen and wash |
| Tiepolo, Punchinello on a camel | 5.67 | 6.18 | +9.0% | pen and wash |
| Tiepolo, Bacchus and Ariadne | 5.19 | 5.56 | +7.2% | pen and wash |
| Tiepolo, Burial of Punchinello | 5.35 | 5.71 | +6.6% | pen and wash |
| Guardi, A Colonnade | 6.01 | 6.27 | +4.4% | pen and wash |
| Fragonard, Rinaldo (brush only) | 4.76 | 4.92 | +3.4% | pencil |
| Rembrandt, Woman Reading | 5.79 | 5.53 | -4.5% | pencil |
| All eight | 5.58 | 5.94 | +6.3% | |

Rembrandt is lower. The target shows 0.19% pen line, under the 0.5% that selects the pen-and-wash recipe, so 0.2.1 paints it in pencil. 0.2.0's automatic stage choice added ink stages there, and they helped.

The same table against 0.2.1's own pencil drawing shows what the recipe adds. The drawing is `--inkrecipe none`.

| Target | 0.2.1 pencil J1 | 0.2.1 default J1 | Score change |
|---|---:|---:|---:|
| Yale gateway (h36-a) | 5.59 | 6.71 | +19.9% |
| Fragonard (pencil chosen) | 4.94 | 4.92 | -0.4% |
| Tiepolo, Punchinello on a camel | 5.39 | 6.18 | +14.8% |
| Yale (h34-a) | 5.82 | 6.64 | +14.2% |
| Guardi | 5.50 | 6.27 | +14.0% |
| Tiepolo, Bacchus and Ariadne | 5.08 | 5.56 | +9.6% |
| Tiepolo, Burial of Punchinello | 5.32 | 5.71 | +7.2% |
| Rembrandt (pencil chosen) | 5.53 | 5.53 | 0.0% |
| All eight | 5.40 | 5.94 | +9.9% |

## Published Opus 5.5 V5 plans

The five benchmark targets, replayed from the published plans. The plans set their own drawing, so 0.2.1 leaves it as written.

With the plans' ink drawing:

| Target | 0.2.0 J1 | 0.2.1 J1 | Score change |
|---|---:|---:|---:|
| Mittens | 7.05 | 7.11 | +0.8% |
| South France | 6.30 | 6.41 | +1.8% |
| White Ships | 6.14 | 6.17 | +0.6% |
| Trumbull | 5.91 | 5.95 | +0.6% |
| Hills | 6.20 | 6.20 | 0.0% |
| All five | 6.32 | 6.37 | +0.8% |

With a pencil drawing, the harness default:

| Target | 0.2.0 J1 | 0.2.1 J1 | Score change |
|---|---:|---:|---:|
| White Ships | 6.06 | 6.17 | +1.9% |
| Hills | 6.38 | 6.41 | +0.6% |
| Mittens | 6.66 | 6.68 | +0.3% |
| South France | 5.62 | 5.62 | 0.0% |
| Trumbull | 6.02 | 6.00 | -0.3% |
| All five | 6.15 | 6.18 | +0.5% |

Gaps under 0.2 J1 (about 3%) are judge noise. Identical images have scored up to 0.33 apart. The standard error of each target's mean is 0.03 to 0.08. The plans draw their own lines and name their own paints, so the recipe does not apply to them.

## Pen and wash on works that are not pen drawings

Painted without a plan, 2 seeds, pencil against `--inkrecipe wash`. The recipe was neutral on all five standard targets: Hills -0.02, Mittens +0.08, South France +0.06, White Ships +0.11, Trumbull -0.06. The mean is +0.03 +/- 0.04, or +0.6%. 0.2.1 still keeps them on pencil, because their pen line is under 0.5% of the picture. Hills reads 1.0% and gets the recipe.

## Colour changes, off by default

These flags did not pass and are off. Each was tested against 0.2.0 on the plans with a pencil drawing, 3 seeds, and on the two Yale studies against 0.2.1's pencil drawing.

| Flag | Mean J1 change | Worst target | Why it is off |
|---|---:|---|---|
| `--paintguard 2` | 0.00 over five targets (+0.1%) | Trumbull -0.17 (-2.8%), one run | Not positive beyond noise. |
| `--techcal 1` | +0.02 over seven targets (+0.4%) | South France -0.22 (-3.8%) | Positive on Hills (+0.21) and h36-a (+0.13), negative on South France and others. |
| Removing Trumbull's forced paint box (`bench:run --no-base-palette`) | -0.29 on Trumbull (-4.8%), 3 seeds | Trumbull | Beyond noise. |

## Known limits

- The pen-line share that selects the recipe depends on picture size. 0.2.1 reads every source scaled to 1200 px wide, so `--width` does not change the choice.
- Rembrandt scores 4.5% lower than 0.2.0, and the recipe does not select it.
- Four paintings that ran on the CPU instead of the GPU were left out and painted again on the GPU.
- Scores are from one judge pass of J1 per painting, 3 judgings each.
