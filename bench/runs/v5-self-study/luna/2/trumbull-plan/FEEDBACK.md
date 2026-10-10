# Feedback on your previous try (try 1)

This is feedback on the preparation you made in try 1 of this subject. Everything here comes from the harness; nothing in it is a hint about how the judges work beyond what is stated.

## Outcome

The plan was admitted, rendered and judged. Results follow.

## The finished painting: score and judge notes

- composite: 5.65
- composite pm: 0.15
- complete: true
- calls per model: 5
- vision overall pm: 0.31
- rubric version: bench-v3-median5
- subject: trumbull
- panel: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- criteria:
  - composition values: 5.33
  - edges detail: 3.0
  - marks texture: 2.33
  - classic value: 6.24
  - classic edge: 9.45
  - classic landmark: null
  - classic marks: 7.2
- judges:
  - moonshotai/kimi k3: 4.0
  - zai org/glm 5.3 flash: 3.0
  - qwen/qwen3.5 9 b: 4.0
- breakdown:
  - vision overall: 3.67
  - classic mean: 7.63
  - classic:
    - value: 6.24
    - edge: 9.45
    - landmark: null
    - marks: 7.2
  - vision per judge:
    - moonshotai/kimi k3:
      - overall: 4.0
      - composition values: 6.0
      - edges detail: 3.0
      - marks texture: 2.0
      - calls: 5
      - spread: 0.5
      - sd: 0.49
      - all: 3.0, 4.0, 3.0, 4.0, 4.0
    - zai org/glm 5.3 flash:
      - overall: 3.0
      - composition values: 5.0
      - edges detail: 3.0
      - marks texture: 2.0
      - calls: 5
      - spread: 0.0
      - sd: 0.0
      - all: 3.0, 3.0, 3.0, 3.0, 3.0
    - qwen/qwen3.5 9 b:
      - overall: 4.0
      - composition values: 5.0
      - edges detail: 3.0
      - marks texture: 3.0
      - calls: 5
      - spread: 1.0
      - sd: 0.8
      - all: 4.0, 4.0, 4.0, 2.0, 4.0
  - vision errors:
- models: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- rubric:
  - version: bench-v3-median5
  - calls per model: 5
  - style: precise architectural watercolor
  - target: targets/trumbull-crop.png
  - target sha256: 91b0a754ab9336f455108f1740b3be609011145569aa08961e8217f4abc511b4
  - score w: 720
  - resize: Lanczos, painting.png/final.png to SCORE_W x round(SCORE_W*targetH/targetW)

## How the painting developed (progression judge)

A panel of vision judges saw one strip: your target, then the painting at 10, 25, 50, 75 and 100 percent of its strokes. They did not know how it was made. They score each stage from 1 to 5 as: 5 unmistakably a person's painting in progress; 4 convincing with one small tell; 3 plausible but a tell a viewer would notice; 2 mostly not, two or more tells; 1 a finished image being uncovered by a filter, mask, wipe or dissolve.

- At 10% of its strokes: 1.0 out of 5
- At 25% of its strokes: 1.5 out of 5
- At 50% of its strokes: 1.5 out of 5
- At 75% of its strokes: 2.0 out of 5
- At 100% of its strokes: 4.5 out of 5
- Tells named by the judges (times named across judges and stages): the whole sheet at one faint value, as if faded in (5); speckle or dotted trails instead of drawn lines (4); cut or scalloped wash edges, round holes (3); fine detail already present in the first 25% (2)
- Mean over the five stages: 2.1; mean of the 10% and 25% stages: 1.25.
- Judges who found the order of work human: 0 of 2.
- judge note: The full scene is already present at 10% as a uniform faint fade-in and is completed by shrinking white speckle holes with scalloped edges — a noise-mask uncovering of a finished image, not cumulative brushwork.
- judge note: The sequence shows a digital opacity reveal of a watercolor filter rather than a painting process.

## Render record

The harness admitted the plan (no refusals).

Base recipe tokens applied: lay4, ink4, rec2x, rcl, sky3, leaf, sep8, cg13, vio, rg10, blk60, bmm40, bka20, birr, skyb, cpp, dk13, tv8, uncap, pgreen, dwg200, tp2, shs
Base recipe tokens skipped: none

Option check (what the painter did with the options in your plan):
  - model: []
  - base: []
  - template: []
  - label: valueversion, valuevariant, inkcolour, inkfast, texvariety
  - unknown: []

Passages: 11274 laid down with paths, 0 dropped for having no path (0 of planned mass, 0%).
Planned mass 2358931.7286085156.

Render: state done, exit 0, 3368.218548422s.

## Files in this folder

- previous-plan/: the plan files you saved last time (config, drawing paths, extra settings, variant, PLAN.md).
- previous-plan/ is the plan as it was painted at the end (after your revisions, if any).
- previous-checkpoints.jsonl: your stops, looks and revisions while it was painted (9 looks, 1 revisions).
- previous-painting.png: the finished painting.
- compare.png: your target on the left, the painting on the right, same height.
- stages.jpg: the strip the progression judge saw (target, then 10, 25, 50, 75, 100 percent).
