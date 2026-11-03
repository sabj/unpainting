import test from 'node:test';
import assert from 'node:assert/strict';
import {certifyDryFixed, validDryFixedCertificate} from './paper-certificate.mjs';
import {layerStorageStats} from './layer-storage.mjs';
import {clipRuns, stableClipMask} from './sheet.mjs';
import {measureBrush} from '../paint/methods/wetdry.mjs';
import {openEdgeShare,sweepCover,sweepCount,brushedWashPaths,invalidateFlowField} from './wash.mjs';

test('certificate and cheap census never resolve queued layer getter',()=>{
  const layers=[],sheet={_rawLayers:layers,_layerVer:0,K:0};
  Object.defineProperty(sheet,'layers',{get(){throw Error('unexpected dry flush');}});
  certifyDryFixed(sheet);assert.equal(validDryFixedCertificate(sheet),true);
  assert.equal(layerStorageStats(sheet,{includeNonzero:false}).layers,0);
  layers.push([]);assert.equal(validDryFixedCertificate(sheet),false);
});
test('brush observation settles only pending hairs, with explicit diagnostic opt out',()=>{
  let settled=0;const b={K:1,resW:2,resP:[3],hairs:[],_pend:{hairs:false,link:{settleBrush(){settled++;}}}};
  assert.equal(measureBrush(b).waterMass,2);assert.equal(settled,0);
  b._pend.hairs=true;measureBrush(b,{settle:false});assert.equal(settled,0);
  measureBrush(b);assert.equal(settled,1);
});
test('stable clip runs cache while mutable clip edits remain visible',()=>{
  const mask=new Uint8Array([0,1,1,0]);assert.deepEqual(clipRuns(mask),[1,2]);
  mask[0]=1;assert.deepEqual(clipRuns(mask),[0,3]);
  stableClipMask(mask);const runs=clipRuns(mask);assert.equal(clipRuns(mask),runs);
});
test('bounded edges and known-cell sweep cover equal complete observations',()=>{
  const w=9,h=7,mask=new Uint8Array(w*h),box={x0:2,y0:1,x1:6,y1:5};
  let cells=0;for(let y=1;y<=5;y++)for(let x=2;x<=6;x++)if(x!==4||y!==3){mask[y*w+x]=1;cells++;}
  const paths=[[{x:2,y:2,r:2,p:1},{x:6,y:4,r:2,p:1}]],counts=sweepCount(paths,w,h);
  assert.equal(openEdgeShare(mask,w,h,box),openEdgeShare(mask,w,h));
  assert.equal(sweepCover(paths,mask,w,h,{counts,cells}),sweepCover(paths,mask,w,h,{counts}));
  assert.equal(sweepCover(paths,mask,w,h,{cells}),sweepCover(paths,mask,w,h));
});


test('rewritten shape-load fields do not reuse the preceding passage flow',()=>{
  const w=24,h=20,mask=new Uint8Array(w*h).fill(1),field=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)field[y*w+x]=x*x*.01;
  const opts={maxRadius:3,minRadius:1,minLength:2,field,seed:42,walk:true};
  brushedWashPaths(mask,w,h,opts);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)field[y*w+x]=y*y*.01;
  const fresh=brushedWashPaths(mask,w,h,{...opts,field:field.slice()});
  assert.notDeepEqual(brushedWashPaths(mask,w,h,opts),fresh,'fixture must expose stale cached direction');
  invalidateFlowField(field);
  assert.deepEqual(brushedWashPaths(mask,w,h,opts),fresh);
});
