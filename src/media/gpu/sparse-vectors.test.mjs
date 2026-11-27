import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../paper.mjs';
import { createSheet, step, dry, DEFAULTS } from '../sheet.mjs';
import { attachGpu } from './link.mjs';
import { layVectorsOnSheet } from '../../paint/methods/lay-vectors-sheet.mjs';

const fields = s => [s.W, s.s, s.M, s.ever, ...s.G, ...s.P, ...s.D, ...s.layers.flat()];

test('Metal sparse vector drawing matches full-sheet layVectors bit-for-bit across phases and drying', t => {
  const keys = ['GPU_RESIDENT', 'GPU_ASYNC_DRY'], saved = keys.map(k => process.env[k]);
  process.env.GPU_RESIDENT = '1'; process.env.GPU_ASYNC_DRY = '1';
  const sheets = [], O = { ...DEFAULTS, edgeEvap: 0, evap: 0.02, paperDry: 0.02, flowIters: 3 };
  try {
    const doc = {
      strokes: [
        { seq: 1, dark: 0.7, outline: [[[2, 2], [10, 2], [10, 3], [2, 3]]] },
        { seq: 2, dark: 0.9, outline: [[[5, 1], [6, 1], [6, 9], [5, 9]]] },
      ],
    };
    const doc2 = {
      strokes: [
        { seq: 3, dark: 0.5, outline: [[[2, 2], [10, 2], [10, 3], [2, 3]]] }, // paler over existing darker stroke
        { seq: 4, dark: 0.85, outline: [[[11, 5], [15, 5], [15, 6], [11, 6]]] },
      ],
    };
    const run = sparse => {
      const pigments = Array.from({ length: 8 }, (_, k) => ({ name: k === 7 ? 'graphite HB' : 'paint', K: [0.3, 0.5, 0.8], S: [0.02, 0.02, 0.02], rho: 0.05, omega: k === 7 ? 60 : 1, gamma: 0.2 }));
      const sh = createSheet(makePaper(67, 51, { seed: 9 }), pigments); sheets.push(sh);
      for (let i = 0; i < sh.n; i++) {
        if (i % 5 === 0) { sh.W[i] = 0.08; sh.s[i] = 0.02; sh.M[i] = sh.ever[i] = 1; sh.G[1][i] = 0.01; }
      }
      const backend = attachGpu(sh, O, { mode: process.env.GPU_REQUIRED === '1' ? 'on' : 'auto', log() {} });
      if (backend.backend !== 'gpu') { t.skip(backend.reason); return null; }
      const g = sh._gpu;
      if (!sparse) g.editPigmentCells = undefined;
      step(sh, O);
      const q1 = layVectorsOnSheet(sh, 7, doc, sh.w, sh.h, 0.25, d => d * 0.4);
      step(sh, O);
      const q2 = layVectorsOnSheet(sh, 7, doc2, sh.w, sh.h, 0.25, d => d * 0.4);
      dry(sh, 1000, O, { dt: 14, levelMax: 12, analyticTail: true });
      g.syncAll(sh);
      return { q1, q2, fields: fields(sh).map(a => a.slice()), stats: { ...g.stats } };
    };
    const whole = run(false); if (!whole) return;
    const sparse = run(true);
    assert.deepEqual(sparse.q1, whole.q1);
    assert.deepEqual(sparse.q2, whole.q2);
    for (let p = 0; p < whole.fields.length; p++) {
      const a = sparse.fields[p], b = whole.fields[p];
      for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]), `plane ${p} cell ${i}: ${a[i]} vs ${b[i]}`);
    }
    assert.equal(sparse.stats.pigmentEdits, 2);
    assert.ok(sparse.stats.upBytes < whole.stats.upBytes / 10, `expected >10x upload reduction: ${sparse.stats.upBytes} vs ${whole.stats.upBytes}`);
  } finally {
    sheets.forEach(s => s._gpu?.close());
    keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
  }
});
