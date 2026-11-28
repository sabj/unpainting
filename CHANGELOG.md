# Changelog

## 0.5.1 (2026-11-27) — 10× Faster GPU Painter, 15-Picture Benchmark & Local-First `open2` Rescore

Major release promoting the `0.5` WebGPU painter and the complete `0.5.1` benchmark to `main`.

### Headline improvements
- **~10× faster rendering on WebGPU (Metal & Vulkan):** Full quarter-sheet paintings now finish in **2–7 minutes** on an M5 Max MacBook Pro (e.g. Turner 2m 13s, Yale Rosewalk 4m 14s, Mittens 7m 06s) — down from 40+ minutes in early CPU builds. Supports multi-machine render pools (`local`, Mac mini, and rented NVIDIA Vulkan pods).
- **Complete `open2` rescore (330 runs, 0 judge faults):** Replaced closed-panel scoring with a reproducible, local-first two-judge vision panel (**Qwen 3.8 27B + Gemma 4 31B**) that runs identically on Apple Silicon MLX (`$0` API cost) and OpenRouter (`r = 0.931` vs. archival 3-judge panel). Grades craft blind side-by-side against Auto 0.5 (`versus-auto`, alternating A/B) and gates craft on 10-frame process human-ness (`Combined = Q × min(1, H / 65)`).
- **Expanded 15-picture benchmark suite:** 12 museum works + 3 generated subjects including **Yale Rosewalk** — covering Core 5 across `L1–L4` (180 runs), Extended 10 at `L2` (70 runs), effort-tier sweeps (`low`/`med`/`high`/`xhigh`, 40 runs), and the **`L4b` open-book control** (proving closed-loop pixel optimization cuts `ΔE` by up to 53% yet wins `0 / 5` on craft).
- **New ladder & honest scripts (Option A + Brief 5):** `L1` bare source, `L2` three block-in colour studies, `L3` opt-in drawing + named forms + Auto reference, `L4` isolated shell (`60` model minutes, GPU wait excluded). Authored scripts get zero automatic source-pixel masking and must reserve their own whites (`lights`).
- **All-new visuals, interactive demos, and visual-first docs:**
  - Updated live **Layers** demo to **Yale Rosewalk** (21 named forms, 4 real painting stages, 3D & 2D views) alongside refreshed Paint Lab & Spore Studies.
  - Redesigned `0.5.1` editorial pipeline map, difficulty-adjusted benchmark overview, Cost-vs-Quality Pareto frontier, judging rubric & difficulty-scoring diagrams, and updated `0.5.1` Fair Mode comparison animation.

### Key benchmark findings (`open2`)
- **All 15 (`L2`):** Auto 0.5 `59.2%` · Codex Astra 6.2 `53.3% ($1.26)` · Codex Sol 6.1 `51.2% ($0.40)` · Gemini 4 Carbon `49.9% ($2.06)` · Gemini 4 Neon `45.4%` · Gemini 4 Argon `44.1%` · Codex Terra 6.1 `41.7% ($0.09)` · Muse Wonder Full `32.6%`.
- **Core 5 (`L1–L4`):** `8/9` models peak at **L3** (`Codex Astra L3 = 61.8%` beats Auto `60.1%`; Sol peaks at `L2 = 55.5%`; `0/9` peak at `L4`, where Python loops double passage counts and trip the human-ness gate).

---

## 0.5.0 (2026-11-26) — WebGPU Physics & Cold-Press Paper

- **WebGPU sheet physics on Metal and Vulkan:** Wet paint flows through cold-press paper fibres, forms capillary backruns/blooms into damp washes, and granulates heavy pigments into paper valleys as the film dries.
- **Continuous brush clearing (`endLine`):** Turning or reversing brush strokes clear their own starting line without clipping return passes.
- **Parallel swatch calibration & fast optical framing:** Pre-paints calibration swatches across CPU workers and encodes lossless frames asynchronously without stalling the GPU.

---

## 0.4.0 (2026-11-24) — Wash Physics, Organic Brushwork & New Ladder

- Added paper cockle, backruns, damp levelling, centimetre-scale paper grain relief (with optional scanned height maps), and form-following brushwork with uneven load.
- Unified `npm run unpaint` CLI and launched the 4-level independent benchmark against Auto (`V4`/`V5` retired to tag `v0.3.2`).

---

## 0.3.2 (2026-11-09) — Defect Repairs
- Stability and defect fixes; no score or speed change.

## 0.3.0 (2026-11-07) — 2.5× Faster Reference Suite
- Combined GPU steps, pruned empty layers, and reduced per-stroke readbacks; three-painting suite dropped from `12.1` to `4.7` minutes.

## 0.2.1 (2026-10-22) — Opt-In Ink & Colour Refinements
- Added opt-in ink and colour adjustments while preserving 0.2.0 default scores.

## 0.2.0 (2026-10-20) — +7% Score in 46% Less Time
- Improved planned scores by 7% over 0.1.1 while cutting runtime nearly in half; switched default drawing medium to pencil (ink opt-in).

## 0.1.1 (2026-10-15) — Hosted Benchmark Alignment
- Added more models, aligned scoring across models, and introduced hosted OpenRouter judging.

## 0.1.0 (2026-10-07 / 2026-10-10) — Initial Release
- Watercolour, paper, brush, dip-pen, and pencil simulator (CPU + WebGPU); CLI painter; JSON stroke plans; Paint Lab; target-read guard; release/commit stamping; initial benchmark rounds (`V1–V3`).
