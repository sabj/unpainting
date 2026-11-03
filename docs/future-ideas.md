# Open problems

Untested ideas and known defects in 0.2.0. Each idea needs a measured result before it changes the painter or the benchmark.

## Benchmark and judging

### An embedding judge fitted to the owner's taste

A retest moves a vision-judge score by about 0.34. Use a pretrained vision encoder (I-JEPA, V-JEPA or DINOv2) to turn paintings and targets into numeric image descriptions. Then fit a small scoring model on the owner's pairwise picks.
- Test: collect a few hundred quick picks, hold some out, and compare agreement with the current judges.
- Why: it is instant and repeatable, so it could also score every saved stage of a painting.

### A diffusion language model as a planner

Diffusion language models, such as Inception's Mercury, draft a whole plan in parallel and finish in seconds. Current planners take 20 to 30 minutes.
- Test: enter it as a contestant in rounds V4 and V5 through the same benchmark runner.
- Unknown: its vision and long-context reasoning are weaker, so plan quality may suffer.

### Judged previews inside a V4 try

Let a model render a few small previews during one attempt. Each preview is judged on the finished image and the painting process. The model then revises before its one scored render. V4 allows one scored render per try; V5 allows practice between tries.
- Test: a fixed preview budget (for example 3 at 270 px) against V4 with one scored render on the same subjects.

### Budgets that do not measure the machine

The V4 and V5 brief gives models 85 minutes of their own time. Waiting for the painter is not counted, and a 300-minute wall-clock limit catches hangs. A painter call is excused for at most 100 seconds. Past that, a slow or busy machine charges the model.
- Test: replace the stated number with "a generous safety limit", or a cost budget in dollars, and report tokens and cost per try.
- Why: a stated time budget can change how a model plans, and token counts differ between vendors.

### Every round on every target

V3 compares three targets. Every round could paint all five, at a smaller size so a try stays affordable.
- Test: compare rankings at the smaller size with the current ones on the shared targets.

### A check for copied targets

The guard blocks reads of target pixels at paint time. A shell copy of a target into the output folder goes unseen, as in MiniMax M3 V2 try 2.
- To do: after each run, hash every file the session wrote and compare with the targets.

### A planner trained on what paints well

Ask a strong model for several plans per target on held-out images, paint each, and judge the best. The winners become training data for a small vision planner (LoRA). This needs a few thousand scored plans, none on benchmark targets.
- Test: measure best-of-N planning against single plans on held-out images first. Train only once that gain is real.

## Painter features

### Searching painter settings on small image sections

The planning tools can already change the plan and the painter settings. Let the pipeline try many setting combinations on small image sections with GPU batching. Keep the best by score and blind picks.
- Test: does a searched setting beat the default recipe on subjects it was not tuned on?

### A learned stand-in for the simulator

A learned world model would predict the sheet after a passage without running the physics. A planner could then try thousands of plan variants before one real render.
- Test: train on recorded stages and stroke logs, then measure how far its predictions drift from real renders.
- Cost: weeks of work, so it comes after the items above.

### Edge drying that knows how much water there is

A wet cell within 2 cells of any dry cell evaporates about 9 times faster (`src/media/sheet.mjs`), and water flows toward that edge carrying pigment. The rule cannot tell a wash's outer edge from a millimetre-wide pit the brush skipped. On cold-press paper, a skipped pit can dry as a white dot in a dark ring. `--holefill` and `--holerim` are workarounds on the CPU and the GPU.
- In real paint the ring depends on the water. A damp wash leaves skipped pits as clean white flecks. A very wet wash can fill a pit, or leave a faint ring or bloom as it dries back.
- Test: scale the extra edge evaporation with the share of dry paper within a few millimetres of a cell. Scale the ring strength with the standing water. Check that outer edges keep their dark rim, pits in damp washes stay clean, and wet washes still bloom. Compare all benchmark targets before and after, on CPU and GPU.

### Flat washes that merge at any resolution

A flat wash is laid in horizontal lanes. At the default sheet resolution (0.218 mm per cell), neighbouring lanes often start drying before they merge. The wash shows horizontal stripes while it is laid, and some stay after it dries. The same wash merges cleanly at 0.08 mm per cell, so the result depends on grid size. The seams are also too clean. Real lanes leave soft, uneven joins, and on prewet paper they do not show at all.
- What a painter does: use a big wash or mop brush, so a sky takes a few wide strokes. Keep a bead of wet paint along the lower edge of each lane so the next lane runs into it. Lift pools and hard seams with a thirsty brush or tissue.
- Test: check that a wash on prewet paper shows no lane seams and feathers at its edges. Plan big washes with the wide mop and a carried bead, and add a lift pass. Scale lane overlap and wet merging by the brush's width in millimetres. Check flat and graded washes at both resolutions, then all benchmark targets.

### Opaque media: oil and gouache

The painter is built for watercolor, where light comes from the paper and each layer stays visible through the next. An experimental oil mode, used in the [Part 1 post](https://samjackson.org/writing/whats-a-painting-anyway-part-1/), lays opaque strokes plus softening strokes that blend wet paint. It is not in this repository.
- The oil Mona Lisa below lays an underpainting, then shifts colour in opaque layers, as sfumato needs. With a 2,500-stroke target under the anti-cheat guard, it used 2,367 strokes and 1,555 softening strokes. Uncapped (lower row), it used 46,694 and 43,184, far more than a person would.
- Related work: [Learning to Paint](https://github.com/hzwer/ICCV2019-LearningToPaint) (ICCV 2019) trains a model to cover a canvas in opaque strokes quickly. It suits opaque media better than watercolor.
- Test: port the oil mode, add a covering-power term per pigment, and benchmark it under the same stroke budget and guard as watercolor.

<p align="center"><img src="img/future-oil-mona.webp" width="900" alt="The oil Mona Lisa at eight steps from blank to finished: the anti-cheat run with a 2,500-stroke target above, the uncapped run below"></p>

## Known defects

### Ink too heavy, paint too pale

On images the painter was not tuned on, closing ink can end up darker than the darkest wash, and the washes come out light. The brush delivers about 0.6 to 0.75 of the pigment the plan asks for, and touch-ups do not make up the rest. 0.2.0 draws in pencil by default while ink is reworked.
- Fix: charge the brush for what reaches the paper. Cap ink at the source's own share of line, and keep closing ink lighter than the darkest wash.

### The progression judge does not check prep

It asks whether each stage looks made by a person, not whether the opening places the main shapes. Its early score barely tracks any measure of the 10% and 25% stages, and the two judges disagree there.
- Fix: a separate prep score that names the target's main structures and checks they are placed, validated against the owner's picks.

### The vision judges reward matching the photo

They bunch most paintings between 5 and 6 and favour close copies over convincing paintings. Small gaps between models are noise.
- Fix: the embedding judge above, and a rubric that asks whether it looks painted by a person.

### A weak judge

Qwen3.5-9B scores most early stages 1 and every target 10, so it adds noise. Replace it with a stronger vision judge, checked against the owner's picks.

### Higher-resolution targets and scoring

The benchmark targets are small crops, about 300 px wide. V4 and V5 render them at 1224 px, and every painting is scored after shrinking it back to the target's size. The judges never see most of the detail the painter lays down.
- Fix: cut the targets from the high-resolution originals and score paintings at their rendered size. Score each target against itself the same way to set the ceiling.
- Cost: larger images make judge calls several times more expensive.

### Paper texture

The simulated cold-press tooth is coarser and weaker than real paper.
