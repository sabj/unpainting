import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { encodeState, decodeState } from '../../demos/lab/worker/history.js';
import { SHEET_FIELDS } from '../../demos/lab/worker/live-tape.js';
import { makePaper } from '../../demos/lab/media/paper.js';
import { createSheet, DEFAULTS } from '../../demos/lab/media/sheet.js';
import { BY_KEY } from '../../demos/lab/media/pigments.js';
import { createBrush, dip, stroke } from '../../demos/lab/media/brush.js';
import { layerRT } from '../../demos/lab/media/km.js';
import { handBrushOptions } from '../../demos/lab/brush-load.js';
import { nextChunkSteps } from '../../demos/lab/worker/pacing.js';

const root = path.resolve(import.meta.dirname, '../..');
async function workerHarness() {
  const source = (await readFile(path.join(root, 'demos/lab/worker.js'), 'utf8')).replace(/^import .*;\s*$/gm, '').replaceAll('import.meta.url', "'file:///lab/worker.js'");
  const messages = [], fixture = createSheet(makePaper(8, 6), [BY_KEY.rose]);
  const context = vm.createContext({ console, performance, structuredClone, Uint8Array, Uint32Array, Float32Array, ArrayBuffer,
    setInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, postMessage: m => messages.push(m),
    layerRT, PALETTE: [BY_KEY.rose], SHEET_START: ['rose'], BY_KEY, DEFAULT_SURFACE: 'cold', DEFAULTS, SHEET_FIELDS,
    savedSheet: async () => null, saveSheet: async () => {}, encodeState, decodeState, nextChunkSteps, fixture,
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  run('sheet=fixture; paper=fixture.paper; W=8; H=6; N=48; baseR=new Float32Array(N*3).fill(1); graphite=new Float32Array(N);');
  return { run, context, messages };
}

test('worker runs live Section physics, pauses CPU brushes and preserves exact/demo stepping', async () => {
  const { run, context } = await workerHarness();
  context.calls = [];
  run(`render=async()=>calls.push('render'); active={kind:'brush',brush:{model:'section',hairs:[{pig:[1]}],resP:[1]}};sheet._sectionStroke=()=>{};
    phys={sectionLink:{brushGpu:true},sheet:{knownDry:false,surfaceWet:true,o:{}},sectionPending:Promise.resolve(),
      rect:()=>[0,0,8,6],ensureFresh:async()=>calls.push('down'),up:()=>calls.push('up'),
      setOptions(o){Object.assign(this.sheet.o,o);},step:async()=>{calls.push('step');return true;}};`);
  await run("touching([{x:1,y:1}],1,()=>{calls.push('contact');phys.sectionWrote=true;})");
  assert.deepEqual(context.calls, ['contact']);
  context.calls.length = 0;
  await run('frame()'); assert.ok(context.calls.includes('step'));
  assert.equal(run('phys.sheet.o.realtime'), true);
  context.calls.length = 0;
  await run("active.brush.model='row'; frame()"); assert.ok(!context.calls.includes('step'));
  run("active.brush.model='section'");
  await run('frame(false,true)'); assert.ok(context.calls.includes('step'));
  assert.equal(run('phys.sheet.o.realtime'), false);
  context.calls.length = 0;
  await run("quality='full';lastInteractiveInput=performance.now();frame()");
  assert.ok(context.calls.includes('step'), 'Full physics steps during a held GPU Section stroke');
  assert.equal(run('phys.sheet.o.realtime'), false);
  run('active=null');context.calls.length=0;
  await run('frame()');assert.ok(context.calls.includes('step'), 'Full physics steps immediately after input');
  run("active={kind:'brush',brush:{model:'section',hairs:[{pig:[1]}],resP:[1]}};quality='fast';lastInteractiveInput=-Infinity");
  context.calls.length=0;await run('speed=1;frame()');const slow=context.calls.filter(v=>v==='step').length;
  context.calls.length=0;await run('speed=8;frame()');assert.ok(context.calls.filter(v=>v==='step').length>slow);
  run('active=null');context.calls.length=0;await run('speed=1;frame()');const slowIdle=context.calls.filter(v=>v==='step').length;
  context.calls.length=0;await run('speed=8;frame()');assert.ok(context.calls.filter(v=>v==='step').length>slowIdle);
  run("active={kind:'brush',brush:{model:'section',hairs:[{pig:[1]}],resP:[1]}}");
  await assert.rejects(run("touching([{x:0,y:0},{x:2,y:0}],1,()=>{})"), /did not submit/);
  await run("quality='fast';det=true;frame()"); assert.equal(run('phys.sheet.o.realtime'), false);
  run('det=false');
  context.calls.length = 0;
  await run("demoPlaying='play'; frame()"); assert.ok(context.calls.includes('step'));
  assert.equal(run('phys.sheet.o.realtime'), false);
  context.calls.length = 0;
  await run("active.brush.model='tuft'; touching([{x:1,y:1}],1,()=>calls.push('contact'))");
  assert.deepEqual(context.calls, ['down', 'contact', 'up']);
});

test('worker defers every stroke boundary and immediate undo/redo preserves separate wet states', async () => {
  const { run, context } = await workerHarness();
  await run('checkpoint()');
  await run("(async()=>{strokes=1;sheet.W[5]=.25;await deferStrokeCheckpoint();strokes=2;sheet.W[5]=.75;await deferStrokeCheckpoint();})()");
  assert.equal(run('history.length'), 3);
  assert.equal(run('history[1].value.fields.W[5]'), .25);
  assert.equal(run('history[2].value.fields.W[5]'), .75);
  context.restored = [];
  run('restoreExact=async bytes=>{const value=await decodeState(bytes);restored.push([value.strokes,value.fields.W[5]]);}');
  await run('travel(-1)'); await run('travel(-1)'); await run('travel(1)'); await run('travel(1)');
  assert.deepEqual(JSON.parse(JSON.stringify(context.restored)), [[1, .25], [0, 0], [1, .25], [2, .75]]);
  await run('historyAt=1;strokes=3;sheet.W[5]=.5;deferStrokeCheckpoint();');
  assert.equal(run('history.length'), 3, 'new paint discards redo');
  for (let i = 0; i < 12; i++) await run('strokes++;deferStrokeCheckpoint()');
  assert.equal(run('history.length'), 11, 'history stays bounded');
});

test('GPU deferred snapshots retain every physical plane across later uploads and sheet replacement', async () => {
  const webgpu = await import('webgpu'); Object.assign(globalThis, webgpu.globals);
  const gpu = webgpu.create([]);
  const { GpuPhysics } = await import('../../demos/lab/gpu/gpu-physics.js');
  const phys = await GpuPhysics.create([BY_KEY.rose], DEFAULTS, gpu);
  const errors = []; phys.device.addEventListener('uncapturederror', e => errors.push(e.error.message));
  try {
    const sheet = createSheet(makePaper(16, 12), [BY_KEY.rose]);
    for (const field of [sheet.W, sheet.s, ...sheet.G, ...sheet.P, ...sheet.D]) for (let i = 0; i < sheet.n; i++) field[i] = (i % 13) / 16;
    sheet.M.fill(1); sheet.ever.fill(1); sheet.layers.push([new Float32Array(sheet.n).fill(.125)]);
    const base = new Float32Array(sheet.n * 3).fill(.75);
    await phys.load(sheet, base, new Float32Array(sheet.n));
    phys.composer.baseAhead = true;
    const first = phys.captureState(sheet), expected = structuredClone(Object.fromEntries(SHEET_FIELDS.map(k => [k, sheet[k]])));
    sheet.W.fill(7); sheet.G[0].fill(5); phys.upload(sheet);
    const second = phys.captureState(sheet);
    await phys.load(createSheet(sheet.paper, [BY_KEY.rose]), base, new Float32Array(sheet.n));
    const a = await first.read(), b = await second.read();
    for (const name of ['W', 's', 'M', 'ever', 'G', 'P', 'D', 'layers']) {
      const want = name === 'layers' ? expected.layers.at(-1) : expected[name];
      assert.deepEqual(a.fields[name], want, name);
    }
    assert.deepEqual(a.baseR, base);
    phys.composer.baseAhead = true;
    const bare = phys.captureState(sheet, { baseIsBare: true });
    assert.equal(bare.bytes, phys.captureStateBytes(sheet, { baseIsBare: true }));
    assert.equal((await bare.read()).baseR, undefined, 'bare paper omits base plane');
    phys.composer.baseAhead = false;
    assert.equal((await phys.captureState(sheet).read()).baseR, undefined, 'CPU-owned base omits plane');
    phys.composer.baseAhead = true;sheet._liveTape = true;
    assert.equal((await phys.captureState(sheet).read()).baseR, undefined, 'live-tape display base omits plane');
    assert.ok(b.fields.W.every(v => v === 7)); assert.ok(b.fields.G[0].every(v => v === 5));
    await phys.idle(); assert.deepEqual(errors, []);
  } finally { phys.destroy(); }
});

test('pending GPU checkpoints stay below 256 MiB and two captures, retaining ten undo actions', async () => {
  const { run, context } = await workerHarness();
  context.rawBytes = 0;context.peakBytes = 0;context.rawSize = 150*1024*1024;
  run(`phys={sheet:{hasTop:false},captureBase:()=>false,captureStateBytes:()=>rawSize,
    captureState(){const bytes=this.captureStateBytes();rawBytes+=bytes;peakBytes=Math.max(peakBytes,rawBytes);
      return {bytes,dispose(){rawBytes-=bytes;},async read(){this.dispose();return {fields:{}};}};}};`);
  for(let i=0;i<15;i++) {
    await run('strokes++;deferStrokeCheckpoint()');
    assert.ok(run('pendingCaptureBytes()')<=256*1024*1024);
    assert.ok(run('history.filter(e=>e.capture).length')<=2);
  }
  assert.ok(context.peakBytes<=256*1024*1024, 'budget holds during allocation too');
  assert.equal(run('history.length'),11);
  await run('flushCheckpoints()');assert.equal(context.rawBytes,0);
  const retained = [];
  for(const bytes of run('history')) {
    assert.ok(bytes instanceof Uint8Array);retained.push((await decodeState(bytes)).strokes);
  }
  assert.deepEqual(retained,Array.from({length:11},(_,i)=>i+5),'every retained action survives materialization');
  context.rawSize=1024;
  for(let i=0;i<4;i++)await run('deferStrokeCheckpoint()');
  assert.equal(run('history.filter(e=>e.capture).length'),2,'small captures obey the count cap');
  await run('flushCheckpoints()');
  context.rawSize=300*1024*1024;
  run('exactState=async()=>new Uint8Array([1]);');
  await run('deferStrokeCheckpoint()');
  assert.equal(context.rawBytes,0,'oversized individual checkpoints materialize directly');
});

test('wide 30 mm Section CPU fallback reaches GPU pixels; masked glaze checkpoints preserve canonical base', async () => {
  const webgpu = await import('webgpu');Object.assign(globalThis,webgpu.globals);
  const { GpuPhysics } = await import('../../demos/lab/gpu/gpu-physics.js');
  const gpu=webgpu.create([]);
  const pigments=Array(8).fill(BY_KEY.rose), physical=await GpuPhysics.create(pigments,DEFAULTS,gpu);
  const {run,context}=await workerHarness();
  const errors=[];physical.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  try {
    const paper=makePaper(400,200,{mmPerCell:.1}), sheet=createSheet(paper,pigments);
    const brush=createBrush(handBrushOptions({tool:'flat',model:'section',sizeMm:30,water:1},{dpi:254}));
    dip(brush,{water:1,conc: pigments.map((_,i)=>i===0?.3:0)});
    assert.equal(brush.hairs.length,345);
    Object.assign(context,{physical,wideSheet:sheet,wideBrush:brush,stroke});
    run('sheet=wideSheet;paper=sheet.paper;W=sheet.w;H=sheet.h;N=sheet.n;PIGS=Array(8).fill(BY_KEY.rose);baseR=new Float32Array(N*3).fill(.85);graphite=new Float32Array(N);phys=physical;active={kind:"brush",brush:wideBrush};');
    await physical.load(sheet,run('baseR'),run('graphite'));
    assert.equal(run('canSectionGpu(active.brush,sheet.K)'),false);
    // Force a stale CPU copy: the fallback must download before contact.
    sheet.W.fill(.1);physical.upload(sheet);physical.stale=true;physical.fresh.stale();sheet.W.fill(0);
    physical.draw(null);const before=await physical.readPixels();
    await run('touching([{x:160,y:100},{x:230,y:100}],180,()=>stroke(wideBrush,sheet,[{x:160,y:100,p:1},{x:230,y:100,p:1}],{lift:true}))');
    assert.ok(physical.stats.down>0);assert.ok(physical.stats.up>0);
    physical.draw(null);const after=await physical.readPixels();
    assert.ok(after.some((v,i)=>i%4!==3&&v<before[i]-3),'GPU pixels visibly contain the CPU stroke');
    // Older folded base plus resist and two retained washes: composer.base is
    // deliberately the temporary display base, never a canonical checkpoint.
    sheet.layers=[pigments.map((_,k)=>new Float32Array(sheet.n).fill(k===0?.08:0)),pigments.map((_,k)=>new Float32Array(sheet.n).fill(k===0?.04:0))];
    sheet.resist=new Float32Array(sheet.n).fill(.5);
    physical.upload(sheet);
    run('active=null;baseIsBare=false;history=[];historyAt=-1;');
    physical.setBase(run('renderBase()'));
    physical.composer.baseAhead=true; // Even this flag cannot admit a masked display base.
    const canonical=run('baseR.slice()'),display=run('renderBase()');
    for(let i=0;i<2;i++)await run('strokes++;deferStrokeCheckpoint()');
    await run('flushCheckpoints()');
    for(const bytes of run('history')) {
      const value=await decodeState(bytes);
      assert.deepEqual(value.baseR,canonical);
      assert.equal(value.fields.layers.length,2);
    }
    context.restored=[];
    run('restoreExact=async bytes=>{const v=await decodeState(bytes);Object.assign(sheet,v.fields);baseR=v.baseR;restored.push(renderBase());}');
    await run('travel(-1)');await run('travel(1)');
    for(const restored of context.restored)assert.deepEqual(restored,display,'undo/redo must not darken retained glaze');
    await physical.idle();assert.deepEqual(errors,[]);
  } finally {physical.destroy();}
});

// Default: the owner's 120 dpi 8 x 6 sheet. Workers use LAB_LATENCY_MM=40
// for a tiny smoke; integrate can run the default once on the merged engine.
test('Chrome WebGPU two-stroke Tuft/Section latency and immediate undo', { timeout: 25000 }, async () => {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
      const file = path.resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /(?:Dawn|WebGPU).*?(?:warn|validat|error)/i.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(mm => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'frame') {
              window.__latencyFrames ??= [];
              window.__latencyFrames.push({ at: performance.now(), strokes: data.strokes, ticks: data.ticks, moveT: data.moveT });
            }
          });
        }
        postMessage(message, ...rest) {
          if (mm && message.type === 'reset') message = { ...message, paperW: mm / 25.4, paperH: mm * .75 / 25.4 };
          return super.postMessage(message, ...rest);
        }
      };
    }, Number(process.env.LAB_LATENCY_MM) || 0);
    await page.goto(`http://127.0.0.1:${server.address().port}/demos/lab/?dpi=120`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__lab?.frames > 0 && window.__lab.sheet);
    assert.equal(await page.evaluate(() => window.__lab.physics), 'webgpu', 'real GPU required');
    assert.equal(await page.evaluate(() => window.__lab.render), 'webgpu');
    assert.match(await page.locator('#engine-pill').textContent(), /^WebGPU/);
    // Freeze only between model fixtures. Each drag itself runs with normal drying enabled.
    const results = [];
    for (const model of ['tuft', 'section']) {
      await page.evaluate(() => window.__lab.send({ type: 'pause', on: true }));
      await page.locator('#more-settings').evaluate(el => { el.open = true; });
      await page.locator(`[data-model=${model}]`).click();
      await page.locator('#more-settings').evaluate(el => { el.open = false; });
      if (process.env.LAB_LATENCY_MM) await page.locator('[data-preset=detail]').click();
      const box = await page.locator('#canvas').boundingBox();
      const baseStrokes = await page.evaluate(() => Number(document.getElementById('canvas').dataset.strokes));
      for (let stroke = 0; stroke < 2; stroke++) {
        const x = box.x + box.width * .18, y = box.y + box.height * (.32 + stroke * .15);
        await page.mouse.move(x, y);
        await page.evaluate(() => { window.__lab.lags.length = 0; window.__latencyFrames.length = 0; window.__lab.send({ type: 'pause', on: false }); });
        await page.mouse.down();
        const started = await page.evaluate(() => performance.now());
        for (let i = 1; i <= 25; i++) {
          await page.mouse.move(x + box.width * .55 * i / 25, y + box.height * .03 * Math.sin(i / 5));
          await page.waitForTimeout(16);
        }
        const stats = await page.evaluate(started => {
          const lags = [...window.__lab.lags].sort((a, b) => a - b), frames = window.__latencyFrames;
          return { frames: lags.length, maxLag: Math.max(...lags), medianLag: lags[Math.floor(lags.length / 2)], startMs: frames[0]?.at - started,
            ticks: [...new Set(frames.map(f => f.ticks))] };
        }, started);
        await page.mouse.up();
        results.push({ model, stroke: stroke + 1, ...stats });
        assert.ok(stats.maxLag < 80, JSON.stringify(results.at(-1)));
        assert.ok(stats.medianLag <= 20, JSON.stringify(results.at(-1)));
        assert.ok(stats.frames >= 12, JSON.stringify(results.at(-1)));
        if (stroke) assert.ok(stats.startMs < 40, JSON.stringify(results.at(-1)));
        if (model === 'section') assert.ok(stats.ticks.length > 1, 'live solver during Section drag');
        else assert.equal(stats.ticks.length, 1, 'CPU brush pauses solver during drag');
        if (!stroke) await page.waitForTimeout(20);
      }
      // Click Undo immediately: deferred snapshots must still be separate actions.
      await page.locator('#undo').click();
      await page.waitForFunction(n => Number(document.getElementById('canvas').dataset.strokes) === n + 1, baseStrokes);
      await page.locator('#redo').click();
      await page.waitForFunction(n => Number(document.getElementById('canvas').dataset.strokes) === n + 2, baseStrokes);
      await page.evaluate(() => window.__lab.send({ type: 'pause', on: true }));
    }
    console.log(JSON.stringify({ sheet: await page.evaluate(() => window.__lab.sheet), results }));
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
