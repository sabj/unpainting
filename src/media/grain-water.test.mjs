import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grainMobility, grainSlide, grainDrag } from './grain-water.mjs';
import { slideRate } from './grain-field.mjs';
import { settleShare } from './settling.mjs';
import { waterWash, WATER_CASES } from '../../tools/lab/grain-water.mjs';

test('grain motion stops in held water and peaks as a connected pool recedes', () => {
  for (const h of [0, 0.001, 0.02, 0.03]) {
    assert.equal(grainMobility(h), 0);
    assert.equal(grainSlide(h), 0);
    assert.equal(settleShare(.003, 2e-7, .85, 1, 1, h), settleShare(.003, 2e-7, .85, 0, 1, h));
  }
  assert.ok(grainMobility(.3) > 100 * grainMobility(.04));
  assert.ok(grainSlide(.1) > grainSlide(.3) && grainSlide(.1) > 10 * grainSlide(.04));
  for (const mm of [.1, .25, .5]) {
    assert.ok(Math.abs(slideRate(.4, mm) * grainDrag(.003) - .003 * .1 / (mm * mm)) < 1e-14);
  }
});

test('hollow capture accumulates wet residence, rather than fractional drying alone', () => {
  const exposure = h0 => {
    let capture = 0, landing = 0;
    const steps = 1000, dt = .9 * h0 / .0003 / steps;
    for (let j = 0; j < steps; j++) {
      const h = h0 * (1 - .9 * (j + .5) / steps);
      const base = -Math.log1p(-settleShare(.003, 0, 0, 0, dt, h));
      landing += base;
      capture += -Math.log1p(-settleShare(.003, 0, .85, 1, dt, h)) - base;
    }
    return { capture, landing };
  };
  const thin = exposure(.04), pooled = exposure(.3);
  assert.ok(Math.abs(thin.landing - pooled.landing) < 1e-10, 'vertical Stokes landing is unchanged');
  assert.ok(pooled.capture > 100 * thin.capture, JSON.stringify({ thin, pooled }));
});

// Exercise the actual scalar WGSL expressions without importing a GPU backend.
// This checks algebra and both call sites; hardware f32/dispatch parity remains
// the lead's GPU check, not something this test claims to establish.
test('WGSL grain and settling expressions match the CPU over film depths and pigments', () => {
  const source = readFileSync(new URL('./gpu/stepfull.wgsl', import.meta.url), 'utf8');
  const names = ['grainMobilityG', 'grainSlideG', 'settleShareG'];
  const scalar = names.map(name => {
    const start = source.indexOf(`fn ${name}(`), body = source.indexOf('{', start);
    assert.ok(start >= 0);
    let depth = 1, end = body + 1;
    for (; depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
    return source.slice(start, end).replace(/^fn /, 'function ').replaceAll(': f32', '').replace(' -> f32', '');
  }).join('\n');
  for (const dt of [.1, 1, 2, 7]) {
    const gpu = new Function('u', 'max', 'min', 'exp', `${scalar}\nreturn { ${names.join(', ')} };`)({ dt }, Math.max, Math.min, Math.exp);
    for (const h of [0, .001, .02, .03, .04, .06, .1, .3, 1]) {
      assert.ok(Math.abs(gpu.grainMobilityG(h) - grainMobility(h)) < 1e-14);
      assert.ok(Math.abs(gpu.grainSlideG(h) - grainSlide(h)) < 1e-14);
      for (const [v, D, gg] of [[.003, 2e-7, .85], [.0013, 4e-7, .55], [2e-6, 5e-6, 0]]) {
        for (const hollow of [0, 1, 3]) assert.ok(Math.abs(gpu.settleShareG(v, D, gg, hollow, h) - settleShare(v, D, gg, hollow, dt, h)) < 5e-10);
      }
    }
  }
  assert.equal(source.match(/let film = grainSlideG\(Wi\);/g)?.length, 2);
  assert.equal(source.match(/pa\.z \* turnover \* grainMobilityG\(Wi\)/g)?.length, 2);
  assert.equal(source.match(/u\.slide \* pigC\((?:c\.z|k)\)\.y/g)?.length, 2);
});

test('CPU washes: a standing pool granulates more, pigment dependence and smooth stainers remain', () => {
  const results = WATER_CASES.map(c => {
    const r = waterWash(c);
    console.log(`${c.name}: grain ${r.grain.toFixed(6)}`);
    for (let k = 0; k < r.before.length; k++) assert.ok(Math.abs(r.after[k] - r.before[k]) < Math.max(1e-8, r.before[k] * 1e-5));
    return r.grain;
  });
  const [thin, pooled, sienna, mixed, phthalo] = results;
  assert.ok(pooled >= 1.3 * thin, `${pooled} / ${thin}`);
  assert.ok(sienna >= .35 * pooled && sienna <= .65 * pooled, `${sienna} / ${pooled}`);
  assert.ok(mixed > sienna && mixed < pooled, `${sienna} < ${mixed} < ${pooled}`);
  assert.ok(phthalo < .02, `stainer grain ${phthalo}`);
  // Equal areal pigment loading rules out simple dilution as the explanation.
  const thinLoaded = waterWash(WATER_CASES[0], { mass: .36 }).grain;
  assert.ok(pooled >= 1.3 * thinLoaded, `${pooled} / equal-load thin ${thinLoaded}`);
});
