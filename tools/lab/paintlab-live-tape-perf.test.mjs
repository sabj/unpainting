// Real Chrome/Metal WebGPU integration benchmark. LAB_LIVE_BASELINE_REF=<commit> records
// a git revision without enforcing the new latency budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {chromium} from 'playwright';
import {makePaper} from '../../demos/lab/media/paper.js';
import {createSheet} from '../../demos/lab/media/sheet.js';
import {runTape} from '../../demos/lab/worker/live-tape.js';
import {BY_KEY} from '../../demos/lab/media/pigments.js';
const root=path.resolve(import.meta.dirname,'../..'), baselineRef=process.env.LAB_LIVE_BASELINE_REF, baseline=Boolean(baselineRef);
const engineFiles=['demos/lab/worker.js','demos/lab/worker/live-tape.js','demos/lab/gpu/gpu-sheet.js','demos/lab/gpu/gpu-physics.js'];
// Freeze each version before Chrome starts, including during development edits.
const originals=new Map(await Promise.all(engineFiles.map(async file=>['/'+file,baseline
 ?execFileSync('git',['show',baselineRef+':'+file],{cwd:root}):await readFile(path.join(root,file))])));
const recorded=JSON.parse(gunzipSync(await readFile(path.join(root,'demos/lab/examples/tiepolo-camel/live.json.gz'))));
// The complete shipped recording, with its native size, materials and events.
const drawing={version:2,w:240,h:180,paper:{seed:9,mmPerCell:.3},pigments:[BY_KEY.paynes,BY_KEY.rose],brushes:[0],brushOpts:[{model:'section',radius:8,capacity:30,bristles:24,seed:7}],penOpts:[],pens:[],marks:[]};
for(let i=0;i<100;i++)drawing.marks.push({k:'g',pigment:0,points:[{x:20+i%10*19,y:20+Math.floor(i/10)*13},{x:33+i%10*19,y:28+Math.floor(i/10)*13}],options:{amount:.4,width:1.4,seed:i}});
drawing.marks.push({k:'d',b:0,w:1,c:[0,.25]},...Array.from({length:3},(_,i)=>({k:'s',b:0,points:[{x:30,y:65+i*10,p:.8},{x:200,y:65+i*10,p:.8}]})),{k:'y'});
drawing.strokeCount=103;
test('graphite batching preserves deposits and stops at flow/checkpoint boundaries',async()=>{
 const tape={...drawing,marks:[...drawing.marks.slice(0,2),{k:'f'},...drawing.marks.slice(2,4)],strokeCount:4};
 const execute=async(batched,checkpoints=false)=>{
  const sheet=createSheet(makePaper(tape.w,tape.h,tape.paper),tape.pigments),groups=[],progress=[];
  const api={sheet:()=>sheet,ready:async()=>true,mutate:async fn=>fn(),progress:async n=>progress.push(n),flow:async()=>{},end:async()=>{}};
  if(batched)api.graphite=async(marks,draw)=>{groups.push(marks.length);marks.forEach(draw);return marks.length;};
  if(checkpoints)api.checkpoint=async()=>{};
  assert.equal(await runTape(tape,api),4);return {sheet,groups,progress};
 };
 const scalar=await execute(false),batch=await execute(true),checkpoint=await execute(true,true);
 assert.deepEqual(batch.sheet.D,scalar.sheet.D);assert.deepEqual(batch.groups,[2,2]);
 assert.deepEqual(checkpoint.groups,[]);assert.deepEqual(checkpoint.progress,[1,2,3,4]);
});
test('recorded Section contacts declare synchronous flow callbacks',async()=>{
 const tape={...drawing,w:16,h:12,marks:[{k:'d',b:0,w:1,c:[0,.1]},...[
  {k:'s',b:0,points:[{x:3,y:5},{x:10,y:5}]},
  {k:'s',b:0,points:[{x:3,y:7},{x:10,y:7}],fl:[1]},
 ]],strokeCount:2};
 const sheet=createSheet(makePaper(tape.w,tape.h,tape.paper),tape.pigments),contacts=[];
 await runTape(tape,{sheet:()=>sheet,ready:async()=>true,begin:async()=>{},end:async()=>{},progress:async()=>{},present:async()=>{},
  touch:async(points,reach,apply,metadata)=>{contacts.push(metadata.between);apply();}});
 assert.deepEqual(contacts,[false,true]);assert.ok(sheet.steps>0,'recorded flow runs synchronously');
});
const instrument=`
import {pencilDraw as pencilPerf} from './media/graphite.js';
let perfTape;
const sendPerf=postMessage.bind(globalThis);const handlePerf=onmessage;
postMessage=(m,...rest)=>{if(m.type==='progress'&&m.done===100&&perfTape.marks.slice(0,100).every(m=>m.k==='g')){const reference=createSheet(paper,PIGS);for(const g of perfTape.marks.slice(0,100))pencilPerf(reference,[{points:g.points}],g.pigment,g.options);sendPerf({type:'perf-graphite',exact:sheet.D.every((plane,k)=>plane.every((v,i)=>v===reference.D[k][i]))});}return sendPerf(m,...rest);};
onmessage=e=>{if(e.data.type==='live')perfTape=e.data.tape;if(e.data.type==='perf-inspect')locked(async()=>{paused=true;await phys.idle();const stats={...phys.stats,sectionGpuStrokes:phys.sectionLink?.stats.sectionGpuStrokes??0};await phys.syncAll(sheet,baseR);baseDirty=true;drawPhys();const pixels=await phys.readPixels();sendPerf({type:'perf-result',stats,pixels,deposit:sheet.D.map(a=>a.reduce((s,v)=>s+v,0)),layers:sheet.layers.length});}).catch(onFailure);else handlePerf(e);};
const configurePerf=configure;configure=async o=>{await configurePerf(o);const dryPerf=phys.sheet.dry.bind(phys.sheet);phys.sheet.dry=async(...args)=>{const t=performance.now();try{return await dryPerf(...args);}finally{phys.stats.dryMs=(phys.stats.dryMs??0)+performance.now()-t;}};if(phys.stats.fullUp===undefined){phys.stats.fullUp=0;const uploadPerf=phys.upload.bind(phys);phys.upload=s=>{phys.stats.fullUp++;return uploadPerf(s);};}phys.device.addEventListener('uncapturederror',e=>sendPerf({type:'perf-error',error:e.error.message}));};
`;
test('Chrome WebGPU saved painting and graphite/wash Live playback', {timeout:1800000},async()=>{
 const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Live tape benchmark</title>');return;}const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('path');let body=originals.get(pathname)??await readFile(file);if(pathname==='/demos/lab/worker.js')body=Buffer.from(body.toString()+instrument);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--use-angle=metal']});const page=await browser.newPage();const errors=[];
 page.on('console',m=>{if(m.text().startsWith('LIVE '))console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/WebGPU.*(?:error|validat)/i.test(m.text()))errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 for(const [name,tape] of [['drawing',drawing],['saved',recorded],['scripted',{w:120,h:90}]].filter(([name])=>!process.env.LAB_LIVE_CASE||name===process.env.LAB_LIVE_CASE)){
 const result=await page.evaluate(async({tape,name})=>{
 const w=new Worker('/demos/lab/worker.js',{type:'module'}),frames=[];let readyAt=0,drawingMs=null,playedAt=0,graphite=null,scriptStarted=false;const start=performance.now();
 return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Live timeout '+name)),1700000);w.onerror=e=>reject(Error(e.message));w.onmessage=({data:m})=>{
 if(['live-ready','played','physics-failed'].includes(m.type)||m.type==='progress'&&m.done%100===0)console.log('LIVE '+name+' '+JSON.stringify({...m,mask:undefined}));if(m.type==='error'||m.type==='perf-error'||m.type==='physics-failed'||m.type==='gpu-failed'){reject(Error(JSON.stringify(m)));return;}
 if(m.type==='caps'){if(!m.webgpu){reject(Error('Chrome WebGPU required'));return;}const canvas=new OffscreenCanvas(tape.w,tape.h);w.postMessage({type:'canvas',mode:'webgpu',canvas},[canvas]);}
 if(m.type==='renderer'&&name==='scripted'){w.postMessage({type:'reset',paperW:2,paperH:1.5,dpi:60});}
 if(m.type==='sheet'&&name==='scripted'&&!scriptStarted){scriptStarted=true;readyAt=performance.now();w.postMessage({type:'play',name:'wash'});}
 if(m.type==='renderer'&&name!=='scripted'){w.postMessage({type:'quality',value:'fast'});w.postMessage({type:'live-speed',value:name==='saved'?8:1});w.postMessage({type:'live',tape,liveRun:1});}
 if(m.type==='perf-graphite')graphite=m.exact;
 if(m.type==='live-ready')readyAt=performance.now();
 if(m.type==='frame'&&readyAt)frames.push(performance.now());
 if(m.type==='progress'&&m.done>=100&&drawingMs===null)drawingMs=performance.now()-readyAt;
 if(m.type==='played'){playedAt=performance.now();w.postMessage({type:'perf-inspect'});}
 if(m.type==='perf-result'){clearTimeout(timeout);const gaps=frames.slice(1).map((v,i)=>v-frames[i]).sort((a,b)=>a-b);let dark=0,color=0;for(let i=0;i<m.pixels.length;i+=4){if(Math.min(...m.pixels.slice(i,i+3))<200)dark++;if(Math.max(...m.pixels.slice(i,i+3))-Math.min(...m.pixels.slice(i,i+3))>20)color++;}w.terminate();resolve({name,speed:name==='saved'?8:1,wallMs:playedAt-start,playbackMs:playedAt-readyAt,drawingMs,frames:frames.length,p95GapMs:gaps[Math.floor(gaps.length*.95)]||0,maxGapMs:gaps.at(-1)||0,stats:m.stats,dark,color,layers:m.layers,graphite});}
 };w.postMessage({type:'config'});});
 },{tape,name});
 if(name==='drawing')assert.equal(result.graphite,true,'bit-identical graphite deposits against serial replay on the same paper');
 delete result.graphite;console.log(JSON.stringify({baseline,...result}));assert.ok(result.dark>100,'visible drawing/paint');assert.ok(result.color>100,'visible watercolor');
 if(!baseline){if(name==='scripted')assert.ok(result.stats.sectionGpuStrokes>0);assert.ok(result.p95GapMs<1000,JSON.stringify(result));assert.ok(result.stats.fullDown<10,JSON.stringify(result));if(name==='drawing'){assert.equal(result.stats.up,0,'Section contacts stay GPU resident');assert.ok(result.stats.sectionGpuStrokes>=3);assert.ok(result.stats.fullUp<=5,JSON.stringify(result));assert.ok(result.drawingMs<500,JSON.stringify(result));assert.ok(result.p95GapMs<500,JSON.stringify(result));assert.ok(result.stats.dryMs<500,JSON.stringify(result));}}
 }
 assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
