# Paint Lab playback review — 10 October 2026

Scope: Paint Lab and its shared simulator in unpainting. No blog files changed.

## What changed

Live playback uses one presentation clock, smaller path segments and a minimum stroke duration. The paper is sized from the viewport and its aspect ratio, never changing status text. The manual cursor is cleared during playback, and zoom transforms the sheet and its overlays together. Fullscreen reserves fixed places for the paper and controls.

Each example has physical checkpoints and previews at 10%, 25%, 50%, 75%, 90% and the end, for both stroke-count options. Clicking a thumbnail immediately shows that state and its progress. The worker restores the water, pigment, masks, brush loads, pen reservoirs and next recorded event, then continues painting. It never replays the prefix to seek. A regression test compares resumed and uninterrupted painting exactly, including depleted instruments and brush randomness. Saved paintings also retain their recorded pigments and paper.

The on-paper entry offers Blank, Example and Technique in one tap, reusing the existing options; the latter two choose from the existing catalogue at random. The catalogue remains under **Quick start**. The target and six clickable previews replace the former text-heavy area. Actual instrument and pigment swatches accompany playback, with phase labels derived from the recorded tool and passage. Status text is secondary. The mixer is behind a disclosure; hand tools remain nearby.

Reviewing the long h36 study exposed a separate simulator fault: fractional brush stiffness produced fractional array indices in paper quantile sampling. The first wash could introduce invalid water and pigment. Sampling now uses integer cells. A scaled, partly depleted brush regression covers it, and all shipped checkpoints are checked for finite water and pigment values.

## Review passes and resulting edits

1. **Independent baseline screenshot review:** the paper started below the phone viewport; the fixed tool strip covered content; fullscreen was an unlabeled icon; tool and painting names truncated; the full mixer dominated the desktop. Moved the paper and three entry actions up, removed the fixed strip, labelled Fullscreen, widened/shortened labels, and collapsed detailed mixing.
2. **Independent revision review:** landscape Pause was below the fold; phone tools followed secondary text; manual selections conflicted with replay materials; the early-study endpoint could imply the complete painting. Put landscape playback controls beside the paper, moved phone tools ahead of secondary content, labelled the desktop panel “Your tools”, and identified the selected stroke-count study above the sequence.
3. **Fresh reviewer, screenshots plus phone interaction:** blank landscape wasted the right column; phone fullscreen pushed the sheet to the bottom. Gave blank landscape a side panel too, removed the obsolete fullscreen width rule, and reserved stable fullscreen layout slots. Palette controls, overflow, exit and focus return were checked.
4. **Interaction and final visual review:** tested immediate seek, live continuation, pause, carry-on painting, recording mode, technique materials, saved-sheet restore, touch targets and fullscreen at desktop, phone and tablet sizes. Added a clearly visible instrument handle anchored to the actual deposited stroke point; its footprint follows recorded radius changes.

## Evidence

Viewport set: 1280×900 desktop; 390×844 and 844×390 phone; 768×1024 and 1024×768 tablet. Final checks found no page overflow, no enabled button/select/summary/slider below 44 px, and no console or page errors. Screenshots are headless Chrome captures, including WebGPU operation.

Both WebGPU and CPU fallback resumed a 75% seek at stroke 187 of 250. The preview was made visible in the click handler (under 1 ms in the local check). Across 120 animation-frame samples, paper x, y, width and height each varied by **0 CSS px**. A separate later-wash fullscreen check also measured **0 CSS px** variation. This is a local measurement, not a promise of network download time or frame rate on every device.

Artifacts, relative to the worktree:

- `output/playwright/before-{WIDTH}x{HEIGHT}.png`
- `output/playwright/final-start-{WIDTH}x{HEIGHT}.png`
- `output/playwright/final-playing-{WIDTH}x{HEIGHT}.png`
- `output/playwright/final-fullscreen-blank-{WIDTH}x{HEIGHT}.png`
- `output/playwright/final-fullscreen-playing-{WIDTH}x{HEIGHT}.png`
- `output/playwright/final-h36-washes-1280x900.png`
- `output/playwright/final-technique-390x844.png`
- `output/playwright/final-recording-390x844.png`
- `output/playwright/interaction-results.json`
- `output/playwright/responsive-results.json`

Validation: `npm test`, including media sync and physical checkpoint regressions; `npm run bench:test`; `node tools/lab/build-site.mjs`. Regenerate checkpoint assets with `node tools/lab/build-live-checkpoints.mjs --gpu`; use `--resume` only for an interrupted build with unchanged simulator code.

## Verification against squashed main — 10 October 2026

Checked a fresh worktree at `8f29c6e496003e9262f4771fac111cf4f4772004` against the pre-squash fixes `016e235402ceb2b3b7b386aa8357aa016a08770f` and `5b0a71c6396e64f58fceec98087af63ac64b9502`. Both fixes are already present in the squashed source. Applying their patches and resolving conflicts in favor of main's later controls, scratch protection, visible operations, and applied-contact outline leaves no source changes. The brush-load helper, depletion tests, playback UI, recorded manifest, physical checkpoint assets, checkpoint tests, and shared brush fix match the old fixes exactly.

Fresh Chrome checks used real pointer strokes and the live simulation in both WebGPU and CPU modes:

- One continuous six-pass stroke with a 25 mm brush and Water 2 visibly faded out. Remaining water fell from about 24,805 after the first pass to below 3 after release. Another stroke in manual mode kept the depleted load; Re-dip restored more than 28,000 after a fresh pass.
- Water 0.15 produced a short, broken dry mark. Auto re-dip replenished its low load at the next pointer-down. Neither mode replenished the brush during a continuous stroke.
- The 75% seek opened at stroke 187 of 250, with an immediate preview. Backward seeking to 25%, pause/resume, seeking into the 2,500-stroke wash at stroke 1,875, and carrying on painting all worked.
- Across 180 animation-frame samples per backend, the paper's position and dimensions varied by zero CSS pixels. Playback advanced through 11 strokes. The applied-contact outline matched the changed-cell boundary exactly in all 82 WebGPU and 78 CPU contact samples. These checks establish stable placement and synchronized paint/contact; they do not promise a particular frame rate.
- Scratch painting near and across the panel left 1,484 visible scratch pixels in free space and zero paint pixels inside protected UI regions. Its canvas retained `z-index: -1` within the isolated page stack.
- No page errors occurred in the brush or playback checks. Screenshots were inspected for depletion, dry marks, playback, and controls.

Validation: `npm test` (854 passed, 3 skipped, 0 failed), `npm run bench:test` (36 passed), and `node tools/lab/build-site.mjs` (159 files). Local evidence and browser scripts are in `output/playwright/{brush,playback,scratch}-results.json`, `check-{brush,playback,scratch}.mjs`, and the corresponding screenshots in this verification worktree.

No requested behavior was omitted. The old generic replay-circle drawing was deliberately not restored: main's outline follows the actual applied contact, including clipping and depletion. This verification changes documentation only.

## Wet hand-brush feed and stroke-start reload — 2026-10-10

Measured from `e05a78a` before changing the Lab settings. Slow feed was most visible at scratch resolution: round outer hairs crossed below free-liquid saturation while the belly still held paint. At ordinary sheet resolution a fresh wet brush retained coverage, but lane pigment varied. The separate 20% reload threshold let partially spent loads begin long washes.

`handBrushOptions` now uses feed 0.6 for wet loads (Water >= 0.4), retaining 0.06 for blotted loads. Transfers still debit water and pigment from the finite belly. Capacity, belly size, contact physics and painter defaults are unchanged. Auto re-dip starts each wet visitor stroke with a fresh palette load; manual mode and low-water dry brush retain their remaining load. Neither mode adds water during an uninterrupted stroke. Sheet and scratch both consume this helper. The faster feed lays more liquid and therefore spends a load sooner: at Water 2 the broad-area test now expects two even sweeps before the third begins thinning.

Reproduce the feed comparison with `node tools/lab/measure-load.mjs`. Cold-press paper, 25 mm brush, pressure 0.8, seed 149, pigment concentration 0.5; pointer segments are two cells long. Sample the inner 65% of the radius, in bands along a 24-inch stroke, before paper flow. Lane CV is standard deviation / mean of pigment per transverse lane; maxima below are over bands with 15–80% load remaining.

| Round brush measurement | Feed 0.06 | Wet feed 0.6 |
| --- | ---: | ---: |
| Mid Water 1.5, scratch 15 dpi, worst lane CV | 20.67% | 1.89% |
| Mid Water 1.5, sheet 60 dpi, worst lane CV | 4.80% | 1.46% |
| Full Water 3, scratch 15 dpi, worst lane CV | 14.77% | 2.65% |
| Full Water 3, sheet 60 dpi, worst lane CV | 5.42% | 1.75% |
| Loaded interior coverage, all these cases | 100% | 100% |
| Dry hairs while loaded, scratch mid/full | up to 2 | 0 |

Mid-water breakup begins with under 3.1% load remaining across round/flat brushes at 15, 60 and 90 dpi. Low Water 0.15 is numerically unchanged: initial round-brush coverage is 21.7%, 32.1% and 38.7% respectively, then fades.

For the reload regression, scale a dipped 10 mm brush's water and pigment to 25% or 40%, retaining Water 2, then paint from x=20 to 700 on a 720-cell, 90 dpi sheet. At 25%, the old policy's final interior coverage was 15.5% round / 16.9% flat; fresh stroke-start loads give 100% for both. The 40% fixture already reached 100%, but now also reloads. Tests cover both Water 2 and 3, both brush shapes, both remaining-load fractions, and manual/dry reload exceptions.

Browser verification used actual pointer drags in Chromium with WebGPU sheet physics and the CPU scratch canvas: a full-water sheet wash and 720-CSS-pixel scratch stroke remained continuous (100% sampled interior coverage). An uninterrupted manual mid-water stroke stayed solid, then faded into broken texture on both surfaces. Screenshots were reviewed at native browser size. `src/media/brush.mjs` and its generated Lab copy remain unchanged; `node tools/lab/sync-site-media.mjs --check` passes.

Validation: `npm test` — 878 passed, 3 skipped; `npm run bench:test` — 36 passed. Initial benchmark attempts hit sandbox worktree restrictions and disk exhaustion; the final complete run passed with temporary worktree access and available disk space.
