// Real Chrome input and RAF timing at the demos' shipped size and density.
// DEMO_FPS_CASES=fungi|lab|layers narrows a diagnostic run; default checks all.
// The 60 Hz clock is 16.667 ms, so cadence permits 1.8 ms of host jitter.
// Main-thread callback work must still fit 16.6 ms; actual artwork deliveries
// are reported separately so an idle UI cannot hide a frozen renderer.
import os from 'node:os';import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'../..'),results=[],cpuRate=Number(process.env.DEMO_CPU_RATE??1),scale=Number(process.env.DEMO_DPR??1);
const selected=(process.env.DEMO_FPS_CASES??'fungi,lab,layers').split(',');
test('shipped demos maintain 60 Hz during real interactions',{timeout:300000},async()=>{
 const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}const file=path.resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp'})[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--use-angle=metal','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:scale}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  if(cpuRate>1){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});}
  await page.addInitScript(()=>{
   window.__timing={active:false,intervals:[],tasks:[],work:[],render:[],updates:0};
   const raf=requestAnimationFrame;
   window.requestAnimationFrame=cb=>raf.call(window,t=>{const s=performance.now();try{cb(t);}finally{if(__timing.active)__timing.work.push(performance.now()-s);}});
   new PerformanceObserver(list=>{if(__timing.active)__timing.tasks.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask',buffered:false});
   const tick=t=>{if(__timing.active&&__timing.last){__timing.intervals.push(t-__timing.last);const p=window.sporeStudy?.getPerformance();if(p&&p.previewFrames!==__timing.renderFrame){__timing.renderFrame=p.previewFrames;__timing.render.push(p.previewMs);}}__timing.last=t;raf.call(window,tick);};raf.call(window,tick);
  });
  const base=`http://127.0.0.1:${server.address().port}`;
  async function measure(name,action,{minUpdates=0}={}){
   let profiler;if(process.env.DEMO_PROFILE){profiler=await page.context().newCDPSession(page);await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
   await page.evaluate(()=>Object.assign(__timing,{active:true,intervals:[],tasks:[],work:[],render:[],last:0}));
   const nativePaint=name==='fungi paint';
   const before=await page.evaluate(nativePaint=>window.sporeStudy?(nativePaint?sporeStudy.getPerformance().frames:sporeStudy.getPerformance().previewFrames):window.__lab?.frames??0,nativePaint);await action();
   const data=await page.evaluate(nativePaint=>{__timing.active=false;const stat=a=>{a=[...a].sort((a,b)=>a-b);return{count:a.length,p50:a[Math.floor(a.length*.5)]??0,p95:a[Math.floor(a.length*.95)]??0,max:a.at(-1)??0}};return{cadence:stat(__timing.intervals),work:stat(__timing.work),render:stat(__timing.render),longTasks:__timing.tasks,frames:window.sporeStudy?(nativePaint?sporeStudy.getPerformance().frames:sporeStudy.getPerformance().previewFrames):window.__lab?.frames??0};},nativePaint);
   if(profiler){const {profile}=await profiler.send('Profiler.stop');await writeFile('/tmp/'+name.replaceAll(' ','-')+'.cpuprofile',JSON.stringify(profile));const c=new Map();profile.samples.forEach((id,i)=>c.set(id,(c.get(id)||0)+profile.timeDeltas[i]));console.info(profile.nodes.map(n=>({name:n.callFrame.functionName,line:n.callFrame.lineNumber+1,ms:(c.get(n.id)||0)/1000})).sort((a,b)=>b.ms-a.ms).slice(0,12));await profiler.detach();}
   const r={name,...data,updates:data.frames-before};results.push(r);console.info(JSON.stringify(r));
   assert.ok(r.cadence.count>=90,`${name}: enough samples`);assert.ok(r.cadence.p95<=(cpuRate>1?35:18.5),`${name}: RAF p95 ${r.cadence.p95} ms`);assert.ok(r.work.p95<=(cpuRate>1?33:16.6),`${name}: UI work p95 ${r.work.p95} ms`);assert.ok(!r.longTasks.some(t=>t>50),`${name}: long main-thread tasks ${r.longTasks}`);assert.ok(r.updates>=(cpuRate>1?Math.min(80,minUpdates):minUpdates),`${name}: ${r.updates} artwork updates, expected >=${minUpdates}`);
  }
  const animate=async(fn,count=180)=>page.evaluate(async({src,count})=>{const step=(0,eval)(`(${src})`);for(let i=0;i<count;i++){await new Promise(requestAnimationFrame);step(i,count);}}, {src:fn.toString(),count});
  if(selected.includes('fungi')){
   await page.goto(base+'/demos/fungi/?paint=full');await page.waitForFunction(()=>window.sporeStudy&&document.querySelector('#painting').dataset.preparingShapes==='false',null,{timeout:30000});
   await page.waitForFunction(()=>document.querySelector('#painting').dataset.preparingShapes!=='true');
   await page.waitForFunction(()=>sporeStudy.getNativePainting()?.streamedFrames>=20,null,{timeout:30000});await measure('fungi paint',()=>animate(()=>{}));
   // Warm the preview worker and its immutable field before continuous input.
   await page.locator('#blend').dispatchEvent('pointerdown');await animate(i=>{const e=document.querySelector('#blend');e.value=.15+i*.001;e.dispatchEvent(new Event('input',{bubbles:true}));},30);
   await page.waitForFunction(()=>Math.abs(+document.querySelector('#painting').dataset.displayedPosition-+document.querySelector('#blend').value)<.002);await animate(()=>{},30);
   await measure('fungi morph scrub',()=>animate((i,n)=>{const e=document.querySelector('#blend');e.value=.1+.8*i/n;e.dispatchEvent(new Event('input',{bubbles:true}));}),{minUpdates:160});
   await page.locator('#blend').dispatchEvent('pointerup');
   await page.goto(base+'/demos/fungi/?paint=fast');await page.waitForFunction(()=>window.sporeStudy&&document.querySelector('#painting').dataset.preparingShapes==='false',null,{timeout:30000});
   const box=await page.locator('#plate-viewport').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
   await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5,{steps:20});await page.waitForFunction(()=>document.querySelector('#painting').dataset.displayedOrbit==='true');await animate(()=>{},30);
   await measure('fungi orbit',()=>animate((i,n)=>{const el=document.querySelector('#plate-viewport'),r=el.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,buttons:1,clientX:r.x+r.width*(.6+.2*Math.sin(i/n*6)),clientY:r.y+r.height*(.5+.12*Math.cos(i/n*6)),bubbles:true}));}),{minUpdates:160});await page.mouse.up();
   await page.locator('#duration').evaluate(e=>{e.value=3;e.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#evolve').click();await page.waitForFunction(()=>sporeStudy.getState().playing,null,{timeout:30000});await measure('fungi loop and landing',async()=>{await animate(()=>{},300);await page.waitForFunction(()=>!sporeStudy.getState().playing&&!sporeStudy.getState().preparing,null,{timeout:30000});await animate(()=>{},60);},{minUpdates:100});await page.locator('#evolve').click();

  }
  if(selected.includes('lab')){
   await page.goto(base+'/demos/lab/');await page.waitForFunction(()=>window.__lab?.gpuReady&&window.__lab?.frames>0,null,{timeout:90000});
   assert.equal(await page.locator('[data-model=section]').getAttribute('aria-pressed'),'true');
   const b=await page.locator('#sheet').boundingBox();await page.mouse.move(b.x+b.width*.25,b.y+b.height*.4);await page.mouse.down();
   await measure('lab paint',()=>animate((i,n)=>{const e=document.querySelector('#sheet'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,pointerType:'mouse',buttons:1,clientX:r.x+r.width*(.25+.5*i/n),clientY:r.y+r.height*(.4+.15*Math.sin(i/n*15)),pressure:.5,bubbles:true}));}),{minUpdates:160});await page.mouse.up();
   await page.keyboard.down('Space');await page.mouse.down();await measure('lab pan',()=>animate((i,n)=>{const e=document.querySelector('#sheet'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,pointerType:'mouse',buttons:1,clientX:r.x+r.width*.5+Math.sin(i/n*6)*100,clientY:r.y+r.height*.5,bubbles:true}));}));await page.mouse.up();await page.keyboard.up('Space');
   await measure('lab zoom',()=>animate((i,n)=>{const e=document.querySelector('#sheet'),r=e.getBoundingClientRect();e.dispatchEvent(new WheelEvent('wheel',{deltaY:i<n/2?-3:3,clientX:r.x+r.width*.5,clientY:r.y+r.height*.5,bubbles:true,cancelable:true}));}));
   await page.locator('#quick-catalogue').evaluate(e=>e.open=true);await page.locator('[data-value="demo:wash"]').click();await measure('lab playback',()=>animate(()=>{}));
   // Exercise each replacement painting in its default saved-frame mode too.
   for(const id of ['bacchus','bathers','prout']){
    await page.locator(`[data-value="${id}"]`).click();
    await page.waitForFunction(id=>__lab.target?.id===id&&__lab.target.film&&__lab.replayProgress>0,id);
    const start=await page.evaluate(()=>__lab.replayProgress);
    await measure(`lab recording ${id}`,()=>animate(()=>{}));
    const end=await page.evaluate(()=>__lab.replayProgress);assert.ok(end>start+.005,`${id}: saved-frame playback advances (${start} → ${end}); errors: ${errors}`);
   }
   await page.locator('[data-value="bacchus"]').click();
   await page.locator('#run-mode').selectOption('live');
   await page.evaluate(()=>__lab.seek(.5));
   await page.waitForFunction(()=>__lab.target?.live&&__lab.progress?.done>314,null,{timeout:90000});
   await measure('lab live wash replay',()=>animate(()=>{}));
  }
  if(selected.includes('layers')){
   await page.goto(base+'/demos/layers/');await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
   const changed=await page.evaluate(async()=>{const m=await(await fetch('data/meta.json')).json(),b=await createImageBitmap(await(await fetch(m.frames.at(-1))).blob()),c=new OffscreenCanvas(m.w,m.h),g=c.getContext('2d');g.drawImage(b,0,0);b.close();const expected=g.getImageData(0,0,m.w,m.h).data,actual=document.querySelector('#cv').getContext('2d').getImageData(0,0,m.w,m.h).data;let changed=0;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])changed++;return changed;});
   assert.equal(changed,0,'all selected layers show the exact saved final frame');
   await measure('layers tilt turn spin fan zoom',()=>animate((i,n)=>{for(const id of ['tilt','turn','spin','gap','fan','zoom']){const e=document.getElementById(id);e.value=+e.min+(+e.max-e.min)*(.5+.3*Math.sin(i/n*6));e.dispatchEvent(new Event('input',{bubbles:true}));}}));
   await measure('layers timeline scrub',()=>animate((i,n)=>{const e=document.querySelector('#tSlider');e.value=Math.round(i/n*+e.max);e.dispatchEvent(new Event('input',{bubbles:true}));}));
   await page.locator('#playBtn').click();await measure('layers play',()=>animate(()=>{}));
   await measure('layers hover isolate',()=>animate(i=>{const row=document.querySelectorAll('#lis > *')[i%document.querySelectorAll('#lis > *').length];row?.dispatchEvent(new Event('mouseenter'));if(i%30===0)row?.click();}));
  }
  assert.deepEqual(errors,[]);
 }finally{await mkdir(path.join(root,'work'),{recursive:true});await writeFile(path.resolve(root,process.env.DEMO_REPORT??'work/demo-fps.json'),JSON.stringify({date:new Date().toISOString(),hardware:os.cpus()[0].model,cpuRate,deviceScaleFactor:scale,browser:await browser.version(),results},null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));}
});
