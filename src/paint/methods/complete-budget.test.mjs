import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateStrokes,completeBudget,budgetPaths,strokeBudgetDefaults} from './stroke-budget.mjs';
test('whole-run counts include drawing and distribute across the final value passes',()=>{
 const shapes=Array.from({length:40},(_,i)=>({area:100+i,amount:.2,mask:Uint8Array.from({length:150},(_,j)=>j<100+i?1:0)})),layers=shapes.map(s=>({shapes:[s]}));
 for(const N of [250,2500]){const b=completeBudget({N,layers,drawing:20});assert.equal(shapes.reduce((n,s)=>n+b.target(s),20),N);assert.ok(b.target(shapes.at(-1))>0);}
 assert.deepEqual(allocateStrokes([1,1,1],2),[1,1,0]);
 assert.throws(()=>allocateStrokes([1],NaN));
});
test('lower budgets broaden coverage instead of taking the opening lanes',()=>{
 const w=80,h=40,mask=new Uint8Array(w*h).fill(1);
 for(const count of [4,16]){const paths=budgetPaths(mask,w,h,count);assert.equal(paths.length,count);assert.ok(paths[0][0].y<10);assert.ok(paths.at(-1)[0].y>30);}
 assert.ok(budgetPaths(mask,w,h,4)[0][0].r>budgetPaths(mask,w,h,16)[0][0].r);
 assert.deepEqual(budgetPaths(mask,w,h,0),[]);
});

test('budget off changes no render defaults; invalid budgets are rejected',()=>{
 assert.deepEqual(strokeBudgetDefaults(),{});assert.deepEqual(strokeBudgetDefaults(0),{});
 for(const bad of [-1,1,24,25.5,NaN,Infinity])assert.throws(()=>strokeBudgetDefaults(bad));
 assert.ok(strokeBudgetDefaults(250).midlayers<strokeBudgetDefaults(2500).midlayers);
});
test('a limited study never omits one colour channel of a selected passage',()=>{
 const mask=Uint8Array.from({length:100},(_,i)=>i<50?1:0);
 const red={mask,area:50,amount:.8},blue={mask:mask.slice(),area:50,amount:.01};
 const other={mask:Uint8Array.from(mask,v=>1-v),area:50,amount:.1};
 const b=completeBudget({N:2,layers:[{value:1,shapes:[red,other]},{value:1,shapes:[blue]}]});
 assert.equal(b.target(red),1);assert.equal(b.target(blue),1);assert.equal(b.target(other),0);
});
