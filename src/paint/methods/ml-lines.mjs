// --mllines: lines inside the subject come from a learned line model instead of the ridge walker, which scribbles loops
// through hair and fur. tools/seg/lines.py precomputes work/lines/<base>-lines.json (polylines in source pixels).
// The file is only candidate paths; the pen draws every mark itself, at its own pressure, with its own nib.
// --mllinesfile base: the line file's base when the lines were found in another picture, such as the source photo
// carried onto the painting by tools/seg/lines-map.py.
// --mlwant: constant pressure for learned lines, since the ridge field is weak along collars and jaws. 0 reads the field.
import path from 'node:path';
import { hasLines, loadLines } from '../../crop/lines.mjs';
import { insideShare } from '../../crop/inktiers.mjs';

// null when --mllines is off or there is no line file. Otherwise
//   lines            the model's paths, each marked ml
//   want             the constant pressure they are drawn at (--mlwant), or 0 to read the ridge field
//   candidates(mask) the tier 2 and tier 3 candidates, { t2, t3 }, split by the subject mask
export function mlLines({ w, h, opt, num, log }) {
  if (opt('mllines', '0') === '0') return null;
  const image = opt('image', '');
  const base = opt('mllinesfile', '') || (image ? path.basename(image, path.extname(image)) : '');
  if (!base || !hasLines(base)) {
    log(`ml lines: no work/lines/${base || 'this source'}-lines.json; run tools/seg/lines.py first. The walker keeps tiers 2 and 3.`);
    return null;
  }
  const lines = loadLines(base, w, h).map(g => ({ ...g, ml: true }));
  // The model's lines fill both tiers the walker is bad at, split by the subject mask at the pen's clip threshold:
  // inside are features (tier 2), outside the rest (tier 3). Rank is strength times length; either alone favours
  // tiny ticks or long texture runs. No length cap, unlike the walker's paths: a model line is already a line.
  const candidates = mask => {
    const rank = (p, q) => (q.strength * q.length) - (p.strength * p.length);
    const inSubject = [], outside = [];
    for (const g of lines) {
      const inside = mask ? insideShare(g.points, mask, w, h, num('pendrawat', 0.5)) : 1;
      (inside >= num('mlinside', 0.5) ? inSubject : outside).push(g);
    }
    log(`ml lines: ${lines.length} loaded, ${inSubject.length} inside the subject for tier 2, ${outside.length} outside it for tier 3`);
    const as = tier => g => ({ points: g.points, length: g.length, strength: g.strength, tier, ml: true });
    return { t2: inSubject.slice().sort(rank).map(as(2)), t3: outside.slice().sort(rank).map(as(3)) };
  };
  return { lines, want: num('mlwant', 0) > 0 ? num('mlwant', 0) : 0, candidates };
}
