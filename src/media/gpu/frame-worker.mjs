// Renders film frames and plan-against-sheet marks off the painter's thread (see framer.mjs).
// Keeps the composite of dried layers as render-cache.mjs does, so output matches the painter's own render byte for byte.
import { parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';
import path from 'node:path';
import { renderCells } from '../km.mjs';
import { execution } from '../../eval/composite.mjs';
import { gaussian } from '../../keyframes/density.mjs';

const { n, w, h, W2, SC, K, Kp, Sp, out, quality, wet, port, outW, outH } = workerData;
const base = new Uint8Array(workerData.base), paperRGB = workerData.paperRGB;
const zero = new Float32Array(n);
let R = null; // the composite of the layers under the top, before rounding (null: none yet, the paper)
const planes = (ks, data, at) => { const L = new Array(K).fill(zero); ks.forEach((k, q) => { L[k] = data.subarray((at + q) * n, (at + q + 1) * n); }); return L; };
const addLower = L => {
  if (!R) { R = new Float64Array(n * 3); for (let i = 0; i < n * 3; i++) R[i] = base[i] / 255; }
  renderCells([L], Kp, Sp, base, 0, n, 1, null, null, R, R);
};
for (const l of workerData.lower) addLower(planes(l.ks, new Float32Array(l.data), 0));

// paint-plate's sheetDensity: the rendered sheet's optical density per picture cell
const pl2 = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2];
const sheetDensity = big => {
  const D = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let l = 0, c = 0;
    for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) {
      const q = ((y * SC + dy) * W2 + x * SC + dx) * 3;
      l += 0.2126 * big[q] + 0.7152 * big[q + 1] + 0.0722 * big[q + 2]; c++;
    }
    D[y * w + x] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, l / c / pl2))));
  }
  return D;
};

const rendered = new Map(); // id -> Buffer (the frame's RGB) until the painter has said what it is for
const named = new Map();    // id -> { name } | { mark, planD }
const marks = new Map();    // id -> { pass, numbers, paintedD }
let done = 0, writes = [];
const settle = id => {
  const rgb = rendered.get(id), what = named.get(id);
  if (!rgb || !what) return;
  rendered.delete(id); named.delete(id);
  if (what.name) writes.push(sharp(rgb, { raw: { width: outW, height: outH, channels: 3 } }).jpeg({ quality }).toFile(path.join(out, what.name)).then(() => { done++; }));
  else { const paintedD = sheetDensity(rgb); marks.set(id, { pass: what.mark, numbers: execution(what.planD, paintedD, w, h, gaussian), paintedD }); done++; }
};

port.on('message', m => {
  if (m.type === 'lower') { addLower(planes(m.ks, m.data, 0)); return; }
  // a snapshot: render.mjs's renderSheet over the composite, then paint-plate's finishRGB (the wet darkening)
  const top = m.hasTop ? planes(m.top, m.data, m.sums.length) : null, sums = planes(m.sums, m.data, 0);
  const rest = top ? [top, sums] : [sums], o = new Uint8ClampedArray(n * 3);
  if (R) renderCells(rest, Kp, Sp, base, 0, n, 1, null, o, R, null);
  else renderCells(rest, Kp, Sp, base, 0, n, 1, null, o);
  if (wet) {
    const Wv = m.data.subarray((m.sums.length + m.top.length) * n, (m.sums.length + m.top.length + 1) * n);
    for (let i = 0; i < n; i++) { const wv = Wv[i]; if (wv > 1e-4) { const f = 1 - wet.dark * Math.min(1, wv / wet.cap); o[i * 3] *= f; o[i * 3 + 1] *= f; o[i * 3 + 2] *= f * 1.01; } }
  }
  rendered.set(m.id, Buffer.from(o.buffer));
  settle(m.id);
});

parentPort.on('message', async m => {
  if (m.type === 'name') { named.set(m.id, { name: m.name }); settle(m.id); return; }
  if (m.type === 'mark') { named.set(m.id, { mark: m.pass, planD: m.planD }); settle(m.id); return; }
  if (m.type === 'drain') {
    // everything the painter has handed over so far: wait until each is rendered and written or marked
    while (done < m.count) await new Promise(r => setTimeout(r, 5));
    await Promise.all(writes); writes = [];
    const res = [...marks.entries()].map(([id, v]) => ({ id, pass: v.pass, numbers: v.numbers, paintedD: v.paintedD }));
    marks.clear();
    parentPort.postMessage({ type: 'drained', marks: res }, res.map(r => r.paintedD.buffer));
  }
});
