import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {drawingLabel,renderRecord,playbackScript,repairPage,selectSubjects,build} from './build.mjs';
test('drawing labels describe linked stages instead of the default ink medium',()=>{
 assert.equal(drawingLabel({drawing:{medium:'ink',order:'first'}},{stages:{prep:{lines:12},prepInk:{lines:0}}}),'graphite preparation (12 planned paths)');
 assert.equal(drawingLabel({drawing:{medium:'ink',order:'none'}},null),'none');
});
test('active subjects can retire reviewed cases and add a converted source without invented baselines',()=>{
 const addition={subject:'flatiron',code:'FI',title:'Flatiron, converted source',target:'/frozen/flatiron.png'};
 const selected=selectSubjects({beach:{},bermuda:{},barn:{}},{exclude:['bermuda','barn'],additions:[addition]});
 assert.deepEqual(Object.keys(selected),['beach','flatiron']);
 assert.equal(selected.flatiron.R4,undefined);
 assert.throws(()=>selectSubjects({beach:{}},{exclude:['typo']}),/unknown excluded/);
 assert.throws(()=>selectSubjects({beach:{}},{additions:[{...addition,subject:'beach'}]}),/duplicate/);
});
test('a new comparison source requires the exact candidate target hash',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canary-source-'));
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));};
 try{
  const baseline=path.join(dir,'baseline'),runs=path.join(dir,'runs'),out=path.join(dir,'out'),target=path.join(dir,'converted.png'),p=path.join(runs,'flatiron/p');
  write(target,'frozen converted source');write(path.join(baseline,'index.html'),'<style></style>');write(path.join(baseline,'ids.json'),{});write(path.join(baseline,'play/play-data.json'),{meta:{},play:{}});
  write(path.join(p,'painting.png'),'candidate');write(path.join(p,'f0001.jpg'),'frame');
  write(path.join(p,'backend.json'),{commit:'aaa',release:'0.2.0-rc.6'});write(path.join(p,'frames.json'),{commit:'aaa',frames:[{src:'f0001.jpg',stage:'finished'}]});
  const card={codeSHA:'aaa',targetSHA256:'wrong',args:['--style','penwash']};write(path.join(p,'run-card.json'),card);
  const additions=[{subject:'flatiron',code:'FI',title:'Flatiron, converted source',target,source:{description:'Our converted rendering'}}];
  assert.throws(()=>build({baseline,runs,out,additions}),/target differs/);
  card.targetSHA256=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');write(path.join(p,'run-card.json'),card);
  // A historical render with this name belongs to another source; it must not
  // be inserted as a baseline or read for the new converted source.
  const historyRuns=path.join(dir,'historical');
  write(path.join(historyRuns,'R4/flatiron/p/backend.json'),{commit:'unrelated'});
  build({baseline,runs,out,additions,historyRuns});
  const data=JSON.parse(fs.readFileSync(path.join(out,'play/play-data.json'),'utf8'));
  assert.deepEqual(Object.keys(data.play),['flatiron-RC6']);assert.equal(data.play['flatiron-RC6'].length,120);
  assert.equal(data.meta.flatiron.RC6.recipe,'penwash');
  assert.equal(data.meta.flatiron.R4,undefined);
  assert.equal(fs.readFileSync(path.join(out,data.meta.flatiron.P.img),'utf8'),'frozen converted source');
  assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/Our converted rendering/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
function playerFixture(){
 const versions=['V01','R4','RC5','RC6'],r={value:0,dataset:{s:'beach'}},b={textContent:'Pause',dataset:{s:'beach'}},elements={
  'btn-all':{},'btn-loupe':{},'loupe-zoom':{},'speed-sel':{},'chk-loop':{checked:false},'pct-beach':{},lb:{style:{},querySelector:()=>({})}
 };
 for(const v of versions){elements['img-beach-'+v]={};elements['txt-beach-'+v]={};}
 const play=Object.fromEntries(versions.map(v=>['beach-'+v,[{src:v+'-first.jpg',text:'paper'},{src:v+'-last.jpg',text:'finished'}]]));
 let timerId=0;const timers=new Map(),images=[];
 const document={body:{classList:{toggle(){}}},getElementById:k=>elements[k],
  querySelector:q=>q.startsWith('input')?r:b,
  querySelectorAll:q=>q.startsWith('input')?[r]:q.startsWith('button')?[b]:[]};
 const context={document,window:{addEventListener(){}},Image:class{set src(value){images.push({value,finish:()=>this.onload()});}},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(playbackScript({meta:{beach:{}},play}),context);
 const loaded=async()=>{images.splice(0).forEach(i=>i.finish());await new Promise(resolve=>setImmediate(resolve));};
 return {r,b,elements,timers,images,loaded};
}
test('canary opens on final paintings, restarts Play All, and synchronizes controls after scrubbing',async()=>{
 const f=playerFixture();await f.loaded();
 assert.equal(f.r.value,1000);assert.equal(f.elements['img-beach-RC6'].src,'RC6-last.jpg');
 assert.equal(f.elements['btn-all'].textContent,'Play All');
 assert.equal(f.b.textContent,'Play');
 f.elements['btn-all'].onclick();await f.loaded();
 assert.equal(f.r.value,0);assert.equal(f.elements['img-beach-RC6'].src,'RC6-first.jpg');
 assert.equal(f.b.textContent,'Pause');assert.equal(f.elements['btn-all'].textContent,'Pause All');
 f.r.value=1000;f.r.oninput();await f.loaded();
 assert.equal(f.b.textContent,'Play');assert.equal(f.elements['btn-all'].textContent,'Play All');assert.equal(f.timers.size,0);
});
test('a slow earlier frame cannot overwrite a later slider position',async()=>{
 const f=playerFixture(),initial=f.images.splice(0);
 f.r.value=0;f.r.oninput();await f.loaded();
 initial.forEach(i=>i.finish());await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.elements['img-beach-RC5'].src,'RC5-first.jpg');
 assert.equal(f.elements['pct-beach'].textContent,'0%');
});
test('repair retains the original page and safely embeds playback text',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canary-repair-'));
 try{
  const original='<style></style><script>oldPlayer()</script>';
  fs.mkdirSync(path.join(dir,'play'));
  fs.writeFileSync(path.join(dir,'index.html'),original);
  fs.writeFileSync(path.join(dir,'play/play-data.json'),JSON.stringify({meta:{beach:{}},play:{'beach-RC6':[{src:'x.jpg',text:'</script><h1>untrusted'}]}}));
  repairPage(dir);const first=fs.readFileSync(path.join(dir,'index.html'),'utf8');repairPage(dir);
  assert.equal(fs.readFileSync(path.join(dir,'original.html'),'utf8'),original);
  const fixed=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  assert.equal(fixed,first);
  assert.equal((fixed.match(/<\/script>/g)||[]).length,1);
  assert.ok(!fixed.includes('oldPlayer()'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a render must have one recorded commit across its artifacts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canary-record-'));
 try{
  fs.writeFileSync(path.join(dir,'backend.json'),JSON.stringify({commit:'aaa',release:'0.2.0-rc.6'}));
  fs.writeFileSync(path.join(dir,'frames.json'),JSON.stringify({commit:'bbb',frames:[]}));
  assert.throws(()=>renderRecord(dir),/inconsistent render commits/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
