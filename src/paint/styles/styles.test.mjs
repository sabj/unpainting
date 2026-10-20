import test from 'node:test';
import assert from 'node:assert/strict';
import {loadStyle,resolveStyle,STYLE_NAMES} from './loader.mjs';
import {planLightToDark,selectValueInk,valueTechnique} from '../methods/light-to-dark.mjs';
const inputs={w:12,h:12,k:1,demand:new Float32Array(144).fill(.5),density:new Float32Array(144).fill(.5)};
const snapshot=(subject,selection)=>planLightToDark({...inputs,subject,styleSelection:selection}).instructions;
const ink={style:'ink-and-wash',reason:'Directional ink over few connected washes',regions:{}};
const precise={style:'precise-watercolor',reason:'Painted value planes carry form',regions:{}};
const urban={style:'urban-sketch',reason:'Much more ink and a looser urban-sketch style',regions:{}};
test('changing one plan selection affects only that plan',()=>{
 const before={a:snapshot('a',ink),b:snapshot('b',precise),c:snapshot('c',urban)};
 assert.deepEqual(snapshot('b',precise),before.b);assert.deepEqual(snapshot('c',urban),before.c);
 assert.notDeepEqual(snapshot('a',precise),before.a);
 assert.equal(new Set(before.a.map(i=>i.valueBand)).size,5);
 assert.equal(new Set(before.c.map(i=>i.valueBand)).size,1);
});
test('a subject id alone selects no style',()=>{
 for(const id of ['subject-a','subject-c','Y1','Cape'])assert.equal(planLightToDark({...inputs,subject:id}).style,null);
 assert.throws(()=>resolveStyle('subject-a'),/styleSelection/);
});
test('profiles are independent, explicit and strict',()=>{
 for(const name of STYLE_NAMES){const a=loadStyle(name);a.water[0]=99;assert.notEqual(loadStyle(name).water[0],99);assert.ok(a.order.length);assert.ok(a.refs.length);assert.ok(a.reserve.length);}
 assert.throws(()=>loadStyle('../precise-watercolor'));assert.throws(()=>resolveStyle('unknown'));
 const mapped={...precise,regions:{hair:{style:'ink-and-wash',reason:'Strands below wash resolution'},sky:{style:'atmospheric-wet',reason:'Soft cloud transitions'}}};
 assert.equal(resolveStyle('x','hair',mapped).structure,'ink');
 assert.equal(resolveStyle('x','sky',mapped).name,'atmospheric-wet');
 assert.equal(resolveStyle('x','wall',mapped).name,'precise-watercolor');
});
test('paper requirements and drawing follow selected profile',()=>{
 for(const name of STYLE_NAMES){const plan=planLightToDark({...inputs,subject:'subject-c',styleSelection:{style:name,reason:'Test reference cue'}});for(const intent of plan.instructions){assert.equal(intent.styleName,name);if(name==='precise-watercolor')continue; /* identity profile: keeps the base planner values */assert.equal(intent.style,name);assert.equal(valueTechnique(intent).water,loadStyle(name).water[intent.valueBand-1]);assert.equal(valueTechnique(intent).intoWet,name==='atmospheric-wet');}}
 assert.deepEqual(selectValueInk([{points:[{x:0,y:0},{x:12,y:12}],outline:true}],{first:true,w:12,h:12,density:inputs.density,subject:'cape',styleSelection:{style:'atmospheric-wet',reason:'Soft sea and sky'}}),[]);
});

test('ink-and-wash selects sepia ink',()=>{const r=resolveStyle('a',null,ink);assert.equal(r.name,'ink-and-wash');assert.equal(r.pigment,'sepia');});

test('source pen contours survive adjacent reserved paper and short feature marks',()=>{
 const paths=[{points:[{x:2,y:2},{x:3,y:2}]}],reserves=new Uint8Array(144).fill(1);
 assert.equal(selectValueInk(paths,{first:true,w:12,h:12,density:inputs.density,reserves,sourceInk:true}).length,1);
 assert.equal(selectValueInk(paths,{first:true,w:12,h:12,density:inputs.density,reserves}).length,0);
});

// Precedence (docs/plan-format.md, docs/ink.md): an authored source-ink declaration (a prepared drawing file, an ink
// medium or ink-and-wash) keeps every authored path even under a style whose own ink share is 0; the style's no-ink
// default applies only to drawing the painter itself chose. A plan that wants no drawing says drawing.medium "none".
test('authored source ink outranks a no-ink style default; drawing.medium none is the way to draw nothing',async()=>{
 const paths=[{points:[{x:2,y:2},{x:9,y:9}]},{points:[{x:3,y:8},{x:8,y:3}]},{points:[{x:5,y:5}]}];
 const atmospheric={style:'atmospheric-wet',reason:'Soft sea and sky'},reserves=new Uint8Array(144).fill(1);
 assert.equal(loadStyle('atmospheric-wet').ink,0);
 const opts={first:true,w:12,h:12,density:inputs.density,subject:'cape',styleSelection:atmospheric};
 assert.deepEqual(selectValueInk(paths,opts),[],'the style default draws nothing the painter chose');
 assert.deepEqual(selectValueInk(paths,{...opts,sourceInk:true}),paths.slice(0,2),'authored paths survive the style default');
 assert.deepEqual(selectValueInk(paths,{...opts,sourceInk:true,reserves}),paths.slice(0,2),'and reserved lights');
 const {drawingFlags}=await import('../drawing-plan.mjs');
 assert.deepEqual(drawingFlags({medium:'none'}),['--drawing','none']);
});

test('ink washes keep light and dark parts of one connected form in different nested masses',()=>{
 const w=24,h=24,density=Float32Array.from({length:w*h},(_,i)=>i%w<12?.15:.8);
 const p=planLightToDark({w,h,k:1,density,demand:density.slice(),subject:'unseen-ink-study',styleSelection:{style:'ink-and-wash',reason:'Connected light and dark planes'},shaped:true});
 const mass=new Float32Array(w*h);
 for(const l of p.layers)for(const s of l.shapes)for(let i=0;i<mass.length;i++)if(s.mask[i])mass[i]+=s.graded[i];
 for(let i=0;i<mass.length;i++)assert(Math.abs(mass[i]-density[i])<1e-6);
 const last=p.layers.filter(l=>l.value===5);
 assert(last.length>0);
 assert(last.every(l=>l.shapes.every(s=>s.mask.every((v,i)=>!v||i%w>=12))));
});
