import test from 'node:test';
import assert from 'node:assert/strict';
import {planSwatchJobs,swatchJob} from './planned-swatches.mjs';
import {scriptStrokePaths} from '../../src/paint/methods/script-stroke-paths.mjs';
import {pressedRadius,swatchDepth} from '../../src/paint/methods/mark-swatch.mjs';
import {sweepCover,sweepCount} from '../../src/media/wash.mjs';
import {sweptPath} from '../../src/paint/methods/zigzag-lanes.mjs';

test('swatch prescan uses the production mark footprint and excludes mutable passage metadata',()=>{
 const w=32,h=24,mask=new Uint8Array(w*h);for(let y=7;y<18;y++)for(let x=4;x<26;x++)mask[y*w+x]=1;
 const intent={kind:'strokes',move:'wet on wet',phase:'light',load:{water:.88},script:{underShare:.75},strokes:[{radiusMm:3,points:[[5,10,.7],[24,10,.7]]},{radiusMm:3,points:[[5,12,.7],[24,12,.7]]}]};
 const sh={mask,_valuePlan:intent},options={SC:1,W2:w,H2:h,w,sheetMm:w,markCount:3};
 const {jobs,planned}=planSwatchJobs([{shapes:[sh,structuredClone(sh)]}],options);
 const paths=scriptStrokePaths(intent.strokes,{scale:1,cellsPerMm:1,splay:.03}).map(pts=>pts.map(q=>({...q,r:Math.max(.5,pressedRadius(q.r,q.p))}))).map(sweptPath);
 const cells=mask.reduce((a,v)=>a+v,0),cover=sweepCover(paths,mask,w,h,{counts:sweepCount(paths,w,h),cells});
 assert.equal(planned.size,1);assert.equal(jobs.size,4);
 for(const job of jobs.values()){
  assert(!('valuePlan' in job.T));if(job.mark)assert.equal(job.mark.depth,swatchDepth(Math.max(1,cover)));
 }
 const T={name:'x',water:.5,wetMix:0,bridge:0,bridgeSoft:1,passes:1,valuePlan:{get target(){throw Error('passage data read');}}};
 assert.deepEqual(swatchJob({kind:'wash',T}).T,{name:'x',water:.5,wetMix:0,bridge:0,bridgeSoft:1,passes:1});
 assert.equal(swatchJob({kind:'mark',T,mark:{depth:1.000001}}).mark.depth,1);
});
