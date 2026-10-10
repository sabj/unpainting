import test from 'node:test';
import assert from 'node:assert/strict';
import {brushContactLookahead,penContactLookahead,lookaheadCount} from './cpu-contact-lookahead.mjs';
import {createBrush} from './brush.mjs';
import {createPen} from './pen.mjs';
const contains=(a,b)=>a&&b&&a[0]<=b[0]&&a[1]<=b[1]&&a[0]+a[2]>=b[0]+b[2]&&a[1]+a[3]>=b[1]+b[3];
test('bounded brush future union covers every one-step envelope without advancing instrument',()=>{
  const b=createBrush({radius:10,seed:17}),path=[{x:-2,y:4,r:5,p:.1},{x:15,y:9,r:9,p:.9},{x:4,y:16,r:4,p:.4}];
  const before={rng:b.rs.s,travel:b.travel,carry:b.carry};
  for(const upright of [false,true,'sweep']){
    const options={k:1,t:0,spacing:.7,upright,hx:1,hy:0,w:20,h:20};
    const all=brushContactLookahead(b,path,{...options,count:8});
    for(let i=0;i<8;i++)assert.ok(contains(all,brushContactLookahead(b,path,{...options,t:i*.7,count:1})));
  }
  assert.deepEqual({rng:b.rs.s,travel:b.travel,carry:b.carry},before);
});
test('pen lazy geometry covers dwell and width interpolation while drop decreases',()=>{
  const p=createPen({reach:3}),path=[{x:3,y:3,dwell:1.5,p:.4},{x:4,y:4,p:.2,nw:2},{x:14,y:12,p:.8,nw:5}];
  p.drop=1;const one=penContactLookahead(p,path,.5,1,20,20),many=penContactLookahead(p,path,.5,8,20,20);
  for(let i=0;i<12;i++){const a=one(),b=many();assert.ok(contains(b,a));p.drop*=.8;}
});
test('only bounded explicit intervals activate lookahead',()=>{
  for(const n of [undefined,NaN,0,-1,1.5,Infinity])assert.equal(lookaheadCount(n),0);
  assert.equal(lookaheadCount(8),8);assert.equal(lookaheadCount(10000),4096);
});
