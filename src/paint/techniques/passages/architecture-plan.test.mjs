import test from 'node:test';import assert from 'node:assert/strict';
import {buildRegionPlan,passagePaths,inPolygon,curvedSkyPaths,waterMopPath} from './architecture-plan.mjs';
const poly=[[0,0],[1,0],[1,1],[0,1]];
test('reference reserves and ownership are independent of painted cell count',()=>{
 const px=Uint8Array.from([30,80,190,220,225,235,40,90,200,230,230,230]);
 const p=buildRegionPlan({w:2,h:2,px,spec:{version:1,regions:[{id:'sky',cue:'blue around light',move:'wet on wet',brushMm:10,polygon:poly,reserve:{minRB:.72,minL:158}}]}});
 assert.deepEqual([...p.owned],[1,1,1,1]);assert.deepEqual([...p.reserved],[0,1,0,1]);assert.deepEqual([...p.regions[0].mask],[1,0,1,0]);
});
test('later reference-specific region supersedes generic ground',()=>{
 const p=buildRegionPlan({w:2,h:1,px:Uint8Array.from([100,120,70,160,130,90]),spec:{version:1,regions:[{id:'ground',cue:'earth',move:'wet on dry',brushMm:4,polygon:poly},{id:'foliage',cue:'green',move:'wet on wet',brushMm:4,polygon:poly,filter:{maxRG:1,minGB:1.1}}]}});assert.deepEqual(p.regions.map(r=>r.cells),[[1],[0]]);
});
test('paint paths stay in disjoint reference intervals and overlap successive sweeps',()=>{
 const m=Uint8Array.from({length:40},(_,i)=>i%10<4||i%10>6?1:0);const paths=passagePaths(m,10,4,1,[0,0,9,3]);assert.ok(paths.length>=8);for(const p of paths)assert.ok(p.every(q=>q.x<4.6)||p.every(q=>q.x>6.4));assert.equal(inPolygon(.5,.5,poly),true);
});

test('connected sky chunks preserve contact continuity across crossing sweep directions',()=>{
 const mask=new Uint8Array(60*80).fill(1),paths=curvedSkyPaths(mask,60,80,6);
 assert.ok(paths.length>20);
 let joined=0;const headings=[];
 for(let i=0;i<paths.length;i++){
  const p=paths[i],a=p[0],b=p.at(-1);
  assert.ok(p.length>=2&&p.every(q=>[q.x,q.y,q.p,q.r].every(Number.isFinite)&&q.p>0&&q.p<=1&&q.r>0));
  headings.push(Math.atan2(b.y-a.y,b.x-a.x));
  if(i&&JSON.stringify(paths[i-1].at(-1))===JSON.stringify(a))joined++;
 }
 assert.ok(joined>paths.length/2);
 assert.ok(headings.some(a=>Math.abs(Math.sin(a))>.8)&&headings.some(a=>Math.abs(Math.cos(a))>.8));
 assert.deepEqual(curvedSkyPaths(mask,60,80,6),paths);
});

test('clean-water mop broadens explicit point radii and fully presses tapered contacts',()=>{
 const source=[{x:1,y:2,r:2,p:.18},{x:4,y:7,r:12,p:.4},{x:9,y:10,p:1}];
 const mop=waterMopPath(source,10);
 assert.deepEqual(mop.map(p=>p.r),[14,16.799999999999997,14]);
 assert.ok(mop.every(p=>p.p===1));assert.equal(source[0].p,.18);assert.equal(source[0].r,2);
});


test('explicit physical plane overrides later color classifiers, only inside its polygon',()=>{
 const spec={version:1,regions:[
  {id:'stone',cue:'one facade',move:'wet on dry',brushMm:3,polygon:poly,filter:{minL:180}},
  {id:'roof',cue:'warm roof color',move:'wet on dry',brushMm:2,polygon:poly}
 ]};
 const px=new Uint8Array(4*2*3).fill(90),plain=buildRegionPlan({w:4,h:2,px,spec});
 assert.deepEqual(plain.regions.map(r=>r.id),['roof']);
 const override={id:'wall',region:'stone',cue:'dark wall is still stone',polygon:[[.25,0],[.75,0],[.75,1],[.25,1]]};
 const result=buildRegionPlan({w:4,h:2,px,spec:{...spec,ownershipOverrides:[override]}});
 assert.deepEqual(result.regions.find(r=>r.id==='stone').cells,[1,2,5,6]);
 assert.deepEqual(result.regions.find(r=>r.id==='roof').cells,[0,3,4,7]);
 assert.deepEqual(result.regions.find(r=>r.id==='stone').ownershipOverrides,[override]);
 assert.deepEqual([...result.owned],new Array(8).fill(1));
 assert.deepEqual(buildRegionPlan({w:4,h:2,px,spec:{...spec,ownershipOverrides:[]}}),plain);
});
test('ownership overrides preserve reserved lights and reject invalid scene data',()=>{
 const region={id:'stone',cue:'wall',move:'wet on dry',brushMm:3,polygon:poly,filter:{minL:250},reserve:{minL:200}};
 const override={id:'wall',region:'stone',cue:'continuous plane',polygon:poly};
 const px=Uint8Array.from([80,80,80,220,220,220]);
 const run=o=>buildRegionPlan({w:2,h:1,px,spec:{version:1,regions:[region],ownershipOverrides:o}});
 const result=run([override]);
 assert.deepEqual([...result.reserved],[0,1]);assert.deepEqual(result.regions[0].cells,[0]);
 assert.throws(()=>run([{...override,region:'missing'}]),/existing region/);
 assert.throws(()=>run([{...override,polygon:[[0,0],[1,0],[NaN,1]]}]),/normalized finite/);
 assert.throws(()=>run([override,override]),/unique id/);
});

test('only short non-sky flat clean-water sweeps extend to the future longitudinal contact',()=>{
 const p=[{x:41.5,y:456.5,p:.9},{x:42.5,y:456.5,p:1},{x:43.5,y:456.5,p:.9}];
 const extended=waterMopPath(p,6,{extendEnds:true});
 assert.equal(extended[0].x,35.5);assert.equal(extended.at(-1).x,49.5);
 assert.equal(waterMopPath(p,6)[0].x,41.5);
 const long=[{x:0,y:0},{x:30,y:0}];assert.equal(waterMopPath(long,6,{extendEnds:true})[0].x,0);
 assert.equal(p[0].x,41.5);
});

test('reference contact choice overrides recipe and defaults preserve recipe',async()=>{
 const {regionContactMode}=await import('./architecture-plan.mjs');
 assert.equal(regionContactMode({},false),'bristle');
 assert.equal(regionContactMode({},true),'film');
 assert.equal(regionContactMode({contactMode:'bristle'},true),'bristle');
 assert.equal(regionContactMode({contactMode:'film'},false),'film');
 assert.throws(()=>regionContactMode({contactMode:'unknown'},true));
});
