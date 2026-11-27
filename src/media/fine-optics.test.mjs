import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renderLayers } from './km.mjs';
import { fineLayers } from './fine-pigment.mjs';
import { renderFine } from './fine-optics.mjs';

function fixture(n) {
  const K = 3, planes = () => Array.from({ length: K }, () => new Float32Array(n));
  return { fn:n,K,L:{steps:0},G:planes(),D:planes(),P:planes(),layers:[planes(),planes()],
    sheet:{pigments:[{K:[.46,.29,.05],S:[.02,.02,.02]},{K:[.03,.4,.25],S:[.04,.03,.02]},{K:[0,0,0],S:[.1,.1,.1]}]} };
}
function hash(F) {
  const h=createHash('sha256');
  for(const a of [F.G,F.D,F.P,...F.layers].flat())h.update(Buffer.from(a.buffer));
  return h.digest('hex');
}

test('bounded fine export matches whole-palette KM exactly across chunks, glazes and a partial final chunk', () => {
  const F=fixture(32769),paper=new Uint8Array(F.fn*3);
  for(let i=0;i<F.fn;i++){
    paper.set([220+i%35,210+i%43,200+i%51],i*3);
    for(let k=0;k<F.K;k++){
      F.G[k][i]=(i*(k+1)%17)/100;F.D[k][i]=(i+k)%11/80;F.P[k][i]=(i+k)%7/90;
      F.layers[0][k][i]=k===1?0:(i+k)%13/70;
      F.layers[1][k][i]=i%5?0:(i+k)%9/60;
    }
  }
  const before=hash(F);
  for(const scale of [0,.3,1,4]) assert.deepEqual(renderFine(F,paper,scale),renderLayers(fineLayers(F),F.sheet.pigments,paper,F.fn,scale));
  assert.equal(hash(F),before,'optics must not move or fix physical pigment');
});

test('an empty fine export is exactly its paper, including the last cell', () => {
  const F=fixture(20003),paper=Uint8Array.from({length:F.fn*3},(_,i)=>160+i%96);
  assert.deepEqual(renderFine(F,paper),new Uint8ClampedArray(paper));
});

test('fine export rejects pending water/pigment steps and mismatched paper or scale', () => {
  const F=fixture(5),paper=new Uint8Array(15);
  for(const steps of [1,2]){F.L.steps=steps;assert.throws(()=>renderFine(F,paper),/consume the fine step/);}
  F.L.steps=0;
  assert.throws(()=>renderFine(F,new Uint8Array(12)),/paper geometry/);
  for(const scale of [-1,NaN,Infinity])assert.throws(()=>renderFine(F,paper,scale),/KM scale/);
});
