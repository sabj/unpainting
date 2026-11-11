// Honest harness: what the model may see and set between planning and the finished painting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { PaintSession, LOOKS } from './pipeline/session.mjs';

const png = (f, rgb) => sharp({ create: { width: 40, height: 30, channels: 3, background: rgb } }).png().toFile(f);
const until = async (f, ms = 10000) => { const t = Date.now(); while (!fs.existsSync(f)) { if (Date.now() - t > ms) throw new Error('no answer ' + f); await new Promise(r => setTimeout(r, 20)); } return JSON.parse(fs.readFileSync(f, 'utf8')); };

/** A session whose painter is a stub, stopped at boundary `at.b`. */
async function stubSession({ strict }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'honest-')), ws = path.join(root, 'ws'), raw = path.join(root, 'raw');
  fs.mkdirSync(path.join(ws, 'bench', 'plan'), { recursive: true });
  const target = path.join(root, 'target.png'), sheet = path.join(root, 'sheet.png');
  await png(target, '#c04020'); await png(sheet, '#f0f0f0');
  fs.copyFileSync(target, path.join(ws, 'bench', 'plan', 'target.png'));
  const s = new PaintSession({ repo: root, ws, raw, spec: { width: 40, sheetmm: 100, noTargetLooks: strict }, target });
  const at = { b: 0 };
  s.painting = { state: 'running', segments: [], currentStop: () => [at.b, { label: `stop ${at.b}`, strokes: 1, penLines: 0, passesDone: at.b, passesPlanned: 9, remaining: [] }], sheetImage: () => sheet, progress: () => ({}) };
  s.started = true; s.planHash = {};
  let seq = 0;
  const ask = async (cmd, args = []) => {
    const k = String(++seq).padStart(4, '0');
    fs.writeFileSync(path.join(s.io, `req-${k}.json`), JSON.stringify({ cmd, args, t: new Date().toISOString() }));
    s.tick();
    return until(path.join(s.io, `res-${k}.json`));
  };
  return { s, ws, raw, root, at, ask };
}

test('strict: a look shows the sheet and never the target, and the target leaves the worktree when painting starts', async () => {
  const { s, ws, raw, root, ask } = await stubSession({ strict: true });
  s.withdrawTarget();
  assert.equal(fs.existsSync(path.join(ws, 'bench', 'plan', 'target.png')), false);
  const r = await ask('look');
  assert.equal(r.exit, 0);
  assert.doesNotMatch(r.text, /compare|target left/);
  const looks = fs.readdirSync(path.join(ws, 'bench', 'looks'));
  assert.deepEqual(looks.filter(f => /compare/.test(f)), [], 'a strict session writes no compare image');
  assert.ok(looks.some(f => /sheet\.jpg$/.test(f)));
  const rows = fs.readFileSync(path.join(raw, 'CHECKPOINTS.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  assert.ok(rows.filter(x => x.kind === 'look').every(x => x.target === false));
  // every answer the model read is kept
  assert.match(fs.readFileSync(path.join(raw, 'paint-answers.jsonl'), 'utf8'), /"cmd":"look"/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('default mode: a look shows target and sheet; looks are few and fixed, never repeated until something converges', async () => {
  const { s, ws, root, at, ask } = await stubSession({ strict: false });
  for (let k = 1; k <= LOOKS; k++) {
    at.b = k;
    const r = await ask('look');
    assert.equal(r.exit, 0, r.text);
    assert.match(r.text, new RegExp(`Look ${k} of ${LOOKS}`));
  }
  assert.ok(fs.readdirSync(path.join(ws, 'bench', 'looks')).some(f => /compare\.jpg$/.test(f)));
  at.b = LOOKS + 1;
  const over = await ask('look');
  assert.equal(over.exit, 1);
  assert.match(over.text, /most a painting gets/);
  assert.equal(s.steps, LOOKS);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a revision follows a look at the same stop, once', async () => {
  const { s, root, at, ask } = await stubSession({ strict: false });
  s.planFilesHash = () => ({ 'config.json': 'changed' });
  at.b = 2;
  const blind = await ask('revise');
  assert.equal(blind.exit, 1);
  assert.match(blind.text, /follows a look/);
  await ask('look');
  at.b = 3;
  const elsewhere = await ask('revise');
  assert.equal(elsewhere.exit, 1, 'a look at one stop does not license a revision at the next');
  fs.rmSync(root, { recursive: true, force: true });
});

test('the brief says what a look shows in each mode, and that looks are counted', async () => {
  const { renderTask, loadSubjects } = await import('./pipeline/round45.mjs');
  const { ROUNDS } = await import('./lib.mjs');
  const spec = Object.values(loadSubjects())[0], round = ROUNDS.find(r => r.id === 'V4');
  const strict = renderTask({ round, n: 1, tries: 1, spec: { ...spec, noTargetLooks: true } });
  const loose = renderTask({ round, n: 1, tries: 1, spec });
  for (const t of [strict, loose]) { assert.doesNotMatch(t, /\{[A-Z_]+\}|as often as you like|as you like/); assert.match(t, /three looks while painting/); }
  assert.doesNotMatch(strict, /compare\.jpg/);
  assert.match(strict, /no target view after planning/);
  assert.match(loose, /compare\.jpg/);
});
