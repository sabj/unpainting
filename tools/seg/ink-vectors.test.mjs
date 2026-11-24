import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { segPythonFor } from '../paint/run.mjs';
import sharp from 'sharp';
import { rasterizeRings, isFill } from '../../src/paint/methods/ink-vectors.mjs';

// The fitter on a small made drawing, soft as the image model's drawings are (every edge spread over 0.8 px): a thin black
// line, two bars a narrow gap apart, a blot, a thick branch.
// (the segmentation python as the painter finds it: a git worktree without its own uses its main checkout's)
const root = fileURLToPath(new URL('../../', import.meta.url)), python = segPythonFor(root);

test('ink-vectors.py: a thin line thin and dark, a narrow gap open, a blot a fill, a thick branch a line, nothing drawn across a gap', async () => {
  assert.ok(fs.existsSync(python), `the segmentation Python environment is missing (${python}); run npm run doctor`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-vectors-')), W = 160, H = 120, mm = 0.2;
  try {
    const svg = `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>
      <rect x="10" y="19.5" width="60" height="1" fill="#000"/><rect x="90" y="19.5" width="50" height="1" fill="#000"/>
      <rect x="20" y="40" width="3" height="40" fill="#000"/><rect x="25" y="40" width="3" height="40" fill="#000"/>
      <circle cx="70" cy="60" r="8" fill="#000"/><rect x="100" y="45" width="8" height="60" fill="#000"/></svg>`;
    const png = path.join(dir, 'drawing.png');
    await sharp(Buffer.from(svg)).blur(0.8).png().toFile(png);
    const line = (seq, a, b, width, n = 40) => ({ seq, points: Array.from({ length: n + 1 }, (_, k) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]), width, weight: 1, role: 'pen stroke', length: Math.hypot(b[0] - a[0], b[1] - a[1]), phase: 'growth' });
    // the thin line as the tracer joins it: one stroke across the 20 px gap between its two pieces
    const lines = [line(0, [10, 19.5], [140, 19.5], 1, 130), line(1, [21, 40], [21, 80], 3), line(2, [26, 40], [26, 80], 3), line(3, [64, 60], [76, 60], 12, 12), line(4, [103.5, 45], [103.5, 105], 8, 60)];
    fs.writeFileSync(path.join(dir, 'd-lines.json'), JSON.stringify({ image: { w: W, h: H }, medium: 'ink', lines }));
    const out = path.join(dir, 'd-vectors.json');
    execFileSync(python, ['tools/seg/ink-vectors.py', png, path.join(dir, 'd-lines.json'), '--sheetmm', String(W * mm), '--out', out], { cwd: root });
    const doc = JSON.parse(fs.readFileSync(out, 'utf8')), by = k => doc.strokes.filter(s => s.line === k);
    assert.equal(doc.fills, 'marked');
    // ink over the whole sheet, at 4 cells a drawing pixel
    const cell = mm / 4, w = W * 4, h = H * 4, ink = new Float32Array(w * h);
    for (const s of doc.strokes) { const r = rasterizeRings(s.outline, w, h, cell, 2); for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) { const k = (r.y0 + j) * w + r.x0 + i; ink[k] = Math.max(ink[k], r.cov[j * r.w + i] * s.dark); } }
    const at = (x, y) => ink[Math.floor(y * 4) * w + Math.floor(x * 4)];
    const thin = by(0)[0];
    assert.equal(thin.drawn, 'path', 'the thin line is drawn as a path');
    const widths = thin.widths.filter(v => v > 0).sort((a, b) => a - b), med = widths[widths.length >> 1];
    assert.ok(thin.dark >= 0.6 && med <= 1.6 * mm, `thin and dark, not a wide grey band: ${thin.dark} at ${med} mm`);
    assert.ok(at(40, 20) > 0.5 && at(120, 20) > 0.5, 'the line is there on both sides');
    assert.ok(at(80, 20) === 0, 'nothing is drawn across the gap in the line');
    assert.ok(at(21.5, 60) > 0.9 && at(26.5, 60) > 0.9 && at(24, 60) < 0.25, `two bars with the gap between them open: ${at(24, 60)}`);
    const blot = doc.strokes.filter(s => isFill(s));
    assert.equal(blot.length, 1, 'one fill');
    assert.ok(at(70, 60) > 0.9 && Math.abs(blot[0].path[0][0] / mm - 70) < 10, 'the blot is the fill');
    assert.ok(by(4).length >= 1 && by(4).every(s => !isFill(s)) && at(104, 75) > 0.9, 'the thick branch is a line, laid whole');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
