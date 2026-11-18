import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLines, DECIDE_DEFAULTS } from './ink-decide.mjs';
import { parseLabelReply, labelIdentity, simpleLabel, ruleAt, toneShadowTakes, shadowMassMask, labelRegions, INK_RULES, LABELS } from './ink-labels.mjs';
import { cutMassEdges, classifyPathDetail, CLASS } from './line-class.mjs';

const W = 160, H = 100, PX = 0.15;
// paper 90; a pen line (L 40, 2 px) along row 20; a dark wash block (L 55) on rows 60..99 whose top edge at row 60 has no line
function plane() {
  const L = new Float32Array(W * H).fill(90);
  for (let x = 0; x < W; x++) { L[20 * W + x] = 40; L[21 * W + x] = 40; }
  for (let y = 60; y < H; y++) for (let x = 0; x < W; x++) L[y * W + x] = 55;
  return L;
}
const line = (y, x0 = 5, x1 = 155) => ({ points: Array.from({ length: 31 }, (_, k) => ({ x: x0 + (x1 - x0) * k / 30, y })) });

test('a pen line is kept and a wash edge with no line of its own is cut', () => {
  const r = cutMassEdges([line(21, 5, 155), line(60, 5, 60)], plane(), W, H, PX);
  const ys = r.lines.map(g => g.points[0].y);
  assert.ok(ys.some(y => Math.abs(y - 21) < 1), 'the pen line stays');
  assert.ok(!ys.some(y => Math.abs(y - 60) < 1.5), 'the wash edge goes');
  assert.ok(r.stats.massBefore > 0.15 && r.stats.massAfter < 0.05, JSON.stringify(r.stats));
});

test('the label of the ground decides: foliage is wash only, architecture keeps the pen line', () => {
  const L = plane();
  const arch = decideLines([line(21, 5, 80)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'architecture' });
  assert.ok(arch.stats.keptPx > 60);
  const leaves = decideLines([line(21, 5, 40)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'foliage' }, { ...DECIDE_DEFAULTS, strongContrast: Infinity });
  // leaves are wash even for a strong stroke; a long smooth line through them is a branch and stays
  assert.equal(decideLines([line(21, 5, 40)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'foliage' }).stats.keptPx, 0);
  assert.ok(decideLines([line(21, 5, 90)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'foliage' }).stats.keptPx > 80);
  assert.equal(leaves.lines.length, 0);
  assert.ok(leaves.stats.droppedMm.short > 4, "a piece too short to be a branch is wash");
  const edge = decideLines([line(21, 5, 80)], { L, w: W, h: H, pxMm: PX, cellLabel: (x, y) => (y < 21 ? 'sky' : 'architecture') });
  assert.ok(edge.stats.keptPx > 60, 'a contour with architecture on one side is drawn');
});

test('a long smooth line that is pen line is structure whatever the ground says', () => {
  const r = decideLines([line(21, 0, 159)], { L: plane(), w: W, h: H, pxMm: 0.15, cellLabel: () => 'sky' });
  assert.ok(r.stats.keptPx > 100);
});

test('labels: replies are checked, the rules cover every label, a shadow mask finds a broad dark block', () => {
  assert.deepEqual(parseLabelReply('Here: {"1": "Sky", "2": "tree", "3": "banana"}', [1, 2, 3]), { 1: 'sky', 2: 'tree_trunk' });
  assert.equal(parseLabelReply('nothing', [1]), null);
  for (const l of LABELS) assert.ok(INK_RULES[l], l);
  assert.equal(simpleLabel({ area: 0.2, lab: [70, -10, 20], labSpread: [20], bbox: [0, 0, 10, 10] }, { w: 100, h: 100 }), 'foliage');
  assert.equal(simpleLabel({ area: 0.5, lab: [70, 0, 5], labSpread: [5], bbox: [0, 0, 10, 10] }, { w: 100, h: 100 }), 'sky');
  assert.equal(simpleLabel({ area: 0.96, lab: [70, 0, 5], labSpread: [5], bbox: [0, 0, 10, 10] }, { w: 100, h: 100 }), 'architecture', 'a whole-sheet paper ground (> 65% of the image) is not mistaken for a wash-only sky');
  assert.equal(ruleAt(() => 'face', 5, 5, 2).ink, 'features');
  const m = shadowMassMask(plane(), W, H, PX, { sigmaMm: 0.3, drop: 20, minAreaMm2: 0.5 });
  assert.equal(m[80 * W + 80], 1);
  assert.equal(m[5 * W + 80], 0);
});


async function labelFixture(t) {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { default: sharp } = await import('sharp');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-label-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'source.png');
  await sharp({ create: { width: 8, height: 8, channels: 3, background: '#dfdac9' } }).png().toFile(image);
  const regions = [1, 2].map(id => ({ id, area: .5, lab: [70, 0, 5], labSpread: [5], bbox: [0, 0, 8, 8] }));
  const opts = { image, regions, labelMap: Uint16Array.from({ length: 64 }, (_, i) => i < 32 ? 1 : 2), w: 8, h: 8,
    judge: 'codex', cacheDir: path.join(dir, 'cache'), env: { CODEX_BIN: process.execPath, AGY_BIN: process.execPath, INK_LABEL_MODEL: 'test-model' } };
  const good = () => ({ status: 0, stdout: '{"1":"architecture","2":"tree"}' });
  const cacheFile = () => path.join(opts.cacheDir, fs.readdirSync(opts.cacheDir)[0]);
  return { fs, dir, opts, good, cacheFile };
}

test('vision labels fail closed on process, image, parse and incomplete label failures', async t => {
  const { opts, fs } = await labelFixture(t);
  for (const run of [
    () => ({ status: 1, stderr: 'private provider output' }),
    () => ({ status: null, error: { code: 'ETIMEDOUT' } }),
    () => ({ status: 0, stdout: 'not JSON' }),
    () => ({ status: 0, stdout: '{"1":"architecture"}' }),
    () => ({ status: 0, stdout: '{"1":"architecture","2":"banana"}' }),
    () => ({ status: 0, stdout: '{"1":"architecture","2":{}}' }),
  ]) {
    await assert.rejects(labelRegions({ ...opts, run }), /ink labels \(codex\):.*(process failed|no valid|missing or unknown)/);
    assert.equal(fs.existsSync(opts.cacheDir), false);
  }
  fs.writeFileSync(opts.image, 'not an image');
  let called = false;
  await assert.rejects(labelRegions({ ...opts, run: () => { called = true; } }), /ink labels \(codex\):/);
  assert.equal(called, false, 'invalid source image must not reach the model');
});

test('explicit simple classification is unchanged and unknown or unresolved judges fail', async t => {
  const { opts, good, fs } = await labelFixture(t);
  const r = await labelRegions({ ...opts, judge: 'simple', run: () => assert.fail('simple must not invoke vision') });
  assert.deepEqual(r, { labels: { 1: 'sky', 2: 'sky' }, source: { 1: 'simple', 2: 'simple' }, judge: 'simple', cached: false });
  assert.equal(fs.existsSync(opts.cacheDir), false);
  await assert.rejects(labelRegions({ ...opts, judge: 'typo', run: good }), /unknown judge/);
  await assert.rejects(labelRegions({ ...opts, env: { CODEX_BIN: process.execPath }, run: good }), /set INK_LABEL_MODEL explicitly/);
});

test('complete vision labels retain aliases, pin model and reuse only valid vision cache', async t => {
  const { opts, good, fs, cacheFile } = await labelFixture(t);
  let called = 0;
  const r = await labelRegions({ ...opts, run: (command, args) => {
    called++; assert.equal(command, fs.realpathSync(process.execPath));
    assert.equal(args[args.indexOf('--model') + 1], 'test-model');
    assert.ok(fs.readFileSync(args[args.indexOf('-i') + 1]).subarray(1, 4).equals(Buffer.from('PNG')));
    return good();
  } });
  assert.deepEqual(r.labels, { 1: 'architecture', 2: 'tree_trunk' });
  assert.deepEqual(r.source, { 1: 'vision', 2: 'vision' });
  assert.equal(r.identity.model, 'test-model');
  assert.ok(r.identity.executable.sha256);
  const cached = await labelRegions({ ...opts, run: () => assert.fail('valid cache must not call model') });
  assert.deepEqual(cached, { ...r, cached: true }); assert.equal(called, 1);
  const original = fs.readFileSync(cacheFile(), 'utf8');
  for (const mutate of [
    d => { d.source[2] = 'simple'; }, d => { delete d.labels[2]; },
    d => { d.labels[2] = 'banana'; }, d => { d.labels[99] = 'sky'; },
    d => { d.identity.model = 'wrong-model'; }, d => { d.judge = 'simple'; },
  ]) {
    const d = JSON.parse(original); mutate(d); fs.writeFileSync(cacheFile(), JSON.stringify(d));
    await assert.rejects(labelRegions({ ...opts, run: () => assert.fail('corrupt cache must fail closed') }), /cached vision labels/);
  }
  fs.writeFileSync(cacheFile(), '{broken');
  await assert.rejects(labelRegions({ ...opts, run: good }), /ink labels \(codex\):/);
});

test('vision cache changes with model, actual map, dimensions, metadata, source and executable', async t => {
  const { opts, good, fs, dir } = await labelFixture(t);
  const { default: sharp } = await import('sharp');
  let calls = 0; const run = () => { calls++; return good(); };
  const first = await labelRegions({ ...opts, run });
  const changedMap = opts.labelMap.slice(); changedMap[0] = 2;
  const variants = [
    { env: { ...opts.env, INK_LABEL_MODEL: 'another-model' } },
    { labelMap: changedMap },
    { w: 16, h: 4 },
    { regions: opts.regions.map(r => ({ ...r, area: .4 })) },
  ];
  const ids = new Set([JSON.stringify(first.identity)]);
  for (const change of variants) {
    const r = await labelRegions({ ...opts, ...change, run });
    assert.equal(r.cached, false); ids.add(JSON.stringify(r.identity));
  }
  const exe = dir + '/runner'; fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n'); fs.chmodSync(exe, 0o700);
  const custom = { ...opts, env: { ...opts.env, CODEX_BIN: exe }, run };
  ids.add(JSON.stringify((await labelRegions(custom)).identity));
  fs.writeFileSync(exe, '#!/bin/sh\nexit 1\n');
  ids.add(JSON.stringify((await labelRegions(custom)).identity));
  await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toFile(opts.image);
  ids.add(JSON.stringify((await labelRegions({ ...opts, run })).identity));
  assert.equal(calls, 8); assert.equal(ids.size, 8);
});

test('prompt identity changes and map views hash only their actual bytes', async t => {
  const { opts } = await labelFixture(t);
  const args = { ...opts, model: 'test-model', executable: { path: '/runner', sha256: 'digest' }, prompt: 'first prompt' };
  const a = labelIdentity(args), b = labelIdentity({ ...args, prompt: 'revised prompt' });
  assert.notEqual(a.promptSHA256, b.promptSHA256);
  const backing = new Uint16Array(66); backing.set(opts.labelMap, 1);
  const view = backing.subarray(1, 65);
  assert.deepEqual(labelIdentity({ ...args, labelMap: view }), a);
  backing[0] = 99; assert.deepEqual(labelIdentity({ ...args, labelMap: view }), a);
  assert.throws(() => labelIdentity({ ...args, labelMap: new Uint8Array(1) }), /w \* h/);
});

test('agy pins the existing default model and cannot substitute simple on failure', async t => {
  const { opts, good } = await labelFixture(t);
  const r = await labelRegions({ ...opts, judge: 'agy', env: { AGY_BIN: process.execPath }, run: (_command, args) => {
    assert.equal(args[args.indexOf('--model') + 1], 'claude-sonnet-4-6'); return good();
  } });
  assert.equal(r.identity.model, 'claude-sonnet-4-6');
  assert.equal(r.judge, 'agy');
  await assert.rejects(labelRegions({ ...opts, judge: 'agy', run: () => ({ status: 1 }) }), /ink labels \(agy\): label process failed/);
});

test('a line that runs mostly into a wash-only ground is left off whole, not trimmed to its architecture end', () => {
  const L = plane();
  // Line crossing from architecture into sky:
  // x=10..14 is architecture (draws line); x=15..16 is within reach=2; x >= 17 is pure sky (r.ink === 'none')
  const crossing = { points: Array.from({ length: 20 }, (_, k) => ({ x: 10 + k, y: 21 })) };
  const r = decideLines([crossing], {
    L, w: W, h: H, pxMm: PX,
    cellLabel: (x) => (x < 15 ? 'architecture' : 'sky'),
  }, { strongContrast: Infinity, structureMm: Infinity });
  // 5 of 20 points lie on architecture: under half of the line is drawable, so none of it is drawn and none is trimmed
  assert.equal(r.lines.length, 0);
});

test('partial options object merges with defaults without dropping unmentioned options', () => {
  const L = plane();
  const r = decideLines([line(21, 5, 40)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'architecture' }, { keepLineShare: 0.4 });
  assert.ok(r.stats != null);
  assert.ok(r.stats.lines === 1);
});

const structuralCtx = (extra = {}) => ({ L: plane(), w: W, h: H, pxMm: PX, inputKind: 'line-map', cellLabel: () => 'architecture', ...extra });
test('source-model structural dark/light boundary survives with endpoints and pressure, including a tone shadow mask', () => {
  for (const label of ['architecture', 'ground']) {
    const g = line(60); g.widths = g.points.map((_, i) => 1 + i / 30); g.weights = g.points.map((_, i) => .2 + i / 30);
    const r = decideLines([g], structuralCtx({ cellLabel: () => label, shadow: new Uint8Array(W * H).fill(1) }));
    assert.equal(r.lines.length, 1);
    assert.deepEqual(r.lines[0].points[0], { x: 5, y: 60, width: 1, weight: .2 });
    assert.deepEqual(r.lines[0].points.at(-1), { x: 155, y: 60, width: 2, weight: 1.2 });
    assert.ok(r.stats.retainedStructuralMassMm > 20);
  }
});
test('structural exception is source-provenance bounded and rejects short, unsupported and wash-only contours', () => {
  assert.equal(decideLines([line(60)], structuralCtx({ inputKind: undefined })).lines.length, 0);
  assert.equal(decideLines([line(60, 5, 40)], structuralCtx()).lines.length, 0);
  assert.equal(decideLines([line(60)], structuralCtx({ L: new Float32Array(W * H).fill(90) })).lines.length, 0);
  for (const label of ['sky', 'water', 'foliage', 'shadow_mass']) {
    assert.equal(decideLines([line(60)], structuralCtx({ cellLabel: () => label })).lines.length, 0, label);
  }
  assert.equal(decideLines([line(60)], structuralCtx({ foliage: new Uint8Array(W * H).fill(1) })).lines.length, 0);
});
test('a structural contour is drawn whole across a short wash-only stretch and left off whole across a long one', () => {
  for (const label of ['sky', 'foliage', 'shadow_mass']) {
    const third = decideLines([line(60)], structuralCtx({ cellLabel: x => x > 55 && x < 105 ? label : 'architecture' }));
    assert.equal(third.lines.length, 1, label);
    assert.equal(third.stats.pieces, 1, label);
    const most = decideLines([line(60)], structuralCtx({ cellLabel: x => x > 15 && x < 145 ? label : 'architecture' }));
    assert.equal(most.lines.length, 0, label);
  }
});
function rasterContour(pxMm, kind) {
  const w = Math.round(48 / pxMm), h = Math.round(40 / pxMm), L = new Float32Array(w * h);
  const edge = x => kind === 'diagonal' ? 10 + .35 * x : kind === 'irregular' ? 20 + 3 * Math.sin(x * 2) : 20 - Math.sqrt(Math.max(0, 16 ** 2 - (x - 24) ** 2));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L[y * w + x] = y * pxMm >= edge(x * pxMm) ? 55 : 90;
  const points = [];
  for (let x = Math.round(12 / pxMm); x <= Math.round(36 / pxMm); x++) points.push({ x, y: Math.round(edge(x * pxMm) / pxMm) });
  return { g: { points }, ctx: { L, w, h, pxMm, inputKind: 'line-map', cellLabel: () => 'architecture' } };
}
test('quantized diagonals and smooth rims retain connected endpoints across physical image grids', () => {
  for (const pxMm of [.1, .2, .3]) for (const kind of ['diagonal', 'rim']) {
    const { g, ctx } = rasterContour(pxMm, kind), r = decideLines([g], ctx);
    assert.equal(r.lines.length, 1, kind + ' ' + pxMm);
    assert.deepEqual(r.lines[0].points[0], g.points[0]);
    assert.deepEqual(r.lines[0].points.at(-1), g.points.at(-1));
  }
});
test('irregular source mass contours gain no structural exemption', () => {
  const { g, ctx } = rasterContour(.15, 'irregular'), r = decideLines([g], ctx);
  assert.equal(r.stats.retainedStructuralMassMm ?? 0, 0);
  assert.ok(r.stats.keptPx < r.stats.lengthPx / 2);
});
test('decideFile forwards source-model provenance into the structural decision', async () => {
  const { decideFile } = await import('./ink-decide-file.mjs');
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'structural-provenance-'));
  try {
    for (const inputKind of [undefined, 'line-map']) {
      const doc = { image: { w: W, h: H }, inputKind, lines: [{ points: line(60).points.map(p => [p.x, p.y]) }] };
      const r = await decideFile({ doc, L: plane(), image: path.join(out, 'source.png'), out, stage: 'opening', pxMm: PX, shadowMask: false });
      assert.equal(r.lines.length, inputKind ? 1 : 0);
    }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('a model mass contour with an unsupported wash-only gap is whole when the gap is short', () => {
  const L = plane();
  for (let y = 0; y < H; y++) for (let x = 55; x <= 105; x++) L[y * W + x] = 90;
  assert.equal(classifyPathDetail(Array.from({ length: 151 }, (_, k) => ({ x: k + 5, y: 60 })), L, W, H, PX).cls[75], CLASS.faint);
  for (const label of ['foliage', 'sky', 'water', 'shadow_mass']) {
    const short = decideLines([line(60)], structuralCtx({ L, cellLabel: x => x >= 55 && x <= 105 ? label : 'architecture' }));
    assert.equal(short.lines.length, 1, label);
    assert.equal(short.stats.pieces, 1, label);
  }
});

test('local pen support through foliage keeps its ordinary rule inside a model structural contour', () => {
  const L = plane();
  for (let x = 45; x <= 115; x++) { L[59 * W + x] = 30; L[60 * W + x] = 30; }
  const r = decideLines([line(60)], structuralCtx({ L, cellLabel: x => x >= 45 && x <= 115 ? 'foliage' : 'architecture' }));
  assert.ok(r.lines.some(g => g.points.some(p => p.x > 65 && p.x < 95)), 'pen marks inside foliage remain eligible');
  assert.ok(r.stats.retainedStructuralMassMm > 0, 'not the old global mostly-pen exception');
});

// Exercise the production raster tracer, not hand-smoothed polylines. Fifteen L* of
// contrast is visible pen evidence without activating the strong-ink exemption.
async function tracedPenFixtures() {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { resolveLinePython } = await import('./line-python.mjs');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const script = String.raw`
import sys, importlib.util, json, cv2, numpy as np
sys.path.insert(0, 'tools/seg')
spec = importlib.util.spec_from_file_location('copylines', 'tools/seg/copy-lines.py')
copylines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(copylines)
fixtures = []
for px in [.15, 280/1080, 280/720]:
    w, h = int(80/px), int(50/px)
    for kind in ['straight', 'arc', 'S', 'wave', 'corner', 'fork', 'parallel', 'loop', 'erratic']:
        x = np.linspace(10, 70, 1201)
        y = 25 + .2*(x-40)
        if kind == 'arc': y = 35-np.sqrt(35**2-(x-40)**2)
        if kind == 'S': y = 25+8*np.sin((x-40)*np.pi/40)
        if kind == 'wave': y = 25+2*np.sin(x*np.pi/4)
        if kind == 'corner': y = 15+abs(x-40)*.4
        if kind == 'erratic': y = 25+3*np.sin(x*2)
        paths = [np.stack([x,y], axis=1)]
        if kind == 'fork': paths = [np.array([[10,40],[40,25],[70,25]]), np.array([[40,25],[60,10]])]
        if kind == 'parallel': paths.append(paths[0]+[0,2])
        if kind == 'loop':
            a = np.linspace(0, 2*np.pi, 1001)
            paths = [np.stack([40+15*np.cos(a),25+15*np.sin(a)], axis=1)]
        raster = np.full((h,w,3), 255, np.uint8)
        for path in paths: cv2.polylines(raster, [np.round(path/px).astype(np.int32)], False, (0,0,0), 1, cv2.LINE_8)
        lines, _, _, _ = copylines.plan(raster, kind='line-map', map_tolerance=.15)
        distance = cv2.distanceTransform((raster[:,:,0]>0).astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)*px
        L = 90-15*np.exp(-.5*(distance/.2)**2)
        fixtures.append(dict(kind=kind, pxMm=px, w=w, h=h, lines=lines, L=L.flatten().tolist()))
print(json.dumps(fixtures))
`;
  const result = spawnSync(resolveLinePython({ root }).path, ['-c', script], {
    cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' },
  });
  assert.equal(result.status, 0, `production trace fixture failed: ${result.error?.message ?? result.stderr}`);
  return JSON.parse(result.stdout);
}

test('sampled pen contours use physical curvature without rewriting the traced geometry', async t => {
  const { resample, turning, smoothPath } = await import('./ink-lines.mjs');
  const fixtures = await tracedPenFixtures();
  for (const f of fixtures) {
    const lines = f.lines.map((g, i) => ({ ...g, id: `${f.kind}-${i}` }));
    const before = structuredClone(lines);
    const ctx = { ...f, inputKind: 'line-map', cellLabel: () => 'tree_trunk' };
    const result = decideLines(lines, ctx);
    const name = `${f.kind} at ${f.pxMm} mm/cell`;
    assert.deepEqual(lines, before, name + ': source candidates are read-only');
    for (const piece of result.lines) {
      const source = lines.find(g => g.id === piece.id);
      assert.ok(source, name + ': retain source identity');
      const expected = resample(source.points.map(([x, y], k) => ({ x, y, width: source.widths[k], weight: source.weights[k] })), 1);
      const start = expected.findIndex(p => p.x === piece.points[0].x && p.y === piece.points[0].y && p.width === piece.points[0].width && p.weight === piece.points[0].weight);
      assert.ok(start >= 0, name + ': no invented starting point');
      assert.deepEqual(piece.points, expected.slice(start, start + piece.points.length), name + ': a retained piece never rewrites geometry or contact');
    }
    if (f.kind === 'erratic') {
      assert.ok(result.stats.keptPx < result.stats.lengthPx / 2, name + ': genuinely erratic geometry still fails');
      continue;
    }
    // Coarse weak curved ridges still fail local optical support. This change
    // must not pretend that physical curvature recovers absent source detail.
    if (f.pxMm > .3 && ['arc', 'wave'].includes(f.kind)) {
      t.diagnostic(`${name}: retained ${(100 * result.stats.keptPx / result.stats.lengthPx).toFixed(1)}%; coarse optical-support limit, not a required failure`);
      continue;
    }
    assert.equal(result.lines.length, lines.length, name + ': keep each contour/branch separately');
    assert.ok(Math.abs(result.stats.keptPx - result.stats.lengthPx) < 1e-7, name + ': no lost contour length');
    for (let i = 0; i < lines.length; i++) {
      const g = lines[i];
      const expected = resample(g.points.map(([x, y], k) => ({ x, y, width: g.widths[k], weight: g.weights[k] })), 1);
      assert.equal(result.lines[i].id, g.id, name);
      assert.deepEqual(result.lines[i].points, expected, name + ': endpoints, corners, loop and width/pressure stay on the original trace');
      if (f.kind === 'straight' && f.pxMm < .3) {
        assert.ok(turning(expected) / f.pxMm > DECIDE_DEFAULTS.elongatedDegPerMm, 'fixture reproduces raw staircase rejection');
        assert.ok(turning(smoothPath(expected, { sigma: DECIDE_DEFAULTS.smoothMm / f.pxMm })) / f.pxMm < DECIDE_DEFAULTS.structureDegPerMm);
      }
    }
    assert.deepEqual(lines, before, name + ': source candidates are read-only');
  }
});

// A pen line drawn inside a dark wash: wash L 55 everywhere, pen L 45 on rows 20..21. Its own contrast is a pen line's (>= penContrast 5)
// but under the shadow rule's floor (10): the case a tone-mass shadow over trunk or foliage used to wipe out (cma: 6.7% of the pen kept).
const inWash = () => { const L = new Float32Array(W * H).fill(55); for (let x = 0; x < W; x++) { L[20 * W + x] = 45; L[21 * W + x] = 45; } return L; };
const dark = () => new Uint8Array(W * H).fill(1);
const mmPx = mm => mm / PX;
const seg = (mm, y = 21, x0 = 5) => line(y, x0, x0 + mmPx(mm));
test('a pen line in a dark wash is the right kind to test: pen class, under the shadow floor', () => {
  const { cls, contrast } = classifyPathDetail(Array.from({ length: 40 }, (_, k) => ({ x: 20 + k, y: 20.5 })), inWash(), W, H, PX);
  assert.ok(cls.slice(4, -4).every(c => c === CLASS.pen));
  assert.ok(contrast.slice(4, -4).every(c => c >= DECIDE_DEFAULTS.penContrast && c < INK_RULES.shadow_mass.penContrast), `${[...contrast.slice(4, 8)]}`);
});

test('a tone-mass shadow never takes wash-only or trunk ground, only ground that draws structure or outline', () => {
  assert.equal(toneShadowTakes('tree_trunk'), false);
  assert.equal(toneShadowTakes('foliage'), false);
  assert.equal(toneShadowTakes('sky'), false);
  assert.equal(toneShadowTakes('water'), false);
  for (const label of ['architecture', 'ground', 'figure', 'drapery', 'shadow_mass']) assert.equal(toneShadowTakes(label), true, label);
  assert.equal(toneShadowTakes(undefined), false);
  const ctx = label => ({ L: inWash(), w: W, h: H, pxMm: PX, inputKind: 'line-map', cellLabel: () => label, shadow: dark() });
  // a trunk stroke (7 mm, over the trunk's 6 mm) inside a dark wash keeps the trunk's rule, with no shadow floor
  const trunk = decideLines([seg(7)], ctx('tree_trunk'));
  assert.equal(trunk.lines.length, 1);
  assert.equal(trunk.lines[0].inkLabel, 'tree_trunk');
  assert.equal(trunk.stats.droppedMm.label.shadow_mass ?? 0, 0);
  // the same stroke on architecture in a dark wash still meets the shadow's floor: a wash edge there is not drawn
  const arch = decideLines([seg(7)], ctx('architecture'));
  assert.equal(arch.lines.length, 0);
  assert.ok(arch.stats.droppedMm.label.shadow_mass > 5);
});

test('observed source ink is pen by construction, except on leaves: foliage takes only a long smooth branch, a trunk keeps its turning strokes, wash edges and faint marks go', async () => {
  const ctx = (inputKind, extra = {}) => ({ L: inWash(), w: W, h: H, pxMm: PX, inputKind, cellLabel: () => 'foliage', shadow: dark(), ...extra });
  // a 3 mm stroke is under the foliage minimum (8 mm): leaves are wash, whatever made the line (Sam: ink goes on branches, not on leaves)
  for (const kind of [undefined, 'line-map', 'stroke']) assert.equal(decideLines([seg(3)], ctx(kind)).lines.length, 0, String(kind));
  // a long smooth stroke through the leaves is a branch and stays, drawn in observed ink
  const branch = decideLines([seg(12)], ctx('stroke'));
  assert.equal(branch.lines.length, 1);
  // the same 3 mm stroke on a trunk is drawn in observed ink
  const trunk = decideLines([seg(3)], ctx('stroke', { cellLabel: () => 'tree_trunk' }));
  assert.equal(trunk.lines.length, 1);
  assert.equal(trunk.lines[0].inkMinMm, 0, 'the salience step does not undo it');
  assert.ok(Math.abs(trunk.stats.keptPx * PX - 3) < 0.3);
  // a strong dark stroke in foliage is still a leaf
  const strongL = inWash(); for (let x = 5; x < 25; x++) { strongL[20 * W + x] = 10; strongL[21 * W + x] = 10; }
  assert.equal(decideLines([seg(3)], { ...ctx('stroke'), L: strongL }).lines.length, 0);
  // a scallop (two loops of 1.2 mm radius, 15 mm of pen) turns faster than a branch may: drawn only in observed ink
  const loopL = inWash(), loop = { points: [] };
  for (let k = 0; k <= 80; k++) { const a = k / 80 * 4 * Math.PI, x = 60 + 8 * Math.cos(a), y = 50 + 8 * Math.sin(a); loop.points.push({ x, y }); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) loopL[Math.round(y + dy) * W + Math.round(x + dx)] = 35; }
  const { resample, turning, smoothPath } = await import('./ink-lines.mjs');
  assert.ok(turning(smoothPath(resample(loop.points, 1), { sigma: DECIDE_DEFAULTS.smoothMm / PX })) / PX > DECIDE_DEFAULTS.elongatedDegPerMm, 'the loop turns too fast for a branch');
  const turny = kind => decideLines([loop], { L: loopL, w: W, h: H, pxMm: PX, inputKind: kind, cellLabel: () => 'tree_trunk' });
  assert.equal(turny('line-map').lines.length, 0, 'a learned line map: too turny for a branch');
  assert.ok(turny('stroke').stats.keptPx > 0.95 * turny('stroke').stats.lengthPx, 'observed ink: drawn');
  // a wash edge with no pen line of its own (the plane's L 55 to 90 step on row 60) is still cut from observed ink
  const edgeL = plane();
  const edge = decideLines([line(60, 5, 60)], { L: edgeL, w: W, h: H, pxMm: PX, inputKind: 'stroke', cellLabel: () => 'foliage' });
  assert.equal(edge.lines.length, 0);
  // no ink at all: nothing to draw, in any ground that is wash-only
  const none = decideLines([seg(3, 40)], { L: new Float32Array(W * H).fill(90), w: W, h: H, pxMm: PX, inputKind: 'stroke', cellLabel: () => 'foliage' });
  assert.equal(none.lines.length, 0);
  // sky stays wash only, observed ink or not
  assert.equal(decideLines([seg(3)], { ...ctx('stroke'), cellLabel: () => 'sky' }).lines.length, 0);
});

// ---- whole lines: a line is kept whole or dropped whole, never sliced at a mass or faint stretch ----
const arcMm = (pts, px) => { let s = 0; for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return s * px; };
const poly = (...runs) => ({ points: runs.flatMap(([y, x0, x1]) => { const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 5) + 1); return Array.from({ length: n }, (_, k) => ({ x: x0 + (x1 - x0) * k / (n - 1), y })); }) });
const ARCH = { L: plane(), w: W, h: H, pxMm: PX, cellLabel: () => 'architecture' };

test('a contour with a short mass stretch in it is kept whole, not sliced into pieces', () => {
  // pen along row 21, over to the wash block's bare top edge at row 60, and back to the pen line
  const g = poly([21, 5, 75], [60, 75, 95], [21, 95, 155]);
  const r = decideLines([g], ARCH);
  assert.equal(r.lines.length, 1, 'one line out for one line in');
  const ends = l => [l.points[0], l.points.at(-1)];
  assert.deepEqual(ends(r.lines[0]), ends(g), 'it runs from the pool line\'s first point to its last');
  assert.ok(Math.abs(arcMm(r.lines[0].points, PX) - arcMm(g.points, PX)) < 0.01, 'none of its length is cut');
  assert.equal(r.stats.pieces, 1);
  assert.ok(r.stats.keptPx > 0);
});

test('a contour that is mostly mass edge is dropped whole, with no short pen piece left behind', () => {
  const g = poly([21, 5, 30], [60, 30, 140]);
  const r = decideLines([g], ARCH);
  assert.equal(r.lines.length, 0);
  assert.ok(r.stats.droppedMm.whole > 0, 'the live part is counted as dropped with its line');
});

test('lines out never exceed lines in, and kept plus dropped length is the input length', () => {
  const gs = [poly([21, 5, 155]), poly([21, 5, 75], [60, 75, 95], [21, 95, 155]), poly([60, 5, 140]), poly([21, 5, 30], [60, 30, 140])];
  const r = decideLines(gs, ARCH);
  assert.ok(r.lines.length <= gs.length);
  const s = r.stats, dropped = s.droppedMm.mass + s.droppedMm.faint + s.droppedMm.short + s.droppedMm.whole + Object.values(s.droppedMm.label).reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(s.keptPx * PX + dropped - s.lengthPx * PX) < 0.05 * s.lengthPx * PX, JSON.stringify(s));
});

test('a line with a wash-only label under most of it is dropped whole; with the label under a minority it stays whole', () => {
  const g = poly([21, 5, 150]);
  const mostlySky = decideLines([g], { ...ARCH, cellLabel: x => (x < 100 ? 'sky' : 'architecture') }, { ...DECIDE_DEFAULTS, strongContrast: Infinity, structureMm: Infinity });
  assert.equal(mostlySky.lines.length, 0);
  const littleSky = decideLines([g], { ...ARCH, cellLabel: x => (x < 40 ? 'sky' : 'architecture') }, { ...DECIDE_DEFAULTS, strongContrast: Infinity, structureMm: Infinity });
  assert.equal(littleSky.lines.length, 1);
  assert.ok(Math.abs(arcMm(littleSky.lines[0].points, PX) - arcMm(g.points, PX)) < 0.01);
});

test('the lines dropped are returned with the reason that mostly cut them, so a joint between kept lines can be restored', () => {
  const mass = decideLines([poly([21, 5, 30], [60, 30, 140])], ARCH);
  assert.equal(mass.dropped.length, 1);
  assert.equal(mass.dropped[0].dropWhy, 'mass');
  const sky = decideLines([poly([21, 5, 150])], { ...ARCH, cellLabel: () => 'sky' }, { ...DECIDE_DEFAULTS, strongContrast: Infinity, structureMm: Infinity });
  assert.equal(sky.dropped[0].dropWhy, 'label');
  assert.equal(decideLines([poly([21, 5, 150])], ARCH).dropped.length, 0, 'a kept line is not in it');
});
