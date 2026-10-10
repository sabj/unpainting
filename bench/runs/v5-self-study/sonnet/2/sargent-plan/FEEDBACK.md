# Feedback on your previous try (try 1)

This is feedback on the preparation you made in try 1 of this subject. Everything here comes from the harness; nothing in it is a hint about how the judges work beyond what is stated.

## Outcome

The plan was admitted, rendered and judged. Results follow.

## The finished painting: score and judge notes

- composite: 4.48
- composite pm: 0.08
- complete: true
- calls per model: 5
- vision overall pm: 0.16
- rubric version: bench-v3-median5
- subject: sargent
- panel: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- criteria:
  - composition values: 4.33
  - edges detail: 2.33
  - marks texture: 1.0
  - classic value: 5.64
  - classic edge: 8.85
  - classic landmark: null
  - classic marks: 6.42
- judges:
  - moonshotai/kimi k3: 2.0
  - zai org/glm 5.3 flash: 2.0
  - qwen/qwen3.5 9 b: 2.0
- breakdown:
  - vision overall: 2.0
  - classic mean: 6.97
  - classic:
    - value: 5.64
    - edge: 8.85
    - landmark: null
    - marks: 6.42
  - vision per judge:
    - moonshotai/kimi k3:
      - overall: 2.0
      - composition values: 4.0
      - edges detail: 2.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.0
      - sd: 0.0
      - all: 2.0, 2.0, 2.0, 2.0, 2.0
    - zai org/glm 5.3 flash:
      - overall: 2.0
      - composition values: 5.0
      - edges detail: 3.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.5
      - sd: 0.49
      - all: 2.0, 2.0, 3.0, 3.0, 2.0
    - qwen/qwen3.5 9 b:
      - overall: 2.0
      - composition values: 4.0
      - edges detail: 2.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.0
      - sd: 0.0
      - all: 2.0, 2.0, 2.0, 2.0, 2.0
  - vision errors:
- models: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- rubric:
  - version: bench-v3-median5
  - calls per model: 5
  - style: pure watercolor, no ink
  - target: targets/sargent-crop.png
  - target sha256: 1e2e5201f186d71d0c0cade0ab27da35948509155b83861b697cce820b2e24d0
  - score w: 720
  - resize: Lanczos, painting.png/final.png to SCORE_W x round(SCORE_W*targetH/targetW)

## How the painting developed (progression judge)

A panel of vision judges saw one strip: your target, then the painting at 10, 25, 50, 75 and 100 percent of its strokes. They did not know how it was made. They score each stage from 1 to 5 as: 5 unmistakably a person's painting in progress; 4 convincing with one small tell; 3 plausible but a tell a viewer would notice; 2 mostly not, two or more tells; 1 a finished image being uncovered by a filter, mask, wipe or dissolve.

- At 10% of its strokes: 1.0 out of 5
- At 25% of its strokes: 1.0 out of 5
- At 50% of its strokes: 1.0 out of 5
- At 75% of its strokes: 1.0 out of 5
- At 100% of its strokes: 1.5 out of 5
- Tells named by the judges (times named across judges and stages): the whole sheet at one faint value, as if faded in (5); cut or scalloped wash edges, round holes (4); flat evenly-toned slabs standing in for a form (4); speckle or dotted trails instead of drawn lines (1)
- Mean over the five stages: 1.1; mean of the 10% and 25% stages: 1.0.
- Judges who found the order of work human: 0 of 2.
- judge note: The entire finished composition fades in uniformly at low opacity across all stages with persistent white rectangular mask holes, revealing a dissolve/uncovering rather than a painter building forms stroke by stroke.
- judge note: The sequence depicts a digital image being revealed through increasing opacity rather than a human painting process, characterized by flat color blocks appearing instead of brushstrokes.

## Render record

The harness admitted the plan (no refusals).

Base recipe tokens applied: ink4, rec2x, rcl, sky3, leaf, sep8, cg13, vio, rg10, skyb, cpp, tv8, uncap, pgreen, dwg200, tp2, shs
Base recipe tokens skipped: lay4, blk60, bmm40, bka20, birr, dk13

Option check (what the painter did with the options in your plan):
  - model: []
  - base: foliagerefit
  - template: []
  - label: valueversion, valuevariant, inkcolour, inkfast, texvariety
  - unknown: []

Passages: 8598 laid down with paths, 0 dropped for having no path (0 of planned mass, 0%).
Planned mass 1330217.7949369384.

Render: state done, exit 0, 2219.995499208s.

## Files in this folder

- previous-plan/: the plan files you saved last time (config, drawing paths, extra settings, variant, PLAN.md).
- previous-plan/ is the plan as it was painted at the end (after your revisions, if any).
- previous-checkpoints.jsonl: your stops, looks and revisions while it was painted (0 looks, 0 revisions).
- previous-painting.png: the finished painting.
- compare.png: your target on the left, the painting on the right, same height.
- stages.jpg: the strip the progression judge saw (target, then 10, 25, 50, 75, 100 percent).
