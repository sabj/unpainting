import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheet, DEFAULTS} from '../sheet.mjs';
import {makePaper} from '../paper.mjs';
import {GpuSheet, openGpu, analyse, SRC} from './stepfull.mjs';
import {FINISH_WET_SCAN} from './finish-wet-scan.mjs';
import {SheetBatch} from './sheet-batch.mjs';

const pigments=[{K:[.4,.2,.1],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25},
  {K:[.1,.3,.5],S:[.03,.03,.03],rho:.3,omega:.9,gamma:.7}];
const fields=s=>[s.W,s.s,s.M,s.ever,...s.G,...s.P,...s.D];
function fixture() {
  const s=createSheet(makePaper(99,81,{seed:9}),pigments);
  // Isolated interior damp tile, plus flowing contacts across tile corners and sheet edges.
  for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++) {
    const i=y*s.w+x;
    if((x>=45&&x<=51&&y>=29&&y<=35)||(x>94&&y>75)) {
      s.M[i]=s.ever[i]=1;s.W[i]=.12+.004*(i%11);s.s[i]=.3;
      for(let k=0;k<2;k++){s.G[k][i]=.015*(k+1);s.P[k][i]=.002;s.D[k][i]=.004;}
    }
    if(x>=22&&x<=25&&y>=54&&y<=57){s.s[i]=.15;s.P[0][i]=.01;}
  }
  return s;
}
test('fused faces bind exactly ten storage buffers',()=>{
  const info=analyse(SRC+FINISH_WET_SCAN);
  assert.equal(info.uses('faces_pflux').filter(b=>info.decl.find(d=>d.binding===b).kind.startsWith('storage')).length,10);
  for(const name of ['p5c_wetfrontier','p5c_wetscan','p5ab','slide_apply_cap_sp']) {
    assert(info.uses(name).filter(b=>b!==0).length<=10,`${name} uses ${info.uses(name).filter(b=>b!==0).length} storage bindings`);
  }
});

test('GPU fusion and tight frontier retain fields across boundaries, drying and re-upload', {timeout:120000}, async t=>{
  const keys=['GPU_RESIDENT','GPU_PERSISTENT','GPU_FUSE_FACES','GPU_FUSE_WETSCAN','GPU_SPARSE_TIGHT','GPU_WORKERS'];
  const saved=keys.map(k=>process.env[k]);let device;
  try {
    let gpu;
    try {const w=await import('webgpu');Object.assign(globalThis,w.globals);gpu=w.create([]);({device}=await openGpu(gpu));}
    catch(e){t.skip(`GPU unavailable: ${e.message}`);return;}
    for(const persistent of ['0','1'])for(const special of [false,true]) {
      process.env.GPU_RESIDENT='1';process.env.GPU_PERSISTENT=persistent;process.env.GPU_WORKERS='2';
      const o={...DEFAULTS,dt:2,...(special?{slope:.2,marangoni:.03,capEps:.01}: {})};
      const sheets=[];const counts=[];
      for(const optimized of [false,true]) {
        process.env.GPU_FUSE_FACES=optimized?'1':'0';process.env.GPU_FUSE_WETSCAN=optimized?'1':'0';process.env.GPU_SPARSE_TIGHT=optimized?'1':'0';
        const s=fixture(),g=await GpuSheet.create(device,s,o);
        try {
          for(const name of ['p5c_wetfrontier','p5c_wetscan','p5ab','slide_apply_cap_sp']) {
            assert.equal(!!g.p[name],optimized && device.limits.maxStorageBuffersPerShaderStage>=10,name+' compiled for the selected arm');
          }
          g.step(60,25,true);await g.download(s);
          // A host stamp into a previously culled tile must re-open its halo.
          const i=8*s.w+8;s.M[i]=s.ever[i]=1;s.W[i]=.2;s.G[0][i]=.01;g.upload(s);
          g.step(15,25,true);
          if(!special) {
            g.dryBegin(4000,o,{level:25,levelMax:50,dt:14});await g.dryAdvance();
            assert.equal(g.dryS.done,true,'ordinary dry solver reaches settled state');
            g.step(1,25,true);
            assert.equal((await g.counters())[0],0,'settled tiles leave the next indirect tile list immediately');
          }
          await g.download(s);
          counts.push(new Uint32Array(await g.readWords('CTR',64))[8]);
          sheets.push(fields(s).map(a=>a.slice()));
        } finally {g.destroy();}
      }
      let peak=0;
      for(let p=0;p<sheets[0].length;p++)for(let i=0;i<sheets[0][p].length;i++)peak=Math.max(peak,Math.abs(sheets[0][p][i]-sheets[1][p][i]));
      assert(peak<2e-6,`persistent=${persistent} special=${special} max field error ${peak}`);
      if(!special)assert(counts[1]<counts[0],`tight frontier must cull tile work: ${counts}`);
      else assert.equal(counts[0],counts[1],'low capillary threshold must retain conservative halo');
      t.diagnostic(JSON.stringify({persistent,special,peak,tileSteps:counts}));
    }
    // Two independent sheets exercise the shared tile queue and per-sheet halo offsets.
    process.env.GPU_RESIDENT='1';process.env.GPU_PERSISTENT='1';
    const batched=[];
    for(const optimized of [false,true]) {
      process.env.GPU_FUSE_FACES=optimized?'1':'0';process.env.GPU_FUSE_WETSCAN=optimized?'1':'0';process.env.GPU_SPARSE_TIGHT=optimized?'1':'0';
      const sheets=[fixture(),fixture()];for(const a of fields(sheets[1]))a.reverse();
      const core=await SheetBatch.create(device,2,sheets[0],DEFAULTS);
      const views=[];
      try {
        for(let i=0;i<2;i++)views.push(await core.attach(i,sheets[i],DEFAULTS));
        views.forEach(v=>v.step(40));await views[0].idle();
        for(let i=0;i<2;i++)await views[i].download(sheets[i]);
        batched.push(sheets.map(s=>fields(s).map(a=>a.slice())));
      } finally {
        views.forEach(v=>v.destroy());Object.values(core.b).forEach(b=>b.destroy());core.sel.destroy();core.arenaBuf?.destroy();
      }
    }
    let batchPeak=0;
    for(let s=0;s<2;s++)for(let p=0;p<batched[0][s].length;p++)for(let i=0;i<batched[0][s][p].length;i++)
      batchPeak=Math.max(batchPeak,Math.abs(batched[0][s][p][i]-batched[1][s][p][i]));
    assert(batchPeak<2e-6,`batched field error ${batchPeak}`);t.diagnostic(`batch max field error ${batchPeak}`);
  } finally {device?.destroy();keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});
