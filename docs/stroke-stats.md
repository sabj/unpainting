# Stroke sizes and the tiny-dab gate

Use fewer, larger strokes to establish the picture. Build connected value masses with broad paint washes, then mid brushes, then selected fine marks. A good result must keep its shapes, values and landmarks within this constraint.

```sh
node tools/stroke-stats.mjs /path/to/run --out /path/to/panel
node tools/stroke-gate.mjs /path/to/panel.json
node tools/stroke-gate.mjs /path/to/run --mode reject
node tools/run-plan.mjs plan.json --stroke-gate reject --out work/plan
node tools/paint-plate.mjs --image target.jpg --marks 1 --strokegate reject --out work/plate
```

Stats write `panel.json` and `panel.svg`, and JSON to stdout. Gate defaults to `warn`, returns JSON, and prints plain-language warnings to stderr. `reject` exits 4 when measured limits fail; input errors exit 2. `off` retains diagnostics but suppresses warnings and rejection. The stroke-plan painter checks admission before allocating or painting and refuses with its usual exit 1. It records the report in `run.json`. The plate painter writes stats and gate reports alongside its recorded tape after rendering and exits 4 on a hard failure. Its generated stroke paths do not exist at plan admission, so this is a run check. A hard plate gate requires `--marks 1`; the default warns when strokes are unmeasured. Checkpoint stops are partial stages, not final gate approval.

The stats reader accepts a run folder, `marks.json`, `marks.json.gz`, an explicit stroke plan (`grid` and `commands`), or `run.json` pointing to that plan. Planned paths are labeled as planned, never as observed deposits. Pass `--sheetmm 152.4` or `--log painter.log` for old tapes. The reader prefers precise `--sheetmm` in an adjacent `run.sh`, then the painter's rounded physical-size log. New plate tapes include `sheetWidthMm`. It never silently assumes a sheet size. Value plans without paths and video snapshots cannot supply stroke-size measurements.

| Threshold key | Default | Meaning |
|---|---:|---|
| `maxTinyPaintShare` | 0.30 | At most 30% of paint marks may be under 1 mm wide or under 3 mm long, counted once in the union |
| `maxUnder1MmShare` | 0.20 | At most 20% under 1 mm wide |
| `maxUnder3MmLongShare` | 0.25 | At most 25% under 3 mm long |
| `minLargestPaintWidthSheetFraction` | 0.10 | Largest paint contact reaches a tenth of sheet width |
| `minBroadWashAreaShare` | 0.50 | At least half the swept paint area comes from paint marks wider than a tenth of the sheet and at least as long as their width |
| `minEarlyBroadWashCount` | 1 | At least one qualifying wash in the first quarter of paint marks |

These are provisional engineering limits chosen from the historical seven-subject distribution and the broad-wash goal. They are not validated human percentile thresholds, and do not reliably separate v0.1.0 from RC2. The reference band of 25.4 to 50.8 mm denotes large practice brushes, not a required width for every sheet. [Castagnet's supply list](https://www.scottsdaleartschool.org/usr/library/documents/supply-lists/castagnet-alvaro_supply-list_watercolor.pdf) calls for big mops, a flat at least two inches wide, and detail brushes. [Penley's manual](https://archive.org/details/systemofwatercol00penl/page/n29/mode/2up) supports broad initial washes. Adapt the guide for miniature sheets and purposeful detail. See the local calibration report `local/STROKE-STATS.md` for the measurements and human-data limits.

Override any thresholds with a JSON object through `stroke-gate --config limits.json`, `run-plan --stroke-gate-config limits.json`, or `paint-plate --strokegateconfig limits.json`. Omitted keys keep their defaults. Unknown keys and invalid values are errors. Use an explicit override for a miniature study, detail-only passage or special style rather than making its geometry appear larger.

Width histograms use median path contact diameter, falling back to brush diameter; the largest contact metric uses maximum point diameter. Pen width uses recorded contact width or nib plus pressure flex, and accounts for fine-sheet recording resolution. Length is the whole polyline arc length, not endpoint distance. Clean-water and pen counts never satisfy paint thresholds. Zero-length contacts count as dabs. A broad single-point dab cannot count as a wash.

Area share is a geometric proxy: local width times path length plus a round end cap. It does not apply a union mask, pressure-dependent bristle coverage, clipping, pigment load, evaporation or later spreading. Overlaps and repeated coats count again. Inspect deposited coverage and the actual painting before treating a gate pass as success. Fine ink lines remain legitimate; the tiny-mark gate concerns paint only. Timeline uses saved-frame indices, or command indices for stroke plans, rather than elapsed seconds.

To reproduce a gallery, give `tools/stroke-stats-gallery.mjs` a JSON array of `{title, version, run, sheetmm, commit, args}` records and an output directory. Human references can supply `{title, image, reason, url}` instead. The gallery includes panels, gate flags, provenance, downloads and a keyboard/touch lightbox.
