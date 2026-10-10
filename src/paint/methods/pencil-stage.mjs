// --pencilstage 1 (with --penpencil and a --drawinglogic 1 drawing): the pencil drawing grows over several frames in
// three passes, big shapes light (--pencilfirst of full pressure), then features, then detail. Bare pencil is erased
// at the finish (--pencilerase), and the opening pen phase ends where the target's drawing does (penEndPosition).

/** The drawing-rank tier a stroke came from (`rank`), grouped into the three passes. */
export const passOf = g => (g.rank === 1 || g.rank === 4 ? 0 : g.rank === 2 ? 1 : 2);

/**
 * Pencil batches, in order: [{ parts: [{ strokes, gain }], pass, name }], one frame each. `frames` is how many batches
 * each pass is cut into, `first` the big shapes' share of full pressure; their remainder is laid in the features' frames.
 */
export function pencilBatches(strokes, { frames = [4, 3, 3], first = 0.45 } = {}) {
  const names = ['big shapes', 'features', 'detail'];
  const byPass = [0, 1, 2].map(p => strokes.filter(g => passOf(g) === p));
  const cut = (gs, k) => { const per = Math.max(1, Math.ceil(gs.length / Math.max(1, k))), out = []; for (let i = 0; i < gs.length; i += per) out.push(gs.slice(i, i + per)); return out; };
  const out = [];
  for (const [p, gs] of byPass.entries()) {
    const parts = cut(gs, frames[p]);
    const restate = p === 1 && first < 1 ? cut(byPass[0], Math.max(1, frames[1])) : [];
    const n = Math.max(parts.length, restate.length);
    for (let i = 0; i < n; i++) {
      const b = { parts: [], pass: p, name: names[p] };
      if (parts[i]) b.parts.push({ strokes: parts[i], gain: p === 0 ? first : 1 });
      if (restate[i]) b.parts.push({ strokes: restate[i], gain: 1 - first });
      out.push(b);
    }
  }
  return out;
}

/**
 * Where the target's drawing is complete on its timeline: the first position at which its line share reaches `level`
 * of the share on the drawing stage (the --penpencil file), interpolated between the stage before and that one.
 * `shares` is [{ position, share }] for the blank and every stage up to the drawing stage, in order.
 */
export function penEndPosition(shares, level = 0.9) {
  const top = shares.at(-1).share * level;
  for (let k = 1; k < shares.length; k++) if (shares[k].share >= top) {
    const a = shares[k - 1], b = shares[k];
    return a.position + (b.position - a.position) * Math.max(0, Math.min(1, (top - a.share) / Math.max(1e-9, b.share - a.share)));
  }
  return shares.at(-1).position;
}

/**
 * --pencilerase: the kneaded eraser over the dry painting, before the closing pen. Graphite in a cell where the finish
 * keeps no line is lifted by `bare` on clean paper and by `under` where paint lies over it (the paint holds some of it).
 * `keep` is 1 where the finish shows a line (dilated), `paint` the paint's density in the cell, `clean` the density
 * under which the paper counts as clean. Returns the factor each cell's graphite is multiplied by.
 */
export function eraseFactor(keep, paint, { bare = 0.85, under = 0.5, clean = 0.08 } = {}) {
  return Float32Array.from(keep, (k, i) => (k ? 1 : 1 - (bare + (under - bare) * Math.min(1, paint[i] / clean))));
}

/**
 * --prepfade 1: the opening drawing fades as washes cover it, so it does not compete with the paint at the finish.
 * Each cell's prep pigment is held at 1 - under * min(1, paint / clean) of what the pen laid, never raised; `keep`
 * cells are left alone. `planes` hold the prep pigment, `applied` each cell's factor so far (starts at 1).
 * `paint` is on the plan's grid (w wide), the rest on the sheet's (W2 wide, SC sheet cells a plan cell).
 */
export function prepFade(planes, applied, keep, paint, { under = 0.7, clean = 0.1, SC = 1, w, W2 }) {
  let faded = 0;
  for (let i = 0; i < applied.length; i++) {
    if (keep[i]) continue;
    const p = SC === 1 ? paint[i] : paint[(((i / W2) | 0) / SC | 0) * w + ((i % W2) / SC | 0)];
    const t = 1 - under * Math.min(1, p / clean);
    if (t >= applied[i]) continue;
    const r = t / applied[i];
    for (const a of planes) a[i] *= r;
    applied[i] = t; faded++;
  }
  return faded;
}
