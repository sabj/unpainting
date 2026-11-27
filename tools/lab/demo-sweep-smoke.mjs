// Run explicitly with Chrome installed: node --test tools/lab/demo-sweep-smoke.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {BENCH_STROKES,strokeSize} from '../../demos/lab/media/stroke-bench.js';

const root=path.resolve(import.meta.dirname,'../..');
test('Chrome stroke rerun/export and 800×400 layers controls', {timeout:240000}, async()=>{
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
   const file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
   if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   let data=await readFile(file);
   // Add a coarse physical cell size only in this smoke server, keeping every
   // real stroke and drying path while avoiding a full rendering benchmark.
   if(file.endsWith('/media/stroke-bench.js'))data=Buffer.from(data.toString().replace('[0.25, 0.1, 0.05]', '[1, 0.25, 0.1, 0.05]'));
   const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.css':'text/css'};
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'}).end(data);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--use-angle=metal']});
  const page=await browser.newPage({viewport:{width:800,height:400}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
   const NativeWorker=window.Worker;
   window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.testWorker=this;}postMessage(data,...args){window.testGen=data.gen;return super.postMessage(data,...args);}};
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...args){this.canvas.testBottom=Math.max(this.canvas.testBottom??0,(args[2]??0)+(args[4]??args[0].height));return draw.apply(this,args);};
   const blob=HTMLCanvasElement.prototype.toBlob;
   HTMLCanvasElement.prototype.toBlob=function(...args){window.exportSize={w:this.width,h:this.height,bottom:this.testBottom};return blob.apply(this,args);};
  });
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base+'/demos/lab/strokes/?backend=cpu&cell=1');
  await page.locator('#run').click();await page.selectOption('#cell','0.25');await page.selectOption('#cell','1');await page.locator('#run').click();
  await page.evaluate(id=>{
   for(const data of [{type:'done'},{type:'stroke',id,backend:'cpu',error:'stale row'}])
    testWorker.dispatchEvent(new MessageEvent('message',{data:{...data,gen:testGen-1}}));
  },BENCH_STROKES[0].id);
  assert.equal(await page.locator('#rows small').evaluateAll(ns=>ns.some(n=>n.textContent==='stale row')),false);
  assert.equal(await page.locator('body').getAttribute('data-state'),'running');
  await page.waitForFunction(()=>document.body.dataset.state==='done',null,{timeout:180000});
  assert.equal(await page.locator('#gpu-head').isVisible(),false);
  const dimensions=await page.locator('#rows canvas').evaluateAll(cs=>cs.map(c=>({w:c.width,h:c.height})));
  assert.deepEqual(dimensions,BENCH_STROKES.map(s=>strokeSize(s,1)));
  assert.equal(await page.locator('#rows small').evaluateAll(ns=>ns.filter(n=>n.textContent.includes('×')).length),BENCH_STROKES.length);
  const download=page.waitForEvent('download');await page.locator('#export').click();const png=await readFile(await (await download).path());
  const size=await page.evaluate(()=>window.exportSize);
  const expectedH=60+BENCH_STROKES.reduce((sum,s)=>sum+Math.max(strokeSize(s,1).h*4,100)+12,0);
  assert.equal(size.h,expectedH);assert.equal(size.w,330+256+12);assert.ok(size.bottom<=size.h);
  assert.equal(png.readUInt32BE(20),expectedH);
  console.info(`CPU PNG ${size.w}×${size.h}; final painted row ends at ${size.bottom}`);
  // Exercise overlapping reruns against a real shared WebGPU device, stopping
  // after the latest generation has returned a correctly sized first stroke.
  const gpuResult=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const worker=new Worker('/demos/lab/strokes/bench-worker.js',{type:'module'});
   const timer=setTimeout(()=>{worker.terminate();reject(new Error('GPU rerun timed out'));},90000);
   const finish=result=>{clearTimeout(timer);worker.terminate();resolve(result);};
   worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(new Error(e.message));};
   worker.onmessage=({data})=>{
    if(data.type==='caps'&&!data.gpu){clearTimeout(timer);worker.terminate();reject(new Error(data.gpuError));return;}
    if(data.type==='caps'&&data.gen===10){
     worker.postMessage({type:'run',gen:11,mmPerCell:.1,backends:['gpu']});
     worker.postMessage({type:'run',gen:12,mmPerCell:1,backends:['gpu']});
    }
    if(data.type==='error'||data.error){clearTimeout(timer);worker.terminate();reject(new Error(data.error));}
    if(data.type==='stroke'&&data.gen===12)finish({gen:data.gen,w:data.w,h:data.h});
   };
   worker.postMessage({type:'run',gen:10,mmPerCell:1,backends:['gpu']});
  }));
  assert.deepEqual(gpuResult,{gen:12,...strokeSize(BENCH_STROKES[0],1)});
  const transfers=await page.evaluate(async()=>{
   const [{GpuPhysics},{makePaper},{createSheet,DEFAULTS},{BY_KEY},{handToolOperation,applyHandOperation,footprint}]=await Promise.all([
    import('/demos/lab/gpu/gpu-physics.js'),import('/demos/lab/media/paper.js'),import('/demos/lab/media/sheet.js'),import('/demos/lab/media/pigments.js'),import('/demos/lab/worker/operations.js')]);
   const p=await GpuPhysics.create([BY_KEY.rose],{...DEFAULTS},navigator.gpu),result=[];
   try{
    for(const kind of ['blot','lift']){
     const paper=makePaper(32,24),sheet=createSheet(paper,[BY_KEY.rose]),expected=createSheet(paper,[BY_KEY.rose]);
     sheet.W.fill(2);sheet.M.fill(1);sheet.G[0].fill(.7);sheet.D[0].fill(.2);sheet.P[0].fill(.9);sheet.s.fill(.3);sheet.ever.fill(1);
     await p.load(sheet,new Float32Array(sheet.n*3).fill(1),new Float32Array(sheet.n));
     await p.step(1);
     // Read the reference directly, leaving the adapter's CPU copy stale.
     await p.sheet.download(expected);
     const before={...p.stats},a={x:10,y:10},b={x:15,y:12};
     applyHandOperation(expected,kind,footprint(32,24,a,b,3));
     await handToolOperation(sheet,kind,a,b,3,p);
     const delta=Object.fromEntries(['down','up','fullDown','fullUp'].map(k=>[k,p.stats[k]-before[k]]));
     await p.sheet.download(sheet);
     for(const key of ['W','s','M','ever','G','D','P']){
      const arrays=['G','D','P'].includes(key)?sheet[key]:[sheet[key]],refs=['G','D','P'].includes(key)?expected[key]:[expected[key]];
      arrays.forEach((array,k)=>array.forEach((value,i)=>{if(value!==refs[k][i])throw new Error(`${kind} ${key} mismatch at ${i}`);}));
     }
     result.push({kind,...delta});
    }
   }finally{p.destroy();}
   return result;
  });
  assert.deepEqual(transfers,['blot','lift'].map(kind=>({kind,down:1,up:1,fullDown:0,fullUp:0})));
  await page.goto(base+'/demos/layers/');await page.waitForFunction(()=>document.querySelectorAll('[data-fam]').length>0);
  // Count actual redraw calls, including any accidental per-checkbox handlers.
  await page.evaluate(()=>{window.redraws=0;window.rebuilds=0;const original=redraw,build=buildSubjList;redraw=()=>{window.redraws++;return original();};buildSubjList=()=>{window.rebuilds++;return build();};});
  for(const button of ['[data-none="fams"]','[data-all="fams"]','[data-none="stages"]','[data-all="stages"]']){
   await page.evaluate(()=>{window.redraws=0;window.rebuilds=0;});await page.locator(button).click();
   assert.equal(await page.evaluate(()=>window.redraws),1);assert.equal(await page.evaluate(()=>window.rebuilds),button.includes('fams')?1:0);
  }
  await page.locator('[data-mode="2d"]').click();
  const height=()=>page.locator('#spread').evaluate(g=>g.clientHeight-parseFloat(getComputedStyle(g).paddingTop)-parseFloat(getComputedStyle(g).paddingBottom));
  assert.ok(await height()>150,'normal spread has usable height at 800×400');
  const normalHeight=await height();
  await page.locator('#fullBtn').click();assert.ok(await height()>150,'full-page spread has usable height at 800×400');
  console.info(`800×400 spread content height: ${normalHeight}px normal, ${await height()}px full page`);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
