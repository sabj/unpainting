# Pipelines

Painter V101-dev has two pipelines. Inking draws the pen drawing. Painting lays the washes. They meet on one sheet: the drawing goes down first and dries, the washes go over it, and the closing pen goes last.

## Inking (drawing)

This is `--inkrecipe wash`. Each stage names its module and file.

```
 target image
      |
      v
 1. line source          src/paint/methods/linework-plan.mjs (prepareLineSource)
      |   lineart maps   tools/seg/sketch-map.py        fine + coarse models, fused, cached by target SHA-256
      |   trace          src/paint/methods/line-model.mjs -> tools/seg/copy-lines.py --kind line-map
      |   fallback       tools/seg/copy-lines.py on the target's own ink (logged with !!!)
      v
 2. decide, hold, measure   src/paint/methods/ink-lines-file.mjs -> ink-decide-file.mjs, ink-decide.mjs, line-class.mjs, ink-labels.mjs
      |                  mass edges (shadow and wash steps) are cut by the line-or-mass test; sky, foliage and water are wash
      |                  (ink-labels.json next to the painting); opt-in: line-geometry.mjs, line-foliage.mjs, line-salience.mjs, line-hatch.mjs
      |                  then ink-lines.mjs, ink-measure.mjs measure the rest, not cut: width 0.06 to 0.35 mm, darkness
      v
 3. stages               src/paint/methods/drawing-stages.mjs
      |                  opening file (stage-prepink) and closing file (stage-finishink)
      v
 4. hand plan            src/paint/methods/drawing-file.mjs -> drawing-hand.mjs
      |                  chain lines, long contours first, taper, strokes of 10% of the short side
      v
 5. ink load             tools/paint-plate.mjs (inkDarkMatch), src/paint/methods/ink-match.mjs
      |                  load set so strokes read 1.6 times the source's line absorbance
      v
 6. pen on the fine sheet   src/paint/methods/fine-material.mjs, ink-res.mjs (--inkres 3)
      |                  src/media/pen.mjs, src/media/draw.mjs
      v
 drawing-opening.png (fine ink at 3 times the width); ink carried down to the painting's sheet
```

## Painting (washes)

```
 target image
      |
      v
 1. regions              src/crop/segment-prep.mjs -> tools/seg/segments.py (SAM), cached by target SHA-256
      v
 2. plan                 value plan, passages and layers: src/paint/pipeline-plan.mjs, src/paint/methods/painter-order.mjs
      v
 3. washes               src/paint/methods/first-wash.mjs, mass-wash.mjs, subject-washes.mjs, segment-washes.mjs
      |                  one act at a time: src/paint/methods/lay.mjs, with brush and well settings
      v
 4. physics              src/media/sheet.mjs (water, pigment, drying), src/media/paper.mjs
      v
 5. glazes and darks     src/paint/methods/light-to-dark.mjs, final-darks.mjs
      v
 painting.png
```

## Where they meet

```
 inking 1-6  ->  drawing-opening.png, dried        (drawing first)
                      |
 painting 1-5 ------->|  washes over the dry drawing  (washes after)
                      |
 inking, closing file ->  src/paint/methods/drawing-file.mjs, --drawinglast   (closing pen last)
```

The pipeline plan (`src/paint/pipeline-plan.mjs`) fixes the order, and `tools/paint-plate.mjs` runs it. `--drawingonly 1` stops after the opening drawing, which is how the [legibility test](../tools/judge/ink-legibility.mjs) judges it. See [Ink](ink.md) for the flags.
