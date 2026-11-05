import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { drawFineMaterial } from './fine-material.mjs';
import { makeInkRes } from './ink-res.mjs';
import { materialProfile } from './material-profiles.mjs';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, DEFAULTS } from '../../media/sheet.mjs';
import { recordMarks, TAPE, tapeState } from '../../media/brush.mjs';

const track = { start() {}, stop() { return []; }, current() {}, replay() {} };
test('warm fine drawings replay material, caps, audit and tape across calls, then carry and settle normally', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fine-drawing-'));
  try {
    const w = 32, h = 24, pigments = [materialProfile('drawing-ink').pigment];
    const run = (enabled, changed = false) => {
      recordMarks(true);
      const main = createSheet(makePaper(w,h,{seed:9}),pigments);
      main._tape = 1;
      const fine = makeInkRes({N:2,W2:w,H2:h,paperOpts:{seed:9},pigments,main});
      const audit = [], state = {used:0}, logs = [], results = [];
      for (let i = 0; i < 2; i++) {
        const gestures = [{points:[{x:3,y:8+i*4,s:.6,nw:.8,v:1},{x:26,y:8+i*4,s:.6,nw:.8,v:2}]}];
        results.push(drawFineMaterial(fine,gestures,{w,h,medium:'drawing-ink',sourceInk:true,
          mmPerCell:.25,O:DEFAULTS,ink:[changed?3:4],audit,state,caps:{lines:10},
          cache:{dir,name:'unused',code:'fixture',enabled,track,log:s=>logs.push(s)}}));
      }
      fine.settle();
      const result = {results,audit,state,tape:structuredClone(TAPE),recorder:structuredClone(tapeState()),
        pixels:fine.compose(Buffer.alloc(w*h*3,255)),D:main.D.map(a=>a.slice())};
      recordMarks(false);
      return {result,logs};
    };
    const reference=run(false),cold=run(true),warm=run(true);
    assert.deepEqual(cold.result,reference.result);
    assert.deepEqual(warm.result,reference.result);
    assert.equal(warm.logs.filter(s=>s.includes('fine-drawing hit')).length,2);
    assert.equal(run(true,true).logs.filter(s=>s.includes('fine-drawing miss')).length,2);
  } finally { recordMarks(false); fs.rmSync(dir,{recursive:true,force:true}); }
});
