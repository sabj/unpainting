// Reproduces the archived 40 x 40 mm landscape in HANDOFF.md, on the CPU.
// node tools/lab/render-dry-demo.mjs <repo root> <out prefix> <mm> [scan png]
// This is a material fixture, not a prepared subject or a GPU painting comparison.
import fs from 'node:fs'; import path from 'node:path';
import sharp from 'sharp';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const [root, out, mmArg, scanPng] = process.argv.slice(2), M = f => import(pathToFileURL(path.join(path.resolve(root), f)).href);
if (!root || !out || !(Number(mmArg) > 0)) throw new Error('usage: render-dry-demo.mjs <repo root> <out prefix> <mm> [scan png]');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const { makePaper } = await M('src/media/paper.mjs'), S = await M('src/media/sheet.mjs'), Br = await M('src/media/brush.mjs'), { renderLayers } = await M('src/media/km.mjs');
const { physicalOf, physicsFields } = await M('src/media/pigment-physical.mjs'), { subcellLayers } = await M('src/media/subcell-grain.mjs');
// the picture sits in the middle 32 mm of the 40 mm sheet: a 4 mm paper margin all round
const F = 0.8, X = v => 4 + F * v;
const U = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], ...physicsFields(physicalOf('ultramarine')) };
const B = { K: [0.09, 0.28, 0.55], S: [0.03, 0.03, 0.03], ...physicsFields(physicalOf('sienna')) };
const PIG = [U, B], mm = Number(mmArg), w = Math.round(40 / mm), h = w, t0 = Date.now();
let relief = 'cold';
if (scanPng) { const { scanRelief } = await M('src/media/paper-relief.mjs'); const { data, info } = await sharp(scanPng).greyscale().raw().toBuffer({ resolveWithObject: true }); relief = scanRelief({ data, width: info.width, height: info.height }, { id: 'ambientcg-Paper001', mmPerPx: 0.075 }); }
const sheet = S.createSheet(makePaper(w, h, { relief, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm } }), PIG);
const O = { ...S.DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 };
const brush = (r, seed, flat = true) => Br.createBrush({ model: 'section', flat, radius: F * r / mm, bristles: Math.max(12, Math.ceil(F * r / mm * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, seed });
const lay = (b, pts, opts = {}) => { const perStep = 0.7 * mm / (opts.speed ?? 60); let t = 0; Br.stroke(b, sheet, pts.map(q => ({ ...q, x: X(q.x) / mm, y: X(q.y) / mm })), { upright: 'sweep', ...opts, between: () => { for (t += perStep; t >= O.dt; t -= O.dt) S.step(sheet, O); } }); };
const wait = sec => { for (let t = 0; t < sec; t += O.dt) S.step(sheet, O); };
const dry = () => S.dry(sheet, 200000, O, { levelMax: 200, dt: 14, analyticTail: true });
const drop = (cx, cy, r, water, conc) => { S.coherent?.(sheet); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot((x + 0.5) * mm - X(cx), (y + 0.5) * mm - X(cy)) < F * r) S.deposit(sheet, y * w + x, water, conc.map(c => c * water)); };
// 1. graded wet sky: sweeps of a 10 mm flat, each weaker, picking up the bead
[1.5, 1.1, 0.7, 0.35, 0.12].forEach((c, k) => { const b = brush(5, 10 + k); Br.dip(b, { water: 1, conc: [c, 0] }); const [a, z] = k % 2 ? [39, 1] : [1, 39]; lay(b, [{ x: a, y: 3 + k * 4.5, p: 1 }, { x: z, y: 3 + k * 4.5, p: 1 }], { speed: 50 }); });
wait(40);
// 2. damp-into-wet hill: a sienna/ultramarine flat along a rolling contour, then a drop of nearly clean water blooms in it
{ const b = brush(4, 21); Br.dip(b, { water: 0.9, conc: [0.5, 1.3] }); const pts = []; for (let x = 0; x <= 40; x += 2) pts.push({ x, y: 24 + 3 * Math.sin(x / 6) + 3, p: 1 }); lay(b, pts, { speed: 45 });
  const b2 = brush(4, 22); Br.dip(b2, { water: 0.9, conc: [0.5, 1.3] }); lay(b2, pts.map(q => ({ ...q, y: q.y + 6 })).reverse(), { speed: 45 }); }
wait(60); drop(12, 27, 2.5, 0.2, [0.05, 0.02]);
dry();
// 3. a darker glaze for the hill's shadow
{ const b = brush(3, 31); Br.dip(b, { water: 0.8, conc: [1.2, 1.0] }); const pts = []; for (let x = 18; x <= 40; x += 2) pts.push({ x, y: 30 + 2 * Math.sin(x / 5), p: 0.9 }); lay(b, pts, { speed: 60 }); }
dry();
// 4. a tree: a trunk and curved branches with a round brush, pressure swelling and tapering
const curve = (x0, y0, x1, y1, bend, p0, p1, p2) => { const pts = []; for (let i = 0; i <= 12; i++) { const s = i / 12, nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1, k = bend * 4 * s * (1 - s); pts.push({ x: x0 + (x1 - x0) * s + nx / L * k, y: y0 + (y1 - y0) * s + ny / L * k, p: s < 0.5 ? p0 + (p1 - p0) * s * 2 : p1 + (p2 - p1) * (s - 0.5) * 2 }); } return pts; };
[[29, 33, 29.5, 14, 0.6, 0.5, 0.9, 0.2], [29.3, 22, 24, 15, -1.2, 0.6, 0.7, 0.1], [29.4, 19, 34, 12, 1, 0.5, 0.6, 0.1], [29.4, 25, 33, 20, 0.8, 0.4, 0.5, 0.1], [29.5, 16, 27, 11, -0.6, 0.4, 0.4, 0.1]].forEach(([x0, y0, x1, y1, bend, a, b2, c], k) => { const b = brush(0.8, 41 + k, false); Br.dip(b, { water: 0.6, conc: [1.4, 1.8] }); lay(b, curve(x0, y0, x1, y1, bend, a, b2, c), { speed: 40, upright: undefined }); });
// 5. dry brush across the foreground
{ const b = brush(5, 51); Br.dip(b, { water: Number(process.env.DRYW ?? 0.6), conc: [1.6, 1.2] }); lay(b, [{ x: 2, y: 37, p: Number(process.env.DRYP ?? 0.9) }, { x: 38, y: 36, p: Number(process.env.DRYP ?? 0.9) }], { speed: 250 }); }
dry();
const n = w * h, base = new Uint8Array(n * 3); for (let i = 0; i < n; i++) base.set([246, 245, 239], i * 3);
const paintSeconds = (Date.now() - t0) / 1000, cpu = process.cpuUsage();
// the final display pass (tools/plate/finish.mjs subgrid): settled pigment spread over N x N sub-cells of the paper's relief
const N = Math.max(1, Math.round(mm / 0.025)), FW = w * N, FN = FW * h * N, fb = new Uint8Array(FN * 3); for (let i = 0; i < FN; i++) fb.set([246, 245, 239], i * 3);
const source = S.layersOf(sheet), before = S.totals(sheet).pig;
const tRender = performance.now(), fine = subcellLayers(source, PIG, sheet.paper, N);
const rgb = Buffer.from(renderLayers(fine, PIG, fb, FN)), renderSeconds = (performance.now() - tRender) / 1000;
const mass = arrays => PIG.map((_, k) => arrays.reduce((sum, layer) => sum + layer[k].reduce((v, x) => v + x, 0), 0));
const coarseMass = mass(source), fineMass = mass(fine).map(v => v / (N * N));
const after = S.totals(sheet).pig;
if (before.some((v, k) => v !== after[k])) throw new Error('final render changed the simulated pigment');
if (coarseMass.some((v, k) => Math.abs(fineMass[k] / v - 1) > 1e-6)) throw new Error('final render lost pigment');
const nativeBytes = Buffer.concat(source.flatMap(layer => layer.map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength))));
fs.writeFileSync(out + '.layers.f32', nativeBytes);
fs.writeFileSync(out + '.rgb', rgb);
await sharp(rgb, { raw: { width: FW, height: h * N, channels: 3 } }).png().toFile(out + '.png');
const report = { kind: 'archived 40 mm material fixture', backend: 'cpu', fallback: false, mm, w, h, N, px: FW, pxMm: mm / N,
  paintSeconds, renderSeconds, cpuSeconds: (cpu.user + cpu.system) / 1e6, totalSeconds: (Date.now() - t0) / 1000,
  peakRssGB: process.resourceUsage().maxRSS * 1024 / 1e9,
  native: { file: path.basename(out) + '.layers.f32', layers: source.length, pigments: PIG, reliefOf: sheet.paper.reliefOf, sha256: createHash('sha256').update(nativeBytes).digest('hex') }, coarseMass, fineMass, renderMassRatios: fineMass.map((v, k) => v / coarseMass[k]) };
fs.writeFileSync(out + '.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
