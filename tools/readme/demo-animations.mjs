#!/usr/bin/env node
// Records the demo animations in demos/thumbs/, each an animated WebP under 1 MB:
//   fungi-paint  Spore Studies painting the first plate from blank paper, ink then washes under the brush (2.5x speed).
//   fungi-turn   one plate turned a full circle in 3D, every frame a finished painting.
//   fungi-morph  Morph from one kind to another and back.
//   layers-spread the Trumbull painting tilting into its layers, spreading apart and closing again; the spread frame
//                is the still layers.webp.
//   lab-paint    Paint Lab painting a heart and arrow (tools/lab/record-demo.mjs); its last frame is the still lab.webp.
//   node tools/readme/demo-animations.mjs [--only fungi-paint,layers-spread] [--out demos/thumbs] [--frames work/demo-animations]
// Frames are the pages' own canvases or screenshots; nothing is redrawn. CHROME names a Chromium binary when Google
// Chrome is not installed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { DEMOS_ORIGIN, launchChromium, serveDemos } from './demos-browser.mjs';
import { contentBox, encodeAnimation } from './webp-frames.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2), opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const OUT = path.resolve(opt('out', path.join(ROOT, 'demos', 'thumbs')));
const FRAMES = path.resolve(opt('frames', path.join(ROOT, 'work', 'demo-animations')));
const ALL = ['fungi-paint', 'fungi-turn', 'fungi-morph', 'layers-spread', 'lab-paint'];
const ONLY = opt('only', ALL.join(',')).split(',');
if (ONLY.some(name => !ALL.includes(name))) throw new Error(`--only takes ${ALL.join(', ')}`);
const MAX_BYTES = 1_000_000, WIDTH = 600;
const PLATE = 'type=amanita-1&seed=woodland-042';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const frameDir = name => { const dir = path.join(FRAMES, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); return dir; };
const framePath = (dir, i) => path.join(dir, `f${String(i).padStart(4, '0')}.png`);
const saveDataUrl = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
async function newPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await serveDemos(context);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  return { context, page, errors };
}
const plateDone = page => page.waitForFunction(() => { const d = document.getElementById('painting').dataset; return d.nativeComplete === 'true' && d.settleFade !== 'running' && d.refining !== 'true' && d.livePainting !== 'true'; }, null, { timeout: 180000, polling: 100 });
// The plate canvas at WIDTH, with the brush or pen cursor layer drawn over it when it shows.
const grabPlate = page => page.evaluate(width => {
  const plate = document.getElementById('painting'), cursor = document.querySelector('.paint-cursor');
  const out = document.createElement('canvas'); out.width = width; out.height = Math.round(width * plate.height / plate.width);
  const c = out.getContext('2d'); c.drawImage(plate, 0, 0, out.width, out.height);
  if (cursor && cursor.style.display !== 'none' && getComputedStyle(cursor).display !== 'none') c.drawImage(cursor, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}, WIDTH);
async function finish(name, files, options) {
  const r = await encodeAnimation(files, path.join(OUT, `${name}.webp`), { width: WIDTH, maxBytes: MAX_BYTES, quality: 72, minQuality: 32, ...options });
  console.log(`${name}.webp: ${r.width}x${r.height}, ${r.frames} frames, quality ${r.quality}, ${(r.bytes / 1024).toFixed(0)} KB`);
}

// Full painting from page load, at 2.5 times real speed; the finished plate holds for 2.5 s.
async function fungiPaint(browser) {
  const dir = frameDir('fungi-paint'), { page, errors } = await newPage(browser, { width: 1200, height: 900 });
  await page.goto(`${DEMOS_ORIGIN}/fungi/?${PLATE}`);
  await page.waitForFunction(() => document.getElementById('painting')?.dataset.livePainting === 'true', null, { timeout: 60000 });
  const files = [], times = [], t0 = Date.now();
  for (;;) {
    const done = await page.evaluate(() => { const d = document.getElementById('painting').dataset; return d.nativeComplete === 'true' && d.livePainting !== 'true' && d.refining !== 'true'; });
    files.push(framePath(dir, files.length)); times.push(Date.now() - t0); saveDataUrl(files.at(-1), await grabPlate(page));
    if (done) break;
    if (Date.now() - t0 > 180000) throw new Error('fungi-paint: the live painting did not finish');
    await sleep(200);
  }
  if (errors.length) throw new Error(`fungi-paint: ${errors.join(' | ')}`);
  const delays = times.map((t, i) => (i + 1 < times.length ? Math.max(40, Math.round((times[i + 1] - t) / 2.5)) : 2500));
  await page.context().close();
  await finish('fungi-paint', files, { delays });
}

// 36 finished plates a tenth of a turn apart, the camera rising and dipping once per turn so the bodies read as
// solid: from below the rim (gills in view) to a little above it. The default angle is never one of them.
async function fungiTurn(browser) {
  const dir = frameDir('fungi-turn'), steps = 36, yaws = Array.from({ length: steps }, (_, k) => {
    const yaw = 0.12 + (k + 0.5) * 2 * Math.PI / steps; return +(((yaw + Math.PI) % (2 * Math.PI)) - Math.PI).toFixed(4);
  }), pitches = yaws.map((_, k) => +(0.36 + 0.12 * Math.sin((k + 0.5) * 2 * Math.PI / steps)).toFixed(4));
  const files = yaws.map((_, k) => framePath(dir, k)), queue = [...yaws.keys()];
  await Promise.all([0, 1, 2].map(async () => {
    const { page, errors, context } = await newPage(browser, { width: 1200, height: 900 });
    for (let k = queue.shift(); k !== undefined; k = queue.shift()) {
      await page.goto(`${DEMOS_ORIGIN}/fungi/?${PLATE}&paint=fast&yaw=${yaws[k]}&pitch=${pitches[k]}`);
      await plateDone(page); await sleep(300);
      saveDataUrl(files[k], await grabPlate(page));
    }
    if (errors.length) throw new Error(`fungi-turn: ${errors.join(' | ')}`);
    await context.close();
  }));
  await finish('fungi-turn', files, { delays: 110 });
}

// Morph to the next kind, then the same frames backwards; each end holds for a second. It stops just short of the
// arrival, where the page paints the new plate afresh.
async function fungiMorph(browser) {
  const dir = frameDir('fungi-morph'), { page, errors, context } = await newPage(browser, { width: 1200, height: 900 });
  await page.goto(`${DEMOS_ORIGIN}/fungi/?${PLATE}&paint=fast`);
  await plateDone(page); await sleep(500);
  const files = [framePath(dir, 0)], times = [0];
  saveDataUrl(files[0], await grabPlate(page));
  await page.click('#morph');
  const t0 = Date.now();
  for (;;) {
    const blend = await page.evaluate(() => window.sporeStudy.getState().blend);
    if (blend >= 0.985 || Date.now() - t0 > 30000) break;
    if (blend > 0) { files.push(framePath(dir, files.length)); times.push(Date.now() - t0); saveDataUrl(files.at(-1), await grabPlate(page)); }
    await sleep(80);
  }
  if (errors.length) throw new Error(`fungi-morph: ${errors.join(' | ')}`);
  await context.close();
  const forward = times.map((t, i) => (i + 1 < times.length ? Math.max(40, times[i + 1] - t) : 1000)); forward[0] = 1000;
  const back = files.slice(1, -1).reverse();
  await finish('fungi-morph', [...files, ...back], { delays: [...forward, ...back.map(() => 60)] });
}

// Layers in 3D: flat, tilted, spread apart, a slow turn, closed and flat again. Cropped to what moves.
async function layers(browser) {
  const dir = frameDir('layers-spread'), { page, errors, context } = await newPage(browser, { width: 1280, height: 860 });
  await page.goto(`${DEMOS_ORIGIN}/layers/`); await sleep(2500);
  await page.evaluate(() => { const tags = document.getElementById('tags'); if (tags.checked) tags.click(); });
  const box = await page.locator('#vStack').boundingBox(), files = [];
  const set = view => page.evaluate(v => { for (const [id, value] of Object.entries(v)) { const el = document.getElementById(id); el.value = String(value); el.oninput?.({ target: el }); } }, view);
  const shot = async () => { files.push(framePath(dir, files.length)); await page.screenshot({ path: files.at(-1), clip: box }); };
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  let view = { tilt: 0, turn: 0, spin: 0, gap: 0, fan: 0, zoom: 70 };
  const go = async (to, n) => { const from = view; view = { ...view, ...to }; for (let i = 1; i <= n; i++) { await set(Object.fromEntries(Object.keys(to).map(k => [k, Math.round(from[k] + (to[k] - from[k]) * ease(i / n))]))); await sleep(40); await shot(); } };
  const hold = async n => { for (let i = 0; i < n; i++) await shot(); };
  await set(view); await sleep(300); await hold(4);
  await go({ tilt: 50, spin: -20 }, 11); await go({ gap: 60 }, 13); await hold(3);
  const still = files.at(-1);
  await go({ turn: 14 }, 9); await go({ turn: -10 }, 12); await go({ turn: 0 }, 7); await hold(2);
  await go({ gap: 0 }, 10); await go({ tilt: 0, spin: 0 }, 10); await hold(3);
  if (errors.length) throw new Error(`layers-spread: ${errors.join(' | ')}`);
  await context.close();
  // Every frame changes all over, so it is narrower than the others to stay under the cap. The spread-apart frame is
  // the still layers.webp.
  const crop = await contentBox(files);
  await finish('layers-spread', files, { crop, delays: 100, width: 480 });
  await sharp(still).extract(crop).resize({ width: 480 }).webp({ quality: 82 }).toFile(path.join(OUT, 'layers.webp'));
  console.log('layers.webp: the layers spread apart');
}

// The recording, and its last frame (the finished heart and arrow) as the still lab.webp.
async function labPaint() {
  const dir = frameDir('lab-paint');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/lab/record-demo.mjs'), '--out', path.join(OUT, 'lab-paint.webp'), '--width', String(WIDTH), '--dpi', '90', '--maxmb', String(MAX_BYTES / 1e6), '--physics', 'cpu', '--frames', dir], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('lab-paint: record-demo.mjs failed');
  const last = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort().at(-1);
  await sharp(path.join(dir, last)).resize({ width: 480 }).webp({ quality: 82 }).toFile(path.join(OUT, 'lab.webp'));
  console.log('lab.webp: the last frame of lab-paint');
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await launchChromium();
try {
  for (const [name, record] of [['fungi-paint', fungiPaint], ['fungi-turn', fungiTurn], ['fungi-morph', fungiMorph], ['layers-spread', layers]]) if (ONLY.includes(name)) await record(browser);
} finally { await browser.close(); }
if (ONLY.includes('lab-paint')) await labPaint();
