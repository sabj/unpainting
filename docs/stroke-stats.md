# Stroke sizes and broad-area tiny-mark reliance

Tiny paint marks are useful on edges, textures and small features. The gate warns only when they carry a planned broad, low-detail wash interior. Paint counts, the largest brush, early wash counts and the old summed swept area are secondary diagnostics.

```sh
node tools/stroke-stats.mjs /path/to/run --out /path/to/panel
node tools/stroke-gate.mjs /path/to/panel.json
node tools/stroke-gate.mjs /path/to/run --mode reject
node tools/run-plan.mjs plan.json --stroke-gate reject --out work/plan
node tools/paint-plate.mjs --image target.jpg --marks 1 --strokegate reject --out work/plate
```

Stats JSON version 2 contains `composition` and the original count histograms. `loadStats` is now asynchronous because finished-image decoding supplies the visible weights. The SVG adds a bar for composition carried by large, mid and tiny paint marks. Grey represents visible paint that the contact estimate cannot attribute.

Tiny means median paint contact under 1 mm wide OR a path under 3 mm long. Large means width over a tenth of the sheet and length at least its width; other paint is mid. Pen and clean water are separate. A zero-concentration dip is clean water even if an old tape did not mark it as prewetting. Zero pressure or zero observed pigment loss cannot contribute paint.

## The two gate limits

| Config key | Default | Meaning, for each broad interior |
|---|---:|---|
| `maxBroadAreaTinyAreaShare` | 0.30 | At most 30% of interior area carried by tiny paint |
| `maxBroadAreaTinyVisibleShare` | 0.30 | At most 30% of visible paint tone and colour carried by tiny paint |

Equality passes. Global count share and global tiny coverage never trigger a painting-quality flag. `flags` contain only failing broad areas, identified by plan ID. Missing spatial or deposit evidence has a separate `unmeasured` reason, with `verified: false`; hard rejection refuses an unverified input. Default warning permits rendering. `off` suppresses warnings and rejection.

The limits are provisional engineering choices, not calibrated human percentiles. They allow small accents over a wash while catching an interior filled by tiny paint instead of a wash. A gate pass still needs visual judgment.

Override limits with a JSON object through `stroke-gate --config`, `run-plan --stroke-gate-config` or `paint-plate --strokegateconfig`. Old count-based threshold keys are errors, so a stale config cannot silently keep rejecting legitimate detail.

## Broad areas come from the plan

Explicit stroke plans declare intended broad low-detail areas as normalized polygons:

```json
{
  "broadAreas": [{
    "id": "wall",
    "label": "Sunlit wall wash",
    "polygon": [[0.1,0.2],[0.9,0.2],[0.9,0.8],[0.1,0.8]],
    "edgeClearanceMm": 1,
    "detailPolygons": [[[0.4,0.3],[0.6,0.3],[0.6,0.6],[0.4,0.6]]]
  }]
}
```

The window in `detailPolygons` is exempt. One millimetre inside the area's contour is also exempt by default. An explicit empty `broadAreas` array declares a detail-only plan; it must still supply measurable pigment loads. An absent array is unmeasured, rather than an automatic exemption. These annotations describe intent and must be reviewed with the plan.

Historical image-painter runs use adjacent `value-plan.json` and `value-commands.jsonl`. The tool pairs command geometry with the tape's quantized paths and takes each broad value-shape's recorded clip. A non-texture planned shape qualifies when its area is at least 1% of the sheet and its planned support width is at least 3 mm. Later glazes qualify too. One millimetre around every planned hard/soft value or feature boundary is excluded; tiny shapes with no substantial interior remain detail. Each area is reported separately, with its plan ID, physical interior area, tiny carried area, tiny visible contribution, tiny covered area and tiny-only area. Overlapping passage reports are not additive. No detail mask is inferred from the noisy final painting.

## How the weighted estimate works

The analysis uses a CPU raster 512 cells wide, scaled to the physical sheet. Recorded contact discs follow the whole polyline and local radius, clipped to the sheet, recorded passage clip and masking fluid. A cell is counted once for coverage, even under repeated coats.

For matched executed commands, pigment loss from the brush before/after snapshots estimates each mark's deposited mass. For other marks, recorded concentration, contact area, pressure, film thickness and a finite prepared brush reservoir estimate delivery, with depletion between dips. The pigment's channel absorption coefficients apportion those deposits between red, green and blue.

At each cell, tiny's share of estimated pigment absorption apportions one cell of carried area. The average over the whole broad interior is `tinyCarriedAreaShare`; unpainted cells contribute zero. This prevents a light accent over a substantial wash from claiming the entire cell. `tinyCoveredShare` records any tiny paint contact and `tinyOnlyShare` records cells supported exclusively by tiny paint. They are useful diagnostics, but do not reject an accent over a wash.

Visible contribution uses the saved final image's per-channel optical distance from the recorded paper colour. Subtracting the ink snapshot's distance removes the estimated ink-first drawing contribution. Deposit shares apportion the remaining paint distance, including tone and colour changes. Final paper-colour pixels contribute nothing. JSON reports tiny's share of visible paint, tiny's share of the whole final distance from paper, and the fraction of paint distance attributable to recorded footprints. Without a final image the report is explicitly a deposit projection, not measured final appearance.

This is an estimate from per-mark deposits, not a wet-transport replay or measured pigment ancestry. Contact discs omit bristle gaps; reservoir loss can include mixing; spreading, pickup, later lifting, and paper texture can change the final support. Coarse raster sampling can miss very fine contacts. Inspect the reported attribution fraction and actual painting. Missing recipes cannot silently establish a pass.

## Inputs and gallery

The reader accepts a run directory, plain/compressed tape, explicit stroke plan, or `run.json` pointing to one. Old tapes need `--sheetmm` or an adjacent log/run script; precise physical sheet flags take precedence over rounded logs. `--plan`, `--commands`, `--final` and `--ink` select the composition inputs explicitly. Adjacent files are detected automatically. Value plans without executed paths cannot supply mark sizes or spatial deposit attribution.

The plate painter writes stats, panel and gate beside its tape after rendering; partial checkpoints do not establish final admission. Its generated paths do not exist before execution. Hard gating requires `--marks 1`. The stroke-plan painter checks projected broad-area reliance before allocation.

`tools/stroke-stats-gallery.mjs manifest.json directory` builds cards with the composition bar, per-area reports, secondary counts, provenance and the keyboard/touch lightbox. Records may supply `tape` and `compositionInputs` for preserved tapes. `archivedStats` retains cached measured results when tapes are unavailable; archived count-only data is clearly unmeasured and never approved by the weighted gate. The generator writes `comparison.json` and `summary.json`.

Human process references lack calibrated stroke paths and deposits. They stay explicitly unmeasured.
