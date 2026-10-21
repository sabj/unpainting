# 0.2.0 compared with 0.1.1

0.2.0 paints the same plans better and about twice as fast. Both releases replayed the published Opus 5.5 V5 plans with identical settings on the same GPU type, scored with J1.

| Target | 0.1.1 J1 | 0.2.0 J1 | 0.1.1 time | 0.2.0 time | Speedup |
|---|---:|---:|---:|---:|---:|
| Mittens | 6.34 | 7.05 | 839 s | 493 s | 1.7x |
| South France | 5.46 | 6.45 | 793 s | 469 s | 1.7x |
| Hills | 5.83 | 6.33 | 3141 s | 1760 s | 1.8x |
| White Ships | 5.82 | 6.04 | 2456 s | 1289 s | 1.9x |
| Trumbull | 6.20 | 5.93 | 3548 s | 1775 s | 2.0x |
| Mean | 5.93 | 6.36 | | | 1.8x |

Gaps under 0.2 are judge noise. These scores were measured with ink on; 0.2.0 ships with pencil drawing and no ink by default.

## Where this leaves us

- The painter now carries out more of each plan: it covers more of the planned area and finishes the washes 0.1.1 dropped. That is most of the quality gain.
- The weak points are ink and colour. Plans ask for lines the target does not have, and the pen draws them too thin and too dark, so ink is off by default for now. Plans that force their own paint box lose colour strength and flatten values.
- Next: rework ink, let the painter pick its own palette, and score the pencil default. From 0.2.1 the Yale studies replace Trumbull in the benchmark. Each change is kept only if it raises J1 on these same plans.
