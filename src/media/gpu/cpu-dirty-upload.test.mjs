import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../paper.mjs';
import { createSheet, step, DEFAULTS, setClip, tapeSheet } from '../sheet.mjs';
import { createBrush, dip, stroke, recordMarks, TAPE } from '../brush.mjs';
import { createPen, dipPen, penStroke } from '../pen.mjs';
import { drawGestures } from '../draw.mjs';
import { GpuLink } from './link.mjs';
const fields = sh => [sh.W, sh.s, sh.M, sh.ever, ...sh.G, ...sh.P, ...sh.D];
const instrument = b => ({ resW: b.resW, resP: b.resP, hairs: b.hairs?.map(h => [h.water, h.pig]), rng: b.rs?.s, travel: b.travel, carry: b.carry, ink: b.ink, drop: b.drop, tip: structuredClone(b.tip), bend: structuredClone(b.bend) });
const clone = a => a.map(v => v.slice());
function fixture(enabled) {
  process.env.GPU_DIRTY_UPLOAD = enabled ? '1' : '0';
  const w = 40, h = 48, pigs = [{ K: [.4, .2, .1], S: [.02, .02, .02], rho: .05, omega: 1.4, gamma: .25 }];
  const paper = makePaper(w, h, { seed: 9, tooth: .8, mmPerCell: .212, coldPress: { mmPerCell: .212 } });
  const local = createSheet(paper, pigs), remote = createSheet(paper, pigs);
  for (const sh of [local, remote]) sh.layers.push([Float32Array.from({ length: sh.n }, (_, i) => i % 17 === 0 ? .03 : 0)]);
  for (const sh of [local, remote]) for (let y = 13; y < 29; y++) for (let x = 12; x < 27; x++) {
    const i = y * w + x; sh.W[i] = .15; sh.M[i] = sh.ever[i] = 1; sh.G[0][i] = .04;
  }
  const n = local.n, O = { ...DEFAULTS, gran: .6, fixedBed: 1 }, rows = [], logical = [];
  let link;
  const dispatch = m => {
    if (m.op === 'step') { step(remote, O); return; }
    if (m.op === 'upNoop') { logical.push(m.logicalRect); return; }
    if (m.op !== 'up' && m.op !== 'down') return;
    const [x0, y0, rw, rh] = m.rect, a = rw * rh, data = m.data ?? link.rectData, lf = fields(local), rf = fields(remote);
    if (m.op === 'up') {
      // A fixture-only full scan proves the narrowed dirty bbox covers every write.
      for (let p = 0; p < lf.length; p++) for (let i = 0; i < n; i++) if (!Object.is(lf[p][i], rf[p][i])) {
        const x = i % w, y = Math.floor(i / w);
        assert.ok(x >= x0 && x < x0 + rw && y >= y0 && y < y0 + rh, `untracked write plane${p} cell${i}`);
      }
      logical.push(m.logicalRect ?? m.rect);
    }
    for (let p = 0; p < lf.length; p++) for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const i = (y0 + y) * w + x0 + x, j = p * a + y * rw + x;
      if (m.op === 'up') rf[p][i] = data[j]; else link.rectData[j] = rf[p][i];
    }
  };
  link = new GpuLink({ postMessage: dispatch }, { rectData: new Float32Array(n * 7) }, local);
  link.call = dispatch; link.brushGpu = false; link.flushDrys = () => {};
  link.syncTop = () => { local.layers.at(-1)[0].set(remote.layers.at(-1)[0]); };
  local._gpu = link;
  const capture = b => rows.push({ fields: clone(fields(remote)), instrument: structuredClone(instrument(b)), clock: local.clock, touched: local.touched?.slice(), steps: local.steps });
  return { local, remote, link, O, rows, logical, capture };
}
function run(enabled, { tracked = true, thirsty = false, metered = false, pen = false, flat = false, draw = false, tuft = false } = {}) {
  recordMarks(true);
  const f = fixture(enabled), sh = f.local; tapeSheet(TAPE); sh._tape = true;
  setClip(sh, Uint8Array.from({ length: sh.n }, (_, i) => (i % 40 > 4 + 2 * Math.sin(i / 100) && i % 40 < 36 ? 1 : 0)));
  const resist = Uint8Array.from({ length: sh.n }, (_, i) => (i % 40 > 18 && i % 40 < 23 && i / 40 > 18 && i / 40 < 24 ? 1 : 0));
  // Pre-attach resist initialization avoids exercising unrelated full-upload plumbing.
  sh.resist = f.remote.resist = resist;
  const path = [{ x: 5, y: 10, r: 4, p: .25, v: 1 }, { x: 29, y: 22, r: 6, p: .85, v: .8 }, { x: 10, y: 33, r: 3, p: .5, v: 1.4 }, { x: 37, y: 40, r: 5, p: .75, v: 1 }];
  let b = pen ? createPen({ reach: 3 }) : createBrush({ radius: 6, bristles: 18, capacity: 12, wetMix: .7, seed: 17, flat, model: tuft ? 'tuft' : 'row', depositDepth: metered ? .3 : 0 });
  if (pen) dipPen(b, [.15]); else dip(b, { water: thirsty ? .02 : .88, conc: thirsty ? [0] : [.2] });
  const options = { gpuBetween: tracked, between: k => { if (k % 8 === 0) { step(sh, f.O); f.capture(b); } } };
  if (draw) drawGestures(sh, [{ points: path, dip: true }], new Float32Array(sh.n).fill(.4), sh.w, sh.h,
    { ink: [.15], O: f.O, flowEvery: 8, beforeStroke: e => { b = e.pen; } });
  else if (pen) penStroke(b, sh, path, options); else stroke(b, sh, path, options);
  f.capture(b); f.tape = structuredClone(TAPE); recordMarks(false); tapeSheet(null);
  delete sh._gpu;
  return f;
}
for (const [name, config] of [['loaded-round', {}], ['loaded-tuft', {tuft:true}], ['thirsty', { thirsty: true }], ['metered', { metered: true }], ['flat', { flat: true }], ['pen', { pen: true }], ['production-draw', { pen: true, draw: true }], ['arbitrary-callback-fallback', { tracked: false }]]) {
  test(name + ': exact full physics, instruments, contact clock, flow tape and tracked bounds', () => {
    const before = run(false, config), after = run(true, config);
    assert.deepEqual(after.rows, before.rows);
    assert.deepEqual(fields(after.local), fields(before.local));
    assert.deepEqual(after.local.layers, before.local.layers);
    assert.deepEqual(after.logical, before.logical);
    assert.deepEqual(after.tape, before.tape);
    assert.ok(after.tape.some(m => m.k === (config.pen ? 'P' : 's') && m.fl?.length), 'instrument flow tape exercised');
    assert.equal(after.link.stats.downBytes, before.link.stats.downBytes);
    if (config.tracked === false) assert.equal(after.link.stats.upBytes, before.link.stats.upBytes);
    else assert.ok(after.link.stats.upBytes < before.link.stats.upBytes);
    assert.equal(after.local._cpuStrokeDirty, undefined);
  });
}
