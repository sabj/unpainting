import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makePaper, setPaperStore } from './paper.mjs';
import { diskPaperStore } from './paper-store.mjs';

const same = (a, b) => { assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort()); for (const k of Object.keys(a)) assert.deepEqual(a[k], b[k], k); };

test('a paper asked for again is the same paper, and each caller has its own copy', () => {
  const o = { seed: 9, mmPerCell: 0.5, coldPress: { mmPerCell: 0.5 } };
  const a = makePaper(40, 30, o), b = makePaper(40, 30, { coldPress: { mmPerCell: 0.5 }, mmPerCell: 0.5, seed: 9 });
  same(a, b);
  assert.notEqual(a.height, b.height);
  a.capacity[0] = -1;
  assert.notEqual(makePaper(40, 30, o).capacity[0], -1);
  assert.notDeepEqual(makePaper(40, 30, { ...o, seed: 10 }).height, b.height);
});

test('the disk store gives back a paper made in another run, bit for bit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-store-'));
  try {
    const o = { seed: 4, mmPerCell: 0.4, coldPress: { mmPerCell: 0.4 } };
    let puts = 0, gets = 0;
    const disk = diskPaperStore(dir, 'code-a'), counted = { get: k => { const p = disk.get(k); if (p) gets++; return p; }, put: (k, p) => { puts++; disk.put(k, p); } };
    setPaperStore(counted);
    const made = makePaper(33, 21, o);
    assert.equal(puts, 1);
    const key = JSON.stringify([33, 21, { coldPress: { mmPerCell: 0.4 }, mmPerCell: 0.4, seed: 4 }]);
    same(disk.get(key), made);
    assert.equal(diskPaperStore(dir, 'code-b').get(key), null, 'another paper code does not read it');
  } finally { setPaperStore(null); fs.rmSync(dir, { recursive: true, force: true }); }
});
