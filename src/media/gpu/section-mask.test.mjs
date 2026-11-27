import test from 'node:test';
import assert from 'node:assert/strict';
import {makePaper} from '../paper.mjs';
import {createSheet,step,DEFAULTS} from '../sheet.mjs';
import {createBrush,dip,stroke} from '../brush.mjs';
import {attachGpu} from './link.mjs';

test('section pigment bound retains wet pickup and top-layer lift with exact GPU fields',t=>{
  const keys=['GPU_DEMAND_READBACK','GPU_DIRTY_UPLOAD','GPU_RESIDENT'],saved=keys.map(k=>process.env[k]);
  process.env.GPU_DEMAND_READBACK='fast';process.env.GPU_DIRTY_UPLOAD='1';process.env.GPU_RESIDENT='1';
  const sheets=[],O={...DEFAULTS,edgeEvap:0};
  try{
    const run=bounded=>{
      const sh=createSheet(makePaper(67,51,{seed:9}),Array.from({length:8},()=>({K:[.3,.5,.8],S:[.02,.02,.02],rho:.05,omega:1,gamma:.2})));sheets.push(sh);
      sh.layers.push(sh.pigments.map((_,k)=>Float32Array.from({length:sh.n},(_,i)=>k===5&&i%31===0?.03:0)));
      for(let y=10;y<35;y++)for(let x=8;x<50;x++){const i=y*sh.w+x;sh.W[i]=.1;sh.s[i]=.03;sh.G[2][i]=.02;sh.M[i]=sh.ever[i]=1;}
      const backend=attachGpu(sh,O,{mode:process.env.GPU_REQUIRED==='1'?'on':'auto',log(){}});
      if(backend.backend!=='gpu'){t.skip(backend.reason);return null;}
      const g=sh._gpu;
      g.brushGpu=false;
      if(!bounded)g.beginStroke=(s,r,options)=>{const {pigmentMask,...rest}=options;g.constructor.prototype.beginStroke.call(g,s,r,rest);};
      const brush=createBrush({model:'section',radius:5,bristles:16,seed:17});
      for(const conc of [[.3,0,0,0,0,0,0,0],Array(8).fill(0)]){
        dip(brush,{water:.7,conc});
        stroke(brush,sh,[{x:5,y:10},{x:40,y:30},{x:55,y:15}],{gpuBetween:true,flowEvery:8,between:k=>{if(k%8===0)step(sh,O);}});
      }
      g.syncAll(sh);
      return {fields:[sh.W,sh.s,sh.M,sh.ever,...sh.G,...sh.P,...sh.D,...sh.layers.flat()],mask:g.sentMask,brush:{resW:brush.resW,resP:brush.resP,hairs:brush.hairs}};
    };
    const full=run(false);if(!full)return;const bounded=run(true);
    assert.deepEqual(bounded.fields,full.fields);assert.deepEqual(bounded.brush,full.brush);
    assert.equal(full.mask,255);assert.equal(bounded.mask,(1<<0)|(1<<2)|(1<<5));
  }finally{sheets.forEach(s=>s._gpu?.close());keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});
