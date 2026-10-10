// In-between frames in true stroke order, for README films made from a run with few saved frames.
//
// Between two saved frames A and B the painter laid some strokes, recorded in order on its mark tape (marks.json). Each
// pixel is given the order of the last stroke in that gap whose footprint covers it: a brush stroke ('s') covers a disc
// of its recorded radius round each of its points, a pen line ('P') a disc of its recorded width. An in-between at
// stroke c shows B's pixel where that stroke came before c and A's pixel everywhere else; pixels no stroke covered (paint
// that flowed, or dried in place) switch to B at the end of the gap. Every pixel shown is a pixel the painter saved:
// nothing is blended, recoloured or generated, though a switched pixel shows its colour at the end of the gap.
import fs from 'node:fs';
import sharp from 'sharp';

// The tape's strokes grouped by the saved frame they were laid before: gaps[k] holds the strokes laid between saved
// frames k - 1 and k, each as a list of discs { x, y, r } in sheet pixels. Frame markers are { k: 'm', i: frame }.
export function strokesByGap(tapeFile, frameCount) {
  const tape = JSON.parse(fs.readFileSync(tapeFile, 'utf8'));
  const s = tape.scale ?? 1, gaps = Array.from({ length: frameCount }, () => []);
  let frame = 0;
  for (const m of tape.marks) {
    if (m.k === 'm') { frame = m.i; continue; }
    if (m.k !== 's' && m.k !== 'P') continue;
    const gap = Math.min(frameCount - 1, frame + 1);
    const brush = m.k === 's' ? tape.brushOpts?.[tape.brushes?.[m.b] ?? m.b] : null;
    // 's' points are [x, y, pressure, radius] and 'P' points [x, y, width, ...], all times the tape's scale.
    const discs = (m.d ?? []).map(q => ({ x: q[0] / s, y: q[1] / s, r: m.k === 's' ? (q[3] ?? (brush?.radius ?? 0) * s) / s : Math.max(1, (q[2] ?? 10) / s / 2) }));
    if (discs.length) gaps[gap].push(discs);
  }
  return gaps;
}

// For one gap, each panel pixel's stroke order (the last stroke covering it), or -1. `k` is panel pixels per sheet pixel.
export function orderMap(strokes, w, h, k) {
  const owner = new Int32Array(w * h).fill(-1);
  strokes.forEach((discs, j) => {
    let last = null;
    for (const d of discs) {
      const r = Math.max(0.5, d.r * k), x = d.x * k, y = d.y * k;
      // Points closer than a third of the radius to the last stamped one add nothing visible.
      if (last && Math.hypot(x - last.x, y - last.y) < r / 3) continue;
      last = { x, y };
      const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(w - 1, Math.ceil(x + r)), y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(h - 1, Math.ceil(y + r)), r2 = r * r;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if ((xx - x) ** 2 + (yy - y) ** 2 <= r2) owner[yy * w + xx] = j;
    }
  });
  return owner;
}

// The film: every saved frame plus in-betweens, about `total` frames in all, shared out between the gaps by their stroke
// counts. Returns [{ rgb (w x h x 3 raw), label }] in order. `files[k]` is saved frame k's image; `last` replaces the
// final frame's file (painting.png).
export async function inBetweenFilm({ files, tapeFile, sheetW, w, h, total }) {
  const gaps = strokesByGap(tapeFile, files.length), k = w / sheetW;
  const counts = gaps.map(g => g.length), all = counts.reduce((a, b) => a + b, 0), spare = Math.max(0, total - files.length);
  const share = counts.map(c => (all ? Math.round(spare * c / all) : 0));
  const load = f => sharp(f).flatten({ background: '#fff' }).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const out = [];
  let prev = await load(files[0]);
  out.push({ rgb: prev, label: 'f0' });
  for (let j = 1; j < files.length; j++) {
    const next = await load(files[j]);
    const n = Math.min(share[j], counts[j]);
    if (n > 0) {
      const owner = orderMap(gaps[j], w, h, k);
      for (let m = 1; m <= n; m++) {
        const cut = Math.round(m * counts[j] / (n + 1)), rgb = Buffer.from(prev);
        for (let i = 0; i < owner.length; i++) if (owner[i] >= 0 && owner[i] < cut) { rgb[3 * i] = next[3 * i]; rgb[3 * i + 1] = next[3 * i + 1]; rgb[3 * i + 2] = next[3 * i + 2]; }
        out.push({ rgb, label: `f${j - 1}+${cut}/${counts[j]}` });
      }
    }
    out.push({ rgb: next, label: `f${j}` });
    prev = next;
  }
  return out;
}
