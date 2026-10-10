# Self-review of try 1 (written before opening FEEDBACK.md)

Looked at: `previous-painting.png`, `sf-crop.png`, `compare.png`, `stages.jpg`, and my own previous plan files and
checkpoints. Not yet opened: `FEEDBACK.md`.

## What works
- The focal house group (right of centre) is in the right place with the right palette: terracotta roofs, lilac shadow
  walls, a pale lit wall. It is the only part that reads as a painting of this scene.
- The cypress pair at top centre-left comes out as dark upright flames in about the right positions.
- The sheet has some warm/cool variety (ochre path, olive greens, a blue-grey patch at top right for the hills).
- The 10% stage (big pale ochre ground wash with paper left in the lights) is a believable way to start a painting.

## What is wrong
1. **The whole sheet is one mid-dark olive "camouflage" pattern.** The target has a strong value structure: a bright
   yellow-green pine crown at bottom left, light ochre terraces and path, mid-green olive crowns, and a few real darks
   (cypresses, pine trunk, window openings). The painting has nearly all cells at the same mid-dark olive-khaki, so the
   brightest and most important mass in the target (the pine crown) is painted dark and grey. Lights are missing, so
   there is no sunlight.
2. **Blob shapes are all the same size and have the same hard edge.** Foliage reads as cut-out stencils, not crowns with
   a lit side and a shadow side. No soft/hard edge variety, no lost edges.
3. **The pen layer is almost invisible.** The task style is "pen plus light wash"; I authored 82 pen strokes (houses,
   cypress outlines, pine trunk and limbs) and none of it reads at viewing size. The pine trunk and limbs, the strongest
   dark structure in the target, are missing. A viewer would call this a wash-only painting, and not a light wash: full
   coverage.
4. **Random dark blobs that are not in the target.** Blue-black splotches in the centre (around x 450-730, y 360-470 and
   x 520-600, y 560-740) read as stains. The target's centre is mid olive trees with small shadows, not black holes.
5. **Artefacts.** Several clean white rectangles (e.g. near x 875-935/y 460-515, x 520-595/y 887-935, x 365-440/y 375-430,
   x 1040-1115/y 470-500, top near x 715-780) look like unpainted boxes, not paper lights. A pale diagonal blue streak
   crosses the lower centre. (Added after re-reading my own try-1 PLAN.md, still before FEEDBACK.md: the boxes are the
   four rectangular reserves I put in the first config. I deleted them from `config.json` at pass 9, but the passes
   already painted had left holes, and the painter did not fill them later. A reserve is always a rectangle, so a
   reserve that is not a tiny glint is a hard square hole. Lesson: no reserves this time.)
6. **The houses lose their form.** Walls are white or lilac patches; the tan stone walls and window rows of the target
   are mostly gone, and the dark olive mass around the houses swallows their silhouette.

## At which stage it went wrong
- Pass 1 to 9 (the foundation): fine, a pale base. The first sign of trouble is the jump from "10% strokes" to "25%
  strokes" in the stage strip: the sheet goes from pale tan to nearly final olive coverage in one step.
- Passes 12 to 26 (mid layers): this is where everything was pushed to the same mid-dark green. Value separation between
  lit and shaded foliage was never made, so later passes could only add more of the same.
- After 25% the strips barely change (50%, 75%, 100% look almost identical). The painter's own touch-up passes added about
  13000 strokes (2402 at pass 31, 15252 at closing) with almost nothing visible to show for it.
- My two revisions (config at pass 9, closing lines at the end) were small. I used them to tidy and did not change the
  value structure, which was the real problem.
- Root cause in my plan: I chose `urban-sketch` for the whole sheet and a flat family split, and I treated foliage as
  "wash plane" without ever asking where the light yellow-green and the darks are. I never wrote a value map for the
  foliage, so the painter's segmentation decided it.

## Scores (mine)
- Finished painting: **3 / 10**. The composition and house group are recognisable. The colour is muddy, the lights are
  gone, there is no pen, and the blobs look mechanical.
- Plausibly painted: **2 / 5**. A person would not paint uniform-size blobs with constant hard edges everywhere, would not
  leave floating white rectangles, and would not reach 'finished' coverage at 25% of the strokes and then do nothing
  visible for the remaining 75%.

## Judges' critique (read after the self-review above)

Numbers: composite 4.8; vision judges 2.0 / 3.0 / 2.0 (mean 2.33 of 5), with composition-values 3.67, edges-detail 2.33,
marks-texture 1.33; the classic (pixel-side) scores were value 6.12, edge 9.13, marks 6.6 (mean 7.28). Progression judge:
2.0 at 10%, 2.0 at 25%, 3.0 at 50%, 3.0 at 75%, 4.5 at 100%; mean 2.9. Tells: speckle or dotted trails instead of drawn
lines (3), whole sheet at one faint value as if faded in (2), texture arriving as a dump late (2), a pixel-grid or
stair-step fill (2), a region finished beside untouched paper (1), fine detail already present in the first 25% (1). Judge
notes: "uniformly faint first pass with no pen linework", "buildings arriving nearly complete at 25% beside untouched paper",
"foliage built by dumping scattered dabs rather than drawn pen-and-wash marks", "resolution reveal rather than build-up".

### Where I agree
- **No visible pen, marks-texture 1.33 (the lowest number).** This matches my item 3, and the code shows why: the opening
  pen is capped at pressure 0.3, which means a nib of about 0.16 mm, under one output pixel, and on cold-press paper a
  line that thin breaks into dots. That is very likely the judges' "dotted trails". The cause is in my settings, not bad
  luck.
- **Faint, flat first stage and a late dump.** The urban-sketch ladder puts almost all paint into the first wash for cells
  outside a shadow mask, so the sheet appears at one value, and then the painter's touch-up rounds laid 12,000+ strokes
  (2.4k to 15k) on top. Stroke-percentage frames are therefore mostly touch-up and the strip barely changes after 25%.
- **Composition values and "edges detail" are weak** for the reasons in my items 1, 2 and 6 (no lit/shaded separation, equal
  blob size, houses swallowed).

### Where I disagree, or discount
- **"Classic edge 9.13".** I do not read it as a sign that the edges are good. The painting has hard, cut-out edges
  everywhere, with no soft or lost edges, and that is what an edge-sharpness score rewards. I will not tune towards it.
- **Classic value 6.12 and marks 6.6 versus vision 2.33.** The two families of judges disagree strongly, and the task says
  they are noisy. I trust the vision side more here, because it matches what I see (the pine crown painted dark, no pen).
- **4.5 for the finished frame.** The final stage scored well even though I rated the finished painting 3/10 and its
  plausibility 2/5. A strip of five thumbnails flatters a busy olive mosaic. I will not read the 4.5 as "the end state is
  fine"; my own reasons for the low score still stand.
- **"Pixel-grid or stair-step fill".** I cannot tell whether this means my hard rectangular holes or the painter's
  own stepped blob edges. The holes were my doing; the stepped edges I do not control.
- The judges are noisy, and the progression judge varies by half a point on identical images. A single named tell with
  one count (finished region beside untouched paper; fine detail early) is not enough on its own to redesign for.

### What this changes (details in PLAN.md)
Pen first and visible; no reserves; no sepia in the paints; foliage on the champion's native five-band ladder so the
build-up is gradual and lit and shaded greens separate; touch-up rounds off to start with, and a look at the sheet before
deciding whether to add one back.
