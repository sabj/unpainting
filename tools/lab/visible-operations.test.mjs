import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {runTape} from '../../demos/lab/worker/live-tape.js';
import {applyHandOperation,footprint,watchContact} from '../../demos/lab/worker/operations.js';
import {makePaper} from '../../demos/lab/media/paper.js';
import {createSheet,liftResist} from '../../demos/lab/media/sheet.js';
import {PIGMENTS} from '../../demos/lab/media/pigments.js';
import {GpuPhysics} from '../../demos/lab/gpu/gpu-physics.js';
const fresh=()=>createSheet(makePaper(64,48,{seed:9}),[PIGMENTS[5]]);
const recording=marks=>({w:64,h:48,scale:10,brushes:[0],pens:[],brushOpts:[{radius:2,flat:true,capacity:20,variety:0}],penOpts:[],pigments:[PIGMENTS[5]],marks});
const api=sheet=>({sheet:()=>sheet,ready:async()=>true,begin:()=>{},end:()=>{},touch:async(p,r,fn)=>fn(),present:()=>{},progress:()=>{},mutate:async fn=>fn(),flow:()=>{}});

test('all recorded non-paint actions are named before mutation and have the actual area',async()=>{
 const sheet=fresh(),mask=Array.from(footprint(64,48,{x:20,y:20},{x:30,y:20},4));
 const marks=[{k:'r',m:mask},{k:'c',r:[0,640]},{k:'d',b:0,w:1,c:[.5]},{k:'y'},{k:'f'},{k:'b',m:mask,s:.8,p:.7},{k:'R'},{k:'c'}];
 const seen=[];
 await runTape(recording(marks),{...api(sheet),operation:async(e,apply)=>{
  seen.push(e.kind);assert.ok(e.label);
  if(e.kind==='mask'){assert.equal(sheet.resist,null);assert.deepEqual([...e.mask],mask);}
  if(e.kind==='unmask')assert.ok(sheet.resist);
  await apply();
  if(e.kind==='mask')assert.deepEqual([...sheet.resist],mask);
  if(e.kind==='unmask')assert.equal(sheet.resist,null);
 }});
 assert.deepEqual(seen,['mask','clip','dip','dry','flow','blot','unmask','unclip']);assert.equal(sheet.clip,null);
});

test('recorded large radii fit the WebGPU upload rectangle and changed-cell overlay',async()=>{
 const sheet=fresh(),geometry=Object.assign(Object.create(GpuPhysics.prototype),{w:64,h:48});
 let farPaint=false,contacts=0;
 await runTape(recording([{k:'d',b:0,w:1,c:[.6]},{k:'s',b:0,lf:0,d:[[160,240,100,160],[460,240,100,160]]}]),{
 ...api(sheet),touch:async(points,reach,fn)=>{
  assert.ok(reach>=19,'reach must use the 16-cell recorded radius, not the 2-cell default');
  const rect=geometry.rect(points,reach),changed=watchContact(sheet,rect),before=sheet.G[0].slice();fn();
  const contact=changed();
  for(let i=0;i<sheet.n;i++)if(sheet.G[0][i]!==before[i]){
   const x=i%64,y=Math.floor(i/64);assert.ok(x>=rect[0]&&x<rect[0]+rect[2]&&y>=rect[1]&&y<rect[1]+rect[3],'all changed paint must be uploaded');
   assert.equal(contact.mask[(y-rect[1])*rect[2]+x-rect[0]],1);
   if(Math.abs(y-24)>8)farPaint=true;
  }
  return contact;
 },present:(p,r,d,l,c)=>{contacts++;assert.ok(c.mask.some(Boolean));}});
 assert.ok(farPaint,'wide paint lands well outside the old upload bounds');assert.ok(contacts>0);
});

test('a fully clipped stroke yields no changed cells and no invented contact',async()=>{
 const sheet=fresh();sheet.clip=new Uint8Array(sheet.n);
 await runTape(recording([{k:'d',b:0,w:1,c:[.6]},{k:'s',b:0,d:[[160,240,100,100],[460,240,100,100]]}]),{
 ...api(sheet),touch:async(p,r,fn)=>{const changed=watchContact(sheet,[0,0,64,48]);fn();return changed();},
 present:(p,r,d,l,c)=>assert.equal(c.mask.some(Boolean),false)
 });
});

test('hand masking persists across strokes; removal, blotting and lifting change only their area',()=>{
 const sheet=fresh(),a=footprint(64,48,{x:10,y:10},{x:20,y:10},3),b=footprint(64,48,{x:40,y:30},{x:50,y:30},3);
 applyHandOperation(sheet,'mask',a);applyHandOperation(sheet,'mask',b);
 assert.ok(sheet.resist[10*64+10]&&sheet.resist[30*64+40]);
 sheet.W.fill(2);sheet.M.fill(1);sheet.G[0].fill(1);sheet.P[0].fill(1);
 liftResist(sheet);assert.equal(sheet.resist,null);assert.equal(sheet.G[0][10*64+10],0);assert.equal(sheet.G[0][0],1);
 applyHandOperation(sheet,'blot',a);assert.equal(sheet.W[0],2);
 sheet.G[0].fill(1);sheet.P[0].fill(1);applyHandOperation(sheet,'lift',b);
 assert.ok(sheet.P[0][30*64+40]<1);assert.equal(sheet.P[0][0],1);
});

test('complete shipped live paintings preserve masks and their actual removal',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../../demos/lab/examples/recorded.json',import.meta.url)));
 let masked=0;
 for(const file of manifest.examples.flatMap(ex=>Object.values(ex.live??{}))){
  const tape=JSON.parse(gunzipSync(fs.readFileSync(new URL(`../../demos/lab/${file}`,import.meta.url))));
  assert.equal(tape.complete,true);
  const masks=tape.marks.filter(m=>m.k==='r').length,removals=tape.marks.filter(m=>m.k==='R').length;
  assert.equal(removals,masks,'every recorded mask has its actual removal');
  masked+=masks;
  assert.ok(tape.marks.some(m=>m.k==='y'),'the complete run includes drying');
 }
 assert.ok(masked>0,'the gallery exercises physical mask removal');
});

test('carrying on mid-stroke never deposits a lift bead at the unvisited endpoint',async()=>{
 const sheet=fresh();let running=true,touches=0,progress=0;
 const done=await runTape(recording([{k:'d',b:0,w:1,c:[.6]},{k:'s',b:0,d:[[100,240,100,30],[600,240,100,30]]}]),{
  ...api(sheet),ready:async()=>running,
  touch:async(p,r,fn)=>{touches++;fn();},present:()=>{running=false;},progress:()=>progress++
 });
 assert.equal(touches,1);assert.equal(done,0);assert.equal(progress,0);
 assert.equal(sheet.G[0][24*64+60],0,'the far endpoint was never visited');
});

test('GPU hand blot/lift transfer only the footprint and match whole-mask CPU pixels',async()=>{
 const {handToolOperation,footprintRect}=await import('../../demos/lab/worker/operations.js');
 for(const kind of ['blot','lift'])for(const [a,b,r] of [[{x:20.2,y:15.5},{x:30,y:20},3.2],[{x:-2,y:0},{x:2,y:3},4]]){
  const cpu=fresh(),gpu=fresh();
  for(const sheet of [cpu,gpu]){
   sheet.W.fill(2);sheet.M.fill(1);sheet.G[0].fill(.7);sheet.P[0].fill(.9);sheet.D[0].fill(.2);sheet.s.fill(.3);
   sheet.resist=new Uint8Array(sheet.n);sheet.resist[15*64+20]=1;
  }
  const calls=[],rect=footprintRect(64,48,a,b,r);
  const phys={ensureFresh:async(s,bounds)=>calls.push(['down',bounds]),up:(s,bounds)=>calls.push(['up',bounds]),syncAll:()=>assert.fail('full read'),upload:()=>assert.fail('full upload')};
  applyHandOperation(cpu,kind,footprint(64,48,a,b,r));
  const local=await handToolOperation(gpu,kind,a,b,r,phys);
  assert.deepEqual(calls,[['down',rect],['up',rect]]);assert.equal(local.mask.length,rect[2]*rect[3]);assert.ok(local.mask.length<gpu.n);
  for(const name of ['W','G','D','P','M','s','ever'])assert.deepEqual(gpu[name],cpu[name],name);
 }
});
test('localized mask extends film without resetting resistFrom and skips unchanged GPU uploads',async()=>{
 const {handToolOperation}=await import('../../demos/lab/worker/operations.js');
 const sheet=fresh(),calls=[],phys={syncAll:async()=>calls.push('sync'),upload:()=>calls.push('upload')};
 const a={x:10,y:10},b={x:30,y:30};
 sheet.layers.push([new Float32Array(sheet.n)]);
 await handToolOperation(sheet,'mask',a,a,3,phys);const from=sheet.resistFrom;
 await handToolOperation(sheet,'mask',a,a,3,phys);assert.deepEqual(calls,['sync','upload']);
 sheet.layers.push([new Float32Array(sheet.n)]);
 await handToolOperation(sheet,'mask',b,b,3,phys);assert.equal(sheet.resistFrom,from);
 sheet.G[0].fill(1);liftResist(sheet);assert.equal(sheet.G[0][10*64+10],0);assert.equal(sheet.G[0][30*64+30],0);assert.equal(sheet.G[0][0],1);
});

test('localized hand tools retain full-sheet mask geometry in recorded tapes',async()=>{
 const {handToolOperation}=await import('../../demos/lab/worker/operations.js');
 const {tapeSheet}=await import('../../demos/lab/media/sheet.js');
 const sheet=fresh(),tape=[],a={x:8,y:10},b={x:14,y:12},mask=Array.from(footprint(64,48,a,b,3));
 sheet._tape=true;tapeSheet(tape);
 try{
  await handToolOperation(sheet,'mask',a,b,3);
  assert.deepEqual(tape[0],{k:'r',m:mask});
  await handToolOperation(sheet,'blot',a,b,3);
  assert.deepEqual(tape[1].m,mask);assert.equal(tape[1].k,'b');
 }finally{tapeSheet(null);}
});
