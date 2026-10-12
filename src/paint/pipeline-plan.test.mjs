import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePipeline, pipelineFlags } from './pipeline-plan.mjs';
import { sameWash } from './methods/wash-session.mjs';
import { finishTexture, furLightReserves } from './methods/finish-texture.mjs';

test('one plan selects ink stages, wash sessions, flow and subject order',()=>{
 const p={drawing:{source:'source-ink',stages:{prep:{weight:.8},prepInk:{from:'prep'},finishInk:{from:'prepInk',restate:.2}}},washes:{sessions:'connected',physics:{holeRimMm:.4,marangoni:.01}},order:{subjects:[{id:'sky',bounds:[[0,0,1,.4]]},{id:'rest'}]}};
 const r=pipelineFlags(p), m=new Map(Array.from({length:r.flags.length/2},(_,i)=>r.flags.slice(i*2,i*2+2)));
 assert.equal(m.get('--stages'),'prep,prepink,finishink'); assert.equal(m.get('--washsession'),'2');assert.equal(m.get('--washinkfree'),'1');assert.equal(m.get('--subjectorder'),'0.5');assert.equal(m.get('--physics'),'marangoni=0.01,slope=0');
 assert.throws(()=>resolvePipeline({...p,subjectOrder:[{id:'rest'}]}),/not both/);
 assert.throws(()=>resolvePipeline({order:{strength:.5}}),/needs/);
 assert.throws(()=>resolvePipeline({washes:{sessions:'whatever'}}),/sessions/);
});
test('wet sessions cannot mix subjects or successive glazes with the same value',()=>{
 const layer=(step,rank=0)=>({value:2,_valuePhase:'mid',_order:{region:1},_subject:{rank},shapes:[{_valuePlan:{id:`mid/${step}/region1`}}]});
 assert.equal(sameWash(layer('b2L1'),layer('b2L1')),true);
 assert.equal(sameWash(layer('b2L1'),layer('b2L2')),false);
 assert.equal(sameWash(layer('b2L1'),layer('b2L1',1)),false);
 assert.equal(sameWash({...layer('b4'),_valuePhase:'shadow'},{...layer('b4'),_valuePhase:'shadow'}),false);
});
test('layered washes preserve source colour families through the foundation',()=>{
 const {flags}=pipelineFlags({washes:{colour:'layered'}});
 const m=new Map(Array.from({length:flags.length/2},(_,i)=>flags.slice(i*2,i*2+2)));
 assert.equal(m.get('--huechroma'),'30');
 assert.equal(m.get('--lightfamilies'),'1');
 assert.equal(m.get('--passcap'),'0', 'layered washes still use their mean charge');
});
test('recovered texture stays in planned bounds and leaves light gaps',()=>{
 const w=80,h=80,D=Float32Array.from({length:w*h},(_,i)=>i%w<40?.8:0);
 for(const kind of ['hatch','fur']) {
  const paths=finishTexture({D,w,h},{kind,bounds:[.1,.1,.9,.9],budget:12});
  assert.ok(paths.length>0&&paths.length<=12);
  for(const g of paths) for(const [x,y] of g.points) assert.ok(x>=7&&x<41&&y>=7&&y<73);
 }
});

test('fur reserves retain local light groups but reject singleton glints',()=>{
 const w=100,h=100,D=new Float32Array(w*h).fill(1.8);
 D[50*w+50]=.1;D[50*w+51]=.1;D[20*w+20]=.1;
 const R=furLightReserves({D,w,h},{reach:10,drop:.5,dark:.8});
 assert.equal(R[50*w+50],1);assert.equal(R[50*w+51],1);assert.equal(R[20*w+20],0);
 assert.equal(R.reduce((a,b)=>a+b),2);
});
