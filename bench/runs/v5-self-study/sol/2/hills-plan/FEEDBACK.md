# Feedback on your previous try (try 1)

This is feedback on the preparation you made in try 1 of this subject. Everything here comes from the harness; nothing in it is a hint about how the judges work beyond what is stated.

## Outcome

The plan was admitted, rendered and judged. Results follow.

## The finished painting: score and judge notes

- composite: 4.98
- composite pm: 0.14
- complete: true
- calls per model: 5
- vision overall pm: 0.28
- rubric version: bench-v3-median5
- subject: hills
- panel: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- criteria:
  - composition values: 4.0
  - edges detail: 2.0
  - marks texture: 1.0
  - classic value: 5.79
  - classic edge: 8.96
  - classic landmark: null
  - classic marks: 7.11
- judges:
  - moonshotai/kimi k3: 2.0
  - zai org/glm 5.3 flash: 3.0
  - qwen/qwen3.5 9 b: 3.0
- breakdown:
  - vision overall: 2.67
  - classic mean: 7.29
  - classic:
    - value: 5.79
    - edge: 8.96
    - landmark: null
    - marks: 7.11
  - vision per judge:
    - moonshotai/kimi k3:
      - overall: 2.0
      - composition values: 4.0
      - edges detail: 2.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.5
      - sd: 0.49
      - all: 2.0, 3.0, 3.0, 2.0, 2.0
    - zai org/glm 5.3 flash:
      - overall: 3.0
      - composition values: 4.0
      - edges detail: 2.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.5
      - sd: 0.49
      - all: 2.0, 3.0, 3.0, 3.0, 2.0
    - qwen/qwen3.5 9 b:
      - overall: 3.0
      - composition values: 4.0
      - edges detail: 2.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.5
      - sd: 0.49
      - all: 3.0, 2.0, 3.0, 2.0, 3.0
  - vision errors:
- models: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- rubric:
  - version: bench-v3-median5
  - calls per model: 5
  - style: loose ink and wash
  - target: targets/hills-crop.png
  - target sha256: cb7a0fc8abb27372575bf4f14ddfe206b72a27731560f8e88df6648133d40733
  - score w: 720
  - resize: Lanczos, painting.png/final.png to SCORE_W x round(SCORE_W*targetH/targetW)

## How the painting developed (progression judge)

A panel of vision judges saw one strip: your target, then the painting at 10, 25, 50, 75 and 100 percent of its strokes. They did not know how it was made. They score each stage from 1 to 5 as: 5 unmistakably a person's painting in progress; 4 convincing with one small tell; 3 plausible but a tell a viewer would notice; 2 mostly not, two or more tells; 1 a finished image being uncovered by a filter, mask, wipe or dissolve.

- At 10% of its strokes: 2.0 out of 5
- At 25% of its strokes: 2.0 out of 5
- At 50% of its strokes: 4.0 out of 5
- At 75% of its strokes: 5.0 out of 5
- At 100% of its strokes: 5.0 out of 5
- Tells named by the judges (times named across judges and stages): speckle or dotted trails instead of drawn lines (2); flat evenly-toned slabs standing in for a form (2); a straight travelling front, a wipe or raster sweep (2); texture arriving as a dump, everything sharpening at once late (1)
- Mean over the five stages: 3.6; mean of the 10% and 25% stages: 2.0.
- Judges who found the order of work human: 0 of 1.
- judge note: The broad washes-then-detail sequence is plausible, but the early stages are flat evenly-toned slabs with a straight diagonal front and dotted speckle trails rather than drawn washes, and texture arrives as a late dump, so the marks read as procedural rather than hand-painted.

## Render record

The harness admitted the plan (no refusals).

Base recipe tokens applied: lay4, ink4, rec2x, rcl, sky3, leaf, vio, rg10, skyb, cpp, tv8, uncap, pgreen, tp2, shs
Base recipe tokens skipped: sep8, cg13, blk60, bmm40, bka20, birr, dk13, dwg200

Option check (what the painter did with the options in your plan):
  - model: []
  - base: foliagerefit
  - template: []
  - label: valueversion, valuevariant, inkcolour, inkfast, texvariety
  - unknown: []

Passages: 5318 laid down with paths, 0 dropped for having no path (0 of planned mass, 0%).
Planned mass 2440498.2427413133.

Render: state done, exit 0, 848.55737303s.

## Files in this folder

- previous-plan/: the plan files you saved last time (config, drawing paths, extra settings, variant, PLAN.md).
- previous-plan/ is the plan as it was painted at the end (after your revisions, if any).
- previous-checkpoints.jsonl: your stops, looks and revisions while it was painted (5 looks, 2 revisions).
- previous-painting.png: the finished painting.
- compare.png: your target on the left, the painting on the right, same height.
- stages.jpg: the strip the progression judge saw (target, then 10, 25, 50, 75, 100 percent).
