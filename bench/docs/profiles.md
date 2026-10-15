# Benchmark profiles and measurement

The default V4 run is `lite-v1`; V5 and the historical toolkit rounds retain full behavior. Lite cannot run as V5,
because it has no feedback or repair loop. Both profiles preserve all requested targets, paper dimensions in mm,
brush widths in mm, the painter recipe, target guards and essential stage evidence. Native density changes.

| Setting | Lite | Full |
|---|---|---|
| Tries per model and target | 1 | 3 |
| Native width | at most 540 | subject specification (1200–1224) |
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
Lite is a development screen; its native density can lose fine detail, so it is not interchangeable with full quality evidence.

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
three full tries. The offline plan currently estimates 90.2% fewer initial final+progression calls and about 93% fewer
grid-cell/try operations. Retries can add calls. These are work estimates, not measured speed, money or quality gains.
Dropping models is not counted as an optimization.

`suite.json` records actual whole-suite wall time, renderer time, provider-reported model tokens, completeness and
provenance. Baseline comparisons require the intended lite/full profiles and try counts, matching targets and hashes,
paper/style specifications, source commit, versions, roster/effort, machine/backend, scoring route/rubric/protocol and
progression panel. Missing or failed jobs prevent certification.

Only observed reductions are reported. Unknown usage/cost stays null rather than zero. Total billed model plus judge
cost is not yet available across all providers, so the suite cannot currently certify the combined time-and-cost
objective. A large reduction in allocated minutes or judge calls does not establish actual quota savings.

Results keep budget, native density, judge sampling/route and strict-verdict groups separate, and withhold aggregate
rankings until the planned targets and tries are complete. Historical J1 records and published outputs are preserved.
