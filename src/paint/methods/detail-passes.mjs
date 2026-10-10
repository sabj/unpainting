// --detailpasses <share>: late small passages where the picture carries its detail, so the subject comes out tight
// while the setting stays loose. The ladder's plan smooths away detail under about eight cells; these passages put it back.
import { components, dilate } from '../../raster.js';
import { passage } from '../../crop/blockin.mjs';

// The detail region: the top share of painted cells by source edge energy times 0.25 + 0.75 of the subject mask
// (work/masks/<name>.png, the whole sheet if missing), grown one cell. Built when --detailpasses or --detailtrim is on;
// --detailshare sets its share for --detailtrim alone. The passages are what each pigment still owes inside it, cut
// into --detailstep levels up to --detaillevels deep, pieces of at least --detailmin cells, with no smoothing.
export async function detailLayers({ A, K, delivered, SRC, w, h, n, steps, image, root, path, fs, sharp, gaussian, num, log }) {
  const share = num('detailpasses', 0) > 0 ? num('detailpasses', 0) : num('detailtrim', 0) > 0 ? num('detailshare', 0.25) : 0;
  if (!(share > 0)) return { layers: [], region: null };
  const B = gaussian(SRC, w, h, 1), E = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, gx = B[y * w + Math.min(w - 1, x + 1)] - B[y * w + Math.max(0, x - 1)], gy = B[Math.min(h - 1, y + 1) * w + x] - B[Math.max(0, y - 1) * w + x];
    E[i] = Math.hypot(gx, gy) / 2;
  }
  const base = image ? path.basename(image, path.extname(image)) : '';
  const file = base ? path.resolve(root, `work/masks/${base}.png`) : '';
  let S = null;
  if (file && fs.existsSync(file)) { const { data } = await sharp(file).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true }); S = Float32Array.from({ length: n }, (_, i) => data[i] / 255); }
  const Wt = Float32Array.from(E, (e, i) => e * (0.25 + 0.75 * (S ? S[i] : 1)));
  const painted = []; for (let i = 0; i < n; i++) if (SRC[i] > 0.05) painted.push(Wt[i]);
  painted.sort((a, b) => a - b);
  const cut = painted.length ? painted[Math.min(painted.length - 1, Math.floor((1 - share) * painted.length))] : Infinity;
  const region = dilate(Uint8Array.from(Wt, (v, i) => (v >= cut && SRC[i] > 0.05 ? 1 : 0)), w, h, 1);
  let rc = 0; for (let i = 0; i < n; i++) rc += region[i];
  if (!(num('detailpasses', 0) > 0)) { log(`detail region: ${(100 * rc / n).toFixed(1)}% of the sheet, for --detailtrim only`); return { layers: [], region }; }
  const g = num('detailstep', 0.06), levels = Math.round(num('detaillevels', 4)), min = Math.round(num('detailmin', 2));
  const layers = []; let value = steps, count = 0;
  for (let j = 0; j < K; j++) for (let t = 1; t <= levels; t++) {
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (region[i] && A[i * K + j] - delivered[i * K + j] >= t * g) m[i] = 1;
    const { labels, areas, count: c } = components(m, w, h);
    const ids = c < 65535 ? new Uint16Array(n) : new Int32Array(n);
    const box = Array.from({ length: c + 1 }, () => ({ x0: w, y0: h, x1: -1, y1: -1 }));
    for (let i = 0; i < n; i++) { const id = labels[i]; if (!id || areas[id] < min) continue; ids[i] = id; const x = i % w, y = (i / w) | 0, b = box[id]; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
    const shapes = [];
    for (let id = 1; id <= c; id++) if (areas[id] >= min) { const sh = passage(ids, id, box[id], g, areas[id], w); sh.mix = new Array(K).fill(0); sh.mix[j] = g; shapes.push(sh); }
    if (!shapes.length) continue;
    count += shapes.length;
    const mix = new Array(K).fill(0); mix[j] = g;
    layers.push({ value: ++value, pigment: j, ids, _detail: true, _mask: null, get mask() { return (this._mask ??= Uint8Array.from(this.ids, id => (id ? 1 : 0))); }, set mask(q) { this._mask = q; }, shapes, mix, amount: g, area: shapes.reduce((a, sh) => a + sh.area, 0) });
  }
  log(`detail passes: region ${(100 * rc / n).toFixed(1)}% of the sheet (${S ? 'edges x subject' : 'edges only'}), ${layers.length} passes, ${count} passages of ${g} at least ${min} cells`);
  return { layers, region };
}

// --detailtrim <share>: the passage's mask (a new field) without the region's cells that want less than this share of
// its charge, so a glaze is cut back to the cells that asked for paint; null when nothing is cut.
export function trimPassage(mask, want, amount, region, n, share) {
  if (!region || !(share > 0)) return null;
  const out = Uint8Array.from(mask); let cut = 0;
  for (let i = 0; i < n; i++) if (out[i] && region[i] && want[i] < share * amount) { out[i] = 0; cut++; }
  return cut ? out : null;
}
