// --washplanpng 1: the wash plan as pictures, written before any paint, for judging where the washes go.
//   wash-plan.png      three panels side by side: the light washes, the middle layers and the shadow glazes. Each
//                      passage is a pale fill with its outline in its own colour; the segments' boundaries are drawn
//                      in red over every panel, so a wash that runs across a subject boundary shows.
//   subject-field.png  under --subjectwash 1: the wash groups, each a flat colour, with the subject boundaries.
// Reads no target pixels: only the plan's masks and the segment labels.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { hasSegments, loadSegments } from '../../crop/segments.mjs';

const PANELS = Object.freeze(['light', 'mid', 'shadow']);
const GAP = 6;
const RED = Object.freeze([220, 30, 30]);

// a stable bright colour for an integer
const hue = k => { const t = ((k * 0.61803398875) % 1) * 6, i = Math.floor(t), f = t - i, v = [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][i % 6]; return v.map(c => Math.round(40 + 180 * c)); };

/** The phase a pass belongs to: the value plan names it; a ladder pass goes by its value step. */
function phaseOf(layer, steps) {
  if (layer._valuePhase) return layer._valuePhase;
  if (layer.shapes.some(sh => sh.firstWash) || layer.value <= steps / 3) return 'light';
  return layer.value <= (2 * steps) / 3 ? 'mid' : 'shadow';
}

function boundaryOf(labels, w, h) {
  const n = w * h, edge = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const x = i % w; if ((x < w - 1 && labels[i] !== labels[i + 1]) || (i + w < n && labels[i] !== labels[i + w])) edge[i] = 1; }
  return edge;
}

function panel(layers, phase, steps, w, h, groupOf) {
  const n = w * h, img = new Float32Array(n * 3).fill(255);
  let k = 0;
  for (const L of layers) {
    if (phaseOf(L, steps) !== phase) continue;
    for (const sh of L.shapes) {
      // a passage's mask is built from its label field on demand; let it go again afterwards (blockin.mjs dropMask)
      const cached = sh._mask, m = sh.mask; if (!m) continue;
      const b = sh.box ?? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
      let first = -1;
      for (let y = b.y0; y <= b.y1 && first < 0; y++) for (let x = b.x0; x <= b.x1; x++) if (m[y * w + x]) { first = y * w + x; break; }
      const col = hue(groupOf && first >= 0 ? groupOf[first] : ++k);
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
        const i = y * w + x; if (!m[i]) continue;
        const rim = x === 0 || x === w - 1 || y === 0 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w];
        for (let c = 0; c < 3; c++) img[i * 3 + c] = rim ? col[c] : img[i * 3 + c] * 0.88 + col[c] * 0.12;
      }
      if (!cached && sh.ids) sh._mask = null;
    }
  }
  return img;
}

/** Writes wash-plan.png (and subject-field.png under subjects) into out. image: the target, for its segments. */
export async function writeWashPlan({ layers, steps = 5, w, h, out, image = '', subjects = null, log }) {
  const base = image ? path.basename(image, path.extname(image)) : '';
  const seg = base && hasSegments(base) ? await loadSegments(base, w, h) : null;
  const n = w * h, edge = seg ? boundaryOf(seg.labels, w, h) : null, W = 3 * w + 2 * GAP;
  const sheet = Buffer.alloc(W * h * 3, 255);
  PANELS.forEach((phase, p) => {
    const img = panel(layers, phase, steps, w, h, subjects ? (phase === 'shadow' ? subjects.shadow : subjects.wash) : null);
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i - x) / w, o = (y * W + p * (w + GAP) + x) * 3;
      for (let c = 0; c < 3; c++) sheet[o + c] = edge?.[i] ? RED[c] : Math.round(img[i * 3 + c]);
    }
  });
  await sharp(sheet, { raw: { width: W, height: h, channels: 3 } }).png().toFile(path.join(out, 'wash-plan.png'));
  if (subjects) {
    const img = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) { const col = edge?.[i] ? [0, 0, 0] : subjects.lights[i] ? [255, 255, 255] : hue(subjects.wash[i]); for (let c = 0; c < 3; c++) img[i * 3 + c] = col[c]; }
    await sharp(img, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, 'subject-field.png'));
    fs.writeFileSync(path.join(out, 'subject-field.json'), JSON.stringify(subjects.summary, null, 1));
  }
  log(`wash plan: ${layers.length} passes drawn in wash-plan.png${seg ? ', segment boundaries in red' : ''}${subjects ? '; wash groups in subject-field.png' : ''}`);
}
