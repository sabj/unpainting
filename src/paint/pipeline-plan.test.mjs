import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePipeline, pipelineFlags } from './pipeline-plan.mjs';
import { sameWash } from './methods/wash-session.mjs';

test('one plan selects ink stages, wash sessions, flow and subject order',()=>{
 const p={drawing:{stages:{prep:{weight:.8},prepInk:{from:'prep'},finishInk:{from:'prepInk',restate:.2}}},washes:{sessions:'connected',inkAware:true,physics:{holeRimMm:.4,marangoni:.01}},order:{subjects:[{id:'sky',bounds:[[0,0,1,.4]]},{id:'rest'}]}};
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
test('washes.paints names the authored box palette',()=>{
 const m=r=>new Map(Array.from({length:r.flags.length/2},(_,i)=>r.flags.slice(i*2,i*2+2)));
 assert.equal(m(pipelineFlags({washes:{paints:['sienna','hansa','ultramarine']}})).get('--paints'),'sienna,hansa,ultramarine');
 assert.equal(m(pipelineFlags({})).get('--paints'),undefined);
 assert.throws(()=>resolvePipeline({washes:{paints:['vermilion']}}),/washes.paints/);
 assert.throws(()=>resolvePipeline({washes:{paints:[]}}),/washes.paints/);
});

test('washes.darkGain was removed: a plan that sets it stops, and no plan yields a gain flag',()=>{
 const m=r=>new Map(Array.from({length:r.flags.length/2},(_,i)=>r.flags.slice(i*2,i*2+2)));
 assert.equal(m(pipelineFlags({})).get('--darkgain'),undefined);
 assert.throws(()=>resolvePipeline({washes:{darkGain:2}}),/washes.darkGain was removed/);
});

test('washes.deepAccent was removed: a plan that names it is refused with the reason',()=>{
 const families=[{id:'cat-fur'},{id:'man-skin'}];
 assert.throws(()=>resolvePipeline({families,washes:{deepAccent:{max:75,families:['cat-fur']}}}),/washes\.deepAccent was removed in 0\.3\.3: .+/);
 const flags=pipelineFlags({families}).flags;
 for(const k of ['--deepaccent','--deepgrow','--deepaccentin'])assert.ok(!flags.includes(k),k);
});

test('hierarchical washes and drawing controls emit flags when authored and validate types',()=>{
 const { flags } = pipelineFlags({
  drawing: { hand: true, joinGap: 3.5, damp: 0.25 },
  washes: { soften: { maxArcMm: 18 } }
 });
 const m = new Map(Array.from({length:flags.length/2},(_,i)=>flags.slice(i*2,i*2+2)));
 assert.equal(m.get('--drawinghand'), '1');
 assert.equal(m.get('--drawjoingap'), '3.5');
 assert.equal(m.get('--inkdamp'), '0.25');
 assert.equal(m.get('--softsplit'), '1');
 assert.equal(m.get('--softmm'), '18');
 assert.throws(()=>resolvePipeline({washes:{skyOneLayer:true}}), /washes\.skyOneLayer was removed in 0.4/);
 assert.throws(()=>resolvePipeline({drawing:{damp:2}}), /drawing\.damp/);
});
