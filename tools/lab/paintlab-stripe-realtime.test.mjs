import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../../demos');
const quantile = (a, q) => [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * q)];

test('Chrome Metal: stale scratch, progressive conservation, native stripe plates and live latency', { timeout: 120000 }, async () => {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/favicon.ico') return void res.writeHead(204).end();
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
      if (!file.startsWith(root + path.sep)) return void res.writeHead(403).end();
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const errors = [], report = [];
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /(?:Dawn|WebGPU).*?(?:warn|validat|error)/i.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', e => {
            const d = e.data;
            if (d.type === 'frame') (window.__frames ??= []).push({ at: performance.now(), ticks: d.ticks, stepMs: d.stepMs, stepCount: d.stepCount, gpuFrameMs: d.gpuFrameMs, moveT: d.moveT, strokes: d.strokes });
            if (d.type === 'snapshot') { window.__pixels = d; e.stopImmediatePropagation(); }
          });
        }
      };
    });
    await page.goto(origin + '/lab/?intro=0');
    await page.waitForFunction(() => window.__lab?.frames > 0 && window.__lab.sheet);
    assert.equal(await page.evaluate(() => window.__lab.physics), 'webgpu');
    assert.ok(await page.evaluate(() => window.__lab.dpi <= 120));
    assert.equal(await page.locator('[data-model=section]').getAttribute('aria-pressed'), 'true');

    // Deliberately poison the shared buffer as lv_s1 does, then run only the
    // slide producer/consumer. This fails on the original shader independently
    // of brush shape, timing, or whether the screenshot happens to hide a seam.
    const scratch = await page.evaluate(async () => {
      const [{ GpuSheet, openDevice }, { makePaper }, { createSheet, DEFAULTS }, { BY_KEY }] = await Promise.all([
        import('/lab/gpu/gpu-sheet.js'), import('/lab/media/paper.js'), import('/lab/media/sheet.js'), import('/lab/media/pigments.js')]);
      const { device, name } = await openDevice();
      const validation = []; device.addEventListener('uncapturederror', e => validation.push(e.error.message));
      const sheet = createSheet(makePaper(128, 96, { mmPerCell: .3 }), [BY_KEY.hansa, BY_KEY.rose]);
      sheet.M.fill(1); sheet.W.fill(.4); sheet.ever.fill(1);
      sheet.D[0].fill(.1);
      for (let y = 0; y < 96; y++) for (let x = 0; x < 16; x++) sheet.D[1][y * 128 + x] = .01;
      const gs = await GpuSheet.create(device, [BY_KEY.hansa, BY_KEY.rose], { ...DEFAULTS, mmPerCell: .3 });
      try {
        gs.attach(sheet);
        const stale = new Float32Array(sheet.n * 2 * 4); for (let i = 0; i < sheet.n * 2; i++) stale[i * 4 + 1] = 1;
        device.queue.writeBuffer(gs.b.OUT4, 0, stale);
        let enc = device.createCommandEncoder(), pass = enc.beginComputePass();
        for (const [kernel, x, y] of [['tiles_prep', Math.ceil(gs.ntiles / 64), 1], ['tiles_build', Math.ceil(gs.ntiles / 64), 1], ['tiles_args', 1, 1], ['pigment_scan', gs.ntiles, 2], ['pigment_masks', Math.ceil(gs.ntiles / 64), 1], ['dep_k', gs.ntiles, 1], ['slide_out', gs.ntiles, 2], ['slide_apply', gs.ntiles, 2]]) {
          pass.setPipeline(gs.p[kernel]); pass.setBindGroup(0, gs.bg[kernel]); pass.dispatchWorkgroups(x, y);
        }
        pass.end(); device.queue.submit([enc.finish()]);
        const deposit = new Float32Array(await gs.readWords('D', sheet.n * 2 * 4));
        const before = sheet.D[1].reduce((a, b) => a + b, 0), after = deposit.slice(sheet.n).reduce((a, b) => a + b, 0);
        // Progressive solve: nonuniform film with no evaporation/absorption must
        // move water on every frame while conserving both water and pigment.
        for (let y = 0; y < 96; y++) for (let x = 0; x < 128; x++) { const i = y * 128 + x; sheet.W[i] = .2 + .4 * Math.exp(-((x - 64) ** 2 + (y - 48) ** 2) / 400); sheet.G[0][i] = sheet.W[i] * .1; }
        gs.upload(sheet);
        gs.setOptions({ realtime: true, evap: 0, edgeEvap: 0, paperDry: 0, absorb: 0, dt: .1 });
        gs.efRefresh = () => { throw new Error('realtime called efRefresh'); };
        gs.readPackedBits = () => { throw new Error('realtime read packed bits'); };
        await gs.prepareStep();
        const names = [];
        enc = device.createCommandEncoder();
        gs.encodeSteps(enc, 1, { pass(enc, name) { names.push(name); return enc.beginComputePass(); } });
        device.queue.submit([enc.finish()]);
        await device.queue.onSubmittedWorkDone();
        const water = new Float32Array(await gs.readWords('W', sheet.n * 4));
        const change = water.reduce((a, v, i) => a + Math.abs(v - sheet.W[i]), 0);
        const waterError = Math.abs(water.reduce((a, b) => a + b, 0) - sheet.W.reduce((a, b) => a + b, 0));
        let pigmentBefore = 0, pigmentAfter = 0;
        for (const key of ['G', 'P', 'D']) {
          pigmentBefore += sheet[key].reduce((sum, plane) => sum + plane.reduce((a, b) => a + b, 0), 0);
          pigmentAfter += new Float32Array(await gs.readWords(key, sheet.n * 2 * 4)).reduce((a, b) => a + b, 0);
        }
        const pigmentError = Math.abs(pigmentBefore - pigmentAfter);
        gs.setOptions({ realtime: false });
        await device.queue.onSubmittedWorkDone();
        return { adapter: name, before, after, change, waterError, pigmentError, names, validation };
      } finally { gs.destroy(); device.destroy(); }
    });
    assert.ok(Math.abs(scratch.after - scratch.before) < 1e-5, JSON.stringify(scratch));
    assert.ok(scratch.change > .001, 'partial CG must move water');
    assert.ok(scratch.waterError < .01, 'bounded transport conserves water');
    assert.ok(scratch.pigmentError < .001, 'bounded transport conserves pigment');
    assert.equal(scratch.names.filter(n => n === 'lv_cg_a').length, 6);
    assert.equal(scratch.names.filter(n => n === 'lv_s1').length, 2);
    assert.ok(scratch.names.includes('lv_realtime_subs'));
    assert.ok(!scratch.names.some(n => /continue|ef_(?:reset|begin|prep|apply|small|watch)/.test(n)));
    assert.deepEqual(scratch.validation, []);
    report.push({ scratch });

    const box = await page.locator('#canvas').boundingBox();
    await page.evaluate(() => { window.__lab.lags.length = 0; window.__frames = []; });
    await page.mouse.move(box.x + box.width * .15, box.y + box.height * .35);
    await page.mouse.down();
    for (let i = 1; i <= 48; i++) { await page.mouse.move(box.x + box.width * (.15 + .65 * i / 48), box.y + box.height * (.35 + .04 * Math.sin(i / 8))); await page.waitForTimeout(16); }
    const live = await page.evaluate(() => ({ lags: [...window.__lab.lags], frames: window.__frames }));
    await page.mouse.up();
    async function nativePixels() {
      await page.evaluate(() => { window.__pixels = null; window.__lab.send({ type: 'snapshot', native: true }); });
      await page.waitForFunction(() => window.__pixels?.rgba);
      return page.evaluate(() => { window.__earlierPixels = window.__pixels.rgba; return window.__pixels.width; });
    }
    await nativePixels();
    await page.waitForTimeout(80);
    await page.evaluate(() => { window.__pixels = null; window.__lab.send({ type: 'snapshot', native: true }); });
    await page.waitForFunction(() => window.__pixels?.rgba);
    const evolvedPixels = await page.evaluate(() => {
      const a = window.__earlierPixels, b = window.__pixels.rgba; let changed = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 2) changed++;
      return changed;
    });
    const afterLift = await page.evaluate(() => window.__frames.at(-1).ticks);
    const moving = live.frames.filter(f => f.moveT), steps = live.frames.at(-1).stepCount - live.frames[0].stepCount;
    const frameTimes = live.frames.slice(1).map((f, i) => f.at - live.frames[i].at);
    const latency = { median: quantile(live.lags, .5), p90: quantile(live.lags, .9), stepMs: (live.frames.at(-1).stepMs - live.frames[0].stepMs) / steps,
      frameMs: quantile(frameTimes, .5), frameP90: quantile(frameTimes, .9), ticksDuring: live.frames.at(-1).ticks - live.frames[0].ticks, ticksAfterLift: afterLift - live.frames.at(-1).ticks, inputFrames: moving.length, evolvedPixels };
    report.push({ latency });
    assert.ok(latency.median <= 20 && latency.p90 <= 45, JSON.stringify(latency));
    assert.ok(latency.stepMs <= 5, JSON.stringify(latency));
    assert.ok(latency.frameMs <= 30 && latency.frameP90 <= 30, JSON.stringify(latency));
    assert.ok(evolvedPixels > 50, 'wet paint must visibly evolve between frames');
    assert.ok(latency.ticksDuring >= 10 && latency.ticksAfterLift > 0, JSON.stringify(latency));

    // The current production starter palette already contains rose. Reproduce
    // the reported K=6 -> 7 allocation using a test-only six-colour palette with
    // yellow at 0 and rose absent; production media files remain untouched.
    await page.route('**/lab/media/pigments.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace("export const SHEET_START = ['walnut', 'umber', 'rose', 'ultramarine', 'hansa', 'cerulean'];", "export const SHEET_START = ['hansa', 'walnut', 'umber', 'ultramarine', 'ochre', 'cerulean'];") });
    });
    for (const [dpi, quality] of [[120, 'fast'], [203.2, 'fast'], [120, 'full']]) {
      console.log(JSON.stringify({ fixture: { dpi, quality }, phase: 'load' }));
      await page.goto(`${origin}/lab/?intro=0&dpi=${dpi}&quality=fast`);
      await page.waitForFunction(() => window.__lab?.frames > 0 && window.__lab.sheet);
      await page.locator('[data-preset=wash]').click();
      const b = await page.locator('#canvas').boundingBox();
      async function stroke(pigment, x0, x1) {
        await page.locator(`[data-pigment=${pigment}]`).first().evaluate(el => el.click());
        await page.mouse.move(b.x + b.width * x0, b.y + b.height * .5); await page.mouse.down();
        for (let i = 1; i <= 24; i++) { await page.mouse.move(b.x + b.width * (x0 + (x1 - x0) * i / 24), b.y + b.height * .5); await page.waitForTimeout(16); }
        await page.mouse.up();
      }
      console.log('painting yellow', dpi, quality);
      await stroke('hansa', .15, .85);
      await page.waitForTimeout(1200);
      if (quality === 'full') await page.locator('#quality').evaluate(el => { el.value = 'full'; el.dispatchEvent(new Event('change', { bubbles: true })); });
      console.log('painting rose', dpi, quality);
      await stroke('rose', .2, .34);
      await page.waitForTimeout(1500);
      await page.evaluate(() => { window.__pixels = null; window.__lab.send({ type: 'pause', on: true }); window.__lab.send({ type: 'snapshot', native: true }); });
      await page.waitForFunction(() => window.__pixels?.rgba);
      console.log('reading stripe pixels', dpi, quality);
      const stripe = await page.evaluate(async () => {
        const { rgba: p, width: w, height: h } = window.__pixels;
        const redness = (x, y) => p[4 * (y * w + x)] - p[4 * (y * w + x) + 1];
        let hits = 0, yellow = 0;
        for (let x = Math.ceil(w * .4); x < w * .8; x++) {
          let run = 0;
          for (let y = Math.ceil(h * .46); y < h * .54; y++) {
            const i = 4 * (y * w + x);
            if (p[i] > p[i + 2] + 15) yellow++;
            const spike = redness(x, y) - (redness(x - 1, y) + redness(x + 1, y)) / 2;
            run = spike > 12 && redness(x, y) > 20 ? run + 1 : 0;
            if (run === 10) hits++;
          }
        }
        const { unpackSheet } = await import('/lab/worker/sheet-state.js');
        const { header } = await unpackSheet(await window.__lab.capture());
        return { hits, yellow, width: w, height: h, sheetWidth: header.w, channels: header.names };
      });
      report.push({ dpi, quality, stripe });
      assert.equal(stripe.width, stripe.sheetWidth, 'inspect native canvas pixels');
      assert.ok(stripe.yellow > 500, 'fixture must contain a visible yellow wash');
      assert.equal(stripe.channels.length, 7, 'takePigments must grow K=6 to 7');
      assert.equal(stripe.channels[6], 'rose');
      assert.equal(stripe.hits, 0, JSON.stringify({ dpi, quality, stripe }));
    }
    assert.deepEqual(errors, []);
  } finally {
    console.log(JSON.stringify({ paintlabRealtime: report, errors }));
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
