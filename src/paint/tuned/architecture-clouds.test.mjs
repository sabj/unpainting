import test from 'node:test';import assert from 'node:assert/strict';
import {cloudTissuePressure,cloudTissuePresses,pressCloudTissue} from './architecture-clouds.mjs';
import {createSheet,deposit,blot} from '../../media/sheet.mjs';
import {makePaper} from '../../media/paper.mjs';
test('blue sky stays untouched, strong neutral cloud receives full pressure',()=>{
 const p=cloudTissuePressure({px:Uint8Array.from([40,95,185,245,245,235]),w:2,h:1,sigma:0});
 assert.equal(p[0],0);assert.equal(p[1],1);
});
test('pressure transitions continuously rather than a white threshold cutout',()=>{
 const px=Float32Array.from(Array.from({length:101},(_,i)=>{const t=i/100;return [40+205*t,95+150*t,185+50*t]}).flat());
 const p=cloudTissuePressure({px,w:101,h:1,sigma:1.4});
 assert.ok([...p].filter(v=>v>0&&v<1).length>30);
 for(let i=1;i<p.length;i++){assert.ok(p[i]>=p[i-1]-1e-6);assert.ok(p[i]-p[i-1]<.05);}
 const masked=cloudTissuePressure({px,w:101,h:1,mask:new Uint8Array(101),sigma:1.4});assert.ok(masked.every(v=>v===0));
});
test('six nested strictly boolean touches give cores more and stronger contact',()=>{
 const p=Float32Array.from([0,.1,.3,.5,.7,1]),touches=cloudTissuePresses(p);assert.equal(touches.length,6);
 for(let k=0;k<6;k++){assert.ok([...touches[k].mask].every(v=>v===0||v===1));if(k){assert.ok(touches[k].strength>touches[k-1].strength);for(let i=0;i<p.length;i++)assert.ok(touches[k].mask[i]<=touches[k-1].mask[i]);}}
 assert.equal(touches.reduce((n,t)=>n+t.mask[0],0),0);assert.equal(touches.reduce((n,t)=>n+t.mask[5],0),6);
});
test('real blot removal audit equals actual physical water and pigment loss',()=>{
 const s=createSheet(makePaper(4,1,{seed:7}),[{K:[.9,.3,.1],S:[.1,.1,.1],rho:.08,omega:.1,gamma:.2}]);
 for(let i=0;i<s.n;i++)deposit(s,i,3,[2]);
 const sum=a=>a.reduce((x,y)=>x+y,0),before={water:sum(s.W),pigment:sum(s.G[0])},audits=[];
 const taken=pressCloudTissue({sheet:s,pressure:Float32Array.from([0,.1,.5,1]),blot,record:e=>audits.push(e)});
 assert.ok(taken.water>0&&taken.pigment[0]>0);assert.ok(Math.abs(taken.water-(before.water-sum(s.W)))<1e-5);assert.ok(Math.abs(taken.pigment[0]-(before.pigment-sum(s.G[0])))<1e-5);
 assert.equal(audits.length,6);assert.ok(s.W[0]>s.W[1]&&s.W[1]>s.W[2]&&s.W[2]>s.W[3]);
 assert.throws(()=>cloudTissuePresses([NaN]),/pressure/);
});
