import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {runTape} from '../../docs/lab/worker/live-tape.js';
import {applyHandOperation,footprint,watchContact} from '../../docs/lab/worker/operations.js';
import {makePaper} from '../../docs/lab/media/paper.js';
import {createSheet,liftResist} from '../../docs/lab/media/sheet.js';
import {PIGMENTS} from '../../docs/lab/media/pigments.js';
import {GpuPhysics} from '../../docs/lab/gpu/gpu-physics.js';
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

test('complete shipped studies preserve masks and their actual removal',()=>{
 for(const name of ['h36-a','white-ships']){
  const tape=JSON.parse(gunzipSync(fs.readFileSync(new URL(`../../docs/lab/examples/${name}/live-2500.json.gz`,import.meta.url))));
  assert.equal(tape.complete,true);
  assert.ok(tape.marks.some(m=>m.k==='c'&&m.r?.length));
  assert.ok(tape.marks.some(m=>m.k==='R'),'the complete run includes physical mask removal');
  assert.ok(tape.marks.some(m=>m.k==='y'),'the complete run includes drying');
 }
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
