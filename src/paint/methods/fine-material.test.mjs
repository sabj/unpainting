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
 const r=drawFineMaterial(fine,[{points:[{x:3,y:8,s:.6,nw:.8},{x:22,y:8,s:.6,nw:.8}]}],{w,h,medium:'drawing-ink',sourceInk:true,mmPerCell:.25,O:DEFAULTS,audit});
 assert.equal(r.drawn,1);assert.equal(fine.stats.calls,1);assert.equal(audit[0].after.water,0);
 assert(audit[0].contactWidthMm.every(v=>Math.abs(v-.2)<1e-6));
 assert(main.D[0].some(v=>v>0));assert.equal(fine.compose(Buffer.alloc(w*h*3,255)).length,w*h*3*4);
});
