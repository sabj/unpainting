import test from 'node:test';
import assert from 'node:assert/strict';
import {makePaper} from '../paper.mjs';
import {createSheet,step,dry,DEFAULTS} from '../sheet.mjs';
import {makeInkRes} from '../../paint/methods/ink-res.mjs';
import {attachGpu} from './link.mjs';

const fields=s=>[s.W,s.s,s.M,s.ever,...s.G,...s.P,...s.D,...s.layers.flat()];
test('Metal fine drawing carry preserves every field, recipient and clamp through flow and drying',t=>{
  const keys=['GPU_RESIDENT','GPU_ASYNC_DRY'],saved=keys.map(k=>process.env[k]);
  process.env.GPU_RESIDENT='1';process.env.GPU_ASYNC_DRY='1';
  const sheets=[],O={...DEFAULTS,edgeEvap:0,evap:.02,paperDry:.02,flowIters:3};
  try{
    const run=sparse=>{
      const pigments=Array.from({length:8},(_,k)=>({name:k===7?'graphite HB':'paint',K:[.3,.5,.8],S:[.02,.02,.02],rho:.05,omega:k===7?60:1,gamma:.2}));
      const sh=createSheet(makePaper(67,51,{seed:9}),pigments);sheets.push(sh);
      for(let i=0;i<sh.n;i++){
        sh.D[6][i]=.003;sh.D[7][i]=.002;sh.G[2][i]=.01;
        if(i%3){sh.W[i]=.1;sh.s[i]=.03;sh.M[i]=sh.ever[i]=1;sh.G[6][i]=.007;sh.G[7][i]=.005;}
      }
      const R=makeInkRes({N:2,W2:sh.w,H2:sh.h,paperOpts:{seed:9},pigments,main:sh,inkAt:6,graphiteAt:7});
      const backend=attachGpu(sh,O,{mode:process.env.GPU_REQUIRED==='1'?'on':'auto',log(){}});
      if(backend.backend!=='gpu'){t.skip(backend.reason);return null;}
      const g=sh._gpu;if(!sparse)g.editPigmentCells=undefined;
      const snapshots=[];
      for(let phase=0;phase<3;phase++){
        step(sh,O); // the CPU arrays are stale at the drawing's arrival
        for(const k of [0,1])for(const i of [0,4,68,1600,3201,3416]){
          const x=i%sh.w,y=(i/sh.w)|0,j=y*2*R.width+x*2;
          R.fine.D[k][j]=phase===1?0:(k+1)*.12*(phase+1);
        }
        R.changed();R.carry();
        g.syncAll(sh);snapshots.push(fields(sh).map(a=>a.slice()));
        const down=g.stats.down,up=g.stats.up;R.carry();
        assert.equal(g.stats.down,down,'no-op carry does not read the sheet');
        assert.equal(g.stats.up,up,'no-op carry does not write the sheet');
      }
      step(sh,O);dry(sh,1000,O,{dt:14,levelMax:12,analyticTail:true});g.syncAll(sh);
      snapshots.push(fields(sh).map(a=>a.slice()));
      return {snapshots,stats:{...g.stats}};
    };
    const before=run(false);if(!before)return;const after=run(true);
    for(let q=0;q<before.snapshots.length;q++)for(let p=0;p<before.snapshots[q].length;p++){
      const a=after.snapshots[q][p],b=before.snapshots[q][p];
      for(let i=0;i<a.length;i++)assert.ok(Object.is(a[i],b[i]),`snapshot ${q} plane ${p} cell ${i}: ${a[i]} versus ${b[i]}`);
    }
    assert.equal(after.stats.pigmentEdits,6);
    assert.ok(after.stats.upBytes<before.stats.upBytes/2);
    console.log('fine carry '+JSON.stringify({whole:{down:before.stats.downBytes,up:before.stats.upBytes},cells:{down:after.stats.downBytes,up:after.stats.upBytes}}));
  }finally{sheets.forEach(s=>s._gpu?.close());keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});
