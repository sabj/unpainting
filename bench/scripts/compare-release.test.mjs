// Release comparison page: gates, prior selection, rows, client helpers, page output.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {
  readImageSize, parsePlateDir, gatePlate, scanPlates, loadPriors, loadSelfScores, buildRows, indexedOf,
} from './compare-release-collect.mjs';
import { voteKey, tally, votesToCsv, frameAt, nextVote } from './compare-release-client.mjs';
import { renderPage, esc } from './compare-release-page.mjs';
import { IMPROVED, validateImproved } from './compare-release-improved.mjs';
import { generate, parseArgs } from './compare-release.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-rel-'));
const jpg = (w, h, rgb = { r: 200, g: 100, b: 50 }) => sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).jpeg().toBuffer();
const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();
const webp = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 90, g: 90, b: 90 } } }).webp().toBuffer();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const COMMIT = '6c6faa6cb66f5a7935186c2336c2770924742bf2';

async function makePlate(dir, o = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const n = o.frames ?? 4;
  const width = o.paintWidth ?? (/france/.test(dir) ? 1216 : /hills/.test(dir) ? 1224 : 1200);
  const commit = 'commit' in o ? o.commit : COMMIT;
  const card = {
    provenance: { backend: { adapterEvidence: { adapterInfo: { vendor: 'nvidia', device: o.device ?? 'l40s' } } } },
    subject: 'X', codeSHA: commit, cleanTree: o.clean ?? true, exit: 'exit' in o ? o.exit : 0, seconds: o.seconds ?? 200,
    args: o.args ?? ['--gpu', 'on', '--width', '1200'],
    targetSHA256: o.targetSha ?? null,
    gpuBackend: { backend: o.backend ?? 'gpu' },
    dimensions: 'dims' in o ? o.dims : { sourceWidth: o.sourceWidth ?? 300, sourceHeight: 259, paintWidth: width, paintHeight: 1036, enlargement: 4 },
    segments: { backend: o.sam ?? 'sam', model: { model: 'vit_b', device: 'cuda' } },
  };
  fs.writeFileSync(path.join(dir, 'run-card.json'), JSON.stringify(card));
  fs.writeFileSync(path.join(dir, 'backend.json'), JSON.stringify({ release: o.release ?? '0.3.2', commit, backend: o.backend ?? 'gpu', fallback: o.fallback ?? false }));
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ release: o.release ?? '0.3.2', commit, width, height: 1036, frames: Array.from({ length: n }, (_, i) => ({ src: `f${String(i).padStart(4, '0')}.jpg`, stage: i === n - 1 ? 'finished' : 'wash', position: i / (n - 1) })) }));
  if (!o.noFrameFiles) for (let i = 0; i < n; i++) fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), await jpg(width, 1036, { r: 20 * i, g: 80, b: 80 }));
  fs.writeFileSync(path.join(dir, 'painting.jpg'), await jpg(width, 1036));
  if (o.score) fs.writeFileSync(path.join(dir, 'score.json'), JSON.stringify(o.score));
  return dir;
}

// ---------- image headers
test('readImageSize reads png, jpeg and webp headers', async () => {
  assert.deepEqual(readImageSize(await png(31, 17)), { w: 31, h: 17 });
  assert.deepEqual(readImageSize(await jpg(33, 19)), { w: 33, h: 19 });
  assert.deepEqual(readImageSize(await webp(35, 21)), { w: 35, h: 21 });
  assert.equal(readImageSize(Buffer.from('nope')), null);
});

// ---------- gates
const base = () => ({ release: '0.3.2', commit: COMMIT, exit: 0, backend: 'gpu', fallback: false, argsGpuOff: false, sourceWidth: 300, paintWidth: 1200, cleanTree: true, targetSHA256: null, framesListed: 4, framesFound: 4 });
const codes = l => l.map(x => x.code);

test('gate: matching commit prefix and a supported 300px source are admitted', () => {
  const g = gatePlate(base(), { expectedCommit: '6c6faa6' });
  assert.equal(g.admitted, true);
  assert.deepEqual(codes(g.refused), []);
  assert.deepEqual(codes(g.marks), []);
});
test('gate: commit that differs from the labelled commit is refused', () => {
  const g = gatePlate({ ...base(), commit: '20676e99e724d4bbac79ce2fc095526b2138f0f2' }, { expectedCommit: '6c6faa6' });
  assert.equal(g.admitted, false);
  assert.ok(codes(g.refused).includes('commit-mismatch'));
});
test('gate: a plate with no recorded commit is refused, since it cannot be checked', () => {
  const g = gatePlate({ ...base(), commit: null }, { expectedCommit: '6c6faa6' });
  assert.ok(codes(g.refused).includes('commit-missing'));
});
test('gate: no labelled commit known for the release refuses the plate', () => {
  const g = gatePlate(base(), { expectedCommit: null });
  assert.ok(codes(g.refused).includes('commit-unlabelled'));
});
test('gate: CPU backend, fallback and --gpu off are all refused', () => {
  for (const patch of [{ backend: 'cpu' }, { fallback: true }, { argsGpuOff: true }, { backend: null }]) {
    const g = gatePlate({ ...base(), ...patch }, { expectedCommit: '6c6faa6' });
    assert.ok(codes(g.refused).includes('cpu'), JSON.stringify(patch));
  }
});
test('gate: render narrower than 540 px is refused; strict also refuses low-res sources', () => {
  assert.ok(codes(gatePlate({ ...base(), paintWidth: 300 }, { expectedCommit: '6c6faa6' }).refused).includes('low-res-render'));
  assert.ok(codes(gatePlate({ ...base(), sourceWidth: 299 }, { expectedCommit: '6c6faa6', strict: true }).refused).includes('low-res-source'));
  assert.equal(gatePlate(base(), { expectedCommit: '6c6faa6', strict: true }).admitted, true);
  assert.equal(gatePlate({ ...base(), sourceWidth: 1600 }, { expectedCommit: '6c6faa6', strict: true }).admitted, true);
});
test('gate: unknown source width is marked, not silently passed', () => {
  const g = gatePlate({ ...base(), sourceWidth: null }, { expectedCommit: '6c6faa6' });
  assert.ok(codes(g.marks).includes('source-unknown'));
});
test('gate: wrong target hash is refused; dirty tree and missing frames are marked', () => {
  const g = gatePlate({ ...base(), targetSHA256: 'aa', cleanTree: false, framesFound: 2 }, { expectedCommit: '6c6faa6', targetSha256: 'bb' });
  assert.ok(codes(g.refused).includes('target-mismatch'));
  assert.ok(codes(g.marks).includes('dirty-tree'));
  assert.ok(codes(g.marks).includes('frames-missing'));
});

// ---------- plate parsing
test('parsePlateDir reads provenance only from the run records', async () => {
  const root = tmp();
  const dir = await makePlate(path.join(root, 'ab', 'v031-final', 'opus1-france'), { seconds: 321 });
  const p = parsePlateDir(dir);
  assert.equal(p.model, 'opus');
  assert.equal(p.try, 1);
  assert.equal(p.subject, 'south-france');
  assert.equal(p.release, '0.3.2');
  assert.equal(p.commit, COMMIT);
  assert.equal(p.seconds, 321);
  assert.equal(p.gpu, 'nvidia l40s');
  assert.equal(p.sam, 'sam vit_b (cuda)');
  assert.equal(p.paintWidth, 1216);
  assert.equal(p.sourceWidth, 300);
  assert.equal(p.framesListed, 4);
  assert.equal(p.framesFound, 4);
  assert.equal(p.backend, 'gpu');
});
test('parsePlateDir reads the rerender layout <round>/<model>/<try>/<subject>-raw', async () => {
  const root = tmp();
  const dir = await makePlate(path.join(root, 'v4-pipeline', 'astra', '2', 'sargent-raw'));
  const p = parsePlateDir(dir);
  assert.deepEqual([p.model, p.try, p.subject, p.round], ['astra', 2, 'sargent', 'v4-pipeline']);
});
test('parsePlateDir finds no source width when run records lack dimensions, and reads --image from args', async () => {
  const root = tmp();
  const img = path.join(root, 'targets', 'mittens.png');
  fs.mkdirSync(path.dirname(img), { recursive: true });
  fs.writeFileSync(img, await png(300, 259));
  const dir = await makePlate(path.join(root, 'ab', 'v030', 'opus1-mittens'), { dims: null, release: '0.1.1', args: ['--image', img, '--gpu', 'on'] });
  const p = parsePlateDir(dir);
  assert.equal(p.sourceWidth, 300);
  const dir2 = await makePlate(path.join(root, 'ab', 'v030', 'opus1-hills'), { dims: null, release: '0.1.1', args: ['--image', '/nope/x.png'] });
  assert.equal(parsePlateDir(dir2).sourceWidth, null);
});
test('scanPlates admits and refuses by release label and dedups equal plates', async () => {
  const root = tmp();
  await makePlate(path.join(root, 'ab', 'v031-final', 'opus1-france'));
  await makePlate(path.join(root, 'ab', 'v031-final', 'opus2-france'), { commit: '20676e99e724d4bbac79ce2fc095526b2138f0f2' });
  await makePlate(path.join(root, 'ab', 'v030', 'opus1-france'), { release: '0.1.1', commit: '70ceb7c0000000000000000000000000000000000' });
  await makePlate(path.join(root, 'rr', 'v4-pipeline', 'opus', '1', 'south-france-raw'));
  const plates = scanPlates([root], { expected: { '0.3.2': '6c6faa6', '0.1.1': '70ceb7c' } });
  const ok = plates.filter(p => p.gate.admitted);
  assert.equal(plates.length, 3, 'duplicate of opus 1 france is folded in');
  assert.equal(ok.length, 2);
  const dup = plates.find(p => p.model === 'opus' && p.try === 1 && p.release === '0.3.2');
  assert.equal(dup.alsoAt.length, 1);
  assert.ok(plates.find(p => p.try === 2).gate.refused.some(r => r.code === 'commit-mismatch'));
});

test('scanPlates takes the source width from the target only when the card hash matches it', async () => {
  const root = tmp();
  const t = await png(300, 259);
  await makePlate(path.join(root, 'v031-final', 'opus1-mittens'), { dims: null, targetSha: sha(t) });
  await makePlate(path.join(root, 'v031-final', 'opus1-hills'), { dims: null, targetSha: 'other' });
  const plates = scanPlates([root], { expected: { '0.3.2': '6c6faa6' }, targetOf: s => ({ sha: sha(t), width: 300 }) });
  assert.equal(plates.find(p => p.subject === 'mittens').sourceWidth, 300);
  const hills = plates.find(p => p.subject === 'hills');
  assert.equal(hills.sourceWidth, null);
  assert.ok(hills.gate.refused.some(r => r.code === 'target-mismatch'));
});

// ---------- priors
function writeRun(runs, round, model, tryN, o) {
  const dir = path.join(runs, round, model, String(tryN));
  fs.mkdirSync(dir, { recursive: true });
  const crops = {};
  for (const [crop, c] of Object.entries(o.crops)) {
    crops[crop] = {
      strokes: 100, minutes: c.minutes ?? 10, sheet: { W: 300, H: 259 },
      images: { final: `${crop}.webp`, stages: `${crop}-stages.webp` },
      score: c.composite == null ? { composite: null } : { composite: c.composite },
      progression: c.prog == null ? null : { mean: c.prog },
    };
    if (!c.noImage) {
      fs.writeFileSync(path.join(dir, `${crop}.webp`), c.img);
      fs.writeFileSync(path.join(dir, `${crop}-stages.webp`), c.img);
    }
  }
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({
    schema: 'unpaint-bench/run@2', round: round.slice(0, 2).toUpperCase(), release: o.release, painterVersion: 'V096', simVersion: '100', commit: o.commit ?? null,
    painter: { key: model, name: model }, try: tryN, settings: { machine: 'cloud GPU (NVIDIA L40S)', paintWidth: { hills: 1224, mittens: 1200 } },
    cheat: { disqualified: !!o.dq }, complete: true, crops,
  }));
}

test('loadPriors picks the best J1 composite per subject and model across rounds, releases and tries', async () => {
  const runs = path.join(tmp(), 'runs');
  const img = await webp(300, 259);
  writeRun(runs, 'v1-naive', 'argon', 1, { release: '0.1.1', crops: { mittens: { composite: 5.0, img } } });
  writeRun(runs, 'v4-pipeline', 'argon', 3, { release: '0.1.1', crops: { mittens: { composite: 6.7, img, prog: 2.5 } } });
  writeRun(runs, 'v4-pipeline', 'argon', 2, { release: '0.1.0', crops: { mittens: { composite: 6.1, img } } });
  writeRun(runs, 'v5-self-study', 'argon', 1, { release: '0.1.1', crops: { mittens: { composite: 9.9, img } }, dq: true });
  writeRun(runs, 'v4-pipeline', 'opus', 1, { release: '0.1.0', crops: { mittens: { composite: null, img } } });
  const { priors, scanned } = loadPriors(runs, { selfScores: { mittens: 8.76 } });
  const a = priors.get('mittens|argon');
  assert.equal(a.composite, 6.7);
  assert.equal(a.round, 'V4');
  assert.equal(a.try, 3);
  assert.equal(a.release, '0.1.1');
  assert.equal(a.progression, 2.5);
  assert.ok(Math.abs(a.indexed - 100 * 6.7 / 8.76) < 1e-9);
  assert.equal(a.machine, 'cloud GPU (NVIDIA L40S)');
  assert.equal(a.commit, null);
  assert.equal(a.imageWidth, 300);
  assert.equal(priors.has('mittens|opus'), false, 'unscored runs are never a prior');
  assert.equal(scanned.runs, 5);
});
test('loadPriors honours a release filter', async () => {
  const runs = path.join(tmp(), 'runs');
  const img = await webp(300, 259);
  writeRun(runs, 'v4-pipeline', 'opus', 1, { release: '0.1.0', crops: { mittens: { composite: 6.5, img } } });
  writeRun(runs, 'v4-pipeline', 'argon', 1, { release: '0.1.1', crops: { mittens: { composite: 6.0, img } } });
  const { priors } = loadPriors(runs, { releases: ['0.1.1', '0.2.1', '0.1.1'] });
  assert.deepEqual([...priors.keys()], ['mittens|argon']);
});
test('loadPriors skips a prior whose image is missing', async () => {
  const runs = path.join(tmp(), 'runs');
  writeRun(runs, 'v4-pipeline', 'opus', 1, { release: '0.1.0', crops: { mittens: { composite: 6.5, noImage: true } } });
  assert.equal(loadPriors(runs).priors.size, 0);
});
test('indexedOf and loadSelfScores', () => {
  assert.equal(indexedOf(4, 8), 50);
  assert.equal(indexedOf(null, 8), null);
  assert.equal(indexedOf(4, undefined), null);
  const d = tmp();
  fs.mkdirSync(path.join(d, 'results'));
  fs.writeFileSync(path.join(d, 'results', 'results.json'), JSON.stringify({ crops: [{ key: 'hills', selfScore: 8.43 }] }));
  assert.deepEqual(loadSelfScores(path.join(d, 'runs')), { hills: 8.43 });
  assert.deepEqual(loadSelfScores(path.join(d, 'none', 'runs')), {});
});

// ---------- rows
test('buildRows lists every subject and model, with gaps shown as gaps, and not scored when absent', () => {
  const priors = new Map([['mittens|argon', { composite: 6, indexed: 70 }]]);
  const plates = [
    { subject: 'mittens', model: 'argon', try: 1, release: '0.3.2', gate: { admitted: true }, score: null },
    { subject: 'mittens', model: 'argon', try: 1, release: '0.1.1', gate: { admitted: true }, score: { j1: { composite: 5 } } },
  ];
  const rows = buildRows({ plates, priors, subjects: ['mittens', 'hills'], models: ['argon', 'opus'] });
  assert.equal(rows.length, 4);
  const r = rows.find(x => x.subject === 'mittens' && x.model === 'argon');
  assert.equal(r.prior.composite, 6);
  assert.equal(r.repaint.release, '0.1.1');
  assert.equal(r.plate.release, '0.3.2');
  const gap = rows.find(x => x.subject === 'hills' && x.model === 'opus');
  assert.equal(gap.prior, null);
  assert.equal(gap.plate, null);
});
test('buildRows makes a row per try when several 0.3.2 plates exist', () => {
  const plates = [1, 2].map(t => ({ subject: 'hills', model: 'opus', try: t, release: '0.3.2', gate: { admitted: true } }));
  const rows = buildRows({ plates, priors: new Map(), subjects: ['hills'], models: ['opus'] });
  assert.deepEqual(rows.map(r => r.try), [1, 2]);
});

// ---------- client helpers
test('client: voteKey is stable, tally counts, csv escapes', () => {
  assert.equal(voteKey('hills', 'opus', 1, 'prior-vs-plate'), 'hills|opus|1|prior-vs-plate');
  const votes = { a: { choice: 'new' }, b: { choice: 'new' }, c: { choice: 'old' }, d: { choice: 'tie' }, e: { choice: 'neither' } };
  assert.deepEqual(tally(votes), { new: 2, old: 1, tie: 1, neither: 1, total: 5 });
  const csv = votesToCsv({ 'hills|opus|1|prior-vs-plate': { choice: 'new', at: '2026-01-01T00:00:00Z', note: 'a "b", c' } });
  assert.match(csv, /^pair,subject,model,try,kind,choice,at,note\n/);
  assert.match(csv, /"a ""b"", c"/);
});
test('client: nextVote toggles a vote off when pressed twice', () => {
  const v = nextVote({}, 'k', 'new', 'T');
  assert.equal(v.k.choice, 'new');
  assert.deepEqual(nextVote(v, 'k', 'new', 'T'), {});
  assert.equal(nextVote(v, 'k', 'old', 'T').k.choice, 'old');
});
test('client: frameAt maps a 0..1 slider to every frame index', () => {
  assert.equal(frameAt(0, 21), 0);
  assert.equal(frameAt(1, 21), 20);
  assert.equal(frameAt(0.5, 21), 10);
  assert.equal(frameAt(5, 3), 2);
  assert.equal(frameAt(0.5, 0), -1);
});

// ---------- improved data
test('improved data file validates and each look pair names a subject and model', () => {
  assert.ok(IMPROVED.length >= 3);
  assert.deepEqual(validateImproved(IMPROVED), []);
  assert.ok(validateImproved([{ id: 'x' }]).length > 0);
  assert.ok(validateImproved([{ id: 'x', subsystem: 's', summary: 't', files: [], commits: [], look: [{ subject: 'a' }] }]).some(e => /look/.test(e)));
});

// ---------- page
async function fixtureWorld() {
  const root = tmp();
  const runs = path.join(root, 'bench', 'runs');
  const targets = path.join(root, 'bench', 'v2', 'targets');
  fs.mkdirSync(targets, { recursive: true });
  const t = await png(300, 259);
  fs.writeFileSync(path.join(targets, 'mittens.png'), t);
  writeRun(runs, 'v4-pipeline', 'argon', 1, { release: '0.1.1', crops: { mittens: { composite: 6.7, img: await webp(300, 259) } } });
  const ab = path.join(root, 'ab');
  await makePlate(path.join(ab, 'v031-final', 'argon1-mittens'), { frames: 5, seconds: 111, targetSha: sha(t) });
  await makePlate(path.join(ab, 'v031-final', 'opus1-mittens'), { commit: '8ba139a000000000000000000000000000000000' });
  await makePlate(path.join(ab, 'v031-final', 'astra1-mittens'), { backend: 'cpu' });
  await makePlate(path.join(ab, 'v030', 'argon1-mittens'), { release: '0.1.1', commit: '70ceb7c000000000000000000000000000000000', frames: 3 });
  return { root, runs, ab, targets };
}

test('generate writes a self-contained page: every frame, refusals, not scored, provenance from records', async () => {
  const w = await fixtureWorld();
  const out = path.join(w.root, 'out', 'comparison.html');
  const res = await generate({ runs: w.runs, plateRoots: [w.ab], out, expected: { '0.3.2': '6c6faa6', '0.1.1': '70ceb7c' }, targetsDir: w.targets, frameWidth: 64 });
  const html = fs.readFileSync(out, 'utf8');
  assert.equal(res.admitted, 2);
  assert.equal(res.refused, 2);
  assert.match(html, /not scored/);
  assert.match(html, /commit-mismatch|commit differs/i);
  assert.match(html, /cpu/i);
  assert.match(html, /nvidia l40s/);
  assert.match(html, />111</, 'seconds read from the run card');
  assert.match(html, /6c6faa6/);
  assert.doesNotMatch(html, /(src|href)="https?:/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  const data = JSON.parse(/<script type="application\/json" id="cmp-data">([\s\S]*?)<\/script>/.exec(html)[1]);
  const argon = data.rows.find(r => r.model === 'argon');
  assert.equal(argon.plate.frames.length, 5, 'all five frames in playback');
  assert.equal(argon.repaint.frames.length, 3);
  assert.ok(argon.plate.frames[0].src.startsWith('data:image/'));
  const opus = data.rows.find(r => r.model === 'opus');
  assert.equal(opus.plate.refused.length > 0, true);
  assert.equal(opus.plate.final, undefined, 'refused plate carries no image');
  assert.equal(opus.plate.frames, undefined);
  const astra = data.rows.find(r => r.model === 'astra');
  assert.ok(astra.plate.refused.some(r => r.code === 'cpu'));
});
test('renderPage escapes text from run records', () => {
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  const html = renderPage({ rows: [], improved: [], meta: { title: 'x', generatedAt: 'now', labelledCommits: {}, counts: {}, priorReleases: [] } });
  assert.match(html, /<!doctype html>/i);
});
test('parseArgs accepts the documented flags and rejects unknown ones', () => {
  const o = parseArgs(['--out', '/tmp/x.html', '--expect', '0.3.2=abc123', '--strict', '--releases', '0.1.1,0.1.0']);
  assert.equal(o.out, '/tmp/x.html');
  assert.equal(o.expected['0.3.2'], 'abc123');
  assert.equal(o.strict, true);
  assert.deepEqual(o.releases, ['0.1.1', '0.1.0']);
  assert.throws(() => parseArgs(['--bogus']), /unknown option/);
  assert.throws(() => parseArgs(['--out']), /requires a value/);
});

test('improved data names files and commits that exist in this checkout', async () => {
  const { spawnSync } = await import('node:child_process');
  const root = path.resolve(import.meta.dirname, '..', '..');
  for (const e of IMPROVED) {
    for (const f of e.files) assert.ok(fs.existsSync(path.join(root, f)), `${e.id}: missing file ${f}`);
    for (const c of e.commits) assert.equal(spawnSync('git', ['cat-file', '-e', `${c}^{commit}`], { cwd: root }).status, 0, `${e.id}: unknown commit ${c}`);
  }
});


test('every benchmark target including Yale 300px sources is accepted with a full-size painting', async () => {
  const targets = new URL('../v2/targets/', import.meta.url);
  const specs = JSON.parse(fs.readFileSync(new URL('../v4v5/subjects.json', import.meta.url))).subjects;
  for (const file of fs.readdirSync(targets).filter(f => /\.(png|jpe?g|webp)$/.test(f))) {
    const { width } = await sharp(fs.readFileSync(new URL(file, targets))).metadata();
    const subject = file.replace(/\.[^.]+$/, '');
    assert.equal(gatePlate({ ...base(), subject, paintWidth: specs[subject].width, sourceWidth: width }, { expectedCommit: COMMIT, strict: true }).admitted, true, file);
  }
});

test('actual painting dimensions gate proof and lossless PNG wins over a JPEG sibling', async t => {
  const root = tmp(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = await makePlate(path.join(root, 'argon1-mittens'));
  fs.writeFileSync(path.join(dir, 'painting.jpg'), await jpg(300, 259));
  const rejected = gatePlate(parsePlateDir(dir), { expectedCommit: COMMIT, strict: true });
  assert.ok(codes(rejected.refused).includes('low-res-image'), '1200px metadata cannot legitimize a 300px preview');
  fs.writeFileSync(path.join(dir, 'painting.png'), await png(1200, 1036));
  const plate = parsePlateDir(dir);
  assert.equal(plate.painting, path.join(dir, 'painting.png'));
  assert.equal(plate.imageWidth, 1200);
  assert.equal(gatePlate(plate, { expectedCommit: COMMIT, strict: true }).admitted, true);
  fs.unlinkSync(path.join(dir, 'painting.png')); fs.unlinkSync(path.join(dir, 'painting.jpg'));
  assert.ok(codes(gatePlate(parsePlateDir(dir), { expectedCommit: COMMIT }).refused).includes('low-res-image'));
});

const pageData = file => JSON.parse(/<script type="application\/json" id="cmp-data">([\s\S]*?)<\/script>/.exec(fs.readFileSync(file, 'utf8'))[1]);
const uriBytes = uri => Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');

test('default delivery preserves native PNG, JPEG frames, targets, prior images and stage-strip bytes', async t => {
  const w = await fixtureWorld(); t.after(() => fs.rmSync(w.root, { recursive: true, force: true }));
  const dir = path.join(w.ab, 'v031-final', 'argon1-mittens');
  const final = await png(1600, 1380); fs.writeFileSync(path.join(dir, 'painting.png'), final);
  const cardFile = path.join(dir, 'run-card.json'), card = JSON.parse(fs.readFileSync(cardFile));
  card.dimensions.paintWidth = 1600; card.dimensions.paintHeight = 1380;
  fs.writeFileSync(cardFile, JSON.stringify(card));
  const manifestFile = path.join(dir, 'frames.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile));
  for (const f of manifest.frames) fs.writeFileSync(path.join(dir, f.src), await jpg(1600, 1380));
  manifest.frames[0] = {...manifest.frames[0], stage:'wash',step:'band 1 dry',valueBand:1,dried:true};
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const out = path.join(w.root, 'native.html');
  await generate({ runs:w.runs,plateRoots:[w.ab],out,expected:{'0.3.2':COMMIT,'0.1.1':'70ceb7c'},targetsDir:w.targets,strict:true });
  const row = pageData(out).rows.find(r => r.model === 'argon');
  assert.deepEqual(uriBytes(row.plate.final), final);
  assert.deepEqual(readImageSize(uriBytes(row.plate.final)), {w:1600,h:1380});
  assert.equal(row.plate.delivery.final, 'original bytes');
  assert.equal(row.plate.frames.length, manifest.frames.length);
  for (const [i,f] of manifest.frames.entries()) assert.deepEqual(uriBytes(row.plate.frames[i].src), fs.readFileSync(path.join(dir,f.src)));
  assert.equal(row.plate.frames[0].valueBand, 1); assert.equal(row.plate.frames[0].dried, true);
  assert.equal(row.plate.frames[0].stage, 'wash band 1 dry');
  assert.deepEqual(uriBytes(row.repaint.final), fs.readFileSync(path.join(w.ab,'v030','argon1-mittens','painting.jpg')));
  assert.deepEqual(uriBytes(row.target.src), fs.readFileSync(path.join(w.targets,'mittens.png')));
  const priorDir = path.join(w.runs,'v4-pipeline','argon','1');
  assert.deepEqual(uriBytes(row.prior.final), fs.readFileSync(path.join(priorDir,'mittens.webp')));
  assert.deepEqual(uriBytes(row.prior.stages), fs.readFileSync(path.join(priorDir,'mittens-stages.webp')));
});

test('explicit preview widths use JPEG92 and visibly disclose preview delivery', async t => {
  const w = await fixtureWorld(); t.after(() => fs.rmSync(w.root, { recursive: true, force: true }));
  const out = path.join(w.root,'preview.html'), dir=path.join(w.ab,'v031-final','argon1-mittens');
  await generate({runs:w.runs,plateRoots:[w.ab],out,expected:{'0.3.2':COMMIT,'0.1.1':'70ceb7c'},frameWidth:400,finalWidth:500});
  const row=pageData(out).rows.find(r=>r.model==='argon');
  const expected = async (file,width) => sharp(file).resize({width,withoutEnlargement:true}).jpeg({quality:92,mozjpeg:true}).toBuffer();
  assert.deepEqual(uriBytes(row.plate.final),await expected(path.join(dir,'painting.jpg'),500));
  assert.equal(readImageSize(uriBytes(row.plate.final)).w,500);
  assert.deepEqual(uriBytes(row.plate.frames[0].src),await expected(path.join(dir,'f0000.jpg'),400));
  assert.ok(row.plate.marks.some(m=>m.code==='preview-delivery' && /JPEG92/.test(m.text)));
  assert.match(fs.readFileSync(out,'utf8'),/Explicit preview delivery/);
});

test('native is the default and invalid preview widths fail loudly', async () => {
  assert.equal(parseArgs([]).frameWidth,null); assert.equal(parseArgs([]).finalWidth,null);
  for (const flag of ['--frame-width','--final-width']) for(const value of ['0','-1','NaN','Infinity','2.5','bad']) assert.throws(()=>parseArgs([flag,value]),/positive integer/);
  await assert.rejects(generate({frameWidth:NaN}),/positive integer/);
});


test('full benchmark width and both recorded image dimensions are required', async t => {
  assert.ok(codes(gatePlate({...base(), subject:'h36a',paintWidth:1200},{expectedCommit:COMMIT}).refused).includes('low-res-render'));
  assert.equal(gatePlate({...base(),subject:'h36a',paintWidth:1224},{expectedCommit:COMMIT,strict:true}).admitted,true);
  const root=tmp(); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const dir=await makePlate(path.join(root,'argon1-mittens'));
  for(const [w,h] of [[600,518],[1200,1000]]) {
    fs.writeFileSync(path.join(dir,'painting.jpg'),await jpg(w,h));
    assert.ok(codes(gatePlate(parsePlateDir(dir),{expectedCommit:COMMIT}).refused).includes('render-size-mismatch'));
  }
});

test('missing transient frames remain explicit gaps beside separately labeled retained checkpoints', async t => {
  const w=await fixtureWorld(); t.after(()=>fs.rmSync(w.root,{recursive:true,force:true}));
  const dir=path.join(w.ab,'v031-final','argon1-mittens');
  fs.unlinkSync(path.join(dir,'f0000.jpg'));
  fs.writeFileSync(path.join(dir,'f0001.jpg'),await jpg(300,259));
  fs.mkdirSync(path.join(dir,'stages')); fs.writeFileSync(path.join(dir,'stages','stage-010.jpg'),await jpg(1200,1036));
  const out=path.join(w.root,'missing.html');
  await generate({runs:w.runs,plateRoots:[w.ab],out,expected:{'0.3.2':COMMIT,'0.1.1':'70ceb7c'}});
  const plate=pageData(out).rows.find(r=>r.model==='argon').plate;
  assert.deepEqual(plate.playback.missingFrames,['f0000.jpg']);
  assert.deepEqual(plate.playback.nonNativeFrames,['f0001.jpg']);
  assert.equal(plate.playback.nativeFramesComplete,false);
  assert.equal(plate.playback.delivered,4);
  assert.equal(plate.recordedFrames.length,4);
  assert.deepEqual(uriBytes(plate.recordedFrames[0].src),fs.readFileSync(path.join(dir,'f0001.jpg')));
  assert.equal(plate.frames.length,2);
  assert.match(plate.playback.kind,/not chronological/);
  assert.equal(plate.checkpoints.nativeComplete,false);
  assert.ok(plate.marks.some(m=>m.code==='frames-missing'));
  assert.ok(plate.marks.some(m=>m.code==='frame-resolution'));
});


test('all retained native percentage checkpoints and every dried band including band1 remain accessible', async t => {
  const w=await fixtureWorld(); t.after(()=>fs.rmSync(w.root,{recursive:true,force:true}));
  const dir=path.join(w.ab,'v031-final','argon1-mittens');
  for(const file of fs.readdirSync(dir).filter(f=>/^f\d+\.jpg$/.test(f))) fs.unlinkSync(path.join(dir,file));
  fs.mkdirSync(path.join(dir,'stages'));
  const files=[];
  for(const percent of [10,25,50,75,100]) {
    const file=`stages/stage-${String(percent).padStart(3,'0')}.jpg`;
    fs.writeFileSync(path.join(dir,file),await jpg(1200,1036)); files.push(file);
  }
  for(const band of [1,2,3,4,5]) {
    const file=`value-band-${band}-dried.png`;
    fs.writeFileSync(path.join(dir,file),await png(1200,1036)); files.push(file);
  }
  fs.writeFileSync(path.join(dir,'value-executed-counts.json'),JSON.stringify({bands:[1,2,3,4,5].map(band=>({band,strokes:1}))}));
  const out=path.join(w.root,'checkpoints.html');
  const options={runs:w.runs,plateRoots:[w.ab],out,expected:{'0.3.2':COMMIT,'0.1.1':'70ceb7c'}};
  await generate(options);
  const plate=pageData(out).rows.find(r=>r.model==='argon').plate;
  assert.equal(plate.playback.missingFrames.length,5);
  assert.equal(plate.playback.nativeFramesComplete,false);
  assert.equal(plate.checkpoints.nativeComplete,true);
  assert.equal(plate.frames.length,11,'all ten checkpoints precede explicit final endpoint');
  for(const [i,file] of files.entries()) {
    assert.equal(plate.frames[i].file,file);
    assert.deepEqual(uriBytes(plate.frames[i].src),fs.readFileSync(path.join(dir,file)));
    assert.deepEqual(plate.frames[i].sourceDimensions,{w:1200,h:1036});
  }
  assert.equal(plate.frames[5].band,1,'early light band remains accessible');
  assert.match(plate.frames[10].stage,/not a recorded frame/);
  assert.ok(plate.marks.some(m=>m.code==='checkpoint-evidence'));
  fs.unlinkSync(path.join(dir,'value-band-1-dried.png'));
  await generate(options);
  const missing=pageData(out).rows.find(r=>r.model==='argon').plate;
  assert.equal(missing.checkpoints.nativeComplete,false);
  assert.ok(missing.checkpoints.missing.includes('value-band-1-dried.png'));
  fs.writeFileSync(path.join(dir,'value-band-1-dried.png'),await png(1200,1036));
  fs.unlinkSync(path.join(dir,'value-band-3-dried.png'));
  const countsFile=path.join(dir,'value-executed-counts.json');
  fs.writeFileSync(countsFile,JSON.stringify({bands:[1,2,3,4,5].map(band=>({band,strokes:band===3?0:1}))}));
  await generate(options);
  const emptyBand=pageData(out).rows.find(r=>r.model==='argon').plate;
  assert.equal(emptyBand.checkpoints.nativeComplete,true,'unexecuted zero-stroke band is not a missing completion');
  assert.deepEqual(emptyBand.checkpoints.expectedBands,[1,2,4,5]);
  const manifestFile=path.join(dir,'frames.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
  manifest.frames[0]={...manifest.frames[0],boundary:'value',value:3};
  fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  await generate(options);
  assert.ok(pageData(out).rows.find(r=>r.model==='argon').plate.checkpoints.missing.includes('value-band-3-dried.png'),'explicit completed boundary wins over a contradictory zero count');
  for(const bands of [null,{},[{band:1,strokes:'1'}],[{band:1,strokes:-1}]]) {
    fs.writeFileSync(countsFile,JSON.stringify({bands}));
    await assert.rejects(generate(options),/Invalid completed-band counts/);
  }
  fs.writeFileSync(countsFile,JSON.stringify({bands:[1,2,3,4,5].map(band=>({band,strokes:1}))}));
  for(const f of JSON.parse(fs.readFileSync(path.join(dir,'frames.json'))).frames) fs.writeFileSync(path.join(dir,f.src),await jpg(1200,1036));
  await generate(options);
  const complete=pageData(out).rows.find(r=>r.model==='argon').plate;
  assert.equal(complete.playback.kind,'recorded frames');
  assert.equal(complete.playback.nativeFramesComplete,true);
  assert.equal(complete.frames.length,5,'complete recorded playback stays preferred');
  assert.equal(complete.checkpoints.images.length,9,'separate checkpoint group remains in the artifact');
});


test('explicit oversized preview requests never upscale native source files', async t => {
  const w=await fixtureWorld(); t.after(()=>fs.rmSync(w.root,{recursive:true,force:true}));
  const out=path.join(w.root,'large-preview.html');
  await generate({runs:w.runs,plateRoots:[w.ab],out,expected:{'0.3.2':COMMIT,'0.1.1':'70ceb7c'},frameWidth:2400,finalWidth:2400});
  const plate=pageData(out).rows.find(r=>r.model==='argon').plate;
  assert.deepEqual(readImageSize(uriBytes(plate.final)),{w:1200,h:1036});
  assert.deepEqual(readImageSize(uriBytes(plate.frames[0].src)),{w:1200,h:1036});
});


test('only a recorded successful integer exit qualifies, including actual parsed exit3', async t => {
  for(const exit of [3,1,-1,null,undefined,'0',0.5]) {
    assert.ok(codes(gatePlate({...base(),exit},{expectedCommit:COMMIT}).refused).includes('run-failed'),String(exit));
  }
  assert.equal(gatePlate(base(),{expectedCommit:COMMIT}).admitted,true);
  const root=tmp(); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const dir=await makePlate(path.join(root,'argon1-mittens'),{exit:3});
  const parsed=parsePlateDir(dir);
  assert.equal(parsed.exit,3);
  assert.equal(gatePlate(parsed,{expectedCommit:COMMIT,strict:true}).admitted,false);
  const scanned=scanPlates([root],{expected:{'0.3.2':COMMIT}});
  assert.equal(scanned.length,1);
  assert.ok(scanned[0].gate.refused.some(r=>r.code==='run-failed'));
});
