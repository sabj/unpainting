#!/usr/bin/env node
// Records work/paint-lab-demo.webp: Paint Lab, headless, painting a heart with an arrow through it. The heart is laid
// wet in rose and dried; the arrow's shaft glazes over it with a hard edge where it crosses the dried paint; the
// feathers, in yellow, are laid against the wet shaft and run into it; then the sheet dries and the wet edges darken.
//   node tools/lab/record-demo.mjs [--out work/paint-lab-demo.webp] [--width 1920] [--dpi 240] [--maxmb 3]
//                                  [--physics webgpu|cpu] [--port 8796] [--frames DIR] [--rewind 2] [--from-frames DIR]
// --frames saves each frame and frames.json (each frame's time on screen); --from-frames encodes a saved recording
// again without painting it. --rewind N, after the hold on the finished picture, plays every Nth frame backwards to
// the blank paper (N times as fast), and the loop starts again; 0 turns it off. If the image is over --maxmb, the
// rewind takes every (N+1)th frame before the quality drops.
// It serves docs/ itself and drives the lab through its worker messages (the same ones a pointer sends). Each frame is
// the sheet's canvas at one screen pixel per cell, so an 8 x 6 inch sheet at 240 dpi gives 1920 px with no scaling.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2), opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const OUT = path.resolve(opt('out', path.join(ROOT, 'work', 'paint-lab-demo.webp')));
const WIDTH = Number(opt('width', 1920)), DPI = Number(opt('dpi', 240)), FRAMES = opt('frames', '');
const MAX_BYTES = Number(opt('maxmb', 3)) * 1e6, PHYSICS = opt('physics', 'webgpu'), REWIND = Number(opt('rewind', 2)), FROM = opt('from-frames', '');
const DRY_TIMEOUT_MS = 600000, DRY_FRAMES = 40, DRY_SHOW_MS = 4000;
if (!(WIDTH >= 200 && WIDTH <= 4000) || ![60, 90, 120, 150, 200, 240, 300].includes(DPI) || !(MAX_BYTES > 0) || !['webgpu', 'cpu'].includes(PHYSICS) || !(Number.isInteger(REWIND) && REWIND >= 0))
  throw new Error('usage: --width 200..4000, --dpi 60|90|120|150|200|240|300, --maxmb above 0, --physics webgpu|cpu, --rewind 0 or more');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
const DOCS = path.join(ROOT, 'docs');
const ORIGIN = 'https://paint-lab.invalid';
async function serve(context) {
  await context.route(`${ORIGIN}/**`, async route => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(DOCS, '.' + rel);
    if (!file.startsWith(DOCS + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      await route.fulfill({ status: 404, body: '' }); return;
    }
    await route.fulfill({ path: file, contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' });
  });
}

// A hand's path through the given points (sheet pixels), sampled every `step` pixels and rounded to whole pixels as
// pointer samples are.
function handPath(points, step) {
  const out = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const [a, b] = [points[k], points[k + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d < L; d += step) { const u = d / L; out.push({ x: Math.round(a[0] + (b[0] - a[0]) * u), y: Math.round(a[1] + (b[1] - a[1]) * u), p: 0.85 }); }
  }
  const last = points[points.length - 1]; out.push({ x: Math.round(last[0]), y: Math.round(last[1]), p: 0.85 });
  return out;
}

// The picture, in sheet pixels for a W x H sheet: a heart, and an arrow through it from lower left to upper right.
function picture(W, H) {
  const u = W / 72, cx = W / 2, cy = H * 0.46; // the heart is 32 units wide: 44% of the sheet
  // two halves, each from the dip between the lobes round its lobe to the point, as a painter lays a heart: one stroke
  // turning through the point's cusp left a seam of dots there
  const at = t => [cx + u * 16 * Math.sin(t) ** 3, cy - u * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
  const heart = [1, -1].map(side => Array.from({ length: 61 }, (_, i) => at(side * (i / 60) * Math.PI)));
  const tail = [W * 0.15, H * 0.86], tip = [W * 0.83, H * 0.17], L = Math.hypot(tip[0] - tail[0], tip[1] - tail[1]);
  const dx = (tip[0] - tail[0]) / L, dy = (tip[1] - tail[1]) / L;
  const turn = (deg, len, from) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [from[0] + len * (c * -dx - s * -dy), from[1] + len * (s * -dx + c * -dy)]; };
  const head = [-30, 30].map(deg => [tip, turn(deg, W * 0.06, tip)]);
  // feathers: from the shaft near its tail, back and out, in pairs
  const feathers = [0.02, 0.07, 0.12].flatMap(f => { const at = [tail[0] + dx * L * f, tail[1] + dy * L * f]; return [-35, 35].map(deg => [at, turn(deg, W * 0.075, at)]); });
  return { heart, shaft: [tail, tip], head, feathers };
}

// The natural drying runs for minutes on this machine's clock: keep DRY_FRAMES of it, evenly spaced, over DRY_SHOW_MS.
function thinDrying(frames) {
  const dry = frames.filter(f => f.stage === 'dry');
  if (dry.length <= DRY_FRAMES) return frames;
  const keep = new Set(Array.from({ length: DRY_FRAMES }, (_, i) => dry[Math.round(i * (dry.length - 1) / (DRY_FRAMES - 1))]));
  return frames.filter(f => f.stage !== 'dry' || keep.has(f)).map(f => (f.stage === 'dry' ? { ...f, ms: Math.round(DRY_SHOW_MS / DRY_FRAMES) } : f));
}

async function record() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
  const errors = [], frames = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
    await serve(context);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${ORIGIN}/?intro=0&physics=${PHYSICS}&dpi=${DPI}&paper=8x6`);
    await page.waitForFunction(() => window.__lab?.sheet && window.__lab.physics !== 'pending', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const { width: W, height: H } = await page.evaluate(() => window.__lab.sheet);
    // the canvas pinned to the page's corner at half its size, so at two device pixels per CSS pixel each cell is one pixel
    await page.addStyleTag({ content: `#canvas{position:fixed!important;left:0!important;top:0!important;width:${W / 2}px!important;height:${H / 2}px!important;z-index:9999;transform:none!important}` });
    await page.waitForTimeout(300);
    const clip = { x: 0, y: 0, width: W / 2, height: H / 2 };
    let stage = 'paint';
    const grab = async (ms = 80) => { frames.push({ png: await page.screenshot({ clip }), ms, stage }); };
    const send = msg => page.evaluate(m => window.__lab.send(m), msg);
    const settle = (ms = 250) => page.waitForTimeout(ms);
    const tool = over => ({ tool: 'round', pigment: 'rose', sizeMm: 12, water: 2, amount: 0.55, pressure: 0.85, model: 'row', reservoirMode: 'standard', ...over });
    const step = Math.max(2, Math.round(DPI / 30)); // pointer samples about 0.85 mm apart
    // a stroke laid a few samples per frame, as a hand would draw it
    async function paint(points, t, perFrame = 10, show = 60) {
      const pts = handPath(points, step);
      await send({ type: 'down', pt: pts[0], tool: t });
      for (let i = 1; i < pts.length; i += perFrame) { await send({ type: 'move', pts: pts.slice(i, i + perFrame) }); await settle(40); await grab(show); }
      await send({ type: 'up', pt: pts[pts.length - 1] }); await settle(); await grab(200);
    }
    // drying, grabbed as often as the screenshots allow until the sheet is dry
    async function dry(quick, show) {
      const t0 = Date.now(), wet = () => page.evaluate(() => window.__lab.wet);
      stage = quick ? 'quick' : 'dry';
      if (quick) await send({ type: 'dry-layer' });
      await page.waitForFunction(() => window.__lab.wet, null, { timeout: 10000 }).catch(() => {});
      while (await wet()) {
        if (Date.now() - t0 > DRY_TIMEOUT_MS) throw new Error('the sheet did not dry in time');
        await page.waitForTimeout(150); await grab(show);
      }
      await settle(1500); stage = 'paint'; await grab(show);
    }
    const art = picture(W, H);
    await send({ type: 'speed', value: 1 }); await grab(600);

    for (const half of art.heart) await paint(half, tool({ pigment: 'rose', sizeMm: 14, water: 2.2, amount: 0.55 }), 12);
    await dry(true, 70); await grab(700);
    // The arrow, with the sheet paused while it is laid so the shaft is still wet when the feathers touch it. The shaft and
    // head glaze over the dried heart; the yellow feathers run into the wet shaft once the sheet runs again.
    await send({ type: 'pause', on: true });
    const ink = tool({ pigment: 'ultramarine', sizeMm: 6, water: 1.6, amount: 0.7 }), tipInk = { ...ink, water: 1 }, quill = tool({ pigment: 'hansa', sizeMm: 5, water: 1.3, amount: 0.7 });
    await paint(art.shaft, ink, 14);
    for (const h of art.head) await paint(h, tipInk, 6);
    for (const f of art.feathers) await paint(f, quill, 6);
    await send({ type: 'pause', on: false });
    await dry(false, 90);
    frames[frames.length - 1].ms = 2500;
    frames.splice(0, frames.length, ...thinDrying(frames));
    if (errors.length) throw new Error(`the page logged errors: ${errors.join(' | ')}`);
  } finally { await browser.close(); }
  if (FRAMES) {
    fs.mkdirSync(FRAMES, { recursive: true });
    frames.forEach((f, i) => fs.writeFileSync(path.join(FRAMES, `${String(i).padStart(3, '0')}.png`), f.png));
    fs.writeFileSync(path.join(FRAMES, 'frames.json'), JSON.stringify(frames.map(f => ({ ms: f.ms }))));
  }
  return frames;
}

// a saved recording: the PNGs in order and their times from frames.json
function load(dir) {
  const times = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8')), files = fs.readdirSync(dir).filter(f => /^\d+\.png$/.test(f)).sort();
  if (files.length !== times.length) throw new Error(`${dir} has ${files.length} frames and ${times.length} times`);
  return files.map((f, i) => ({ png: fs.readFileSync(path.join(dir, f)), ms: times[i].ms }));
}

// forward, then every `step`th frame backwards to the first (each shown as long as it was going forward), as a loop
function withRewind(frames, step) {
  if (!step) return frames;
  const back = [];
  for (let i = frames.length - 1 - step; i > 0; i -= step) back.push({ ...frames[i], ms: Math.min(frames[i].ms, 100) });
  return [...frames, ...back];
}

async function encode(frames) {
  const sized = await Promise.all(frames.map(f => sharp(f.png).resize({ width: WIDTH, withoutEnlargement: true }).png().toBuffer()));
  const { width: shotW } = await sharp(frames[0].png).metadata();
  if (shotW < WIDTH) console.warn(`the sheet is ${shotW} px wide, under --width ${WIDTH}; raise --dpi rather than scale it up`);
  const build = async (step, quality) => {
    const order = withRewind(frames.map((f, i) => ({ ...f, png: sized[i] })), step);
    return { step, quality, count: order.length, webp: await sharp(order.map(f => f.png), { join: { animated: true } }).webp({ quality, effort: 6, smartSubsample: true, delay: order.map(f => f.ms), loop: 0 }).toBuffer() };
  };
  let out = await build(REWIND, 92);
  if (out.webp.length > MAX_BYTES && REWIND) out = await build(REWIND + 1, 92);
  for (let q = 84; out.webp.length > MAX_BYTES && q >= 30; q -= 8) out = await build(out.step, q);
  if (out.webp.length > MAX_BYTES) throw new Error(`${(out.webp.length / 1e6).toFixed(2)} MB is over the ${MAX_BYTES / 1e6} MB limit`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, out.webp);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${out.count} frames (${frames.length} forward${out.step ? `, every ${out.step === 2 ? 'second' : out.step === 3 ? 'third' : `${out.step}th`} back` : ''}), ${Math.min(WIDTH, shotW)} px wide, quality ${out.quality}, ${(out.webp.length / 1e6).toFixed(2)} MB`);
}

const main = async () => encode(FROM ? load(path.resolve(FROM)) : await record());
main().catch(e => { console.error('record-demo failed:', e.message); process.exit(1); });
