// Load pictures as optical density D = -ln(L / paperL), so bare paper is 0 and transparent passes add.
// Also cuts comparison sheets into their panels.
import path from 'node:path';
import sharp from 'sharp';

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function quantile(values, q) {
  if (!values.length) return NaN;
  const a = Float64Array.from(values).sort();
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
export const mean = v => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
export const sd = v => { if (v.length < 2) return NaN; const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1)); };

// Paper tone: the lightest luminance histogram lump with a real share of the sheet. A percentile fails on
// scan margins and nearly covered sheets.
function paperTone(L) {
  const bins = 64, hist = new Float64Array(bins);
  for (let i = 0; i < L.length; i++) hist[Math.min(bins - 1, Math.max(0, Math.floor(L[i] / 256 * bins)))]++;
  const sm = new Float64Array(bins);
  for (let b = 0; b < bins; b++) { let s = 0, ws = 0; for (let k = -2; k <= 2; k++) { const j = b + k; if (j < 0 || j >= bins) continue; const wk = Math.exp(-k * k / 2); s += hist[j] * wk; ws += wk; } sm[b] = s / ws; }
  let peak = 0, dom = -1;
  for (let b = 0; b < bins; b++) if (sm[b] > peak) { peak = sm[b]; dom = b; }
  // dominant lump, unless a lighter lump of comparable size exists (then the dominant one is a wash)
  let best = dom;
  for (let b = dom + 2; b < bins - 1; b++) if (sm[b] >= sm[b - 1] && sm[b] >= sm[b + 1] && sm[b] >= 0.55 * peak) { best = b; break; }
  return Math.max(12, best < 0 ? 200 : (best + 0.7) / bins * 256);
}

// Drop dark edge rows and columns (mount board, scan border) so they do not read as ink.
function trimMount(rgb, w, h) {
  const rowMed = [], colMed = [], buf = [];
  for (let y = 0; y < h; y++) { buf.length = 0; for (let x = 0; x < w; x += 4) { const i = (y * w + x) * 3; buf.push(lum(rgb[i], rgb[i + 1], rgb[i + 2])); } rowMed.push(quantile(buf, 0.5)); }
  for (let x = 0; x < w; x++) { buf.length = 0; for (let y = 0; y < h; y += 4) { const i = (y * w + x) * 3; buf.push(lum(rgb[i], rgb[i + 1], rgb[i + 2])); } colMed.push(quantile(buf, 0.5)); }
  const centre = quantile([...rowMed, ...colMed], 0.7), cut = centre * 0.55;
  const scan = (arr, from, to, step) => { let k = from; const limit = Math.floor(arr.length * 0.12); for (let n = 0; n < limit && k !== to; n++, k += step) if (arr[k] >= cut) break; return k; };
  const top = scan(rowMed, 0, h, 1), bottom = scan(rowMed, h - 1, -1, -1), left = scan(colMed, 0, w, 1), right = scan(colMed, w - 1, -1, -1);
  return { left, top, width: Math.max(8, right - left + 1), height: Math.max(8, bottom - top + 1) };
}

// Load an image (or a rectangle of one) as density plus raw pixels. maxDim downsamples by area averaging
// so thin lines keep their mean darkness.
export async function loadDensity(file, { rect = null, maxDim = 0, trim = false, resizeTo = null } = {}) {
  let img = sharp(file).flatten({ background: '#ffffff' }).removeAlpha();
  if (rect) img = img.extract({ left: rect[0], top: rect[1], width: rect[2], height: rect[3] });
  let { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  let w = info.width, h = info.height;
  if (trim) {
    const box = trimMount(data, w, h);
    if (box.width < w || box.height < h) {
      ({ data, info } = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).extract(box).raw().toBuffer({ resolveWithObject: true }));
      w = info.width; h = info.height;
    }
  }
  let scale = 1;
  if (resizeTo) {
    ({ data, info } = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).resize({ width: resizeTo[0], height: resizeTo[1], fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true }));
    w = info.width; h = info.height;
  }
  if (maxDim && Math.max(w, h) > maxDim) {
    scale = maxDim / Math.max(w, h);
    ({ data, info } = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).resize({ width: Math.round(w * scale), height: Math.round(h * scale), kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true }));
    w = info.width; h = info.height;
  }
  const n = w * h, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = lum(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  const paper = paperTone(L);
  const D = new Float32Array(n);
  for (let i = 0; i < n; i++) D[i] = Math.max(0, -Math.log(Math.max(2, L[i]) / paper));
  // paper noise sets the ink floor
  const light = []; for (let i = 0; i < n; i += 5) if (L[i] > paper * 0.9) light.push(D[i]);
  const noise = sd(light) || 0.01;
  return { file, w, h, n, D, rgb: data, paper, noise, scale, inkFloor: Math.max(0.055, 3.2 * noise) };
}

// Comparison sheet layouts: stacks of (target, painting) panel pairs. Sizes must match the tools that build them:
// crop sheets use S=384, Z=256, pad=8, labelH=22; line-fit.mjs uses S=384, a 30 px title and three rows.
const LAYOUTS = {
  crop: { match: (w, h) => w === 776 && h % 678 === 0, panels(w, h) {
    const out = [];
    for (let r = 0; r < h / 678; r++) { const y = r * 678;
      out.push({ name: `stage${r + 1}-full`, target: [0, y + 22, 384, 384], painting: [392, y + 22, 384, 384] });
      out.push({ name: `stage${r + 1}-zoom`, target: [0, y + 414, 256, 256], painting: [264, y + 414, 256, 256] });
    }
    return out;
  } },
  linefit: { match: (w, h) => w === 776 && h === 1206, panels() {
    return [0, 1, 2].map(j => ({ name: j === 0 ? 'full' : `zoom${j}`, target: [0, 30 + 392 * j, 384, 384], painting: [392, 30 + 392 * j, 384, 384] }));
  } },
};

export async function panelsOf(file, forced = null) {
  const { width, height } = await sharp(file).metadata();
  const key = forced || Object.keys(LAYOUTS).find(k => LAYOUTS[k].match(width, height));
  if (!key) return null;
  return { layout: key, sheet: path.basename(file), panels: LAYOUTS[key].panels(width, height) };
}
