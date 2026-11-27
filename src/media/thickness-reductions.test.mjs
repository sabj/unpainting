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

test('selective thickness extends each channel lazily and invalidates changed lower layers', () => {
  const sheet=createSheet(makePaper(12,8),Array.from({length:4},()=>({K:[1,1,1],S:[.1,.1,.1]})));
  sheet._zeroLayer=new Float32Array(sheet.n);
  const layer=l=>Array.from({length:4},(_,k)=>k===2?sheet._zeroLayer:Float32Array.from({length:sheet.n},(_,i)=>(l+k+i%7)*.013));
  const check=channels=>{
    const selected=thickness(sheet,{channels}),old=process.env.LAYER_CACHE;
    process.env.LAYER_CACHE='0';
    try {
      const plain=thickness(sheet);
      for(const k of new Set(channels.filter(k=>Number.isInteger(k)&&k>=0&&k<sheet.K)))assert.deepEqual(selected[k],plain[k]);
    } finally {if(old===undefined)delete process.env.LAYER_CACHE;else process.env.LAYER_CACHE=old;}
  };
  for(let l=0;l<6;l++){
    sheet.layers.push(layer(l));sheet.G[1][l]=.03;
    check([1,1,-1,7,.5]);
    assert.equal(sheet._thickLower.sum[0],undefined,'unqueried pigment is not allocated');
  }
  check([0,2,3]);
  const cached=sheet._thickLower;
  sheet.layers[2][1][4]=.75;layersChanged(sheet);check([1]);assert.notEqual(sheet._thickLower,cached);
  sheet.layers[1]=layer(9);check([0,1]);
  sheet.layers.length=2;check([0,1,2,3]);
  sheet.layers=sheet.layers.slice();check([0,1,2,3]);
  assert.deepEqual(thickness(sheet,{channels:[-1,.5,99]}),new Array(sheet.K));
});

test('selective thickness notices deferred GPU archives populated in place',()=>{
  const sheet=createSheet(makePaper(4,4),Array.from({length:2},()=>({K:[1,1,1],S:[.1,.1,.1]})));
  sheet.layers=Array.from({length:3},()=>Array.from({length:2},()=>new Float32Array(sheet.n)));
  let filled=false;
  sheet._gpu={syncTop(_sheet,_sums,mask){
    if(mask===2&&!filled){sheet.layers[0][1].fill(.25);sheet.layers[0]._cacheVersion=1;filled=true;}
  },wetSums(){return null;},syncAll(){}};
  assert.equal(thickness(sheet,{channels:[0]})[0][0],0);
  assert.equal(thickness(sheet,{channels:[1]})[1][0],.25);
  assert.equal(thickness(sheet)[1][0],.25);
});
