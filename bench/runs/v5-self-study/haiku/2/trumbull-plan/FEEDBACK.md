# Feedback on your previous try (try 1)

This is feedback on the preparation you made in try 1 of this subject. Everything here comes from the harness; nothing in it is a hint about how the judges work beyond what is stated.

## Outcome

The plan was admitted, rendered and judged. Results follow.

## The finished painting: score and judge notes

- composite: 5.27
- composite pm: 0.15
- complete: true
- calls per model: 5
- vision overall pm: 0.3
- rubric version: bench-v3-median5
- subject: trumbull
- panel: moonshotai/Kimi-K3, zai-org/GLM-5.3-Flash, Qwen/Qwen3.5-9B
- criteria:
  - composition values: 5.33
  - edges detail: 2.67
  - marks texture: 2.33
  - classic value: 6.09
  - classic edge: 9.43
  - classic landmark: null
  - classic marks: 7.11
- judges:
  - moonshotai/kimi k3: 3.0
  - zai org/glm 5.3 flash: 3.0
  - qwen/qwen3.5 9 b: 3.0
- breakdown:
  - vision overall: 3.0
  - classic mean: 7.54
  - classic:
    - value: 6.09
    - edge: 9.43
    - landmark: null
    - marks: 7.11
  - vision per judge:
    - moonshotai/kimi k3:
      - overall: 3.0
      - composition values: 6.0
      - edges detail: 3.0
      - marks texture: 2.0
      - calls: 5
      - spread: 0.5
      - sd: 0.49
      - all: 3.0, 4.0, 3.0, 4.0, 3.0
    - zai org/glm 5.3 flash:
      - overall: 3.0
      - composition values: 5.0
      - edges detail: 3.0
      - marks texture: 2.0
      - calls: 5
      - spread: 0.5
      - sd: 0.4
      - all: 3.0, 3.0, 4.0, 3.0, 3.0
    - qwen/qwen3.5 9 b:
      - overall: 3.0
      - composition values: 5.0
      - edges detail: 2.0
      - marks texture: 3.0
      - calls: 5
      - spread: 1.0
      - sd: 0.632
      - all: 3.0, 4.0, 3.0, 2.0, 3.0
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
- rescores: [{"at": "2026-10-09T22:34:05-0700", "models": ["moonshotai/Kimi-K3", "zai-org/GLM-5.3-Flash", "Qwen/Qwen3.5-9B"], "cost": {"usd": 0.0768, "calls": 15, "byModel": {"zai-org/GLM-5.3-Flash": {"usd": 0.0025, "calls": 5}, "moonshotai/Kimi-K3": {"usd": 0.072, "calls": 5}, "Qwen/Qwen3.5-9B": {"usd": 0.0023, "calls": 5}}}, "previousErrors": {"moonshotai/Kimi-K3": null, "zai-org/GLM-5.3-Flash": null, "Qwen/Qwen3.5-9B": null}, "why": "judge calls refused by the score cap (V2_SCORE_CAP 25, ledger inflated by unrefunded reservations); missing judges only, 5 calls each"}]

## How the painting developed (progression judge)

A panel of vision judges saw one strip: your target, then the painting at 10, 25, 50, 75 and 100 percent of its strokes. They did not know how it was made. They score each stage from 1 to 5 as: 5 unmistakably a person's painting in progress; 4 convincing with one small tell; 3 plausible but a tell a viewer would notice; 2 mostly not, two or more tells; 1 a finished image being uncovered by a filter, mask, wipe or dissolve.

- At 10% of its strokes: 2.5 out of 5
- At 25% of its strokes: 2.5 out of 5
- At 50% of its strokes: 3.5 out of 5
- At 75% of its strokes: 3.5 out of 5
- At 100% of its strokes: 3.0 out of 5
- Tells named by the judges (times named across judges and stages): texture arriving as a dump, everything sharpening at once late (3); a feature painted before its form (2); the whole sheet at one faint value, as if faded in (2); a straight travelling front, a wipe or raster sweep (2); flat evenly-toned slabs standing in for a form (1)
- Mean over the five stages: 3.0; mean of the 10% and 25% stages: 2.5.
- Judges who found the order of work human: 1 of 2.
- judge note: The sequence reads as a credible watercolor workflow—faint underdrawing and sky washes first, broad light-to-dark facade washes, then shadows, foliage and fine detail last—with the only blemish being diagonal light-ray streaks drifting over the facade before its form is established in the early stages.
- judge note: The sequence depicts an AI-generated texture or filter strength increasing on the target image, rather than a human painting process with distinct brushstrokes.

## Render record

The harness admitted the plan (no refusals).

Base recipe tokens applied: rec2x, rcl, sky3, leaf, cg13, vio, rg10, blk60, bmm40, bka20, birr, skyb, cpp, dk13, tv8, uncap, pgreen, dwg200, tp2, shs
Base recipe tokens skipped: lay4, ink4, sep8

Option check (what the painter did with the options in your plan):
  - model: []
  - base: foliagerefit
  - template: []
  - label: valueversion, valuevariant, inkcolour, inkfast, texvariety
  - unknown: []

Passages: 9311 laid down with paths, 0 dropped for having no path (0 of planned mass, 0%).
Planned mass 2013897.574616048.

Render: state done, exit 0, 11641.383550981s.

## Files in this folder

- previous-plan/: the plan files you saved last time (config, drawing paths, extra settings, variant, PLAN.md).
- previous-plan/ is the plan as it was painted at the end (after your revisions, if any).
- previous-checkpoints.jsonl: your stops, looks and revisions while it was painted (0 looks, 0 revisions).
- previous-painting.png: the finished painting.
- compare.png: your target on the left, the painting on the right, same height.
- stages.jpg: the strip the progression judge saw (target, then 10, 25, 50, 75, 100 percent).
