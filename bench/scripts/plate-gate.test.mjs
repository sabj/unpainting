import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { imageStats, delivery, absolute, compare } from './plate-gate.mjs';

const stats = o => ({ paperShare: 0.5, darkShare: 0.1, gradP95: 10, ...o });
const result = o => ({ delivery: null, cheat: null, playback: null, ...o, paint: stats(o?.paint), targetStats: stats(o?.target) });

test('imageStats separates paper from dark paint', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  const file = path.join(dir, 'half.png');
  const raw = Buffer.alloc(40 * 40 * 3, 255);
  raw.fill(10, 0, 40 * 20 * 3);
  await sharp(raw, { raw: { width: 40, height: 40, channels: 3 } }).png().toFile(file);
  const s = await imageStats(file, 40);
  assert.ok(Math.abs(s.darkShare - 0.5) < 0.05, `darkShare ${s.darkShare}`);
  assert.ok(Math.abs(s.paperShare - 0.5) < 0.05, `paperShare ${s.paperShare}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('delivery reads the last log line and counts pans inside the 0.9 to 1.1 band', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  fs.writeFileSync(path.join(dir, 'paint.log'), 'pigment delivered over planned: a 0.5\npigment delivered over planned: a 1.0, b 1.2, c 0.95\n');
  const d = delivery(dir);
  assert.deepEqual(d.pans, [1.0, 1.2, 0.95]);
  assert.equal(d.inBand, '2/3');
  assert.equal(delivery(path.join(dir, 'missing')), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('absolute checks pass when shares are within 25 percent and edges keep 85 percent', () => {
  const ok = absolute(result({ paint: { paperShare: 0.55, darkShare: 0.11, gradP95: 9 } }));
  assert.equal(ok.paperShare, true);
  assert.equal(ok.darkShare, true);
  assert.equal(ok.edgeP95, true);
  const bad = absolute(result({ paint: { paperShare: 0.9, darkShare: 0.3, gradP95: 5 } }));
  assert.equal(bad.paperShare, false);
  assert.equal(bad.darkShare, false);
  assert.equal(bad.edgeP95, false);
});

test('compare fails a run that moves dark share away from the target or lowers edge energy', () => {
  const prev = result({ paint: { darkShare: 0.1, gradP95: 10 } });
  assert.equal(compare(result({ paint: { darkShare: 0.1, gradP95: 10 } }), prev).pass, true);
  assert.equal(compare(result({ paint: { darkShare: 0.2, gradP95: 10 } }), prev).darkShare, false);
  assert.equal(compare(result({ paint: { darkShare: 0.1, gradP95: 9 } }), prev).edgeP95, false);
  assert.equal(compare(result(), null), null);
});
