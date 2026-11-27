import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheet,DEFAULTS} from '../sheet.mjs';
import {makePaper} from '../paper.mjs';
import {openGpu,GpuSheet} from './stepfull.mjs';
import {resetCpuStrokeDirty,markCpuStrokeCell,cpuStrokeDirtyRects} from '../cpu-stroke-dirty.mjs';
const fields=s=>[s.W,s.s,s.M,s.ever,...s.G,...s.P,...s.D];

test('row write spans are disjoint, tight and reset between epochs',()=>{
  const sheet={w:100,h:80};resetCpuStrokeDirty(sheet);
  for(const [x,y] of [[2,3],[4,3],[2,4],[4,4],[80,60]])markCpuStrokeCell(sheet,y*100+x);
  assert.deepEqual(cpuStrokeDirtyRects(sheet),[[2,3,3,2],[80,60,1,1]]);
  resetCpuStrokeDirty(sheet);assert.deepEqual(cpuStrokeDirtyRects(sheet),[]);
});

test('Metal disjoint transfers equal individual rectangles and leave gaps unchanged',async t=>{
  const {create,globals}=await import('webgpu');Object.assign(globalThis,globals);
  let device;
  try{({device}=await openGpu(create([])));}catch(error){if(process.env.GPU_REQUIRED==='1')throw error;t.skip(error.message);return;}
  const sheet=createSheet(makePaper(67,51,{seed:9}),Array.from({length:8},()=>({K:[.3,.5,.8],S:[.02,.02,.02],rho:.05,omega:1,gamma:.2})));
  fields(sheet).forEach((plane,k)=>{for(let i=0;i<sheet.n;i++)plane[i]=plane instanceof Float32Array?Math.fround((i+k*5)/10000):i%2;});
  const gpu=await GpuSheet.create(device,sheet,{...DEFAULTS,edgeEvap:0});
  try{
    const rects=[[1,2,5,3],[20,12,3,7],[60,45,7,6]];
    const expected=[];for(const r of rects)expected.push(...await gpu.readRect(r));
    const actual=await gpu.readRects(rects);assert.deepEqual(actual,Float32Array.from(expected));
    // Upload all fields, including -0, and verify untouched gaps against a full download.
    let base=0;
    for(const r of rects){const area=r[2]*r[3];for(let k=0;k<fields(sheet).length;k++)if(k!==2&&k!==3)for(let i=0;i<area;i++)if(i%7===0)actual[base+k*area+i]=-0;base+=area*fields(sheet).length;}
    gpu.writeRects(rects,actual,[0,0,sheet.w,sheet.h]);
    assert.deepEqual(await gpu.readRects(rects),actual);
    const whole=await gpu.readRect([0,0,sheet.w,sheet.h]),count=fields(sheet).length;
    for(let k=0;k<count;k++)for(let y=0;y<sheet.h;y++)for(let x=0;x<sheet.w;x++){
      if(rects.some(([rx,ry,rw,rh])=>x>=rx&&x<rx+rw&&y>=ry&&y<ry+rh))continue;
      assert.equal(whole[k*sheet.n+y*sheet.w+x],fields(sheet)[k][y*sheet.w+x]);
    }
  }finally{gpu.destroy();device.destroy();}
});
