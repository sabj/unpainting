import test from 'node:test';
import assert from 'node:assert/strict';
import { detailSegments } from './detail-segments.mjs';

test('--detailseg reads the run\'s own segment map, respects explicit --segments off, and fails loudly on missing stem or detailscale', async () => {
  const asked = [], logs = [];
  const load = async (stem, w, h) => { asked.push([stem, w, h]); return { regions: [] }; };
  const record = { stem: 'work/segments/by-hash/abc-sam-1', backend: 'sam' };
  assert.equal(await detailSegments({ detailseg: 0, detailscale: 0.5, record, w: 4, h: 3, load }), null);
  assert.deepEqual(await detailSegments({ detailseg: 1, detailscale: 0.5, record, w: 4, h: 3, load }), { regions: [] });
  assert.deepEqual(asked, [[record.stem, 4, 3]], 'the prepared stem, not a lookup by the target name');
  assert.equal(await detailSegments({ detailseg: 1, detailscale: 0.5, record: null, segmentsMode: 'off', w: 4, h: 3, load, log: l => logs.push(l) }), null);
  assert.match(logs[0], /--segments off/);
  await assert.rejects(detailSegments({ detailseg: 1, detailscale: 0.5, record: null, segmentsMode: 'sam', w: 4, h: 3, load }), /needs the run's segment map/);
  await assert.rejects(detailSegments({ detailseg: 1, detailscale: 0, record, w: 4, h: 3, load }), /--detailscale k > 0/);
});
