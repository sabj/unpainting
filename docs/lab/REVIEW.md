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
