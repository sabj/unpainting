# Mittens — Painting Plan

## 1. Visual Analysis of `bench/plan/target.png`
The target (`300 × 259` px, painted at `--width 1200` on a `280 mm` cold-press sheet) is a high-key watercolor portrait sketch (`"watercolor portrait sketch, fine lines and light washes"`) pairing an orange-and-white tabby cat ("Mittens") on the left with a curly-haired, bearded man on the right against an untouched white paper background:
- **Untouched paper & essential reserves**: Over half of the sheet is bare white paper (`[252, 251, 248]`), including the upper-left and upper-right background, the cat's white muzzle and central chest ruff (`[0.160, 0.560, 0.210, 0.610]`), crisp eye catchlights (`[0.263, 0.216, 0.271, 0.233]` and `[0.086, 0.242, 0.092, 0.249]`), the man's bright forehead plane (`[0.640, 0.460, 0.700, 0.515]`), and the highlight along the bridge of his nose (`[0.672, 0.675, 0.702, 0.710]`).
- **Warm ginger & skin washes (`Mittens.cat-head`, `Mittens.human-face`)**: Warm yellow-ochre and burnt-sienna washes model the cat's ears, forehead stripes, and cheek patches (`x: 0.04..0.50, y: 0.01..0.58`), as well as the man's temple, cheek, eye sockets, and nose (`x: 0.50..0.94, y: 0.42..0.85`).
- **Soft pale shadow washes (`Mittens.cat-chest`)**: Very dilute warm-grey wet-in-wet modeling shapes the cat's white chest ruff and neck fold (`x: 0.01..0.48, y: 0.45..0.99`) while preserving the bright paper core.
- **Cooler neutral-dark hair & beard masses (`Mittens.human-hair`, `Mittens.human-beard`)**: The man's curly dark hair (`x: 0.46..0.99, y: 0.18..0.72`) is built with neutral-cool washes (`Payne's grey` + `French ultramarine` + `burnt sienna`) combined with directional curl line work (`ink-and-wash`), while the lower-face beard and jawline (`x: 0.49..0.92, y: 0.70..1.00`) use cooler grey-brown shadow planes.

## 2. Configuration & Layering Choices
- **Palette (`--paints paynes,ochre,sienna,ultramarine,sapgreen`)**: A 5-paint portrait palette (`Payne's grey`, `yellow ochre`, `burnt sienna`, `French ultramarine`, `sap green`) achieving a `1.95` ΔE sheet/local fit across the neutral greys (`0.9` ΔE), warm ginger/skin tones (`0.7–1.4` ΔE), and the cat's pale green irises.
- **Style selection**: `precise-watercolor` overall so light-to-dark value planes carry the portrait modeling while preserving paper lights, with `Mittens.human-hair` using `ink-and-wash` for the dark curly hair mass.
- **Drawing files (`opening-lines.json`, `closing-lines.json`)**:
  - `opening-lines.json` (115 structural spans): Captures the fine contour and feature lines of the cat's ears, eyes, nose, whiskers, and muzzle, the man's eyes, brows, nose, and curls, and the faint background arch at light opening pressure (`--openingpressure 0.35`).
  - `closing-lines.json` (23 selective dark spans): Reinforces only the highest-contrast focal dark edges (pupils, upper lash/lid lines, nostrils, and darkest curl accents) over the dried washes at moderate closing pressure (`--closingpressure 0.55`).
- **Variant tokens (`region_w13_lay3_noslane_cg11_dk11`) & Extra Args**:
  - `_lay3`: Three middle value layers for clean, readable light-to-dark progression suited to a light-wash portrait sketch.
  - `_noslane`: Disables sky-lane splitting since there is no sky region in the portrait.
  - `--groundglaze 0`: Prevents low-chroma regions in the lower half of the frame (the cat's white chest ruff and the man's beard) from being shifted into a landscape ground glaze.
  - `_cg11` and `_dk11`: Moderate cool gain (`1.1`) and shadow glaze gain (`1.1`) to keep washes light, fresh, and balanced against the fine line work.
