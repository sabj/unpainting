import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWetBed } from './wet-bed-prep.mjs';

// a bed the clean brush wets to glossy, the pickup takes to damp: the order and the brushes the sheet uses
test('a wet-into-wet bed is wetted by a clean brush made like the painting brush, then picked up with a thirsty one', () => {
  const calls = []; let bed = { moistShare: 0, waterP50: 0, waterMax: 0, saturationMax: 0 };
  const out = prepareWetBed({
    settings: { radius: 9, loadWater: 123, depositDepth: 0.2, wetMix: 0.85 }, bristles: 18, seed: 911, pigments: 3, target: 'sheet', points: ['p'], prepOpts: { lift: false },
    observe: () => bed, gate: () => ({ saturationMax: 0 }), advance: () => calls.push('advance'),
    createBrush: o => ({ o }), dip: (b, d) => calls.push(`dip ${d.water} [${d.conc}] depth ${b.o.depositDepth} load ${b.o.loadWater} bridge ${b.o.bridge}`),
    thirsty: (_b, t) => calls.push(`thirsty ${t.water}`),
    stroke: (b, target, points) => { calls.push(`stroke ${target}`); bed = b.o.depositDepth === 0 && calls.some(c => c.startsWith('thirsty')) ? { moistShare: 1, waterP50: 0.1 } : { moistShare: 1, waterP50: 0.4 }; },
  });
  assert.deepEqual(calls, ['dip 0.55 [0,0,0] depth 0 load 123 bridge 0', 'stroke sheet', 'dip 0.08 [0,0,0] depth 0 load 123 bridge 0', 'thirsty 0.08', 'stroke sheet']);
  assert.equal(out.paper.waterP50, 0.1);
});

// The numeric sheet callback is exercised directly, as the recorder tests exercise renderRaw.
// This is a synthetic observed-state/contact-domain regression, not replay of a saved physical sheet.
const callerSource = (await import('node:fs')).readFileSync(new URL('../plate/sheet.mjs', import.meta.url), 'utf8');
const numericCaller = callerSource.slice(callerSource.indexOf('const stroke=(b,target,points,options)=>{'), callerSource.indexOf(' if(!ctx.AREA_PLAN){', callerSource.indexOf('const stroke=(b,target,points,options)=>{')));
const sourceLine = marker => { const start=numericCaller.indexOf(marker); assert.ok(start>=0,marker); return numericCaller.slice(start,numericCaller.indexOf('\n',start)); };
const { measurePaper } = await import('../../src/paint/methods/wetdry.mjs');
const { layIntoWetBed } = await import('./wet-bed-wait.mjs');
const { resetChecks, setStrict } = await import('../../src/media/checks.mjs');
function domainFixture(freshCount=34){
 const cells=Array.from({length:100},(_,i)=>i),freshCells=cells.slice(0,freshCount);
 const target={w:10,h:10,n:100,W:Float32Array.from(cells,i=>i<freshCount?.09:.23),s:new Float32Array(100),paper:{capacity:new Float32Array(100).fill(1)}};
 const waitStart=numericCaller.indexOf('const observeWet='),waitBinding=numericCaller.slice(waitStart,numericCaller.indexOf(';',waitStart)+1);
 const observe=new Function('measurePaper','target','SPEED_PAPER','getObservationCells',waitBinding+'return observeWet;')(measurePaper,target,false,()=>cells);
 const prepare=read=>prepareWetBed({
  settings:{radius:9},bristles:18,seed:911,pigments:1,target,points:[{x:5,y:5,r:9,p:1}],prepOpts:{lift:false},
  observe:read,gate:()=>measurePaper(target,cells,false,{stats:'gate'}),
  createBrush:o=>({o}),dip:()=>{},thirsty:b=>{b.pickup=true;},
  // Scripted clean-water actions isolate the observation contract; they are not new brush physics.
  stroke:b=>{for(const i of cells)target.W[i]=b.pickup?Math.min(target.W[i],.1):Math.max(target.W[i],.09);},
  advance:()=>{throw Error('the evenly damp synthetic bed needs no absorption wait');}
 });
 const wait=()=>layIntoWetBed({paper:observe(),observe,O:{},step:()=>{
  for(const i of cells)target.W[i]=Math.max(0,target.W[i]-(i<freshCount?.001:.0005));
 }});
 const bound=new Function('measurePaper','target','freshCells','cells','SPEED_PAPER','getObservationCells',sourceLine('const observeBed=')+';return observeBed;')(measurePaper,target,freshCells,cells,false,()=>cells);
 return {cells,freshCells,target,observe,prepare,wait,bound};
}
test('numeric wet-bed preparation measures the same allowed contact as strict admission, including glossy overlap',()=>{
 resetChecks();setStrict(true);
 try{
  const old=domainFixture();
  const prepared=old.prepare(()=>measurePaper(old.target,old.freshCells,false,{uniform:false}));
  assert.equal(prepared.paper.cells,34);assert.equal(prepared.actions.length,0,'fresh-only bed already passes preparation');
  assert.ok(prepared.paper.moistShare>=.7&&prepared.paper.waterP50<=.15);
  assert.throws(old.wait,/wet wash laid on uneven paper/,'waiting for glossy overlap dries the fresh portion too far');
  const actual=domainFixture(),ready=actual.prepare(actual.bound);
  assert.equal(ready.paper.cells,100,'actual caller must prepare the entire allowed contact');
  assert.deepEqual(ready.actions.map(a=>a.operation),['pick up excess surface water']);
  const admitted=actual.wait();assert.equal(admitted.wetWaits,0);
  assert.ok(admitted.paper.moistShare>=.7&&admitted.paper.waterP50<=.15,'unchanged strict admission');
 }finally{resetChecks();}
});
test('numeric all-fresh preparation and into-own-wash exemption remain unchanged',()=>{
 const all=domainFixture(100),ready=all.prepare(all.bound);
 assert.equal(ready.paper.cells,100);assert.equal(ready.actions.length,0);assert.equal(all.wait().wetWaits,0);
 const ownBinding=sourceLine('const intoOwnWash=');
 const prepCondition=sourceLine('if(paint&&!intoOwnWash&&ownBed&&').split('{')[0].slice(3,-1);
 const admitted=new Function('freshCells','cells','paint','ownBed','ctx',ownBinding+';return '+prepCondition+';');
 assert.equal(admitted(new Array(29),new Array(100),true,true,{VALUE_ACTIVE:{move:'wet on wet'}}),false,'existing own-wash contact exemption');
 assert.equal(admitted(new Array(34),new Array(100),true,true,{VALUE_ACTIVE:{move:'wet on wet'}}),true,'existing fresh-contact threshold is not changed');
});
