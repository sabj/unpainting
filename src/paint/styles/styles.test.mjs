import test from 'node:test';
import assert from 'node:assert/strict';
import {loadStyle,loadSubjects,resolveStyle,STYLE_NAMES} from './loader.mjs';
import {planLightToDark,selectValueInk,valueTechnique} from '../methods/light-to-dark.mjs';
const inputs={w:12,h:12,k:1,demand:new Float32Array(144).fill(.5),density:new Float32Array(144).fill(.5)};
const snapshot=(subject,selection)=>planLightToDark({...inputs,subject,styleSelection:selection}).instructions;
test('changing subject-a style affects only subject-a plan',()=>{
 const subjects=loadSubjects(); const before=Object.fromEntries(['subject-a','subject-c','Y2','Cape'].map(id=>[id,snapshot(id,subjects[id])]));
 subjects['subject-a']={style:'precise-watercolor',reason:'Isolation test changes this subject only',regions:{}};
 for(const id of ['subject-c','Y2','Cape'])assert.deepEqual(snapshot(id,subjects[id]),before[id]);
 assert.notDeepEqual(snapshot('subject-a',subjects['subject-a']),before['subject-a']);
 assert.equal(new Set(before['subject-a'].map(i=>i.valueBand)).size,2);
 assert.equal(new Set(before.Y2.map(i=>i.valueBand)).size,1);
});
test('profiles are independent, explicit and strict',()=>{
 for(const name of STYLE_NAMES){const a=loadStyle(name);a.water[0]=99;assert.notEqual(loadStyle(name).water[0],99);assert.ok(a.order.length);assert.ok(a.refs.length);assert.ok(a.reserve.length);}
 assert.throws(()=>loadStyle('../precise-watercolor'));assert.throws(()=>resolveStyle('unknown'));
 assert.equal(resolveStyle('subject-c','subject-c.human-hair').structure,'ink');
 assert.equal(resolveStyle('subject-d','subject-d.sky').name,'atmospheric-wet');
});
test('paper requirements and drawing follow selected profile',()=>{
 for(const name of STYLE_NAMES){const plan=planLightToDark({...inputs,subject:'subject-c',styleSelection:{style:name,reason:'Test reference cue'}});for(const intent of plan.instructions){assert.equal(intent.styleName,name);if(name==='precise-watercolor')continue; /* identity profile: keeps the base planner values */assert.equal(intent.style,name);assert.equal(valueTechnique(intent).water,loadStyle(name).water[intent.valueBand-1]);assert.equal(valueTechnique(intent).intoWet,name==='atmospheric-wet');}}
 assert.deepEqual(selectValueInk([{points:[{x:0,y:0},{x:12,y:12}],outline:true}],{first:true,w:12,h:12,density:inputs.density,subject:'Cape'}),[]);
});

test('subject-a routes to ink-and-wash with sepia ink',()=>{const r=resolveStyle('subject-a');assert.equal(r.name,'ink-and-wash');assert.equal(r.pigment,'sepia');});
