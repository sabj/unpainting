import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFineMaterial } from './fine-material.mjs';
import { makeInkRes } from './ink-res.mjs';
import { materialProfile } from './material-profiles.mjs';
import { makePaper } from '../../media/paper.mjs';
import { createSheet,DEFAULTS } from '../../media/sheet.mjs';
test('fine ink preserves measured physical width, dry gate and pigment transfer',()=>{
 const w=30,h=20,pigments=[materialProfile('drawing-ink').pigment],main=createSheet(makePaper(w,h),pigments);
 const fine=makeInkRes({N:2,W2:w,H2:h,paperOpts:{seed:9},pigments,main});
 const audit=[];
 const r=drawFineMaterial(fine,[{points:[{x:3,y:8,s:.6,nw:.8,v:.6,dwell:1},{x:3,y:8,s:.6,nw:.8,v:.6},{x:22,y:8,s:.6,nw:.8,v:2.4}]}],{w,h,medium:'drawing-ink',sourceInk:true,mmPerCell:.25,O:DEFAULTS,audit});
 assert.deepEqual(audit[0].speeds,[1.2,1.2,4.8]);assert.equal(audit[0].dwellTime,1);
 assert.equal(r.drawn,1);assert.equal(fine.stats.calls,1);assert.equal(audit[0].after.water,0);
 assert(audit[0].contactWidthMm.every(v=>Math.abs(v-.2)<1e-6));
 assert(main.D[0].some(v=>v>0));assert.equal(fine.compose(Buffer.alloc(w*h*3,255)).length,w*h*3*4);
});

import { finePen, fineGestures, fineDrop } from './fine-material.mjs';
test('a finer ink sheet scales the pen: sizes by N, volumes by N squared',()=>{
 const p=finePen({nib:.3,reservoir:100},3);
 assert.equal(p.travel,4.5);assert.equal(p.reach,36);assert.equal(p.reservoir,900);assert.equal(p.feed,1.2*9);assert.equal(p.nib,.3);
 const d=finePen(undefined,2);assert.equal(d.reservoir,1000);assert.equal(d.reach,24);
 assert.ok(Math.abs(fineDrop(3)-.9)<1e-12);
});
test('fine gestures keep the cell centre, widths and speeds N times as large',()=>{
 const [g]=fineGestures([{points:[{x:0,y:0,nw:.5,v:1},{x:2,y:1}]}],3);
 assert.deepEqual(g.points[0],{x:1,y:1,nw:1.5,v:3});assert.equal(g.points[1].x,7);assert.equal(g.points[1].y,4);
});
