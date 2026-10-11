import test from 'node:test';
import assert from 'node:assert/strict';
import {runTape,SHEET_FIELDS} from '../../docs/lab/worker/live-tape.js';
import {encodeState,decodeState} from '../../docs/lab/worker/history.js';
import {makePaper} from '../../docs/lab/media/paper.js';
import {createSheet,step,DEFAULTS} from '../../docs/lab/media/sheet.js';
import {PIGMENTS} from '../../docs/lab/media/pigments.js';
const tape={w:64,h:48,scale:10,strokeCount:5,pigments:[PIGMENTS[5]],brushes:[0],pens:[0],brushOpts:[{radius:3,seed:17,capacity:.25}],penOpts:[{reservoir:8,reach:2}],marks:[
 {k:'c',r:[0,16*64,17*64,31*64]},
 {k:'r',m:Array.from({length:64*48},(_,i)=>i%64===31?1:0)},
 {k:'d',b:0,w:1,c:[.6]},
 {k:'s',b:0,d:[[70,100,80,-1],[250,150,65,-1],[470,120,90,-1]]},
 {k:'f'},
 {k:'D',pen:0,ink:[2],a:.7},
 {k:'P',pen:0,d:[[80,220,80,100,0],[500,240,80,100,0]]},
 {k:'s',b:0,d:[[90,180,70,-1],[480,290,60,-1]]},
 {k:'P',pen:0,d:[[90,280,80,100,0],[490,340,80,100,0]]},
 {k:'s',b:0,d:[[70,320,80,-1],[450,390,75,-1]]}
]};
const fresh=()=>createSheet({...makePaper(64,48,{seed:9}),mmPerCell:25.4/60},tape.pigments);
const fields=s=>Object.fromEntries(SHEET_FIELDS.map(k=>[k,s[k]]));
function api(sheet,extra={}){return {sheet:()=>sheet,ready:async()=>true,begin:()=>{},end:()=>{},touch:async(p,r,fn)=>fn(),present:async()=>{},progress:async()=>{},mutate:async fn=>fn(),flow:async()=>step(sheet,{...DEFAULTS,dt:.3}),...extra};}
test('physical seek resumes at the next stroke, preserving paint, water, masks and depleted tools',async()=>{
 const continuous=fresh();let checkpoint,last;
 await runTape(tape,api(continuous,{checkpoint:async(done,state)=>{last=state();if(done===2)checkpoint=await encodeState({fields:fields(continuous),tape:state()});}}));
 const saved=await decodeState(checkpoint),resumed=fresh();Object.assign(resumed,saved.fields);resumed.wetDirty=1;const seen=[];let resumedTools;
 await runTape(tape,api(resumed,{begin:(tool,isPen,meta)=>seen.push(meta.done),checkpoint:async(done,state)=>resumedTools=state()}),saved.tape);
 assert.deepEqual(seen,[2,3,4],'no earlier stroke is replayed during seek');
 for(const name of ['W','s','G','P','D','layers','clip','resist','ever'])assert.deepEqual(resumed[name],continuous[name],name+' must resume exactly');
 assert.deepEqual(resumedTools.brushes,last.brushes,'brush hairs, depleted reservoir and RNG resume exactly');
 assert.deepEqual(resumedTools.pens,last.pens,'pen charge and reservoir resume exactly');
 assert.ok(saved.tape.brushes[0][1].resW<.25*22*1.6,'seek does not re-dip the brush');
});
test('a scaled dry brush samples whole paper cells even with fractional stiffness',async()=>{
 const scaled={...tape,w:100,h:75,strokeCount:1,brushOpts:[{radius:8,stiffness:8,capacity:2,flat:true}],marks:[{k:'d',b:0,w:.62,c:[.6]},{k:'s',b:0,d:[[50,180,80,-1],[700,220,65,-1]]}]};
 const sheet=fresh();await runTape(scaled,api(sheet));
 for(const a of [sheet.W,sheet.s,...sheet.G,...sheet.P,...sheet.D])assert.ok(a.every(Number.isFinite),'no invalid water or pigment in a scaled, depleted stroke');
 assert.ok([...sheet.P,...sheet.G,...sheet.D].some(a=>a.some(v=>v>0)),'the dry brush still lays real pigment');
});
test('shipped seek points contain finite physical states at the advertised stroke, with previews',async()=>{
 const fs=await import('node:fs/promises'),{gunzipSync}=await import('node:zlib'),root=new URL('../../docs/lab/',import.meta.url);
 const manifest=JSON.parse(await fs.readFile(new URL('examples/recorded.json',root)));
 for(const ex of manifest.examples)for(const [limit,stops]of Object.entries(ex.checkpoints)){
  const recording=JSON.parse(gunzipSync(await fs.readFile(new URL(ex.live[limit],root))));
  assert.deepEqual(stops.map(s=>s.fraction),[.1,.25,.5,.75,.9,1]);
  for(const stop of stops){const state=await decodeState(await fs.readFile(new URL(stop.state,root)));
   assert.equal(state.tape.done,Math.floor(stop.fraction*recording.strokeCount));
   if(stop.fraction===1)assert.equal(state.tape.index,recording.marks.length,'finished stop includes trailing dry and unmask');
   assert.equal(recording.marks.slice(0,state.tape.index).filter(m=>['s','P','g'].includes(m.k)).length,state.tape.done);
   for(const a of [state.fields.W,state.fields.s,...state.fields.G,...state.fields.D,...state.fields.P,...state.fields.layers.flat()])assert.ok(a.every(Number.isFinite),`${ex.id} ${limit} ${stop.fraction} must have finite water and paint`);
   assert.ok((await fs.stat(new URL(stop.image,root))).size>0);
  }
 }
});
