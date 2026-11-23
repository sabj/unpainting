// The paint step's erase passage (src/paint/methods/erase-passage.mjs): the sheet dried first unless the passage says
// otherwise, each eraser stroke rubbed with the kit's eraser, and the rub recorded as every passage is: a line per
// stroke in value-commands.jsonl, an 'e' entry in the mark tape, a native capture, a counted sweep, and a film frame
// once the passage is done. A sheet wet where the eraser passes stops the painting with a plain message.
import path from 'node:path';
import { layErase } from '../../src/paint/methods/erase-passage.mjs';
import { measurePaperDry } from '../../src/paint/methods/wetdry.mjs';
import { followErase } from '../../src/paint/methods/fine-erase.mjs';

/** `ctx` the painter's shared state; `L` the pass; `env`: {dry, O, out, JSONL, shoot, cellMm, MARKTAPE}. */
export async function eraseStep(ctx, L, { dry, O, out, JSONL, shoot, cellMm, MARKTAPE = null }) {
  const layer = ctx.layers[L], e = layer._erase;
  if (e.wait === 'dry') dry(ctx.sheet, 30000, O, { levelMax: 140, dt: 2 });
  const paper = measurePaperDry(ctx.sheet);
  ctx.STAGE = { stage: 'erase', step: `erase ${e.id}`, pass: L + 1, of: ctx.layers.length, value: layer.value };
  const graphite = ctx.GRAPHITE && ctx.GRAPHITE_AT != null ? [ctx.GRAPHITE_AT] : [];
  const file = path.join(out, 'value-commands.jsonl');
  JSONL.append(file, JSON.stringify({ kind: 'erase-base', intent: e.instruction.id, wait: e.wait, paper }) + '\n');
  // the pencil on the fine sheet, when it is drawn there, is lifted as the painting's sheet was (fine-erase.mjs)
  const done = followErase(ctx.INKRES, ctx.sheet, ctx.GRAPHITE_AT, () => layErase(ctx.sheet, e, { cellMm, graphite, onStroke: (r, st) => {
    JSONL.append(file, JSON.stringify({ kind: 'erase', status: 'EXECUTED', intent: e.instruction.id, passage: e.id, widthMm: e.widthMm, points: st.points, ...r }) + '\n');
    MARKTAPE?.push({ k: 'e', i: ctx.frame, passage: e.id, widthMm: e.widthMm, points: st.points.map(q => [q[0], q[1], q[2]]) });
    ctx.NATIVE_CAPTURE?.('eraser');
  } }));
  ctx.laid += done.length;
  const share = done.reduce((a, r) => a + r.graphiteShare, 0) / Math.max(1, done.length);
  console.log(`erase ${e.id}: ${done.length} eraser strokes; each lifted on average ${(100 * share).toFixed(1)}% of the pencil under it`);
  await shoot();
  return done;
}
