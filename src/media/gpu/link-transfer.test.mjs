import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuLink, attachGpu } from './link.mjs';
import { createSheet, DEFAULTS } from '../sheet.mjs';
import { makePaper } from '../paper.mjs';

function fixture(instrument = true) {
  const w = 8, h = 8, n = w * h, K = 1, planes = 7;
  const sheet = { w, h, n, K, layers: [], steps: 0, W: new Float32Array(n), s: new Float32Array(n),
    M: new Uint8Array(n), ever: new Uint8Array(n), G: [new Float32Array(n)], P: [new Float32Array(n)], D: [new Float32Array(n)] };
  const trace = [], gpu = new Float32Array(n * planes);
  let link;
  const dispatch = msg => {
    trace.push({ op: msg.op, rect: msg.rect && [...msg.rect] });
    if (msg.op === 'step') for (let i = 0; i < n; i++) gpu[i] *= .9;
    if (msg.op === 'up' || msg.op === 'down') {
      const [x, y, rw, rh] = msg.rect, a = rw * rh;
      for (let p = 0; p < planes; p++) for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) {
        const gi = p * n + (y + dy) * w + x + dx, ri = p * a + dy * rw + dx;
        if (msg.op === 'up') gpu[gi] = (msg.data ?? link.rectData)[ri];
        else link.rectData[ri] = gpu[gi];
      }
    }
  };
  link = new GpuLink({ postMessage: dispatch }, { rectData: new Float32Array(n * planes) }, sheet);
  link.call = dispatch;
  if (!instrument) link.recordTransfer = () => {};
  return { sheet, link, gpu, trace };
}
const run = f => {
  const { sheet: sh, link: l } = f;
  l.stale = true; l.fresh.stale();
  l.beginStroke(sh, [1, 1, 4, 4]);
  sh.W[18] = .5; sh.G[0][18] = .2;
  l.step(sh, {});
  sh.W[19] += .3;
  l.step(sh, {});
  l.endStroke(sh);
  l.syncAll(sh);
};
test('scalar transfer attribution preserves transport order and every sheet plane', () => {
  const before = fixture(false), after = fixture(); run(before); run(after);
  assert.deepEqual(after.trace, before.trace);
  assert.deepEqual(after.gpu, before.gpu);
  for (const k of ['W', 's', 'M', 'ever', 'G', 'P', 'D', 'steps']) assert.deepEqual(after.sheet[k], before.sheet[k]);
  const s = after.link.stats, phases = Object.values(s.transferPhases);
  assert.equal(s.cpuStrokes, 1); assert.equal(s.cpuStrokeFlows, 2); assert.equal(s.cpuStrokeRectCells, 16);
  assert.equal(s.transferPhases['cpu-stroke-entry'].down, 1);
  assert.equal(s.transferPhases['cpu-stroke-flow'].up, 2);
  assert.equal(s.transferPhases['cpu-stroke-flow'].down, 2);
  assert.equal(s.transferPhases['cpu-stroke-end'].up, 1);
  assert.equal(s.transferPhases['outside-stroke'].down, 1);
  for (const k of ['up', 'down', 'upBytes', 'downBytes']) assert.equal(phases.reduce((a, p) => a + p[k], 0), s[k]);
  assert.equal(after.link.transferPhase, 'outside-stroke');
});
test('flow attribution scope is restored after transport throws', () => {
  const f = fixture(); f.link.stroke = [0, 0, 2, 2];
  f.link.up = () => { throw new Error('transport failed'); };
  assert.throws(() => f.link.step(f.sheet, {}), /transport failed/);
  assert.equal(f.link.transferPhase, 'outside-stroke');
});

test('GPU initialization transfers private copies and retains owner arrays and Buffer masks',t=>{
  const sheet=createSheet(makePaper(8,8),[{K:[1,1,1],S:[.1,.1,.1],rho:.05,omega:1,gamma:0}]);
  sheet.G[0][3]=.125;sheet.D[0][3]=.25;sheet.P[0][3]=.5;
  sheet.layers.push([new Float32Array(sheet.n).fill(.125)]);
  sheet.resist=Buffer.alloc(sheet.n);sheet.resist[7]=1;
  const planes=[sheet.W,sheet.s,sheet.M,sheet.ever,...sheet.G,...sheet.D,...sheet.P,...sheet.layers[0],sheet.resist];
  const before=planes.map(a=>Uint8Array.from(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)));
  const info=attachGpu(sheet,{...DEFAULTS,edgeEvap:0},{mode:process.env.GPU_REQUIRED?'on':'auto',log:()=>{}});
  if(info.backend!=='gpu'){t.skip('GPU unavailable');return;}
  try{
    planes.forEach((a,i)=>assert.deepEqual(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),before[i]));
    sheet._gpu.call({op:'sums',mask:1});
    assert.equal(sheet._gpu.sumData[3],.875);
  }finally{sheet._gpu.close();}
});


test('initial pigment masks retain numeric semantics for signed zeros, NaNs, subviews and tails',()=>{
 for(let n=1;n<=17;n++){
  const planes=Array.from({length:5},()=>new Float32Array(n+2).subarray(1,n+1));
  planes[0].fill(-0);planes[1][n-1]=NaN;planes[2][0]=Number.MIN_VALUE;planes[3][n-1]=-.25;
  let expected=0;
  for(let k=0;k<planes.length;k++)if(planes[k].some(v=>v!==0))expected|=1<<k;
  assert.equal(GpuLink.maskOf(planes.length,k=>planes[k],n),expected);
  assert.equal(GpuLink.maskOf(planes.length,k=>Array.from(planes[k]),n),expected);
 }
});

test('paper gate scratch reuse never overwrites a live cached cell set',()=>{
  const {sheet,link}=fixture();
  link.stale=true;link.fresh.stale();link.paperVersion=-1;
  let calls=0;
  link.call=msg=>{
    assert.equal(msg.op,'paperGate');calls++;
    link.rectData.fill(0);link.rectData[0]=.003;link.rectData[2]=1;
  };
  for(let offset=0;offset<12;offset++){
    const cells=Array.from({length:40},(_,i)=>(i+offset)%sheet.n);
    assert.ok(link.measurePaperGate(sheet,cells,null,[0,0,8,8],true).dry);
    const before=calls;
    for(const entry of [...link.paperGateCache]){
      const query=Array.from(entry.cells);
      assert.ok(link.measurePaperGate(sheet,query,null,[0,0,8,8],true).dry);
      assert.deepEqual(Array.from(entry.cells),query);
    }
    assert.equal(calls,before,'every retained request is still a cache hit');
    assert.ok(link.paperGateCache.length<=8);
  }
  assert.equal(calls,12);
  assert.ok(link.paperGateIndices,'the retired allocation is available for reuse');
});
