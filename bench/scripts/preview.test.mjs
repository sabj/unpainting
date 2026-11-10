// The CPU plan preview: what the check hands the model, and the cost the try records.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { readPreview, previewText, writePreviewCompare, costRecord } from './pipeline/preview.mjs';
import { renderTask, loadSubjects } from './pipeline/round45.mjs';
import { ROUNDS } from './lib.mjs';

const stats = o => ({ darkShare: 0.06, paperShare: 0.49, meanL: 82.4, L5: 33.6, L25: 73.2, L50: 93.9, L75: 98.6, L95: 98.6, ...o });
const report = { kind: 'k', plan: stats({}), target: stats({ darkShare: 0.033, meanL: 85.2, L5: 39.8 }) };
const folder = async (withReport = true) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prev-'));
  if (withReport) fs.writeFileSync(path.join(d, 'plan-value-check.json'), JSON.stringify(report));
  await sharp({ create: { width: 30, height: 20, channels: 3, background: '#cc9966' } }).png().toFile(path.join(d, 'plan-ledger.png'));
  return d;
};

test('readPreview reads the planning step output and fails loudly when it is missing', async () => {
  const p = readPreview(await folder());
  assert.deepEqual(p.report.plan, report.plan);
  assert.ok(p.ledger.endsWith('plan-ledger.png'));
  assert.throws(() => readPreview(path.join(os.tmpdir(), 'no-such-preview')), /preview/);
});

test('a preview with the ledger picture but no statistics is an error, not an empty preview', async () => {
  const bare = await folder(false);
  assert.throws(() => readPreview(bare), /plan-value-check\.json/);
});

test('the preview text gives plan and target side by side and says what it does not show', async () => {
  const t = previewText({ report, compare: 'bench/check-out/preview.jpg' });
  assert.match(t, /dark share 0\.06 \(target 0\.033\)/);
  assert.match(t, /mean L\* 82\.4 \(target 85\.2\)/);
  assert.match(t, /bench\/check-out\/preview\.jpg/);
  assert.match(t, /values.*not.*(edges|texture)/i);
  assert.match(t, /render once/i);
});

test('the compare picture is the target beside the plan ledger, at the ledger size', async () => {
  const d = await folder(), target = path.join(d, 't.png');
  await sharp({ create: { width: 60, height: 40, channels: 3, background: '#336699' } }).png().toFile(target);
  const out = path.join(d, 'cmp.jpg');
  await writePreviewCompare({ target, ledger: path.join(d, 'plan-ledger.png'), dest: out });
  const m = await sharp(out).metadata();
  assert.equal(m.format, 'jpeg');
  assert.equal(m.width, 60); assert.equal(m.height, 20);
});

test('the cost record counts checks, preview seconds and renders, and does not invent what was not measured', () => {
  assert.deepEqual(costRecord({ checks: [{ seconds: 40, previewSeconds: 12 }, { seconds: 55, previewSeconds: 14 }], renders: 1, renderSeconds: 600 }),
    { checks: 2, checkSeconds: 95, previewSeconds: 26, renders: 1, renderSeconds: 600 });
  assert.deepEqual(costRecord({ checks: [], renders: 0, renderSeconds: 0 }), { checks: 0, checkSeconds: 0, previewSeconds: 0, renders: 0, renderSeconds: 0 });
  assert.throws(() => costRecord({ checks: [{ seconds: 3 }], renders: 1, renderSeconds: 1 }), /previewSeconds/);
});

test('the brief makes the preview the main feedback and allows one render', () => {
  const spec = loadSubjects().hills, round = ROUNDS.find(r => r.id === 'V4');
  const t = renderTask({ round, n: 1, tries: 1, spec });
  assert.match(t, /plan preview/i);
  assert.match(t, /bench\/check-out\/preview\.jpg/);
  assert.match(t, /one render/i);
});
