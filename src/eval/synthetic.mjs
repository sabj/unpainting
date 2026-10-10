// Deliberately bad pictures: negative controls the craft measures must fail.
import sharp from 'sharp';

const W = 384, H = 384;
const newSheet = () => { const px = new Uint8Array(W * H * 3).fill(252); return px; };
const put = (px, x, y, v) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; const c = Math.max(0, Math.min(255, v)); px[i] = c; px[i + 1] = c; px[i + 2] = c; };
const get = (px, x, y) => px[((y * W + x) * 3)];
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// A region filled to one density with a soft boundary: no grain, no sweep, one kind of edge.
function flatFill() {
  const px = newSheet(), cx = W / 2, cy = H / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x - cx, y - cy) / 130 + 0.16 * Math.sin(4 * Math.atan2(y - cy, x - cx));
    if (r < 1) put(px, x, y, 252 * Math.exp(-0.85 * Math.min(1, (1 - r) * 14)));
  }
  return px;
}
// Ruled strokes of one width, one density, square ends: the machine line the references describe.
function uniformLines() {
  const px = newSheet(), r = rng(7);
  for (let k = 0; k < 90; k++) {
    const x0 = r() * W, y0 = r() * H, a = r() * Math.PI * 2, len = 40 + r() * 60;
    for (let t = 0; t < len; t += 0.4) {
      const x = x0 + Math.cos(a) * t, y = y0 + Math.sin(a) * t;
      for (let o = -1.5; o <= 1.5; o += 0.5) put(px, Math.round(x - Math.sin(a) * o), Math.round(y + Math.cos(a) * o), 40);
    }
  }
  return px;
}
// Dots on a jittered lattice: even coverage, no clustering, tone as a scatter rather than as marks.
function buckshot() {
  const px = newSheet(), r = rng(11), step = 7;
  for (let y = step; y < H - step; y += step) for (let x = step; x < W - step; x += step) {
    const jx = x + (r() - 0.5) * 2.2, jy = y + (r() - 0.5) * 2.2;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (dx * dx + dy * dy <= 1) put(px, Math.round(jx + dx), Math.round(jy + dy), 60);
  }
  return px;
}
// Tone as a smooth ramp with no marks in it at all: the filter look.
function smoothRamp() {
  const px = newSheet();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 0.5 + 0.5 * Math.sin(x / 90) * Math.cos(y / 70);
    put(px, x, y, 252 * Math.exp(-1.1 * v));
  }
  return px;
}
// A wash with a hard polygonal rim on every side: the "polygon rims" fault, isolated.
function polygonWash() {
  const px = newSheet(), n = 7, cx = W / 2, cy = H / 2, R = 150;
  const pts = Array.from({ length: n }, (_, k) => [cx + R * Math.cos(2 * Math.PI * k / n), cy + R * Math.sin(2 * Math.PI * k / n)]);
  const inside = (x, y) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) put(px, x, y, 252 * Math.exp(-0.7));
  return px;
}

const NEGATIVES = {
  'flat-fill': { make: flatFill, fault: 'a wash with no grain, no sweep and one kind of edge' },
  'uniform-lines': { make: uniformLines, fault: 'strokes of one width, one load and square ends' },
  buckshot: { make: buckshot, fault: 'dots on a lattice: even coverage, no clustering' },
  'smooth-ramp': { make: smoothRamp, fault: 'tone as a gradient with no marks in it' },
  'polygon-wash': { make: polygonWash, fault: 'a wash whose rim runs in seven straight directions' },
};

export async function writeNegatives(dir) {
  const out = [];
  for (const [name, { make, fault }] of Object.entries(NEGATIVES)) {
    const file = `${dir}/neg-${name}.png`;
    await sharp(Buffer.from(make()), { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
    out.push({ name, file, fault });
  }
  return out;
}
