# Benchmark profiles and measurement

The default V4 run is `lite-v2`. V5 and the V1 to V3 toolkit rounds run in full (`full-v2`). Lite cannot run as V5,
because it has no feedback or repair loop. Both profiles preserve all requested targets, paper dimensions in mm,
brush widths in mm, the painter recipe, target guards and essential stage evidence, and both paint at the same
native density: the subject's own width, one sheet cell for each target pixel (0.259 mm a cell).

The painter does not paint from an enlarged source, so no profile paints a subject wider than its target. Until 0.3.3
the subjects were 1200 to 1224 cells wide, four times their 300 px targets, and `lite-v1` capped that at 540 cells.
That cap is over every target now, so `lite-v2` has none. The ids became `-v2` with the subject sizes: a `-v1` record
was painted from an enlarged target and is never grouped with a `-v2` record.

| Setting | Lite | Full |
|---|---|---|
| Tries per model and target | 1 | 3 |
| Native width | subject specification (300–306, the target's own width) | same |
| Model time per target | 5 minutes | 85 minutes of active work |
| Wall safety cap per model turn | 5 minutes | 300 minutes |
| Model task | write plan, then exit | paint, inspect and revise |
| Automatic repair turns | 0 | at most 1 |
| Harness check timeout | 2 minutes | 15 minutes |
| Renderer timeout | 10 minutes | 60 minutes |
| Large per-mark exports | off | on |
| Final judging | J2-lite: 3 initial calls | J2-full: 15 initial calls |
| Progression judging | 2 calls | 2 calls |

Compact stroke statistics, the audit ledger, final PNG and required stages remain available with mark exports off.
Lite is a development screen: one unrevised plan and lighter judging, so it is not interchangeable with full quality evidence.

```sh
npm run bench:lite -- --plan
npm run bench:lite -- --gpu off --out bench/work/suites/lite-example
npm run bench:suite -- --profile full --models core --gpu off --out bench/work/suites/full-example
npm run bench:lite -- --gpu off --out bench/work/suites/lite-paired --baseline bench/work/suites/full-example/suite.json
```

The default suite roster is Astra, Sol, Opus, Sonnet, Argon-high and Gemini Flash. `--models all` retains the full roster;
`--models core,wonderfull,spark` adds both Muse variants. No effort setting is silently reduced. Each job and failure
is recorded; there are no automatic substitutes or retries. Use a new output folder for a new experiment. `--force`
explicitly replaces it. Outputs stay under ignored bench/work by default, separate from published runs.

Doctor runs before paid suite jobs. The renderer backend is explicit (`--gpu off|on`), not an automatic CPU/GPU fallback.
Lite disables the seeded standalone check and self-view helpers. Local process groups are stopped and cleaned up
before the harness renders, including surviving tools after normal CLI exit. This is a task contract plus local
watchdog, not an OS sandbox or proof of provider-side cancellation.

Muse receives supported step/output limits (24 model steps, 12000 tool-output bytes). Argon receives a five-minute
CLI timeout. A 200000-token watchdog acts when provider usage is observable. Usage can arrive late, and local process
termination cannot prove a remote provider stopped billing. Interrupted/incomplete usage stays unknown; observed
partial counts are retained separately. These controls do not constitute a universal hard token or dollar cap.

## What the 80 percent objective means

Compare the same model IDs/efforts and the same targets, on the same machine/backend and code, one lite try versus
three full tries. The offline plan currently estimates 90.2% fewer initial final+progression calls and 66.7% fewer
grid-cell/try operations (one try in place of three, at the same width). Retries can add calls. These are work estimates, not measured speed, money or quality gains.
Dropping models is not counted as an optimization.

`suite.json` records actual whole-suite wall time, renderer time, provider-reported model tokens, completeness and
provenance. Baseline comparisons require the intended lite/full profiles and try counts, matching targets and hashes,
paper/style specifications, source commit, versions, roster/effort, machine/backend, scoring route/rubric/protocol and
progression panel. Missing or failed jobs prevent certification.

Only observed reductions are reported. Unknown usage/cost stays null rather than zero. Total billed model plus judge
cost is not yet available across all providers, so the suite cannot currently certify the combined time-and-cost
objective. A large reduction in allocated minutes or judge calls does not establish actual quota savings.

Results keep budget, native density, judge sampling/route and strict-verdict groups separate, and withhold aggregate
rankings until the planned targets and tries are complete. Published J1 records are kept as they are.
