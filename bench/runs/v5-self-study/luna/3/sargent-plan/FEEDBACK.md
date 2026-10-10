# Feedback on your previous try (try 2)

This is feedback on the preparation you made in try 2 of this subject. Everything here comes from the harness; nothing in it is a hint about how the judges work beyond what is stated.

## Outcome

The plan was admitted, rendered and judged. Results follow.

## The finished painting: score and judge notes

- composite: 4.82
- composite pm: 0.1
- complete: true
- calls per model: 5
- vision overall pm: 0.19
- rubric version: bench-v3-median5
- subject: sargent
- panel: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- criteria:
  - composition values: 4.33
  - edges detail: 2.67
  - marks texture: 1.67
  - classic value: 5.15
  - classic edge: 9.13
  - classic landmark: null
  - classic marks: 6.62
- judges:
  - moonshotai/kimi k3: 2.0
  - zai org/glm 5.3 flash: 3.0
  - qwen/qwen3.5 9 b: 3.0
- breakdown:
  - vision overall: 2.67
  - classic mean: 6.97
  - classic:
    - value: 5.15
    - edge: 9.13
    - landmark: null
    - marks: 6.62
  - vision per judge:
    - moonshotai/kimi k3:
      - overall: 2.0
      - composition values: 5.0
      - edges detail: 2.0
      - marks texture: 1.0
      - calls: 5
      - spread: 0.5
      - sd: 0.4
      - all: 2.0, 2.0, 2.0, 2.0, 3.0
    - zai org/glm 5.3 flash:
      - overall: 3.0
      - composition values: 4.0
      - edges detail: 3.0
      - marks texture: 2.0
      - calls: 5
      - spread: 0.5
      - sd: 0.4
      - all: 3.0, 3.0, 3.0, 3.0, 2.0
    - qwen/qwen3.5 9 b:
      - overall: 3.0
      - composition values: 4.0
      - edges detail: 3.0
      - marks texture: 2.0
      - calls: 5
      - spread: 0.0
      - sd: 0.0
      - all: 3.0, 3.0, 3.0, 3.0, 3.0
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
- At 25% of its strokes: 1.5 out of 5
- At 50% of its strokes: 2.0 out of 5
- At 75% of its strokes: 2.0 out of 5
- At 100% of its strokes: 4.5 out of 5
- Tells named by the judges (times named across judges and stages): the whole sheet at one faint value, as if faded in (5); cut or scalloped wash edges, round holes (4); flat evenly-toned slabs standing in for a form (1); fine detail already present in the first 25% (1)
- Mean over the five stages: 2.2; mean of the 10% and 25% stages: 1.25.
- Judges who found the order of work human: 0 of 2.
- judge note: The whole scene fades in at low opacity with fine rigging already visible, then forms arrive as masked slabs with scalloped round-hole edges rather than a painter's light-to-dark, big-to-small build-up.
- judge note: The sequence is a digital fade-in of the final image rather than a painting process.

## Render record

The harness admitted the plan (no refusals).

Base recipe tokens applied: ink4, rec2x, rcl, leaf, sep8, cg13, vio, rg10, skyb, dk13, tv8, uncap, pgreen, dwg200, shs
Base recipe tokens skipped: lay4, sky3, blk60, bmm40, bka20, birr, cpp, tp2

Option check (what the painter did with the options in your plan):
  - model: []
  - base: closinglines, closingpressure, closingedgemin, drawwant, foliagerefit, skyfloc, openinglines, drawwidthgain
  - template: []
  - label: valueversion, valuevariant, inkcolour, inkfast, texvariety
  - unknown: []

Passages: 2235 laid down with paths, 0 dropped for having no path (0 of planned mass, 0%).
Planned mass 1497304.5116468996.

Render: state done, exit 0, 688.728941217s.

## Files in this folder

- previous-plan/: the plan files you saved last time (config, drawing paths, extra settings, variant, PLAN.md).
- previous-plan/ is the plan as it was painted at the end (after your revisions, if any).
- previous-checkpoints.jsonl: your stops, looks and revisions while it was painted (0 looks, 0 revisions).
- previous-painting.png: the finished painting.
- compare.png: your target on the left, the painting on the right, same height.
- stages.jpg: the strip the progression judge saw (target, then 10, 25, 50, 75, 100 percent).
