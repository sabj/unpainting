import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness } from '../../media/sheet.mjs';
import { makeInkRes, renderInkProof } from './ink-res.mjs';

const ink = { K: [1.2, 1.3, 1.4], S: [0.02, 0.02, 0.02], rho: 0.02, omega: 5.5, gamma: 0.15 };
const W = 60, H = 20;
const setup = () => { const main = createSheet(makePaper(W, H, { seed: 2 }), [ink]); return { main, R: makeInkRes({ N: 3, W2: W, H2: H, paperOpts: { seed: 2 }, pigments: [ink], main }) }; };
const line = { points: Array.from({ length: 50 }, (_, k) => ({ x: 5 + k, y: 10, s: 0.8 })) };

test('the ink drawn at 3x is carried down whole onto the painting\'s sheet', () => {
  const { main, R } = setup();
  R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
  const lo = thickness(main)[0].reduce((a, v) => a + v, 0);
  const hi = thickness(R.fine)[0].reduce((a, v) => a + v, 0) / 9;
  assert.ok(lo > 0);
  assert.ok(Math.abs(lo - hi) / hi < 1e-4, `${lo} against ${hi}`);
});

test('a fine line drawn into a damp wash spreads wider than on dry paper', () => {
  const spread = wetHalf => {
    const { main, R } = setup();
    if (wetHalf) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; main.M[i] = 1; main.ever[i] = 1; main.W[i] = 0.5; main.s[i] = main.paper.capacity[i]; }
    R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
    const T = thickness(R.fine)[0];
    let cells = 0; for (const v of T) if (v > 1e-3) cells++;
    return cells;
  };
  assert.ok(spread(true) > spread(false), 'wet spreads further');
});

test('compose is N times the size and darker on the line than beside it', () => {
  const { main, R } = setup();
  R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
  const out = R.compose(Buffer.alloc(W * H * 3, 230));
  assert.equal(out.length, W * H * 27);
  const at = (x, y) => out[(y * R.width + x) * 3];
  assert.ok(at(90, 31) < at(90, 45));
});

test('on a GPU sheet the carry reads the sheet down first and tells the GPU it wrote', () => {
  const { main, R } = setup();
  const calls = [];
  main._gpu = { syncAll: () => calls.push('syncAll'), cpuWroteAll: () => calls.push('cpuWroteAll') };
  R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
  assert.ok(calls.includes('cpuWroteAll'));
  assert.ok(calls.indexOf('syncAll') < calls.lastIndexOf('cpuWroteAll'));
  assert.equal(calls.at(-1), 'cpuWroteAll');
});

import { renderLayers } from '../../media/km.mjs';
test('single active ink optics equal a full palette, including zero planes', () => {
  const mass = Float32Array.from([0, 1e-8, .001, .1, 1, 10, 100]);
  const zero = new Float32Array(mass.length), white = Buffer.alloc(mass.length * 3, 255);
  assert.deepEqual(renderLayers([[zero, mass, zero]], [ink, ink, ink], white, mass.length),
    renderLayers([[mass]], [ink], white, mass.length));
});

test('fine ink remaps only its active channel, rejects other pigments and invalidates frames', () => {
  const pigments = [ink, ink, ink], main = createSheet(makePaper(W, H, {seed:2}), pigments);
  const R = makeInkRes({N:3,W2:W,H2:H,paperOpts:{seed:2},pigments,main,inkAt:1});
  const want = new Float32Array(W * H).fill(1), white = Buffer.alloc(W * H * 3, 255);
  assert.throws(() => R.draw([line], want, W, H, {ink:[1,10,0]}), /Only inkAt/);
  R.draw([line], want, W, H, {ink:[0,10,0],peak:1});
  assert.equal(R.fine.K, 1);
  assert(main.D[1].some(v=>v>0)); assert(main.D[0].every(v=>v===0));
  const first = R.compose(white);
  assert.deepEqual(R.compose(white), first);
  const mass = main.D[1].slice(); R.carry(); assert.deepEqual(main.D[1], mass);
  R.settle(); assert.deepEqual(R.compose(white), first);
  R.draw([{points:line.points.map(p=>({...p,y:5}))}], want, W, H, {ink:[0,10,0],peak:1});
  assert.notDeepEqual(R.compose(white), first);
});

import { recordMarks } from '../../media/brush.mjs';
test('specialized fine ink retains main-palette dip concentrations in the replay tape', () => {
  const tape = recordMarks(true);
  try {
    const pigments = [ink, ink, ink], main = createSheet(makePaper(W,H),pigments);
    main._tape = true;
    const R = makeInkRes({N:2,W2:W,H2:H,paperOpts:{},pigments,main,inkAt:1});
    R.draw([line], new Float32Array(W*H).fill(1), W,H,{ink:[0,10,0],peak:1});
    assert.deepEqual(tape.find(m=>m.k==='D').ink,[0,10,0]);
  } finally { recordMarks(false); }
});

import {dry} from '../../media/sheet.mjs';
import {validDryFixedCertificate} from '../../media/paper-certificate.mjs';

test('fine ink carry invalidates a CPU dry-fixed proof and the next dry fixes that ink',()=>{
  const {main,R}=setup();dry(main);
  assert.equal(validDryFixedCertificate(main),true);
  R.draw([line],new Float32Array(W*H).fill(1),W,H,{ink:[10],peak:1});
  const mass=main.D[0].reduce((sum,v)=>sum+v,0),layers=main.layers.length;
  assert.ok(mass>0);
  assert.equal(validDryFixedCertificate(main),false);
  dry(main);
  assert.equal(main.layers.length,layers+1);
  assert.ok(main.D[0].every(v=>v===0));
  const fixed=thickness(main)[0].reduce((sum,v)=>sum+v,0);
  assert.ok(Math.abs(fixed-mass)<1e-4,'fixing preserves the carried pigment');
  assert.equal(validDryFixedCertificate(main),true);
  R.carry();
  assert.equal(validDryFixedCertificate(main),true,'a no-op carry does not discard the proof');
});

test('gain scaling applies to ink concentration array when gain !== 1', () => {
  const { main } = setup();
  const R = makeInkRes({ N: 3, W2: W, H2: H, paperOpts: { seed: 2 }, pigments: [ink], main, gain: 1.5 });
  assert.doesNotThrow(() => {
    R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
  });
});

test('scale rounding before check: N <= 1.4 returns null', () => {
  const { main } = setup();
  const pigments = [ink];
  assert.equal(makeInkRes({ N: 1.000001, W2: W, H2: H, paperOpts: {}, pigments, main }), null);
  assert.equal(makeInkRes({ N: 1.2, W2: W, H2: H, paperOpts: {}, pigments, main }), null);
});

test('native ink export contains deposited pigment at the pen sheet resolution', () => {
  const { main, R } = setup();
  const blank = R.nativeInk();
  assert.equal(blank.width, W * 3); assert.equal(blank.height, H * 3);
  assert.ok(blank.pixels.every(v => v === 255));
  R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
  const drawn = R.nativeInk();
  assert.equal(drawn.pixels.length, W * H * 27);
  assert.ok(drawn.pixels.some(v => v < 250));
  const before = thickness(R.fine)[0].slice();
  const mainBefore = thickness(main)[0].slice();
  const base = Buffer.alloc(W * H * 3, 230);
  const paintingBefore = R.compose(base).slice();
  R.nativeInk();
  assert.deepEqual(thickness(R.fine)[0], before, 'export does not change fine pigment');
  assert.deepEqual(thickness(main)[0], mainBefore, 'export does not change carried pigment');
  assert.deepEqual(R.compose(base), paintingBefore, 'export preserves every painting pixel');
});

test('coarse proof keeps final opening and closing ink, excludes paint and graphite, and is read-only', () => {
  const paint = new Float32Array([5, 5, 5, 5]);
  const finalInk = new Float32Array([0.1, 0, 0.2, 0]);
  const graphite = new Float32Array([4, 4, 4, 4]);
  const thickness = [paint, finalInk, graphite];
  const before = thickness.map(a => a.slice());
  const proof = renderInkProof({ thickness, pigments: [ink, ink, ink], inkAt: 1, width: 4, height: 1 });
  assert.equal(proof.width, 4); assert.equal(proof.height, 1);
  assert.ok(proof.pixels[0] < 255, 'opening ink is present');
  assert.ok(proof.pixels[6] < 255, 'closing ink is present');
  assert.equal(proof.pixels[3], 255, 'paint and graphite do not appear as ink');
  assert.deepEqual(thickness, before);
  assert.deepEqual(renderInkProof({ thickness: [paint, new Float32Array(4), graphite], pigments: [ink, ink, ink], inkAt: 1, width: 4, height: 1 }).pixels, new Uint8ClampedArray(12).fill(255));
  assert.throws(() => renderInkProof({ thickness, pigments: [ink, ink, ink], inkAt: 3, width: 4, height: 1 }), /valid native ink channel/);
});

test('graphite or pure watercolor channel produces an empty proof with zero ink marks', () => {
  const graphite = { name: 'graphite', kind: 'graphite', K: [1.0, 1.0, 1.0], S: [0.1, 0.1, 0.1] };
  const paint = new Float32Array([1, 2, 3, 4]);
  const proof = renderInkProof({ thickness: [paint], pigments: [graphite], inkAt: 0, width: 2, height: 2 });
  assert.equal(proof.width, 2);
  assert.equal(proof.height, 2);
  assert.ok(proof.pixels.every(v => v === 255), 'proof must be completely blank white for non-ink channels');
});

test('composeFine lays the pen over a paint render already at the fine grid as compose does over the coarse one', () => {
  const { main, R } = setup();
  R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
  const lo = Buffer.alloc(W * H * 3, 230), a = R.compose(lo), b = R.composeFine(Buffer.alloc(W * H * 27, 230));
  let worst = 0; for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  assert.ok(worst <= 1, `worst ${worst}`);
  assert.throws(() => R.composeFine(lo), /composeFine/);
});

test('a frame after a change in a band of rows composes to the same bytes as one composed afresh', () => {
  const a = setup(), b = setup();
  for (const { R } of [a, b]) R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
  const lo = Buffer.alloc(W * H * 3); for (let i = 0; i < lo.length; i++) lo[i] = 120 + (i * 7) % 120;
  a.R.compose(lo);
  const next = Buffer.from(lo); for (let y = 6; y <= 8; y++) for (let x = 10; x < 30; x++) next[(y * W + x) * 3 + 1] = 17;
  const again = a.R.compose(next);
  assert.deepEqual(again, b.R.compose(next));
  assert.deepEqual(a.R.compose(next), again, 'unchanged: the same bytes');
  next[0] = 3; next[(H * W - 1) * 3] = 4;
  assert.deepEqual(a.R.compose(next), b.R.compose(Buffer.from(next)));
});

test('a composition kept and changed in place is the same bytes as one made whole, frame after frame', () => {
  // one sheet composes a run of renders that differ by a box, a pixel, nothing, or everything, with the pen drawn on
  // between; a fresh sheet with the same pen composes each of them whole
  const want = new Float32Array(W * H).fill(1), other = { points: line.points.map(p => ({ ...p, y: 5 })) };
  const pen = lines => { const { R } = setup(); for (const l of lines) R.draw([l], want, W, H, { ink: [10], peak: 1 }); return R; };
  const drawn = [line], R = pen(drawn);
  let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  const lo = Buffer.alloc(W * H * 3, 240), kept = [];
  const steps = ['whole', 'same', 'box', 'box', 'pixel', 'corner', 'same', 'pen', 'same', 'box', 'row', 'column', 'whole', 'pixel'];
  for (const step of steps) {
    if (step === 'whole') for (let i = 0; i < lo.length; i++) lo[i] = 150 + ((rnd() * 100) | 0);
    if (step === 'box') { const x0 = (rnd() * (W - 8)) | 0, y0 = (rnd() * (H - 5)) | 0; for (let y = y0; y < y0 + 1 + ((rnd() * 4) | 0); y++) for (let x = x0; x < x0 + 1 + ((rnd() * 7) | 0); x++) lo[(y * W + x) * 3 + ((rnd() * 3) | 0)] = (rnd() * 255) | 0; }
    if (step === 'pixel') lo[(((rnd() * H) | 0) * W + ((rnd() * W) | 0)) * 3 + 1] ^= 64;
    if (step === 'corner') { lo[2] ^= 32; lo[lo.length - 3] ^= 32; }
    if (step === 'row') for (let x = 0; x < W; x++) lo[(7 * W + x) * 3] ^= 16;
    if (step === 'column') for (let y = 0; y < H; y++) lo[(y * W + 31) * 3 + 2] ^= 16;
    if (step === 'pen') { drawn.push(other); R.draw([other], want, W, H, { ink: [10], peak: 1 }); }
    const whole = pen(drawn).compose(lo), got = R.compose(lo);
    assert.ok(got.equals(whole), `after "${step}"`);
    assert.ok(Buffer.from(R.composeKept(lo)).equals(whole), `kept, after "${step}"`);
    kept.push([got, Buffer.from(got)]);
  }
  // a composition handed out is the caller's own: later frames did not write into it
  for (const [got, then] of kept) assert.ok(got.equals(then));
});
