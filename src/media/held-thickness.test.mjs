import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheet, thickness, fix, layersChanged } from './sheet.mjs';
import { makePaper } from './paper.mjs';
const pig={K:[1,1,1],S:[.02,.02,.02],rho:.05,omega:60,gamma:0};
test('cached held thickness retains wet-first double additions across cells, fixes and edits',()=>{
 const sheet=createSheet(makePaper(7,5),[pig,pig]);
 // Wide dynamic range exposes accidental Float32 rounding or reassociation.
 for(let l=0;l<12;l++)sheet.layers.push([0,1].map(k=>Float32Array.from({length:sheet.n},(_,i)=>((i+l+k)%7+1)*2**(-l*5))));
 const check=()=>{
  const held=thickness(sheet,{held:true});
  for(let k=0;k<2;k++){
   let got=0,ref=0;
   for(let i=0;i<sheet.n;i++){
    ref+=sheet.G[k][i]+sheet.D[k][i]+sheet.P[k][i];
    for(const layer of sheet.layers)ref+=layer[k][i];
    got=held(k,i,got);assert.equal(got,ref);
    let cell=sheet.G[k][i]+sheet.D[k][i]+sheet.P[k][i];
    for(const layer of sheet.layers)cell+=layer[k][i];
    assert.equal(held(k,i),cell);assert.equal(held(k,i),cell);
   }
  }
 };
 check();sheet.G[0][3]=.213;sheet.D[1][12]=.017;check();
 sheet.layers.at(-1)[0][3]=.7;check();
 fix(sheet);check();
 sheet.layers[2][1][12]=.25;layersChanged(sheet);check();
 sheet._gpu={pendingLayers:[{index:2}]};check();delete sheet._gpu;
});
