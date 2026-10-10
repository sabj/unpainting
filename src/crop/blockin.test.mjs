// A smooth ramp is folded into one graded passage; passages with real edges stay their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blockInPigments, gradeSmoothPassages } from './blockin.mjs';
import { gaussian } from '../keyframes/density.mjs';

const W = 80, H = 80, N = W * H;
const rect = (x0, y0, x1, y1) => { const m = new Uint8Array(N); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1; return m; };
const count = m => m.reduce((a, v) => a + v, 0);
const shape = (mask, amount) => ({ mask, amount, area: count(mask), mix: [amount] });
const layer = (value, pigment, shapes) => ({ value, pigment, shapes, mask: shapes[0].mask, mix: [shapes[0].amount], amount: shapes[0].amount, area: shapes.reduce((a, s) => a + s.area, 0) });
const massOf = layers => { let m = 0; for (const L of layers) for (const s of L.shapes) for (let i = 0; i < N; i++) if (s.mask[i]) m += s.graded ? s.graded[i] : s.amount; return m; };

/** A sky: strong at the top, falling smoothly to nothing at row 60, one pigment. */
const ramp = () => Float32Array.from({ length: N }, (_, i) => { const y = (i / W) | 0; return y < 60 ? 0.9 * (1 - y / 60) : 0; });

test('a smooth ramp blocked in is a staircase of nested passages, and folded it is one graded passage', () => {
  const A = ramp();
  const { layers } = blockInPigments(A, 1, W, H, { glaze: 0.12 });
  const before = layers.reduce((a, L) => a + L.shapes.length, 0);
  assert.ok(before >= 4, `the ramp is cut into several values: ${before}`);
  const graded = gradeSmoothPassages(layers, A, 1, W, H, { soft: () => true, blur: gaussian });
  assert.equal(graded.reduce((a, L) => a + L.shapes.length, 0), 1, 'one passage lays the whole ramp');
  const sh = graded[0].shapes[0];
  assert.ok(sh.graded, 'and it carries its amount per cell');
  // down the middle column, the amount falls with no riser: no step between rows more than twice the mean fall
  const col = Array.from({ length: 50 }, (_, y) => sh.graded[(y + 3) * W + 40]);
  const fall = (col[0] - col[col.length - 1]) / (col.length - 1);
  assert.ok(fall > 0, `it falls down the sky: ${col[0].toFixed(3)} to ${col[col.length - 1].toFixed(3)}`);
  const worst = Math.max(...col.slice(1).map((v, i) => col[i] - v));
  assert.ok(worst < 2 * fall, `largest step ${worst.toFixed(4)} against a mean fall of ${fall.toFixed(4)} per row`);
  // and it lays what the staircase laid, not more
  const m0 = massOf(layers), m1 = massOf(graded);
  assert.ok(Math.abs(m1 - m0) / m0 < 0.03, `mass ${m0.toFixed(1)} before, ${m1.toFixed(1)} graded`);
  assert.ok(Math.abs(sh.amount - m1 / count(sh.mask)) < 1e-3, 'and its amount is the mean of what it lays, which the charge is calibrated on');
});

test('passages whose edges are real in the source are left alone, and nothing given is changed', () => {
  const A = ramp();
  const { layers } = blockInPigments(A, 1, W, H, { glaze: 0.12 });
  const snapshot = JSON.stringify(layers.map(L => ({ v: L.value, n: L.shapes.length, a: L.shapes.map(s => s.amount) })));
  const same = gradeSmoothPassages(layers, A, 1, W, H, { soft: () => false, blur: gaussian });
  assert.equal(same.reduce((a, L) => a + L.shapes.length, 0), layers.reduce((a, L) => a + L.shapes.length, 0));
  assert.ok(same.every(L => L.shapes.every(s => !s.graded)));
  gradeSmoothPassages(layers, A, 1, W, H, { soft: () => true, blur: gaussian });
  assert.equal(JSON.stringify(layers.map(L => ({ v: L.value, n: L.shapes.length, a: L.shapes.map(s => s.amount) }))), snapshot, 'the layers passed in are not touched');
  assert.ok(layers.every(L => L.shapes.every(s => !s.graded)));
});

test('a soft passage folds only into a passage of its own pigment that holds it', () => {
  const outer = shape(rect(10, 10, 70, 70), 0.2), inner = shape(rect(20, 20, 60, 60), 0.1);
  // the picture's own amounts agree with the passages: 0.3 where both lie, 0.2 where only the outer does
  const A = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) A[i * 2] = inner.mask[i] ? 0.3 : outer.mask[i] ? 0.2 : 0;
  const otherPigment = shape(rect(25, 25, 55, 55), 0.1), outside = shape(rect(0, 72, 80, 80), 0.1);
  const layers = [layer(1, 0, [outer]), layer(2, 1, [otherPigment]), layer(2, 0, [inner, outside])];
  const out = gradeSmoothPassages(layers, A, 2, W, H, { soft: s => s !== outer, blur: gaussian });
  const shapes = out.flatMap(L => L.shapes.map(s => ({ s, pigment: L.pigment })));
  assert.equal(shapes.length, 3, 'the inner passage is folded; the other pigment and the passage outside stay');
  assert.ok(shapes.find(o => o.pigment === 1), 'the other pigment keeps its passage');
  assert.ok(shapes.find(o => o.pigment === 0 && o.s.mask === outside.mask), 'the passage outside keeps its own');
  const root = shapes.find(o => o.pigment === 0 && o.s.graded).s;
  assert.ok(Math.abs(root.graded[40 * W + 40] - 0.3) < 0.02, `inside both, what both laid: ${root.graded[40 * W + 40].toFixed(3)}`);
  assert.ok(Math.abs(root.graded[12 * W + 12] - 0.2) < 0.03, `inside the outer only, its own: ${root.graded[12 * W + 12].toFixed(3)}`);
});

test('a soft passage folds into the innermost passage that holds it, so a real edge between them is kept', () => {
  const sky = shape(rect(0, 0, 80, 80), 0.1), hard = shape(rect(20, 20, 60, 60), 0.2), shade = shape(rect(30, 30, 50, 50), 0.1);
  const A = Float32Array.from({ length: N }, (_, i) => 0.1 + (hard.mask[i] ? 0.2 : 0) + (shade.mask[i] ? 0.1 : 0));
  const out = gradeSmoothPassages([layer(1, 0, [sky]), layer(2, 0, [hard]), layer(3, 0, [shade])], A, 1, W, H, { soft: s => s === shade, blur: gaussian });
  const shapes = out.flatMap(L => L.shapes);
  assert.equal(shapes.length, 2);
  assert.ok(!shapes.find(s => s.mask === sky.mask).graded, 'the outer passage is laid as it was');
  const inner = shapes.find(s => s.mask === hard.mask);
  assert.ok(inner.graded, 'the soft passage went into the hard-edged one that holds it');
  // and the graded amount does not bleed across the hard passage's own edge: right inside it, it is not diluted
  assert.ok(inner.graded[21 * W + 40] > 0.19, `just inside the edge ${inner.graded[21 * W + 40].toFixed(3)}`);
  assert.equal(inner.graded[19 * W + 40], 0, 'and nothing outside it');
});

test('a passage that may not host keeps its soft passages apart, and they do not fold past it into one further out', () => {
  const sky = shape(rect(0, 0, 80, 80), 0.1), rough = shape(rect(20, 20, 60, 60), 0.2), shade = shape(rect(30, 30, 50, 50), 0.1);
  const A = Float32Array.from({ length: N }, (_, i) => 0.1 + (rough.mask[i] ? 0.2 : 0) + (shade.mask[i] ? 0.1 : 0));
  const layers = [layer(1, 0, [sky]), layer(2, 0, [rough]), layer(3, 0, [shade])];
  const out = gradeSmoothPassages(layers, A, 1, W, H, { soft: s => s === shade, host: s => s !== rough, blur: gaussian });
  const shapes = out.flatMap(L => L.shapes);
  assert.equal(shapes.length, 3, 'all three are laid as they were');
  assert.ok(shapes.every(s => !s.graded));
});

test('a connected mixed wash survives small holes assigned to a neighbouring puddle', () => {
  const w=40,h=40,n=w*h,A=new Float32Array(n*2);
  let support=0;
  for(let y=6;y<34;y++) for(let x=6;x<34;x++) {
    const q=(x%3===0)?1:0; A[(y*w+x)*2+q]=0.4; if(q===0)support++;
  }
  const options={glaze:.12,maxValues:8,preMix:false,minShape:8};
  const old=blockInPigments(A,2,w,h,options), fixed=blockInPigments(A,2,w,h,{...options,sampleSupport:true});
  const retained=result=>{let seen=0;for(let i=0;i<n;i++)if(A[i*2]>.1&&result.delivered[i*2]>.1)seen++;return seen/support;};
  assert.ok(retained(old)<.25,'control reproduces the missing wash');
  assert.ok(retained(fixed)>.9,'supported mixed wash survives mask closing');
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<5||x>=35||y<5||y>=35)
    assert.equal(fixed.delivered[(y*w+x)*2],0,'paper outside the region stays unplanned');
});

test('mixed support does not create a wash on blank paper', () => {
  const result=blockInPigments(new Float32Array(40*40*3),3,40,40,{preMix:false,sampleSupport:true});
  assert.equal(result.layers.length,0);
  assert.ok(result.delivered.every(v=>v===0));
});


test('graded washes preserve mixed paint and do not merge different recipes sharing a leading pan', () => {
  const outer = shape(rect(10, 10, 70, 70), .2), inner = shape(rect(20, 20, 60, 60), .1);
  outer.mix = [.12, .08]; inner.mix = [.06, .04];
  const A = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const amount = (outer.mask[i] ? .2 : 0) + (inner.mask[i] ? .1 : 0);
    A[i * 2] = amount * .6; A[i * 2 + 1] = amount * .4;
  }
  const layers = [layer(1, 0, [outer]), layer(2, 0, [inner])];
  layers[0].mix = outer.mix; layers[1].mix = inner.mix;
  const out = gradeSmoothPassages(layers, A, 2, W, H, { soft: () => true, blur: gaussian });
  assert.equal(out.length, 1);
  const wash = out[0].shapes[0];
  assert.ok(wash.graded);
  assert.ok(Math.abs(wash.mix[0] / wash.mix[1] - 1.5) < 1e-9, 'warm mixed wash stays mixed');
  assert.ok(Math.abs(out[0].mix[0] / out[0].mix[1] - 1.5) < 1e-9);
  assert.ok(Math.abs(massOf(out) - massOf(layers)) / massOf(layers) < .03);
  inner.mix = [.09, .01];
  const apart = gradeSmoothPassages(layers, A, 2, W, H, { soft: () => true, blur: gaussian });
  assert.equal(apart.length, 2, 'different brown recipes keep their separate brush charges');
  assert.ok(apart.every(L => L.shapes.every(sh => !sh.graded)));
});
