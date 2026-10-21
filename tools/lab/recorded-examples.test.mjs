import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {pointOnPath} from '../../demos/lab/targets/film.js';
const lab = new URL('../../demos/lab/', import.meta.url);
const json = p => JSON.parse(fs.readFileSync(new URL(p, lab)));
test('published paintings ship complete budgeted live paintings, materials and saved recordings', () => {
  for (const ex of json('examples/recorded.json').examples) {
    for (const limit of [250,2500]) {
      const t=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL(ex.live[limit],lab))));
      const count=t.marks.filter(m=>['s','P','g'].includes(m.k)).length;
      assert.equal(t.complete,true);assert.equal(t.strokeBudget,limit);assert.equal(t.strokeCount,count);assert.ok(count<=limit&&count>=limit*.8);
      assert.ok(t.marks.at(-1).k==='m'||t.marks.at(-1).k==='y'||t.marks.at(-1).k==='c');
      assert.ok(t.pigments.length&&t.brushOpts.length);
      assert.ok(t.marks.some(m=>m.k==='d'||m.k==='D'));
    }
    for(const f of [ex.target,ex.thumb,ex.film.final,...ex.film.frames])assert.ok(fs.existsSync(new URL(f,lab)),f);
    assert.ok(!JSON.stringify(ex).toLowerCase().includes('trumbull'));
  }
});
test('recorded brush travels by distance and reaches the last point', () => {
  assert.deepEqual(pointOnPath([0,0,3,0,3,9], .5), [3,3]);
  assert.deepEqual(pointOnPath([0,0,3,0,3,9], 1), [3,9]);
  assert.deepEqual(pointOnPath([2,3,2,3], .5), [2,3]);
});
