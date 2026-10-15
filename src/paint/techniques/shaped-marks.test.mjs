import test from 'node:test';
import assert from 'node:assert/strict';
import {shapedPlanePaths} from './shaped-marks.mjs';
test('a wide physical plane uses the same mop lanes at different native densities',()=>{
 const plan=d=>{const w=120*d,h=100*d,m=new Uint8Array(w*h).fill(1);return shapedPlanePaths(m,w,h,{mmPerCell:.5/d,maxBrushMm:38});};
 const a=plan(1),b=plan(2); assert.ok(a.length>1);assert.equal(a.length,b.length);
 for(const paths of [a,b])for(const p of paths)assert.ok(p.length>1);
});
test('texture marks retain their single broken-contact gesture',()=>{
 const m=new Uint8Array(120*100).fill(1);
 assert.equal(shapedPlanePaths(m,120,100,{texture:true,mmPerCell:.5,maxBrushMm:38}).length,1);
});
