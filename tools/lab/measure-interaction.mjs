// Browser timings, without changing shipped worker code. Run from the repository root:
// node tools/lab/measure-interaction.mjs /tmp/lab-timings.json
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';let body=await readFile(path.join(root,p));if(p==='/docs/lab/worker.js'){
 let s=body.toString();for(const name of ['render','frame']){s=s.replace(`async function ${name}(`,`async function ${name}Measured(`);s+=`\nasync function ${name}(...args){const t=performance.now();try{return await ${name}Measured(...args);}finally{postMessage({type:'timing',name:'${name}',ms:performance.now()-t});}}\n`;}
 s=s.replace('const changed=watchContact(sheet,rect);fn();const contact=changed();','const ct=performance.now();const changed=watchContact(sheet,rect);fn();const contact=changed();postMessage({type:"timing",name:"contact",ms:performance.now()-ct});');body=Buffer.from(s);
 }res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end();}}).listen(8767,'127.0.0.1');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
const results={};
try{for(const backend of ['cpu','webgpu']){
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.samples=[];window.phase='init';const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.type==='timing')samples.push({...data,phase,at:performance.now()});if(data.type==='frame')samples.push({name:'post',phase,at:performance.now(),main:window.__lab?.mainMs,stepMs:data.stepMs,stepCount:data.stepCount});});}};});
 await page.goto(`http://127.0.0.1:8767/docs/?intro=0&dpi=60&physics=${backend}`);await page.waitForFunction(()=>window.__lab?.frames>0,null,{timeout:15000});const actual=await page.evaluate(()=>({physics:__lab.physics,render:__lab.render}));if(actual.physics!==backend)throw Error(`Requested ${backend}, got ${actual.physics}`);textLog(backend,actual);
 await page.evaluate(()=>{phase='stroke';__lab.send({type:'pause',on:true});__lab.send({type:'down',pt:{x:40,y:150,p:.8},tool:{tool:'round',pigment:'ultramarine',sizeMm:15,water:2,amount:.5,model:'row'}});});
 for(let x=44;x<=420;x+=4){await page.evaluate(x=>__lab.send({type:'move',pts:[{x,y:150,p:.8}],t:performance.timeOrigin+performance.now()}),x);await page.waitForTimeout(12);}
 await page.evaluate(()=>__lab.send({type:'up',pt:{x:420,y:150,p:0}}));await page.waitForTimeout(500);
 await page.evaluate(()=>{phase='drying';__lab.send({type:'pause',on:false});});await page.waitForTimeout(4500);
 await page.evaluate(()=>{phase='quickDry';__lab.send({type:'dry-layer'});});await page.waitForTimeout(4500);
 await page.evaluate(()=>{phase='live';const tape={w:360,h:270,scale:10,brushes:[0],pens:[],brushOpts:[{radius:6,flat:true,capacity:100,feed:.6,variety:0}],penOpts:[],pigments:[{name:'Blue',K:[.3,.2,.1],S:[.1,.1,.1],stain:.4,gran:.2}],strokeCount:20,marks:[{k:'c',r:[0,360*270]},...Array.from({length:20},(_,i)=>[{k:'d',b:0,w:2,c:[.5]},{k:'s',b:0,lf:0,d:[[300,600+(i%4)*500,80,60],[3300,600+(i%4)*500,80,60]]}]).flat()]};__lab.send({type:'live-speed',value:4});__lab.send({type:'live',tape,liveRun:0});});await page.waitForTimeout(9000);
 const samples=await page.evaluate(()=>samples);const summarize=xs=>{xs=xs.filter(Number.isFinite).sort((a,b)=>a-b);return {n:xs.length,mean:xs.reduce((a,b)=>a+b,0)/xs.length,p50:xs[Math.floor(xs.length*.5)],p95:xs[Math.floor(xs.length*.95)]};};
 results[backend]={actual:await page.evaluate(()=>__lab.physics),errors,phases:{}};
 for(const phase of ['stroke','drying','quickDry','live']){const a=samples.filter(s=>s.phase===phase),posts=a.filter(s=>s.name==='post');results[backend].phases[phase]={render:summarize(a.filter(s=>s.name==='render').map(s=>s.ms)),frame:summarize(a.filter(s=>s.name==='frame'&&s.ms>.1).map(s=>s.ms)),main:summarize(posts.slice(1).map((s,i)=>s.main-posts[i].main)),contact:summarize(a.filter(s=>s.name==='contact').map(s=>s.ms)),postInterval:summarize(posts.slice(1).map((s,i)=>s.at-posts[i].at)),posts:posts.length};}
 await page.close();textLog(backend,results[backend]);
}await writeFile(process.argv[2]||'/tmp/lab-timings.json',JSON.stringify(results,null,2));}finally{await browser.close();server.close();}
function textLog(name,data){console.log(name,JSON.stringify(data));}
