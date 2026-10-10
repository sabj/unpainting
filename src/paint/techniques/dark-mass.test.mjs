import test from 'node:test';
import assert from 'node:assert/strict';
import { coherentMasses, massBudget } from '../../../src/paint/methods/mass-budget.mjs';
import { cutStrokes } from '../../../src/paint/techniques/dark-mass.mjs';
import { gaussian } from '../../../src/keyframes/density.mjs';
import { components } from '../../../src/raster.js';
const num=(k,d)=>d;
function fixture(w=540){const h=w,S=new Float32Array(w*h);for(let y=.2*h;y<.5*h;y++)for(let x=.2*w;x<.4*w;x++)S[Math.floor(y)*w+Math.floor(x)]=1.2;for(let y=.2*h;y<.5*h;y++)for(let x=.6*w;x<.8*w;x++)S[Math.floor(y)*w+Math.floor(x)]=1.2;S[10*w+10]=4;return {w,h,S};}
test('coherent darks stay separate and isolated point accents remain outside mass ownership',()=>{const {w,h,S}=fixture();const m=coherentMasses(S,w,h,{gaussian,components,num});assert.equal(m.length,2);assert.ok(m.every(m=>!m.mask[10*w+10]));assert.ok(m.some(m=>m.mask[150*w+150]));assert.ok(m.some(m=>m.mask[150*w+380]));assert.ok(m.every(m=>!m.mask[150*w+270]));});
test('dark mass selection scales with sheet size',()=>{const a=fixture(),b=fixture(270);const run=f=>coherentMasses(f.S,f.w,f.h,{gaussian,components,num});const area=m=>m.reduce((s,r)=>s+r.mask.reduce((x,v)=>x+v,0),0);assert.equal(run(b).length,2);assert.ok(Math.abs(area(run(a))/4-area(run(b)))<300);});
test('cutting an interior line leaves separate boundary runs, with no reconnect across the mass',()=>{const w=20,h=10,mask=new Uint8Array(w*h);for(let x=7;x<=12;x++)mask[5*w+x]=1;const points=Array.from({length:20},(_,x)=>({x,y:5}));const got=cutStrokes([{points}],mask,w,h);assert.equal(got.length,2);assert.equal(got[0].points.at(-1).x,6);assert.equal(got[1].points[0].x,13);});
test('warm dark colour stays with the existing painter while a neutral dark mass is owned',()=>{const {w,h,S}=fixture();const rgb=new Uint8Array(w*h*3).fill(80);for(let y=100;y<300;y++)for(let x=80;x<240;x++){const i=y*w+x;rgb[3*i]=180;rgb[3*i+1]=40;rgb[3*i+2]=20;}const m=coherentMasses(S,w,h,{gaussian,components,num,rgb});assert.equal(m.length,1);assert.equal(m[0].mask[150*w+150],0);assert.equal(m[0].mask[150*w+380],1);});
test('a deliberate light inside a dark mass remains unpainted',()=>{const {w,h,S}=fixture();for(let y=160;y<175;y++)for(let x=155;x<170;x++)S[y*w+x]=0;const m=coherentMasses(S,w,h,{gaussian,components,num});assert.ok(m.every(m=>!m.mask[167*w+162]));assert.ok(m.some(m=>m.mask[150*w+150]));});

test('owned mass receives the full wash budget exactly once and other cells retain modulation',()=>{const {w,h,S}=fixture(),K=2,A=new Float32Array(w*h*K).fill(2),MOD={Aw:new Float32Array(A.length).fill(.8),Ad:new Float32Array(A.length).fill(1.2)};const r=massBudget({A,MOD,K,SRC:S,rgb:null,w,h,gaussian,components,num:(k,d)=>k==='massbudget'?1:d,log:()=>{}});const i=150*w+150;assert.equal(r.owned[i],1);assert.equal(MOD.Aw[i*K],2);assert.equal(MOD.Ad[i*K],0);assert.ok(Math.abs(MOD.Aw[0]-.8)<1e-6);assert.ok(Math.abs(MOD.Ad[0]-1.2)<1e-6);assert.equal(A[i*K],2);});

test('mass-local cut-in suppression leaves unrelated passages alone',()=>{const {w,h,S}=fixture(),A=new Float32Array(w*h).fill(1),MOD={Aw:A.slice(),Ad:A.slice()};const r=massBudget({A,MOD,K:1,SRC:S,w,h,gaussian,components,num:(k,d)=>k==='massbudget'?1:k==='masscutin'?0:d,log:()=>{}});const inside=new Uint8Array(w*h),outside=inside.slice();inside[150*w+150]=1;outside[20*w+20]=1;assert.equal(r.skipCutIn(inside),true);assert.equal(r.skipCutIn(outside),false);});

test('flag off leaves modulation untouched',()=>{const A=new Float32Array([2]),MOD={Aw:new Float32Array([.8]),Ad:new Float32Array([1.2])};assert.equal(massBudget({A,MOD,num}),null);assert.ok(Math.abs(MOD.Aw[0]-.8)<1e-6);assert.ok(Math.abs(MOD.Ad[0]-1.2)<1e-6);});
