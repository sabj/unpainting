import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverWash, remainingMix } from './colour-budget.mjs';
test('smooth colour keeps its budget; textured colour reserves a pale wash and dry detail', () => {
 const M={Aw: new Float32Array([.3,.6,.3,.6]),Ad:new Float32Array([.7,1.4,.7,1.4])};
 recoverWash(M, new Float32Array([0,1]),2);
 assert.ok(Math.abs(M.Aw[0]-1)<1e-6);
 assert.ok(Math.abs(M.Aw[2]-.3)<1e-6);
 for(let i=0;i<4;i++) assert.ok(Math.abs(M.Aw[i]+M.Ad[i]-(i%2?2:1))<1e-6);
});
test('a dry charge contains only missing pigments and cannot charge a complete cell',()=>{
 assert.deepEqual(remainingMix([1,2],[2,.5]),[0,1.5]);
 assert.deepEqual(remainingMix([0,0],[0,0]),[0,0]);
});
import { deferredFirstWash } from './colour-budget.mjs';
import { passage } from '../../crop/blockin.mjs';
test('a suppressed mixed first wash is deferred with every pigment, without changing the opening',()=>{
 const ids=Uint8Array.from([1,1,1,1]);
 const sh=passage(ids,1,{x0:0,y0:0,x1:3,y1:0},.2,4,4); sh.mix=[.2,.1];
 const layers=[{value:1,pigment:0,shapes:[sh]}];
 const later=deferredFirstWash(layers,{subject:Uint8Array.from([0,0,1,1]),n:4,open:.22,tint:0});
 assert.equal(layers[0].shapes[0],sh);assert.equal(sh.amount,.2);
 const sums=[0,0];for(const p of later[0].shapes) for(let j=0;j<2;j++) sums[j]+=p.area*p.mix[j];
 assert.ok(Math.abs(sums[0]-(.2*4-.2*.22*2))<1e-6);
 assert.ok(Math.abs(sums[1]-(.1*4-.1*.22*2))<1e-6);
 assert.equal(later[0].value,2);
});
test('a fully paid opening schedules no clear-water replacement',()=>{
 const sh=passage(Uint8Array.from([1,1]),1,{x0:0,y0:0,x1:1,y1:0},.2,2,2);sh.mix=[.2,.1];
 assert.deepEqual(deferredFirstWash([{value:1,pigment:0,shapes:[sh]}],{subject:null,n:2,open:1,tint:1}),[]);
});
