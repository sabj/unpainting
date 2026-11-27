# Demo assets

The published examples are new section-brush paintings rendered from checkout `179f2cb7` with Metal WebGPU, full stroke tapes, prepared drawings, and block-in studies. The drawings dry before the washes; the pencil example also retains its recorded later drawing phases. Each manifest entry records the source revision, dirty status, adapter, dimensions, and target hash. The checkout's package release label remains `0.4.0-rc.5`; these are current 0.5 development renders, not archived runs relabelled as a release.

| Example | Drawing | Native sheet | Finished image |
| --- | --- | --- | --- |
| Bacchus and Ariadne · Tiepolo | Ink | 556 × 707 | 556 × 707 |
| Bathers under a Bridge · Cézanne | Pencil | 713 × 552 | 2139 × 1656 |
| The Laundresses · Prout | Ink | 532 × 740 | 532 × 740 |

All outputs fit within their original source dimensions. The source artwork and prepared material credits are in [NOTICE](../NOTICE). The original render directories, command arguments, full PNG paintings, run cards, and frame manifests remain under `work/demos-05-*`; they are not needed to serve the demos.

Publish a finished run with the repository's builders:

```sh
node tools/lab/sync-site-media.mjs
node tools/lab/build-live-examples.mjs ID RUN TARGET --title TITLE --kind KIND --credit CREDIT
node tools/lab/build-live-checkpoints.mjs ID
node tools/lab/build-layers-example.mjs RUN NAMED_SAM_RECEIPT TITLE
```

The checkpoint builder accepts example IDs to avoid rebuilding unrelated paintings. It saves actual sheet fields and depleted tool states at 10%, 25%, 50%, 75%, 90%, and 100% of the complete tape.

Layers uses the Tiepolo run's lossless saved frames and its fixed SAM map of 15 named forms. Its wash layers are three contiguous groups of recorded brush passages; no intermediate painting frames are synthesized. `layers/data/meta.json` retains each original saved frame number and hash. The raster worker prepares subject selections and timeline positions away from the UI thread; the page retains its canvas nodes while scrubbing.

`thumbs/lab*.webp` come from the new Prout run. `thumbs/layers*.webp` are captures of the replacement dataset. `thumbs/fungi.webp` is a newly completed native painting from Spore Studies.

Run the interaction timing check separately from the GPU physics suites:

```sh
node --test tools/lab/demo-fps.mjs
```

The check serves the unmodified demos, uses Chrome/Metal at 1440 × 1000, drives their actual controls, and writes `work/demo-fps.json`. It checks RAF cadence and callback work, reports artwork deliveries, and rejects long main-thread tasks. A 60 Hz timestamp interval is 16.667 ms; the cadence assertion allows host jitter while callback work must fit 16.6 ms. It does not claim that native physics checkpoints or saved recording frames are generated at 60 Hz.

M5 Max verification on 27 November 2026: all 16 interaction cases passed at 1× density, including the three replacement recordings and a live wash resumed at 50%; the 2× density run also passed. RAF p95 was 16.7–16.8 ms across the demos, with no long main-thread tasks. The additional Chrome 4× CPU-throttled run passed the 33 ms work budget. CPU throttling is a slower-machine proxy, not a measurement of another physical computer. Full reports are in `work/demo-fps-m5.json`, `work/demo-fps-retina.json`, and `work/demo-fps-throttled.json`. Steady morph/orbit worker time was 7.1/4.5 ms p95, with 178 delivered previews per 180 requested frames. These are percentile checks, not a guarantee against an isolated missed compositor frame during specimen preparation.

The full `npm test` run exposed eight existing failures, reproduced from an archive of the untouched starting commit: three in `src/media/gpu/stroke-batch-waits.test.mjs` and `src/media/gpu/tuft-contact.test.mjs`, and five in `tools/paint/rope-modules.test.mjs`, `run-sets.test.mjs`, and `session-net.test.mjs`. No `src/` files changed in this demo overhaul. Switching the hand-brush helper to Section also exposed Row-specific calibration tests that had omitted their model; those now select Row explicitly, and the 36 load/contact checks pass with physical-unit conservation checks for the Section default.

The requested GPU/mirror, demo sweep, and 214 Spore Studies tests pass. The checkpoint, recorded-example, physical tape, and load/contact checks pass. `npm run bench:test` passes (258 passed, one dependency-related skip).

Live replay now supports fixed-bed support and hollow fill on the browser GPU. Clipping no longer copies physical fields. The complete 627-stroke Bacchus tape at 8× took 47.2 seconds of replay, with two whole-sheet reads and uploads; the prior CPU path took 461.5 seconds. Its actual material-frame delivery remains variable (92.7 ms p95 in that complete replay); the UI cadence test is separate from physics throughput. Default Recording mode displays the saved painting stages on a 60 Hz playback clock.
