# Feedback on your previous try (try 1)

This is feedback on the preparation you made in try 1 of this subject. Everything here comes from the harness; nothing in it is a hint about how the judges work beyond what is stated.

## Outcome

The plan was admitted, rendered and judged. Results follow.

## The finished painting: score and judge notes

- composite: 4.8
- composite pm: 0.1
- complete: true
- calls per model: 5
- vision overall pm: 0.19
- rubric version: bench-v3-median5
- subject: sf
- panel: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- criteria:
  - composition values: 3.67
  - edges detail: 2.33
  - marks texture: 1.33
  - classic value: 6.12
  - classic edge: 9.13
  - classic landmark: null
  - classic marks: 6.6
- judges:
  - moonshotai/kimi k3: 2.0
  - zai org/glm 5.3 flash: 3.0
  - qwen/qwen3.5 9 b: 2.0
- breakdown:
  - vision overall: 2.33
  - classic mean: 7.28
  - classic:
    - value: 6.12
    - edge: 9.13
    - landmark: null
    - marks: 6.6
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
      - overall: 3.0
      - composition values: 4.0
      - edges detail: 3.0
      - marks texture: 2.0
      - calls: 5
      - spread: 0.5
      - sd: 0.4
      - all: 3.0, 4.0, 3.0, 3.0, 3.0
    - qwen/qwen3.5 9 b:
      - overall: 2.0
      - composition values: 3.0
      - edges detail: 2.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.5
      - sd: 0.4
      - all: 2.0, 2.0, 2.0, 1.0, 2.0
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

- At 10% of its strokes: 2.0 out of 5
- At 25% of its strokes: 2.0 out of 5
- At 50% of its strokes: 3.0 out of 5
- At 75% of its strokes: 3.0 out of 5
- At 100% of its strokes: 4.5 out of 5
- Tells named by the judges (times named across judges and stages): speckle or dotted trails instead of drawn lines (3); the whole sheet at one faint value, as if faded in (2); texture arriving as a dump, everything sharpening at once late (2); a pixel-grid or stair-step fill (2); a region arriving finished while its neighbour is untouched (1); fine detail already present in the first 25% (1)
- Mean over the five stages: 2.9; mean of the 10% and 25% stages: 2.0.
- Judges who found the order of work human: 0 of 2.
- judge note: Reads like an automated stroke renderer: a uniformly faint first pass with no pen linework, buildings arriving nearly complete at 25% beside untouched paper, and foliage built by dumping scattered dabs rather than drawn pen-and-wash marks.
- judge note: The sequence mimics a digital resolution reveal or upscaling process rather than a painterly build-up, characterized by blocky artifacts and uniform fading.

## Render record

The harness admitted the plan (no refusals).

Base recipe tokens applied: ink4, rec2x, rcl, sky3, leaf, cg13, vio, rg10, skyb, cpp, dk13, tv8, uncap, pgreen, dwg200, tp2, shs
Base recipe tokens skipped: lay4, sep8, blk60, bmm40, bka20, birr

Option check (what the painter did with the options in your plan):
  - model: []
  - base: foliagerefit, touchgain
  - template: skylanes, skylanemm, skylanestep, texture
  - label: valueversion, valuevariant, inkcolour, inkfast, texvariety
  - unknown: []

Passages: 11089 laid down with paths, 0 dropped for having no path (0 of planned mass, 0%).
Planned mass 2585829.732887059.

Render: state done, exit 0, 289.402196684s.

## Files in this folder

- previous-plan/: the plan files you saved last time (config, drawing paths, extra settings, variant, PLAN.md).
- previous-plan/ is the plan as it was painted at the end (after your revisions, if any).
- previous-checkpoints.jsonl: your stops, looks and revisions while it was painted (8 looks, 2 revisions).
- previous-painting.png: the finished painting.
- compare.png: your target on the left, the painting on the right, same height.
- stages.jpg: the strip the progression judge saw (target, then 10, 25, 50, 75, 100 percent).
