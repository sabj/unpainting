import test from 'node:test';
import assert from 'node:assert/strict';
import {FreshMap} from './fresh.mjs';
import {GpuLink,attachGpu} from './link.mjs';
import {createSheet,step,dry,DEFAULTS} from '../sheet.mjs';
import {makePaper} from '../paper.mjs';
import {createBrush,dip,stroke} from '../brush.mjs';

test('dirty runs exclude fresh gaps, clip edge tiles and become fresh independently',()=>{
  const map=new FreshMap(97,81);
  map.staleRect([2,2,2,2]);map.staleRect([89,73,8,8]);
  const rects=map.staleRects([0,0,97,81]);
  assert.deepEqual(rects,[[0,0,8,8],[88,72,9,9]]);
  map.mark(rects[0]);assert.deepEqual(map.staleRects([0,0,8,8]),[]);
  assert.deepEqual(map.staleRects([0,0,97,81]),[rects[1]]);
  map.mark(rects[1]);assert.deepEqual(map.staleRects([0,0,97,81]),[]);
});

test('dry knowledge survives local changes; flow expands all wet regions, unknown writes invalidate',()=>{
  const w=128,h=96,n=w*h,sh={W:new Float32Array(n).fill(1),s:new Float32Array(n).fill(2),M:new Uint8Array(n).fill(1)};
  const g=Object.assign(Object.create(GpuLink.prototype),{w,h,version:1,paperFresh:new FreshMap(w,h)});
  g.paperZero(sh);assert.ok(sh.W.every(v=>v===0));assert.ok(sh.M.every(v=>v===0));
  g.version++;g.paperChanged([8,8,2,2],0,1);
  const first=g.paperFresh.staleRects([0,0,w,h]);assert.deepEqual(first,[[8,8,8,8]]);g.paperFresh.mark(first[0]);
  g.version++;g.paperChanged([88,72,2,2],0,2);
  assert.equal(g.paperFresh.staleBounds([8,8,2,2]),null);
  g.version++;g.paperChanged(null,1,3);
  assert.ok(g.paperFresh.staleBounds([5,5,1,1]));
  assert.equal(g.paperFresh.staleBounds([120,90,1,1]),null);
  g.version+=2;g.paperChanged([8,8,1,1],0,g.version-1);
  assert.equal(g.paperWetRect,null);assert.notEqual(g.paperVersion,g.version);
});

test('GPU incremental observations equal full W/S/M after strokes, flow, dry, upload and queued dry',t=>{
  const keys=['GPU_PAPER_OBSERVE','GPU_ASYNC_DRY','GPU_RESIDENT'];const saved=keys.map(k=>process.env[k]);
  process.env.GPU_PAPER_OBSERVE='1';process.env.GPU_ASYNC_DRY='1';process.env.GPU_RESIDENT='1';
  const sh=createSheet(makePaper(97,81,{seed:7}),[{K:[.35,.49,.66],S:[.06,.025,.014],rho:.05,omega:1.4,gamma:.15}]);
  try {
    const info=attachGpu(sh,DEFAULTS,{mode:'auto',log(){}});if(info.backend!=='gpu'){t.skip(info.reason);return;}
    const g=sh._gpu;
    const compare=()=>{
      g.ensurePaperFresh(sh,[0,0,sh.w,sh.h],true);
      const expected=[sh.W.slice(),sh.s.slice(),sh.M.slice()];
      // Direct down intentionally does not mark freshness: exercise the incremental cache next time.
      g.down(sh,[0,0,sh.w,sh.h]);
      [sh.W,sh.s,sh.M].forEach((v,i)=>assert.deepEqual(v,expected[i]));
      const reads=g.stats.paperDown??0;g.ensurePaperFresh(sh,[0,0,sh.w,sh.h],true);assert.equal(g.stats.paperDown??0,reads);
    };
    dry(sh,100,DEFAULTS,{analyticTail:true,dt:14});
    const brush=createBrush({radius:3,bristles:8,seed:11});
    const mark=(x,y)=>{dip(brush,{water:.5,conc:[.1]});stroke(brush,sh,[{x,y},{x:x+4,y:y+5}],{lift:true});};
    mark(12,12);compare();mark(80,70);compare();
    assert.ok(g.stats.paperDownBytes<sh.n*12*2,'local marks transfer only modified tiles');
    for(let i=0;i<3;i++)step(sh,DEFAULTS);compare();
    dry(sh,2000,DEFAULTS,{analyticTail:true,dt:14});
    mark(40,30); // Enqueue a stroke after dry, before draining dry metadata.
    compare();
    sh.W[0]=.08;sh.s[0]=.1;sh.M[0]=1;g.cpuWroteAll();g.ensurePaperFresh(sh,[0,0,1,1],true);
    step(sh,DEFAULTS);compare();
    // A threshold-only queued dry is not an exact zero certificate.
    sh.W.fill(0);sh.M.fill(0);sh.s.fill(.0001);g.cpuWroteAll();
    g.dry(sh,100,DEFAULTS,{analyticTail:false,dt:14});
    compare();assert.ok(sh.s.some(v=>v>0),'retain pore traces outside the wet frontier');
    for(let i=0;i<128;i++)g.dry(sh,100,DEFAULTS,{analyticTail:false,dt:14});
    assert.equal(g.pendingPaperZero,false,'automatic metadata drain resolves its pending observation');
    compare();
  } finally {sh._gpu?.close();keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});

test('GPU gates reduce arbitrary cell sets, reuse identical requests, and fall back at moisture thresholds',t=>{
  const sh=createSheet(makePaper(65,49,{seed:19}),[{K:[.3,.5,.8],S:[.02,.02,.02],rho:.05,omega:1,gamma:.2}]);
  for(let i=0;i<sh.n;i++){sh.W[i]=(i%23)/1000;sh.s[i]=sh.paper.capacity[i]*(i%11)/10;}
  try{
    const info=attachGpu(sh,DEFAULTS,{mode:'auto',log(){}});if(info.backend!=='gpu'){t.skip(info.reason);return;}
    const g=sh._gpu,cells=Uint32Array.from({length:1700},(_,i)=>(i*37)%sh.n),rect=[0,0,sh.w,sh.h];
    const forceStale=()=>{g.stale=true;g.fresh.stale();g.paperFresh.stale();};forceStale();
    // Avoid the intentionally borderline 0.6 cells for this ordinary reduction.
    const ordinary=cells.filter(i=>i%11!==6);
    const expected=indices=>{let waterMax=0,saturationMax=0,moist=0;for(const i of indices){const water=sh.W[i],sat=sh.s[i]/Math.max(1e-8,sh.paper.capacity[i]);waterMax=Math.max(waterMax,water);saturationMax=Math.max(saturationMax,sat);if(water>=.015||sat>=.6)moist++;}return {waterMax,saturationMax,moistShare:moist/indices.length,dry:waterMax<=.004&&saturationMax<=.02};};
    const a=g.measurePaperGate(sh,ordinary,null,rect,true),b=expected(ordinary);
    assert.equal(a.waterMax,b.waterMax);assert.ok(Math.abs(a.saturationMax-b.saturationMax)<1e-7);assert.equal(a.moistShare,b.moistShare);assert.equal(a.dry,b.dry);
    const reads=g.stats.paperGate;assert.deepEqual(g.measurePaperGate(sh,ordinary,null,rect,true),a);assert.equal(g.stats.paperGate,reads);
    const changed=ordinary.slice();changed[0]=changed[1];g.measurePaperGate(sh,changed,null,rect,true);assert.equal(g.stats.paperGate,reads+1,'same-sized mutable requests do not alias');
    assert.equal(g.measurePaperGate(sh,cells,null,rect,true),null,'borderline saturation requires exact CPU observation');
    assert.ok(g.stats.paperGateFallback>0);
    assert.ok(g.stats.paperGateBytes<g.stats.paperGateIndexBytes/8);
    // Reach filtering preserves the original denominator and excludes dry cells.
    const wetCells=new Uint32Array(sh.n);for(const i of ordinary)if(i%2)wetCells[i]=3;
    const reachable=ordinary.filter(i=>i%2),want=expected(reachable);
    const actual=g.measurePaperGate(sh,ordinary,{wetCells,exactEpoch:3},rect,true);
    assert.equal(actual.waterMax,want.waterMax);assert.equal(actual.moistShare,want.moistShare*reachable.length/ordinary.length);
    sh.W.fill(0);for(let i=0;i<sh.n;i++)sh.s[i]=sh.paper.capacity[i]*.5;
    g.cpuWroteAll();g.fullUp(sh);forceStale();
    assert.equal(g.measurePaperGate(sh,ordinary,null,rect,true),null,'prewet depth boundary uses exact observation');
    sh.s.fill(0);sh.W[ordinary[0]]=2**-149;
    g.cpuWroteAll();g.fullUp(sh);forceStale();
    assert.equal(g.measurePaperGate(sh,ordinary,null,rect,true),null,'subnormal water cannot become a false zero certificate');
  }finally{sh._gpu?.close();}
});
