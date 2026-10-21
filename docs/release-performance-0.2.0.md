# 0.2.0 render timing comparison

## Summary (20 October 2026)

The release comparison holds the plan fixed. The published Opus 5.5 V5 winning plans (try 1) for all five benchmark targets were replayed, unchanged, at their published width, sheet and seed, on 0.1.1 (`1084396`) and 0.2.0 (`06174e8f`), on the same GPU type (RunPod L40S), and scored with J1.

| Target | 0.1.1 J1 | 0.2.0 J1 | 0.1.1 paint time | 0.2.0 paint time |
|---|---|---|---|---|
| Hills | 5.83 | 6.33 | 3141 s | 1760 s |
| South France | 5.46 | 6.45 | 793 s | 469 s |
| Ships | 5.82 | 6.04 | 2456 s | 1289 s |
| Mittens | 6.34 | 7.05 | 839 s | 493 s |
| Trumbull | 6.20 | 5.93 | 3548 s | 1775 s |
| Mean | 5.93 | 6.36 | | |

Gaps under about 0.2 J1 are judge noise (the same image judged twice moved by up to 0.17). Times are from shared boxes and are approximate. The 0.1.1 replay scores 0.31 lower on average than the published paintings, which were made with the internal V096 benchmark build. Fixed-plan suites over ten subjects at 540 px, 1086 px and native width agree (0.2.0 higher by 0.24 to 0.29 J1 on average). Hills is slower on 0.2.0 in one speed pair (1268 s against 1070 s, 27.8 GB against 15.8 GB peak).

## Earlier single replay (19 October 2026)

Evidence checked on 19 October 2026 at 17:53 PDT. In one completed South France replay, 0.2.0 took **328.57 s**, against **824.10 s** for 0.1.1: **2.51x faster**, **60.1% less elapsed time**, and **8m 16s saved**. These are renderer process wall times, including setup and output, with no planning-model session or judge calls.

Both releases received the same archived input plan, drawing files, target and command-line arguments except for the output directory. This is a single diagnostic pair on the same machine, not a repeated performance benchmark. Cache state and other machine activity were not tightly controlled. Each release interprets the plan through its own implementation, so its resulting marks and output work can differ.

## Wall-clock comparison

Both bars start at zero. Each character is approximately 15 seconds. Phase details below retain the measured values.

```text
Minutes  0       2       4       6       8       10      12      14
         |-------|-------|-------|-------|-------|-------|-------|
0.1.1    SSSSSSPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPF  13m44s
0.2.0    SSSPPPPPPPPPPPPPPPPPPF                                     5m29s

S = setup / palette / plan    P = painting    F = finish / overhead
```

| Phase | 0.1.1 seconds | 0.2.0 seconds | Change, 0.2.0 minus 0.1.1 |
|---|---:|---:|---:|
| Load and sheet initialization | 3.7 | 3.2 | -0.5 |
| Palette | 33.8 | 25.2 | -8.6 |
| Plan construction | 58.7 | 17.2 | -41.5 |
| Painting | 722.6 | 272.7 | -449.9 |
| Finish | 1.8 | 7.8 | +6.0 |
| Other process overhead | 3.50 | 2.47 | -1.03 |
| **Total wall time** | **824.10** | **328.57** | **-495.53** |

Phase counters are rounded to tenths of a second. Other process overhead is the residual between the measured process wall time and those counters; it has not been attributed to a particular function. Drawing and film counters rounded to zero in both logs.

The painting phase accounts for **90.8% of the net saving**; plan construction accounts for **8.4%**. Finish time increased by 6.0 s. This locates the saving by phase; it does not isolate the contribution of individual GPU, simulation or planning changes. The painting timer includes simulation, feedback and frame work, rather than measuring GPU execution alone.

## Replay conditions and evidence

| Setting | Value |
|---|---|
| Baseline | 0.1.1, painter V096, sim 100, `1084396961bc64d362def90784191ab3a75dd22f` |
| Candidate | 0.2.0, painter V099, sim 102, `06174e8ffddfd01ae4bcc8d34bbb3ee33a45c45b` |
| Machine | Apple M4 Mac mini, 16 GiB RAM, macOS 26.2, Node 25.8.2 |
| Backend | GPU, WebGPU/Dawn on Metal; `--gpu auto`, `--mode fast` |
| Input and output | South France, 304 x 249 reference; 1216 x 996 render; 280 mm sheet width |
| Plan | Archived South France plan, try 1; no model inference |
| Shared settings | Seed 0, mark recording on, video off, `--runcache 0` |
| Repetitions | One completed render per release; earlier interrupted diagnostics excluded |

The command records match after normalizing `--out`. Both completed renders exited with code 3 for recorded unused options, retained their painting outputs, and were not interrupted by a resource guard. The candidate log records a segmentation-cache hit. Peak sampled process-tree RSS was 11,669 MiB for 0.1.1 and 10,075 MiB for 0.2.0; these are diagnostic samples, not a memory guarantee.

The command lines, phase logs and wall-time and memory records are kept in the private benchmark archive.


Input SHA-256 values checked when recording this note:

```text
config.json         a87f3b6ef567437486a4207ce3712ea5539d6faa80b336d386e35fda02267db6
opening-lines.json  3aa974325f354a063c8dab51aa92dceb412344b523640cac388d8b571d1ee3fd
closing-lines.json  e22c1b461e75e8621e98e1ac0f4945b9fea19de6dfc1f22bc3345e9de77220b4
```

## Fresh model-driven comparison

The fresh South France pilot is separate from the replay above. Each release receives its own informed plan from the same model under a common frozen harness, prompt, budgets, resolution and judging protocol. A fresh V4 painting is followed by two V5 revisions using that release's previous painting and feedback. V4/1 is also the V5 starting painting and is counted once. The requested models are Sol High, Sol XHigh and Argon.

Renders are 1216 x 996. J1 image judging uses the reference's native 304 x 249 size, with three judges and five requested calls per judge, through Together. The displayed index is `100 * raw J1 score / 8.43`, using the historical reference self-score. It is not a calibrated percentage of human credibility. Progression is judged separately on a 1-to-5 scale.

Status at the evidence check:

| Release and round | Indexed J1 | Raw J1 | Progression mean | Status |
|---|---:|---:|---:|---|
| 0.1.1 Sol High V4/1 | 74.85 | 6.31 | 2.1 / 5 | Painting and evaluation complete |
| 0.2.0 Sol High V4/1 | 71.53 | 6.03 | 2.6 / 5 | Painting and evaluation complete |
| 0.2.0 Sol High V5/2 | 79.36 | 6.69 | 3.2 / 5 | Painting and evaluation complete after a scoring retry |
| Remaining revisions and Sol XHigh | Pending | Pending | Pending | Not complete |
| Argon | Pending | Pending | Pending | Headless CLI command permissions unresolved |

The completed V4 pair gives 0.2.0 a **-3.32 indexed-point** final-image quality delta and a **+0.5 / 5** progression-score delta. Both image evaluations obtained all five calls from each of the three judges. Neither release received a human-order vote from either progression judge. These are one-target results, not release-wide quality means. The candidate's 79.36 V5/2 index is paired with the baseline V5/2 at 76.28 (+3.08), and does not establish an 80% human-credible progression result.

The three image-judge medians were 3/5/4 for 0.1.1 and 3/5/3 for 0.2.0; two judges were unchanged and one fell by one point. The classical component also fell, from 8.62 to 8.38. One paired attempt does not establish a statistically reliable release-quality difference. Both arms used Together; these indexed numbers should not be compared directly with historical OpenRouter leaderboard rows.

| Paired V4 wall-time counter | 0.1.1 | 0.2.0 | Change |
|---|---:|---:|---:|
| Painting session, including model work | 1454.982 s | 674.381 s | -53.7% |
| Painter child lifetime, including inspection pauses | 1127.430 s | 476.729 s | -57.7% |
| Scoring after painting | 164.986 s | 245.838 s | +49.0% |
| Painting session plus scoring | 1619.968 s | 920.219 s | -43.2% |

Thus this fresh model-driven V4 pair took **27m 00s versus 15m 20s** including scoring. These times exclude queue idle time. The model chose different plans and amounts of work (26,712 versus 13,273 strokes), so this is a cycle-time observation, not an isolated renderer speed measurement. The completed comparison preserves both 1216 x 996 PNGs; the baseline V5 refinement has since finished (V5/2 76.28, V5/3 78.65 indexed).

Measured candidate cycle times, useful for estimating benchmark turnaround:

| Counter | V4/1 | V5/2 |
|---|---:|---:|
| Painting session wall time, including model work | 674.381 s | 1880.657 s |
| Painter child lifetime, included in session wall time | 476.729 s | 1566.412 s |
| Logged inspection pauses, included in painter lifetime | 129 s | 188 s |
| Painter lifetime minus logged pauses | 347.729 s | 1378.412 s |
| Active model clock, rounded; overlaps painter lifetime | 4.0 min | 7.2 min |
| Successful scoring attempt, after painting | 245.838 s | 222.264 s |
| Earlier failed scoring attempt | None | 77.154 s |

Painter lifetime includes pauses and resume/output work. Its pause-adjusted value is not GPU-only time. Do not add model minutes to painter lifetime: they overlap. V5/2 used 189 passages and 25,085 strokes, versus 48 passages and 13,273 strokes for V4/1, so these two candidate rounds are not a fixed-workload speed comparison.

Qwen HTTP 503 responses left the first V5/2 evaluation incomplete. Scoring alone was retried under the same J1 protocol; the painting was retained. Both evaluation attempts are preserved. Provider failures, queue idle time and scoring retries must remain separate from renderer speed in release claims.

Fresh-pilot evidence (kept in the private benchmark archive): `protocol.json`, `scoreboard.json`, `runs/sol-high/<release>/`, `score-retry-candidate-v5-2/`, and `queue-priority-change.json`. Harness corrections made for this pilot belong to benchmark infrastructure, not to the measured 0.2.0 engine SHA.

The candidate commit alone cannot reproduce this exact pilot: it requires the archived common harness. Its `protocol.json` freezes the file hashes and records seven corrections shared by both arms: engine/version routing; managed runner approvals; J1 run labels; harness-owned flag handling and disabled run cache; epoch timestamps in the controller; self-checks against the assigned clean engine; and progression-response retries with a larger token limit after truncation. These corrections were not applied to either measured engine checkout. The longer progression replies explain part of the scoring-time difference; that difference is not an engine-performance result.

The first V4 pair is complete; remaining V5 and model comparisons must be reported separately as they finish. Keep the fixed-plan replay result scoped to this image until repeated or broader measurements support a general speed claim.
