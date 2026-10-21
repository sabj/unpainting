# 0.2.0 compared with 0.1.1

0.2.0 scores 7% higher on the same plans and paints them in about half the time. Both releases replayed the published Opus 5.5 V5 plans with identical settings on the same GPU type, scored with J1.

| Target | 0.1.1 J1 | 0.2.0 J1 | Score change | Time saved | Speedup |
|---|---:|---:|---:|---:|---:|
| Mittens | 6.34 | 7.05 | +11% | 41% | 1.7x |
| South France | 5.46 | 6.45 | +18% | 41% | 1.7x |
| Hills | 5.83 | 6.33 | +9% | 44% | 1.8x |
| White Ships | 5.82 | 6.04 | +4% | 48% | 1.9x |
| Trumbull | 6.20 | 5.93 | -4% | 50% | 2.0x |
| All five | 5.93 | 6.36 | +7% | 46% | 1.9x |

Gaps under 0.2 J1 (about 3%) are judge noise. Fixed plans on ten more subjects agree: 0.2.0 is 4 to 6% higher on average. Times are approximate because the machines were shared. The scores were measured with ink on. The 0.2.0 bench harness draws pencil only.

## Why it changed, and known limits

- The painter carries out more of each plan. It covers more of the planned area and finishes washes that 0.1.1 dropped. That is most of the quality gain.
- Ink and colour are the weak points. Plans ask for lines the target does not have, and the pen draws them too thin and too dark. For that reason `--outlinemedium` defaults to graphite in 0.2.0, and the bench harness draws no ink.
- Plans that force their own paint box lose colour strength and flatten values.
