import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {drawingLabel,renderRecord,playbackScript,repairPage} from './build.mjs';
test('drawing labels describe linked stages instead of the default ink medium',()=>{
 assert.equal(drawingLabel({drawing:{medium:'ink',order:'first'}},{stages:{prep:{lines:12},prepInk:{lines:0}}}),'graphite preparation (12 planned paths)');
 assert.equal(drawingLabel({drawing:{medium:'ink',order:'none'}},null),'none');
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
  repairPage(dir);repairPage(dir);
  assert.equal(fs.readFileSync(path.join(dir,'original.html'),'utf8'),original);
  const fixed=fs.readFileSync(path.join(dir,'index.html'),'utf8');
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
