import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheet, thickness, thicknessInto, thicknessTotals, layersChanged} from './sheet.mjs';
import {makePaper} from './paper.mjs';

test('thickness reductions preserve per-cell rounding, order, and layer invalidation', () => {
  const sheet=createSheet(makePaper(12,8,{seed:4}),Array.from({length:3},()=>({K:[1,1,1],S:[.1,.1,.1]})));
  let seed=123; const value=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/2**32)**4;};
  for(let round=-1;round<4;round++) {
    if(round>=0)sheet.layers.push(Array.from({length:3},()=>Float32Array.from({length:sheet.n},value)));
    for(const p of [...sheet.G,...sheet.D,...sheet.P])for(let i=0;i<p.length;i++)p[i]=value();
    if(round===2){sheet.layers[0][1][10]=10;layersChanged(sheet);}
    if(round===3)sheet._gpu={syncTop(){},syncAll(){},wetSums(){return sheet.G.map((g,k)=>Float32Array.from(g,(v,i)=>v+sheet.D[k][i]+sheet.P[k][i]));}};
    const planes=thickness(sheet);
    assert.deepEqual(thicknessTotals(sheet),planes.map(a=>a.reduce((s,v)=>s+v,0)));
    for(const scale of [1,2,4])for(const pigments of [1,3]) {
      const w=sheet.w/scale,expected=new Float32Array(sheet.n/scale**2*pigments);
      for(let y=0;y<sheet.h;y++)for(let x=0;x<sheet.w;x++)for(let k=0;k<pigments;k++) {
        const i=Math.floor(y/scale)*w+Math.floor(x/scale);
        if(scale===1)expected[i*pigments+k]=planes[k][y*sheet.w+x];
        else expected[i*pigments+k]+=planes[k][y*sheet.w+x]/scale**2;
      }
      const out=new Float32Array(expected.length).fill(999);
      assert.equal(thicknessInto(sheet,out,{scale,pigments}),out);assert.deepEqual(out,expected);
    }
  }
});
