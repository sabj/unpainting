import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createTargetGuard, TargetGuardError, writeGuardReport, LOOK_MIN_CELLS, HARD_LOOK_BUDGET, normalizeMode } from './no-target.mjs';
import { lintSource } from './lint-target-use.mjs';
import { smallShare, sweepFront, progressionFlags, combine, pickStages, cheatRisk, HF_CEILING, readFrames } from './cheat-risk.mjs';
import { promoteCheck } from './promote-check.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));

test('gentle guard (the default): planning reads the target, painting cannot', () => {
  const g = createTargetGuard();
  assert.equal(g.mode, 'gentle');
  let px = g.register('px', new Uint8Array([10, 20, 30]));
  assert.equal(px[1], 20);
  g.beginPaint(); px = g.seal('px', px);
  assert.equal(px.length, 3);                    // length and methods pass through
  assert.throws(() => px[0], TargetGuardError);
  g.endPaint();
  assert.equal(px[2], 30);                       // finished: reads are allowed again
  assert.equal(g.summary().violations, 1);
});

test('warn guard records each reader once and keeps counting', () => {
  const g = createTargetGuard({ mode: 'warn' });
  g.beginPaint(); const A = g.seal('A', new Float32Array(100));
  let s = 0; for (let i = 0; i < 100; i++) s += A[i];
  assert.equal(s, 0);
  const sum = g.summary();
  assert.equal(sum.violations, 1);
  assert.equal(sum.elementReads.A, 100);
  assert.deepEqual(sum.byName, { A: 1 });
});

test('sealed arrays keep typed-array behaviour for the plan step', () => {
  const g = createTargetGuard({ mode: 'gentle' });
  const A = g.seal('A', Float32Array.from([1, 2, 3]));
  assert.deepEqual(Array.from(A.map(v => v * 2)), [2, 4, 6]);
  assert.deepEqual(Array.from(Float32Array.from(A)), [1, 2, 3]);
  assert.ok(A instanceof Float32Array);
});

test('off guard is a no-op and returns the same array', () => {
  const g = createTargetGuard({ mode: 'off' });
  const a = new Uint8Array(4); g.beginPaint();
  assert.equal(g.seal('px', a), a);
  assert.doesNotThrow(() => g.assertCleanContext('x', { px: a }));
});

test('reading the target file while painting throws; other images do not', () => {
  const d = tmp(), target = path.join(d, 'target.png'), other = path.join(d, 'frame.png');
  fs.writeFileSync(target, 'x'); fs.writeFileSync(other, 'y');
  const g = createTargetGuard({ mode: 'gentle', targetPaths: [target] });
  assert.doesNotThrow(() => fs.readFileSync(target));
  g.beginPaint();
  assert.throws(() => fs.readFileSync(target), TargetGuardError);
  assert.doesNotThrow(() => fs.readFileSync(other));
  g.endPaint();
  assert.doesNotThrow(() => fs.readFileSync(target));
});

test('sharp cannot open the target while painting', async () => {
  const d = tmp(), target = path.join(d, 't.png');
  await sharp({ create: { width: 4, height: 4, channels: 3, background: '#888' } }).png().toFile(target);
  const g = createTargetGuard({ mode: 'gentle', targetPaths: [target] });
  g.beginPaint();
  await assert.rejects(async () => sharp(target).raw().toBuffer(), TargetGuardError);
  g.endPaint();
});

test('an executor context carrying a target map is refused', () => {
  const g = createTargetGuard({ mode: 'gentle' });
  const AL = g.register('AL', new Float32Array(8));
  g.beginPaint();
  assert.throws(() => g.assertCleanContext('passageHook', { w: 1, plan: AL }), /AL/);
  assert.doesNotThrow(() => g.assertCleanContext('passageHook', { w: 1, masks: new Uint8Array(8) }));
});

test('guard report is written beside the painting', () => {
  const d = tmp(), g = createTargetGuard({ mode: 'warn' });
  g.beginPaint(); const px = g.seal('px', new Uint8Array(3)); void px[0];
  const f = writeGuardReport(g, d, { image: 't.png' });
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(r.mode, 'warn'); assert.equal(r.violations, 1); assert.equal(r.image, 't.png');
});

test('unknown mode is refused', () => assert.throws(() => createTargetGuard({ mode: 'loose' })));


test('a look gives shape-level means of the reference and the sheet, and is recorded', () => {
  const g = createTargetGuard({ mode: 'gentle' }), n = 200;
  const px = new Uint8Array(n * 3).map((_, i) => (i % 3 === 2 ? 200 : 100));
  const AL = Float32Array.from({ length: n * 2 }, (_, i) => (i % 2 ? 0.4 : 0.2));
  g.provide('px', px, { stride: 3 }); g.provide('AL', AL, { stride: 2 });
  const sealed = g.seal('AL', AL); g.beginPaint();
  assert.throws(() => sealed[0], TargetGuardError);             // a cell is still closed
  const mask = new Uint8Array(n).fill(1), sheet = new Float32Array(n * 2).fill(0.1);
  const r = g.look('passage', 's1', mask, { ref: ['AL', 'px'], sheet: { ledger: { arr: sheet, stride: 2 } } });
  assert.equal(r.cells, n);
  assert.deepEqual(r.ref.AL.map(v => +v.toFixed(6)), [0.2, 0.4]);
  assert.deepEqual(r.ref.px, [100, 100, 200]);
  assert.deepEqual(r.sheet.ledger.map(v => +v.toFixed(6)), [0.1, 0.1]);
  const s = g.summary();
  assert.equal(s.violations, 1); assert.equal(s.looks.count, 1); assert.equal(s.looks.entries[0].label, 's1');
});

test('a look refuses shapes too small to squint at, unknown checkpoints and reference maps passed as the sheet', () => {
  const g = createTargetGuard({ mode: 'gentle' }), n = 400, px = new Uint8Array(n * 3);
  g.provide('px', px, { stride: 3 }); g.beginPaint();
  const tiny = new Uint8Array(n); for (let i = 0; i < LOOK_MIN_CELLS - 1; i++) tiny[i] = 1;
  assert.equal(g.look('passage', 'tiny', tiny, { ref: ['px'] }), null);
  assert.equal(g.summary().looks.refused, 1);
  assert.throws(() => g.look('everywhere', 'x', new Uint8Array(n).fill(1), { ref: ['px'] }), /no look/);
  assert.throws(() => g.look('passage', 'x', new Uint8Array(n).fill(1), { sheet: { px: { arr: px, stride: 3 } } }), /reference map/);
  assert.throws(() => g.look('passage', 'x', new Uint8Array(n).fill(1), { ref: ['SRC'] }), /not provided/);
});

test('reference maps can only be given to the look before painting', () => {
  const g = createTargetGuard({ mode: 'warn' }); g.beginPaint();
  assert.throws(() => g.provide('px', new Uint8Array(3)), /before painting/);
});

test('the look works the same with the guard off, so the painting does not depend on the mode', () => {
  const g = createTargetGuard({ mode: 'off' }), n = 100, A = new Float32Array(n).fill(0.3);
  g.provide('A', A); g.beginPaint();
  assert.equal(+g.look('passage', 'x', new Uint8Array(n).fill(1), { ref: ['A'] }).ref.A[0].toFixed(6), 0.3);
});

test('a box limits the look to the shape\'s rows and columns', () => {
  const g = createTargetGuard({ mode: 'gentle' }), w = 20, h = 20, A = Float32Array.from({ length: w * h }, (_, i) => i % w);
  g.provide('A', A); g.beginPaint();
  const m = new Uint8Array(w * h); for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * w + x] = 1;
  const r = g.look('texture', 'b', m, { box: { x0: 5, x1: 14, y0: 5, y1: 14, w }, ref: ['A'] });
  assert.equal(r.cells, 100); assert.equal(r.ref.A[0], 9.5);
});


test('strict is an older name for gentle; unknown names are refused', () => {
  assert.equal(normalizeMode('strict'), 'gentle');
  assert.equal(createTargetGuard({ mode: 'strict' }).mode, 'gentle');
  assert.equal(createTargetGuard({ mode: 'strict' }).summary().requestedMode, 'strict');
  assert.throws(() => normalizeMode('loose'), /gentle/);
});

test('categories: painted under gentle or hard, copied after any target read, unguarded when off', () => {
  for (const mode of ['gentle', 'hard']) { const g = createTargetGuard({ mode }); g.beginPaint(); assert.equal(g.summary().category, 'painted'); }
  const copied = createTargetGuard({ mode: 'warn' }); copied.beginPaint(); const px = copied.seal('px', new Uint8Array(3)); void px[0];
  assert.equal(copied.summary().category, 'copied');
  const off = createTargetGuard({ mode: 'off' }); off.beginPaint(); assert.equal(off.summary().category, 'unguarded');
});

test('a blocked read is recorded as a blocked attempt in the report', () => {
  const d = tmp(), g = createTargetGuard({ mode: 'gentle' });
  g.beginPaint(); const px = g.seal('px', new Uint8Array(3));
  assert.throws(() => px[0], TargetGuardError);
  const r = JSON.parse(fs.readFileSync(writeGuardReport(g, d), 'utf8'));
  assert.equal(r.blockedAttempts, 1); assert.equal(r.records[0].blocked, true); assert.equal(r.category, 'copied');
});

// gentle mode: peeks and reviews are allowed, cell reads are not
test('gentle mode: a peek and a between-pass review succeed while a per-pixel read is blocked', () => {
  const w = 20, h = 20, n = w * h, d = tmp(), target = path.join(d, 'target.png');
  fs.writeFileSync(target, 'x');
  const px = Uint8Array.from({ length: n * 3 }, (_, i) => (i % 3 === 0 ? 200 : 80));
  const g = createTargetGuard({ targetPaths: [target] });
  let sealed = g.register('px', px); g.provide('px', px, { stride: 3 });
  g.beginPaint(); sealed = g.seal('px', sealed);
  const sheet = new Float32Array(n * 3).fill(120), whole = new Uint8Array(n).fill(1);
  // a peek at the target and at the painting, mid-painting
  const peek = g.look('peek', 'agent peek', whole, { ref: ['px'], sheet: { painting: { arr: sheet, stride: 3 } } });
  assert.deepEqual(peek.ref.px, [200, 80, 80]); assert.deepEqual(peek.sheet.painting, [120, 120, 120]);
  // a review between passes, shape by shape
  const left = new Uint8Array(n), right = new Uint8Array(n);
  for (let i = 0; i < n; i++) (i % w < w / 2 ? left : right)[i] = 1;
  for (const [k, m] of [['left', left], ['right', right]]) assert.equal(g.look('review', `pass 2 ${k}`, m, { ref: ['px'], sheet: { painting: { arr: sheet, stride: 3 } } }).cells, n / 2);
  assert.equal(g.summary().violations, 0);
  assert.equal(g.summary().looks.byCheckpoint.review.count, 2);
  // a per-pixel read of the target, as array or as file, is blocked
  assert.throws(() => sealed[3 * 57], TargetGuardError);
  assert.throws(() => fs.readFileSync(target), TargetGuardError);
  // and a look narrowed to one pixel returns nothing
  const one = new Uint8Array(n); one[57] = 1;
  assert.equal(g.look('peek', 'one pixel', one, { ref: ['px'] }), null);
  g.endPaint();
  const s = g.summary();
  assert.equal(s.mode, 'gentle'); assert.equal(s.looks.count, 3); assert.equal(s.blockedAttempts, 2);
});

test('gentle mode has no look budget; hard mode stops answering after its budget', () => {
  const n = 100, A = new Float32Array(n).fill(0.3), mask = new Uint8Array(n).fill(1);
  const gentle = createTargetGuard(); gentle.provide('A', A); gentle.beginPaint();
  for (let k = 0; k < HARD_LOOK_BUDGET + 20; k++) assert.ok(gentle.look('review', `r${k}`, mask, { ref: ['A'] }));
  assert.equal(gentle.lookBudget, null);
  const hard = createTargetGuard({ mode: 'hard', lookBudget: 3 }); hard.provide('A', A); hard.beginPaint();
  const got = Array.from({ length: 5 }, (_, k) => hard.look('review', `r${k}`, mask, { ref: ['A'] }));
  assert.equal(got.filter(Boolean).length, 3);
  const s = hard.summary();
  assert.equal(s.looks.count, 3); assert.equal(s.looks.overBudget, 2); assert.equal(s.looks.budget, 3); assert.equal(s.violations, 0);
  assert.equal(createTargetGuard({ mode: 'hard' }).lookBudget, HARD_LOOK_BUDGET);
  assert.throws(() => createTargetGuard({ mode: 'hard', lookBudget: 0 }), /look budget/);
});

const rules = (file, text) => lintSource(file, text).map(f => `${f.cat}:${f.rule}`);

test('lint flags residual-driven passages (c)', () => {
  assert.deepEqual(rules('x.mjs', 'WANT[i] = Math.max(0, AL[i * P + pg] - LEDGER[i * P + pg]);'), ['c:plan-minus-sheet']);
  assert.deepEqual(rules('x.mjs', "brushedWashPaths(m, W, H, { field: WANT, seed: 1 })"), ['c:residual-field']);
  assert.deepEqual(rules('x.mjs', 'sh._fb = planned > 1e-6 ? Math.max(0, Math.min(2, lack / planned)) : 1;'), ['c:feedback-charge']);
  assert.deepEqual(rules('x.mjs', 'for (let i = 0; i < D0.length; i++) { const d = D0[i] - DR[i]; }'), ['c:render-correct-loop']);
  assert.deepEqual(rules('x.mjs', 'if (t.after.de <= t.before.de - minGain) touches.push(t);'), ['c:keep-if-closer-de']);
  assert.deepEqual(rules('x.mjs', 'if (s.value > bestScore.value) { best = next; }'), ['c:hill-climb-nudge']);
});

test('lint flags per-cell colour fits (b)', () => {
  assert.deepEqual(rules('x.mjs', 'const target=[r,g,b].map(v=>-Math.log(v/255));'), ['b:cell-colour-fit']);
});

test('lint flags px only inside the paint step of paint-plate (d)', () => {
  const src = ["const L = px[0];", "TARGET_GUARD.beginPaint();", "const b = px[3*i+2];", "phaseMark('painting');", "const c = px[1];"].join('\n');
  const f = lintSource('tools/paint-plate.mjs', src);
  assert.equal(f.length, 1); assert.equal(f[0].line, 3); assert.equal(f[0].cat, 'd');
  assert.equal(lintSource('tools/other.mjs', src).length, 0);
});

test('lint ignores comments and allowed planning', () => {
  assert.equal(lintSource('x.mjs', '// WANT[i] = AL[i] - LEDGER[i]').length, 0);
  assert.equal(lintSource('x.mjs', 'const bands = valueBands(density, 5);').length, 0);
});

test('lint keys survive a line move', () => {
  const a = lintSource('x.mjs', 'x = AL[i] - LEDGER[i];')[0].key, b = lintSource('x.mjs', '\n\n  x = AL[i]  - LEDGER[i];')[0].key;
  assert.equal(a, b);
});

test('small-stroke share counts short narrow brush strokes, not pen', () => {
  const mk = { w: 100, brushOpts: [{ radius: 1 }], marks: [
    { k: 's', b: 0, d: [[0, 0], [10, 0]] },          // r 1 cell = 1 mm at 100 mm/100 cells: not small
    { k: 's', b: 0, d: [[0, 0, 1, 5], [5, 0, 1, 5]] }, // r 0.5 cell = 0.5 mm, 0.5 long: small
    { k: 'p', b: 0, d: [[0, 0], [1, 0]] },           // pen: not counted
    { k: 'd', b: 1, c: [0, 0] },                      // brush 1 dipped in clean water
    { k: 's', b: 1, d: [[0, 0, 1, 5], [5, 0, 1, 5]] }, // clean water: not counted
  ] };
  const s = smallShare(mk, 100);
  assert.equal(s.total, 2); assert.equal(s.small, 1); assert.equal(s.share, 0.5);
});

test('a straight wipe between stages is a travelling front; scattered washes are not', () => {
  const W = 40, H = 40, A = new Float32Array(W * H).fill(1), wipe = new Float32Array(W * H).fill(1), blobs = new Float32Array(W * H).fill(1);
  for (let y = 0; y < 20; y++) for (let x = 0; x < W; x++) wipe[y * W + x] = 0.5;
  for (const [cx, cy] of [[8, 8], [30, 12], [15, 30], [33, 33]]) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < 25) blobs[y * W + x] = 0.5;
  assert.ok(sweepFront(A, wipe, W, H) > 0.8);
  assert.equal(sweepFront(A, blobs, W, H), 0);
});

test('progression flags: dark first, detail first, finished early', () => {
  const ok = { 10: { dark: 0, hf: 0.1 }, 25: { dark: 0.1, hf: 0.3 }, 50: { dark: 0.5, hf: 0.6 }, 75: { dark: 0.8, hf: 0.8 } };
  assert.deepEqual(progressionFlags(ok), []);
  assert.deepEqual(progressionFlags({ ...ok, 10: { dark: 0.5, hf: 0.1 } }), ['darks first']);
  assert.deepEqual(progressionFlags({ ...ok, 25: { dark: 0.1, p95: 0.9, hf: 0.3 } }), ['darks first']);
  assert.deepEqual(progressionFlags({ 10: { dark: 0, mean: 0.1, hf: 0 }, 25: { dark: 0, mean: 0.1, hf: 0.1 }, 50: { dark: 0.9, mean: 0.95, hf: 0.9 }, 75: { dark: 0.9, mean: 0.95, hf: 0.9 } }), ['one sweep']);
  assert.deepEqual(progressionFlags({ ...ok, 25: { dark: 0.1, hf: 0.9 } }), ['early detail']);
  assert.deepEqual(progressionFlags({ ...ok, 25: { dark: 0.1, mean: 0.6, hf: 0.9 } }), []); // detail with the tone: not early
  assert.deepEqual(progressionFlags({ ...ok, 50: { dark: 1, hf: 1 } }), ['finished by 50%']);
  assert.deepEqual(progressionFlags(ok, [{ front: 0.9 }]), ['travelling front']);
  assert.deepEqual(progressionFlags({}), ['no frames']);
});

test('risk combines parts with the judge taking over when it is harsher', () => {
  assert.deepEqual(combine({ flags: [], copy: 0, small: 0, pixelFit: 0 }), { parts: { progression: 0, copy: 0, small: 0, pixelFit: 0 }, risk: 0, level: 'low', review: false });
  assert.equal(combine({ flags: [], judge: { earlyMean: 2 }, copy: 0, small: 0, pixelFit: 0 }).parts.progression, 1);
  assert.equal(combine({ flags: ['darks first', 'early detail'], copy: 1, small: 1, pixelFit: 0 }).level, 'high');
});

test('stroke count and small strokes alone never make a run high risk', () => {
  const r = combine({ flags: [], copy: 0, small: 1, pixelFit: 0 });
  assert.equal(r.level, 'low'); assert.equal(r.risk, 0.1);
});

test('a paint-time target read makes the run high whatever its pictures say', () => {
  const r = combine({ flags: [], copy: 0, small: 0, pixelFit: 1 });
  assert.equal(r.level, 'high'); assert.match(r.why, /read the target/);
});

test('frames are placed by strokes laid when the tape has frame markers', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'frames.json'), JSON.stringify({ frames: [0, 1, 2].map(i => ({ src: `f${i}.jpg`, position: i / 2 })) }));
  for (const i of [0, 1, 2]) fs.writeFileSync(path.join(d, `f${i}.jpg`), 'x');
  const s = { k: 's', b: 0, d: [[0, 0], [1, 0]] };
  const mk = { marks: [{ k: 'm', i: 0 }, s, { k: 'm', i: 1 }, s, s, s, { k: 'm', i: 2 }] };
  const { frames, basis } = readFrames(d, mk);
  assert.match(basis, /strokes/);
  assert.deepEqual(frames.map(f => f.position), [0, 0.25, 1]);
});

test('stage picks are the frames nearest each share of the timeline', () => {
  const frames = [0, 0.1, 0.3, 0.5, 0.7, 1].map((p, i) => ({ src: `f${i}.jpg`, position: p }));
  const p = pickStages(frames);
  assert.equal(p[10].src, 'f1.jpg'); assert.equal(p[25].src, 'f2.jpg'); assert.equal(p[75].src, 'f4.jpg'); assert.equal(p[100].src, 'f5.jpg');
});

test('honest ceiling follows the painting width', () => { assert.equal(HF_CEILING(540), 0.53); assert.equal(HF_CEILING(1086), 0.645); });

async function fakeRun({ copyTarget = false, guard = { mode: 'gentle', violations: 0, byName: {} } } = {}) {
  const d = tmp(), W = 64, H = 64;
  const noise = Buffer.alloc(W * H * 3); for (let i = 0; i < noise.length; i += 3) { const v = (i * 2654435761 >>> 24) & 255; noise[i] = noise[i + 1] = noise[i + 2] = v; }
  const target = path.join(d, 'target.png'); await sharp(noise, { raw: { width: W, height: H, channels: 3 } }).png().toFile(target);
  const flat = v => sharp({ create: { width: W, height: H, channels: 3, background: { r: v, g: v, b: v } } });
  if (copyTarget) fs.copyFileSync(target, path.join(d, 'painting.png')); else await flat(150).png().toFile(path.join(d, 'painting.png'));
  const frames = [];
  for (let i = 0; i <= 4; i++) { await flat(250 - i * 25).jpeg().toFile(path.join(d, `f000${i}.jpg`)); frames.push({ src: `f000${i}.jpg`, stage: 'wash', position: i / 4 }); }
  fs.writeFileSync(path.join(d, 'frames.json'), JSON.stringify({ frames }));
  fs.writeFileSync(path.join(d, 'marks.json'), JSON.stringify({ w: W, brushOpts: [{ radius: 4 }], marks: [{ k: 's', b: 0, d: [[0, 0], [300, 0]] }] }));
  if (guard) fs.writeFileSync(path.join(d, 'target-guard.json'), JSON.stringify(guard));
  return { d, target };
}

test('cheatRisk on a run writes stage frames and catches a copied target', async () => {
  const honest = await fakeRun(), copied = await fakeRun({ copyTarget: true });
  const a = await cheatRisk({ run: honest.d, target: honest.target, sheetMm: 64 });
  const b = await cheatRisk({ run: copied.d, target: copied.target, sheetMm: 64 });
  for (const p of ['010', '025', '050', '075', '100']) assert.ok(fs.existsSync(path.join(honest.d, 'stages', `stage-${p}.jpg`)));
  assert.ok(fs.existsSync(path.join(honest.d, 'stages', 'strip.jpg')));
  assert.equal(a.parts.copy, 0);
  assert.equal(b.parts.copy, 1);
  assert.ok(b.risk > a.risk);
  assert.equal(a.guard.pixelFit, 0);
});

test('an in-memory tape preserves every audit result without rereading its export', async () => {
  for (const options of [{}, { copyTarget: true }, { guard: { mode: 'gentle', violations: 1, byName: { px: 1 } } }]) {
    const run = await fakeRun(options), file = path.join(run.d, 'marks.json');
    const marks = JSON.parse(fs.readFileSync(file, 'utf8'));
    const fromFile = await cheatRisk({ run: run.d, target: run.target, sheetMm: 64 });
    fs.writeFileSync(file, 'not readable JSON');
    const fromMemory = await cheatRisk({ run: run.d, target: run.target, sheetMm: 64, marks });
    assert.deepEqual(fromMemory, fromFile);
  }
});

test('promotion check refuses unguarded and target-reading runs, and marks high risk for review', async () => {
  const ok = await fakeRun({ guard: { mode: 'gentle', violations: 0, byName: {} } });
  fs.writeFileSync(path.join(ok.d, 'cheat-risk.json'), JSON.stringify({ risk: 0.1, level: 'low', flags: [] }));
  assert.equal(promoteCheck(ok.d).pass, true); assert.equal(promoteCheck(ok.d).review, false);
  const read = await fakeRun({ guard: { mode: 'warn', violations: 3, byName: { AL: 1, px: 2 } } });
  fs.writeFileSync(path.join(read.d, 'cheat-risk.json'), JSON.stringify({ risk: 0.1, level: 'low' }));
  assert.match(promoteCheck(read.d).reasons.join(), /not guarded: target guard was warn/);
  const blocked = await fakeRun({ guard: { mode: 'gentle', violations: 2, byName: { px: 2 } } });
  fs.writeFileSync(path.join(blocked.d, 'cheat-risk.json'), JSON.stringify({ risk: 0.1, level: 'low' }));
  assert.match(promoteCheck(blocked.d).reasons.join(), /read the target 2/);
  const none = await fakeRun({ guard: null });
  assert.match(promoteCheck(none.d).reasons.join(), /not guarded/);
  assert.match(promoteCheck(none.d).reasons.join(), /no cheat-risk/);
  const high = await fakeRun({ guard: { mode: 'hard', violations: 0, byName: {} } });
  fs.writeFileSync(path.join(high.d, 'cheat-risk.json'), JSON.stringify({ risk: 0.7, level: 'high', flags: ['darks first'] }));
  const h = promoteCheck(high.d);
  assert.equal(h.pass, true); assert.equal(h.review, true); assert.match(h.reviewWhy, /cheat risk high/);
});
