// Each family must catch its own fault and stay quiet about the others.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composability, tooling, endResult, execution, intermediates, report } from './composite.mjs';

const field = (n, v) => { const F = new Float32Array(n); F.fill(v); return F; };
const has = (flags, word) => flags.some(f => f.includes(word));

test('a decomposition that adds up is clean; one that falls short is caught', () => {
  const src = field(1000, 0.4);
  const good = composability(src, field(1000, 0.3), field(1000, 0.1));
  assert.equal(good.flags.length, 0, `wash plus ink reconstructs it: ${JSON.stringify(good.flags)}`);
  const short = composability(src, field(1000, 0.1), field(1000, 0.05));
  assert.ok(has(short.flags, 'short'), `falling short is caught: ${JSON.stringify(short.flags)}`);
});

test('both parts claiming the same tone is caught as overshoot', () => {
  const src = field(1000, 0.3);
  const r = composability(src, field(1000, 0.3), field(1000, 0.3));
  assert.ok(has(r.flags, 'overshoot') || has(r.flags, 'claiming'), `double counting is caught: ${JSON.stringify(r.flags)}`);
});

test('a right-looking picture made by an impossible process fails tooling, not end result', () => {
  const src = field(4000, 0.3);
  const end = endResult(src, field(4000, 0.3));
  assert.equal(end.flags.length, 0, 'the sheet itself is right');
  const tool = tooling({ marks: 12000, glazes: 1, medianLength: 30 }, { width: 1086, height: 1448 }, {});
  assert.ok(has(tool.flags, 'not a drawing anyone made'), `the count is caught: ${JSON.stringify(tool.flags)}`);
  assert.ok(has(tool.flags, 'fewer than two glazes'), 'and so is the single pass');
});

test('a scribble is caught by its median length against the sheet', () => {
  const r = tooling({ marks: 80, glazes: 6, medianLength: 1200 }, { width: 1086, height: 1448 }, {});
  assert.ok(has(r.flags, 'scribble'), `a median mark longer than the sheet: ${JSON.stringify(r.flags)}`);
});

test('a plausible process raises nothing', () => {
  const r = tooling({ marks: 160, glazes: 8, medianLength: 120, brushSweeps: 900 }, { width: 1086, height: 1448 }, {});
  assert.equal(r.flags.length, 0, `nothing wrong here: ${JSON.stringify(r.flags)}`);
});

test('end result catches a sheet that is too light and one that invents paint', () => {
  const src = field(2000, 0.4);
  const pale = endResult(src, field(2000, 0.1));
  assert.ok(has(pale.flags, 'too light'), `${JSON.stringify(pale.flags)}`);
  const bare = new Float32Array(2000);
  const invented = endResult(bare, field(2000, 0.3));
  assert.ok(has(invented.flags, 'where the picture is bare'), `${JSON.stringify(invented.flags)}`);
});

test('the report keeps the families apart and names which one flagged', () => {
  const rep = report({
    composability: composability(field(500, 0.4), field(500, 0.05), field(500, 0.02)),
    tooling: tooling({ marks: 140, glazes: 7, medianLength: 130 }, { width: 1086, height: 1448 }, {}),
    endResult: endResult(field(500, 0.4), field(500, 0.39)),
  });
  assert.ok(rep.flags.some(f => f.startsWith('composability:')), 'the family is named');
  assert.ok(!rep.flags.some(f => f.startsWith('tooling:')), 'and a clean family says nothing');
  assert.equal(rep.clean, false);
});


const blur = (F, w, h, sigma) => {
  const r = Math.max(1, Math.ceil(sigma * 2.5)), k = new Float32Array(2 * r + 1);
  let sum = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += F[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r]; tmp[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r]; out[y * w + x] = a; }
  return out;
};
const WW = 80, HH = 80;
/** A plan with real structure in it: stripes a brush would have to keep apart. */
// stripes wide enough to register at form scale
const striped = () => { const F = new Float32Array(WW * HH); for (let y = 0; y < HH; y++) for (let x = 0; x < WW; x++) F[y * WW + x] = 0.3 + 0.25 * (Math.floor(x / 14) % 2); return F; };

test('execution catches a sheet that flooded and levelled the plan away', () => {
  const plan = striped();
  const flooded = blur(plan, WW, HH, 6);                      // the stripes averaged into one tone
  const r = execution(plan, flooded, WW, HH, blur);
  assert.ok(has(r.flags, 'flattened'), `${JSON.stringify(r.flags)}`);
  assert.ok(r.fineKept < 0.4, `detail kept ${r.fineKept.toFixed(2)}`);
});

test('execution is quiet when the sheet carries the plan, grain and all', () => {
  const plan = striped();
  const painted = Float32Array.from(plan, (v, i) => v + 0.02 * Math.sin(i * 1.7));   // the paper's own grain
  const r = execution(plan, painted, WW, HH, blur);
  assert.equal(r.flags.length, 0, `${JSON.stringify(r.flags)}`);
  assert.ok(r.structure > 0.8, `and it is the plan's structure: ${r.structure.toFixed(2)}`);
});

test('execution tells texture of its own from the plan being carried out', () => {
  const plan = striped();
  // as much variation as the plan has, but in the wrong places: the simulation's grain, not the picture's
  const wrong = Float32Array.from(plan, (v, i) => 0.42 + 0.25 * (Math.floor((i % WW) / 4) % 2 ? 0 : 1) * 0 + 0.25 * Math.sin(i * 0.9));
  const r = execution(plan, wrong, WW, HH, blur);
  // more variation than the plan and none of the plan's own: texture, not flattening
  assert.ok(has(r.flags, 'adding texture of its own'), `${JSON.stringify(r.flags)}`);
  assert.ok(has(r.flags, 'barely agrees'), `${JSON.stringify(r.flags)}`);
});

test('the intermediate judge names the pass where the sheet loses the plan', () => {
  const plan = striped();
  const pairs = [];
  for (let k = 1; k <= 6; k++) {
    // passes one to three are carried out; from four the washes flood
    const painted = k < 4 ? Float32Array.from(plan, (v, i) => v + 0.01 * Math.sin(i)) : blur(plan, WW, HH, 14);
    pairs.push({ pass: k, planD: plan, paintedD: painted });
  }
  const r = intermediates(pairs, WW, HH, blur);
  assert.ok(has(r.flags, 'pass 4'), `it names the pass: ${JSON.stringify(r.flags)}`);
  assert.ok(has(r.flags, 'forms'), 'and judges it at the scale a form lives at, not at one cell');
  assert.equal(r.worst.pass, 4);
});

test('form score falls away on both sides of the plan\'s own variation', () => {
  const W = 160, H = 160, n = W * H;   // form scale is a 20-cell blur of a 6-cell blur, so the sheet has to be big enough to hold it
  const plan = new Float32Array(n), noisy = new Float32Array(n), faint = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % W, y = (i / W) | 0;
    plan[i] = x < 80 ? 0.2 : 0.8;
    noisy[i] = plan[i] + (((x / 30 | 0) + (y / 30 | 0)) % 2) * 0.6;   // the plan's forms plus blocks of its own, at form scale
    faint[i] = 0.5 + (plan[i] - 0.5) * 0.4;               // the plan's forms, flattened
  }
  const blur = (F, w, h, s) => { const r = Math.max(1, Math.round(s)), o = new Float32Array(F.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { a += F[yy * w + xx]; k++; } } o[y * w + x] = a / k; } return o; };
  const over = execution(plan, noisy, W, H, blur);
  const under = execution(plan, faint, W, H, blur);
  assert.ok(over.formKept > 1.2, `noisy formKept ${over.formKept}`);
  assert.ok(over.formScore < 0.85, `noisy formScore ${over.formScore} should not pass`);
  assert.ok(under.formScore <= under.formKept + 1e-9 && under.formScore < 0.8, `flattened formScore ${under.formScore}`);
});

test("a pass with more form-scale variation than the plan departs from its forms; it does not lose 400% of them", () => {
  const steps = [{ pass: 1, formKept: 4.27, formScore: 0, formStructure: 0.45, fineKept: 1, structure: 1 }, { pass: 2, formKept: 0.4, formScore: 0.4, formStructure: 0.9, fineKept: 1, structure: 1 }];
  const over = intermediates(steps, 10, 10, null).flags[0], under = intermediates(steps.slice(1), 10, 10, null).flags[0];
  assert.match(over, /departs from the plan.s forms at pass 1: it holds 427% of the plan.s variation/);
  assert.match(under, /loses the plan.s forms at pass 2: it keeps 40% of the plan.s variation/);
});
