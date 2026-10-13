import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';

test('a fair full painting uses frozen charges with no target look or element read', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-no-looks-'));
  try {
    const target = path.join(dir, 'target.png'), out = path.join(dir, 'paint');
    await sharp(Buffer.from('<svg width="48" height="36"><rect width="48" height="36" fill="#faf7ef"/><rect x="4" y="4" width="30" height="25" fill="#7796b0"/><rect x="24" y="15" width="18" height="17" fill="#473c32"/></svg>')).png().toFile(target);
    try { execFileSync(process.execPath, ['tools/paint-plate.mjs', '--allowdirty', '1', '--image', target, '--width', '48', '--scale', '1', '--sheetmm', '152.4', '--mode', 'fast', '--gpu', 'off', '--threads', '1', '--drawing', 'none', '--feedback', '0', '--touchpoints', '0', '--finaldarks', '0', '--notargetlooks', '1', '--targetguard', 'strict', '--frames', '0', '--video', '0', '--out', out], {cwd: new URL('../../', import.meta.url), env: {...process.env, W2_CACHE_DIR: path.join(dir, 'cache')}, stdio: 'pipe', timeout: 60000}); } catch (e) { throw Error(String(e.stdout).split('\n').slice(-20).join('\n') + String(e.stderr)); }
    const guard = JSON.parse(fs.readFileSync(path.join(out, 'target-guard.json'), 'utf8'));
    assert.equal(guard.looks.count, 0);
    assert.equal(guard.violations, 0);
    assert.deepEqual(guard.elementReads, {});
    const {data} = await sharp(path.join(out, 'painting.png')).removeAlpha().raw().toBuffer({resolveWithObject: true});
    assert.ok(Math.max(...data) - Math.min(...data) > 30, 'the no-look route still lays a visible painting');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test("painting looks pass through by default and return null in frozen replay", async () => {
  const { paintingLooks } = await import("./painting-look.mjs");
  const calls = [], guard = { look: (...a) => { calls.push(a); return { ref: {} }; } };
  assert.deepEqual(paintingLooks(guard, 0)("passage", "L1/s0", null), { ref: {} });
  assert.equal(paintingLooks(guard, 1)("passage", "L1/s1", null), null);
  assert.deepEqual(calls, [["passage", "L1/s0", null]]);
});
