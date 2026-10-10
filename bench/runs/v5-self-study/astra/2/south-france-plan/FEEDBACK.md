# Feedback on your previous try (try 1)

This is feedback on the preparation you made in try 1 of this subject. Everything here comes from the harness; nothing in it is a hint about how the judges work beyond what is stated.

## Outcome

The plan was admitted, rendered and judged. Results follow.

## The finished painting: score and judge notes

- composite: 5.21
- composite pm: 0.14
- complete: true
- calls per model: 5
- vision overall pm: 0.27
- rubric version: bench-v3-median5
- subject: sf
- panel: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- criteria:
  - composition values: 3.67
  - edges detail: 2.67
  - marks texture: 2.0
  - classic value: 5.86
  - classic edge: 9.52
  - classic landmark: null
  - classic marks: 6.88
- judges:
  - moonshotai/kimi k3: 2.0
  - zai org/glm 5.3 flash: 5.0
  - qwen/qwen3.5 9 b: 2.0
- breakdown:
  - vision overall: 3.0
  - classic mean: 7.42
  - classic:
    - value: 5.86
    - edge: 9.52
    - landmark: null
    - marks: 6.88
  - vision per judge:
    - moonshotai/kimi k3:
      - overall: 2.0
      - composition values: 3.0
      - edges detail: 2.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.0
      - sd: 0.0
      - all: 2.0, 2.0, 2.0, 2.0, 2.0
    - zai org/glm 5.3 flash:
      - overall: 5.0
      - composition values: 5.0
      - edges detail: 4.0
      - marks texture: 4.0
      - calls: 5
      - spread: 1.0
      - sd: 0.8
      - all: 3.0, 4.0, 5.0, 5.0, 5.0
    - qwen/qwen3.5 9 b:
      - overall: 2.0
      - composition values: 3.0
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
  - style: urban sketch, pen plus light wash
  - target: targets/sf-crop.png
  - target sha256: c4c00d6ccc8e0ef9fc010030291b749f97054dd6107115c048cc4b600be781ba
  - score w: 720
  - resize: Lanczos, painting.png/final.png to SCORE_W x round(SCORE_W*targetH/targetW)

## How the painting developed (progression judge)

A panel of vision judges saw one strip: your target, then the painting at 10, 25, 50, 75 and 100 percent of its strokes. They did not know how it was made. They score each stage from 1 to 5 as: 5 unmistakably a person's painting in progress; 4 convincing with one small tell; 3 plausible but a tell a viewer would notice; 2 mostly not, two or more tells; 1 a finished image being uncovered by a filter, mask, wipe or dissolve.

- At 10% of its strokes: 1.0 out of 5
- At 25% of its strokes: 2.0 out of 5
- At 50% of its strokes: 2.5 out of 5
- At 75% of its strokes: 3.0 out of 5
- At 100% of its strokes: 4.5 out of 5
- Tells named by the judges (times named across judges and stages): the whole sheet at one faint value, as if faded in (6); fine detail already present in the first 25% (4); texture arriving as a dump, everything sharpening at once late (2)
- Mean over the five stages: 2.6; mean of the 10% and 25% stages: 1.5.
- Judges who found the order of work human: 0 of 2.
- judge note: Every stage is the entire finished scene at rising opacity and contrast — buildings, trees and fine detail all fade in together rather than emerging stroke by stroke, so this reads as a dissolve of the completed image, not a painter's light-to-dark build-up.
- judge note: The sequence reveals the final image by increasing opacity rather than adding strokes, showing the complete form too early.

## Render record

The harness admitted the plan (no refusals).

Base recipe tokens applied: ink4, rec2x, rcl, sky3, leaf, cg13, vio, rg10, skyb, cpp, tv8, uncap, pgreen, tp2, shs
Base recipe tokens skipped: lay4, sep8, blk60, bmm40, bka20, birr, dk13, dwg200

Option check (what the painter did with the options in your plan):
  - model: []
  - base: foliagerefit
  - template: skylanemm
  - label: valueversion, valuevariant, inkcolour, inkfast, texvariety
  - unknown: []

Passages: 14116 laid down with paths, 0 dropped for having no path (0 of planned mass, 0%).
Planned mass 1895691.3797386363.

Render: state done, exit 0, 1055.471450458s.

## Files in this folder

- previous-plan/: the plan files you saved last time (config, drawing paths, extra settings, variant, PLAN.md).
- previous-plan/ is the plan as it was painted at the end (after your revisions, if any).
- previous-checkpoints.jsonl: your stops, looks and revisions while it was painted (5 looks, 2 revisions).
- previous-painting.png: the finished painting.
- compare.png: your target on the left, the painting on the right, same height.
- stages.jpg: the strip the progression judge saw (target, then 10, 25, 50, 75, 100 percent).
