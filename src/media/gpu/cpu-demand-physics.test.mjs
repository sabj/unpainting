import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../paper.mjs';
import { createSheet, step, DEFAULTS, setClip, tapeSheet } from '../sheet.mjs';
import { createBrush, dip, stroke, recordMarks, TAPE } from '../brush.mjs';
import { createPen, dipPen, penStroke } from '../pen.mjs';
import { drawGestures } from '../draw.mjs';
import { GpuLink } from './link.mjs';
import {renderLayers} from '../km.mjs';
import { logicalUploadMetadata } from './cpu-demand-window.mjs';
const fields = sh => [sh.W, sh.s, sh.M, sh.ever, ...sh.G, ...sh.P, ...sh.D];
const instrument = b => ({ resW: b.resW, resP: b.resP, hairs: b.hairs?.map(h => ({...h})), rng: b.rs?.s, travel: b.travel, carry: b.carry, ink: b.ink, drop: b.drop,
  penBuffers:['A','given','seen','pin','dist','done','hk','hv'].map(k=>b[k]?.slice()),penClock:b.clock });
const clone = a => a.map(v => v.slice());
function fixture(enabled) {
  process.env.GPU_DIRTY_UPLOAD = '1';
  process.env.GPU_DEMAND_READBACK = enabled === 'fast' ? 'fast' : enabled ? '1' : '0';
  const w = 40, h = 48, pigs = [{ K: [.4, .2, .1], S: [.02, .02, .02], rho: .05, omega: 1.4, gamma: .25 }];
  const paper = makePaper(w, h, { seed: 9, tooth: .8, mmPerCell: .212, coldPress: { mmPerCell: .212 } });
  const local = createSheet(paper, pigs), remote = createSheet(paper, pigs);
  for (const sh of [local, remote]) sh.layers.push([Float32Array.from({ length: sh.n }, (_, i) => i % 17 === 0 ? .03 : 0)]);
  for (const sh of [local, remote]) for (let y = 13; y < 29; y++) for (let x = 12; x < 27; x++) {
    const i = y * w + x; sh.W[i] = .15; sh.M[i] = sh.ever[i] = 1; sh.G[0][i] = .04;
  }
  local.D[0][10*w+5]=remote.D[0][10*w+5]=-0;
  const n = local.n, O = { ...DEFAULTS, gran: .6, fixedBed: 1 }, rows = [], logical = [];
  let link;
  const raw = fields(local);
  let checkedReads = 0;
  let fullBrushPigments = false;
  const guard = array => new Proxy(array, {
    get(target,key) {
      if(typeof key==='string' && /^\d+$/.test(key) && local._cpuDemandWindow) {
        const i=Number(key);local._cpuDemandWindow.assertFresh([i%w,Math.floor(i/w),1,1]);checkedReads++;
      }
      if(key==='subarray')return (a,b)=>{
        if(local._cpuDemandWindow)for(let i=a;i<b;i++)local._cpuDemandWindow.assertFresh([i%w,Math.floor(i/w),1,1]);
        return target.subarray(a,b);
      };
      if(key===Symbol.iterator)return function*(){for(let i=0;i<target.length;i++){
        if(local._cpuDemandWindow){local._cpuDemandWindow.assertFresh([i%w,Math.floor(i/w),1,1]);checkedReads++;}
        yield target[i];
      }};
      if(['slice','map','reduce','reduceRight','forEach','every','some','find','findIndex','includes','indexOf','lastIndexOf'].includes(key))return (...args)=>{
        if(local._cpuDemandWindow)for(let i=0;i<target.length;i++)local._cpuDemandWindow.assertFresh([i%w,Math.floor(i/w),1,1]);
        return target[key](...args);
      };
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }
  });
  if(enabled){local.W=guard(local.W);local.s=guard(local.s);local.M=guard(local.M);local.ever=guard(local.ever);
    for(const name of ['G','P','D'])local[name]=local[name].map(guard);}
  const dispatch = m => {
    if (m.op === 'step') {
      step(remote, O);
      if(local._cpuDemandWindow)for(const plane of raw)plane.fill(plane instanceof Float32Array?NaN:173);
      return;
    }
    if(m.op==='upReduced') {
      logical.push(m.logicalRect);
      if(m.rect){const [x,y,rw,rh]=m.rect,a=rw*rh;
        fields(remote).forEach((p,k)=>{for(let yy=0;yy<rh;yy++)p.set(m.data.subarray(k*a+yy*rw,k*a+(yy+1)*rw),(y+yy)*w+x);});}
      const metadata=logicalUploadMetadata(remote,w,m.logicalRect,remote.K);
      fullBrushPigments ||= metadata.signedZero;
      link.ctrl[10]=metadata.mask;link.ctrl[11]=metadata.signedZero?1:0;return;
    }
    if (m.op === 'upNoop') { fullBrushPigments ||= m.signedZero === true;logical.push(m.logicalRect); return; }
    if (m.op !== 'up' && m.op !== 'down') return;
    const [x0, y0, rw, rh] = m.rect, a = rw * rh, data = m.data ?? link.rectData, lf = fields(local), rf = fields(remote);
    if (m.op === 'up') {
      fullBrushPigments ||= m.signedZero === true;
      // A fixture-only full scan proves the narrowed dirty bbox covers every write.
      if(enabled!=='fast')for (let p = 0; p < lf.length; p++) for (let i = 0; i < n; i++) if (!Object.is(lf[p][i], rf[p][i])) {
        const x = i % w, y = Math.floor(i / w);
        assert.ok(x >= x0 && x < x0 + rw && y >= y0 && y < y0 + rh, `untracked write plane${p} cell${i}`);
      }
      logical.push(m.logicalRect ?? m.rect);
    }
    for (let p = 0; p < lf.length; p++) for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const i = (y0 + y) * w + x0 + x, j = p * a + y * rw + x;
      if (m.op === 'up') rf[p][i] = data[j]; else link.rectData[j] = rf[p][i];
    }
  };
  link = new GpuLink({ postMessage: dispatch }, { rectData: new Float32Array(n * 7),ctrl:new Int32Array(16) }, local);
  link.call = m => { if(m.op==='upReduced')link.version++;dispatch(m); }; link.brushGpu = false; link.flushDrys = () => {};
  link.syncTop = () => { local.layers.at(-1)[0].set(remote.layers.at(-1)[0]); };
  local._gpu = link;
  const capture = b => rows.push({ fields: clone(fields(remote)), instrument: structuredClone(instrument(b)), clock: local.clock, touched: local.touched?.slice(), steps: local.steps,
    hostMask:link.wetMask,sentMask:link.sentMask,activeCounts:link.actCount.slice(),version:link.version,fullBrushPigments });
  return { local, remote, link, O, rows, logical, capture,checkedReads:()=>checkedReads };
}
function run(enabled, { tracked = true, thirsty = false, metered = false, pen = false, flat = false, draw = false, late=false,multiple=false,offsheet=false,noFlow=false,observer=false,perContact=false,interval=8 } = {}) {
  recordMarks(true);
  const f = fixture(enabled), sh = f.local; tapeSheet(TAPE); sh._tape = true;
  setClip(sh, Uint8Array.from({ length: sh.n }, (_, i) => (i % 40 > 4 + 2 * Math.sin(i / 100) && i % 40 < 36 ? 1 : 0)));
  const resist = Uint8Array.from({ length: sh.n }, (_, i) => (i % 40 > 18 && i % 40 < 23 && i / 40 > 18 && i / 40 < 24 ? 1 : 0));
  // Pre-attach resist initialization avoids exercising unrelated full-upload plumbing.
  sh.resist = f.remote.resist = resist;
  const path = [{ x: 5, y: 10, r: 4, p: .25, v: 1 }, { x: 29, y: 22, r: 6, p: .85, v: .8 }, { x: 10, y: 33, r: 3, p: .5, v: 1.4 }, { x: 37, y: 40, r: 5, p: .75, v: 1 }];
  if(offsheet){path[0].x=-10;path.at(-1).x=49;}
  let b = pen ? createPen({ reach: 3 }) : createBrush({ radius: 6, bristles: 18, capacity: 12, wetMix: .7, seed: 17, flat, depositDepth: metered ? .3 : 0 });
  if (pen) dipPen(b, [.15]); else dip(b, { water: thirsty ? .02 : .88, conc: thirsty ? [0] : [.2] });
  const options = { gpuBetween: tracked,flowEvery:perContact?0:interval, between: k => {
    if(observer && k%8===4){f.link.ensureFresh(sh,[0,0,sh.w,sh.h]);assert.ok(Number.isFinite(sh.W.reduce((a,v)=>a+v,0)));}
    if (!noFlow && k % (late?13:8) === 0) { step(sh, f.O);if(multiple)step(sh,f.O); f.capture(b); }
  } };
  if (draw) drawGestures(sh, [{ points: path, dip: true }], new Float32Array(sh.n).fill(.4), sh.w, sh.h,
    { ink: [.15], O: f.O, flowEvery: 8, beforeStroke: e => { b = e.pen; } });
  else if (pen) penStroke(b, sh, path, options); else stroke(b, sh, path, options);
  f.capture(b); f.tape = structuredClone(TAPE); recordMarks(false); tapeSheet(null);
  f.link.ensureFresh(sh,[0,0,sh.w,sh.h]);
  delete sh._gpu;
  return f;
}
for (const [name, config] of [['loaded-round', {}], ['thirsty', { thirsty: true }], ['metered', { metered: true }], ['flat', { flat: true }], ['pen', { pen: true }], ['production-draw', { pen: true, draw: true }], ['arbitrary-callback-fallback', { tracked: false }],['lateflow',{late:true}],['multipleflows',{multiple:true}],['offsheet-lift',{offsheet:true}],['no-flow',{noFlow:true}],['stateobserver-between',{observer:true}]]) {
  test(name + ': demand reads fresh; full physics/instrument/contact/tape match', () => {
    const before = run(false, config), after = run(true, config);
    assert.deepEqual(after.rows, before.rows);
    assert.deepEqual(clone(fields(after.local)), clone(fields(before.local)));
    assert.deepEqual(after.local.layers, before.local.layers);
    assert.deepEqual(after.logical, before.logical);
    assert.deepEqual(after.tape, before.tape);
    if(!config.noFlow)assert.ok(after.tape.some(m => m.k === (config.pen ? 'P' : 's') && m.fl?.length), 'instrument flow tape exercised');
    if(config.tracked !== false)assert.ok(after.checkedReads()>0);
    assert.equal(after.local._cpuStrokeDirty, undefined);
    assert.equal(after.local._cpuDemandWindow, undefined);
    if(!config.draw && config.tracked!==false && !config.noFlow && !config.observer){
      const perContact=run(true,{...config,perContact:true});
      assert.deepEqual(after.rows,perContact.rows);
      assert.ok(after.link.stats.down<=perContact.link.stats.down,'lookahead cannot increase these fixture maps');
    }
  });
}

// Cadence affects a conservative geometry hint, not the actual flow epoch.
for(const interval of [1,76,173,184,187,296,4096])test('explicit lookahead '+interval+' preserves exact state with earlier/later actual8-contact flows',()=>{const a=run(false,{interval}),b=run(true,{interval});assert.deepEqual(b.rows,a.rows);assert.deepEqual(clone(fields(b.local)),clone(fields(a.local)));assert.deepEqual(b.local.layers,a.local.layers);assert.deepEqual(b.tape,a.tape);assert.deepEqual(b.logical,a.logical);assert.ok(b.checkedReads()>0);});

test('Fast real CPU brush fallback shares lookahead readbacks and preserves physical output',()=>{
 const before=run(false),after=run('fast'),single=run('fast',{perContact:true});
 assert.deepEqual(clone(fields(after.remote)),clone(fields(before.remote)));
 assert.deepEqual(after.rows.map(r=>r.instrument),before.rows.map(r=>r.instrument));
 assert.deepEqual(after.tape,before.tape);
 const image=f=>renderLayers([...f.remote.layers,f.remote.G.map((p,k)=>Float32Array.from(p,(v,i)=>v+f.remote.P[k][i]+f.remote.D[k][i]))],f.remote.pigments,new Uint8Array(f.remote.n*3).fill(255),f.remote.n);
 const actual=image(after);assert.deepEqual(actual,image(before));assert.ok(actual.some(v=>v<250),'actual physical pigment must be visible');
 assert.ok(after.checkedReads()>0);
 assert.ok(after.link.stats.downBytes<before.link.stats.downBytes);
 assert.ok(after.link.stats.down<single.link.stats.down);
 assert.ok(after.link.stats.fastDemandUploads>0);
 console.log('W6 fixture counters '+JSON.stringify({full:{reads:before.link.stats.down,bytes:before.link.stats.downBytes},fast:{reads:after.link.stats.down,bytes:after.link.stats.downBytes},unbatched:{reads:single.link.stats.down,bytes:single.link.stats.downBytes}}));
});
