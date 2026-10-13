import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const TOOL = fileURLToPath(new URL('./compare.mjs', import.meta.url));

async function run(root, name, backend) {
  const dir = path.join(root, name); fs.mkdirSync(dir);
  await sharp({ create: { width: 4, height: 4, channels: 3, background: 'white' } }).png().toFile(path.join(dir, 'painting.png'));
  fs.writeFileSync(path.join(dir, 'backend.json'), JSON.stringify(backend === 'gpu' ? { mode: 'auto', backend: 'gpu', fallback: false, adapter: 'webgpu (Dawn)' } : { mode: 'auto', backend: 'cpu', fallback: true, reason: 'no WebGPU adapter' }));
  return path.join(dir, 'painting.png');
}

test('compare.mjs refuses a GPU run against a CPU-fallback run, and compares two GPU runs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-compare-'));
  const a = await run(root, 'a', 'gpu'), b = await run(root, 'b', 'gpu'), c = await run(root, 'c', 'cpu');
  const mixed = spawnSync(process.execPath, [TOOL, a, c, path.join(root, 'out-mixed')], { encoding: 'utf8' });
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.stderr, /refusing to compare: the runs used different sheet backends/);
  assert.equal(fs.existsSync(path.join(root, 'out-mixed', 'metrics.json')), false);
  const same = spawnSync(process.execPath, [TOOL, a, b, path.join(root, 'out-same')], { encoding: 'utf8' });
  assert.equal(same.status, 0, same.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'out-same', 'metrics.json'), 'utf8')).byteIdentical, true);
  const parity = spawnSync(process.execPath, [TOOL, a, c, path.join(root, 'out-parity'), '--mixedbackends'], { encoding: 'utf8' });
  assert.equal(parity.status, 0, parity.stderr);
});
