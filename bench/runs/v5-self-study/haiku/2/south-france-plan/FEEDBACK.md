# Feedback on your previous try (try 1)

This is feedback on the preparation you made in try 1 of this subject. Everything here comes from the harness; nothing in it is a hint about how the judges work beyond what is stated.

## Outcome

The plan was admitted, rendered and judged. Results follow.

## The finished painting: score and judge notes

- composite: 4.28
- composite pm: 0.14
- complete: true
- calls per model: 5
- vision overall pm: 0.27
- rubric version: bench-v3-median5
- subject: sf
- panel: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- criteria:
  - composition values: 2.33
  - edges detail: 1.0
  - marks texture: 1.0
  - classic value: 5.6
  - classic edge: 8.7
  - classic landmark: null
  - classic marks: 6.38
- judges:
  - moonshotai/kimi k3: 1.0
  - zai org/glm 5.3 flash: 2.0
  - qwen/qwen3.5 9 b: 2.0
- breakdown:
  - vision overall: 1.67
  - classic mean: 6.89
  - classic:
    - value: 5.6
    - edge: 8.7
    - landmark: null
    - marks: 6.38
  - vision per judge:
    - moonshotai/kimi k3:
      - overall: 1.0
      - composition values: 2.0
      - edges detail: 1.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.5
      - sd: 0.49
      - all: 2.0, 2.0, 1.0, 1.0, 1.0
    - zai org/glm 5.3 flash:
      - overall: 2.0
      - composition values: 2.0
      - edges detail: 1.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.5
      - sd: 0.4
      - all: 2.0, 2.0, 2.0, 2.0, 1.0
    - qwen/qwen3.5 9 b:
      - overall: 2.0
      - composition values: 3.0
      - edges detail: 1.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.5
      - sd: 0.49
      - all: 1.0, 2.0, 2.0, 2.0, 1.0
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

- At 10% of its strokes: 1.5 out of 5
- At 25% of its strokes: 1.5 out of 5
- At 50% of its strokes: 1.5 out of 5
- At 75% of its strokes: 2.0 out of 5
- At 100% of its strokes: 2.0 out of 5
- Tells named by the judges (times named across judges and stages): cut or scalloped wash edges, round holes (5); the whole sheet at one faint value, as if faded in (5); speckle or dotted trails instead of drawn lines (3); lines that do not describe the subject (2); texture arriving as a dump, everything sharpening at once late (2); flat evenly-toned slabs standing in for a form (1); a pixel-grid or stair-step fill (1)
- Mean over the five stages: 1.7; mean of the 10% and 25% stages: 1.5.
- Judges who found the order of work human: 0 of 2.
- judge note: Marks accumulate as uniform scattered dabs with no pen linework, no light-to-dark or structure-first order, and two rectangular mask holes persisting in every stage — a stroke-by-stroke filter uncovering the target, not a hand painting.
- judge note: The sequence shows a digital fade-in effect with a static mask, not a painting process.

## Render record

The harness admitted the plan (no refusals).

Base recipe tokens applied: ink4, rec2x, rcl, sky3, leaf, cg13, vio, rg10, skyb, cpp, tv8, uncap, pgreen, dwg200, tp2, shs
Base recipe tokens skipped: lay4, sep8, blk60, bmm40, bka20, birr, dk13

Option check (what the painter did with the options in your plan):
  - model: []
  - base: foliagerefit
  - template: skylanemm
  - label: valueversion, valuevariant, inkcolour, inkfast, texvariety
  - unknown: []

Passages: 6673 laid down with paths, 0 dropped for having no path (0 of planned mass, 0%).
Planned mass 2461145.0505203875.

Render: state done, exit 0, 1231.7705623979998s.

## Files in this folder

- previous-plan/: the plan files you saved last time (config, drawing paths, extra settings, variant, PLAN.md).
- previous-plan/ is the plan as it was painted at the end (after your revisions, if any).
- previous-checkpoints.jsonl: your stops, looks and revisions while it was painted (7 looks, 0 revisions).
- previous-painting.png: the finished painting.
- compare.png: your target on the left, the painting on the right, same height.
- stages.jpg: the strip the progression judge saw (target, then 10, 25, 50, 75, 100 percent).
