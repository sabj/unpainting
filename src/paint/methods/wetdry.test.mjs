import test from 'node:test';
import assert from 'node:assert/strict';
import { setStrict, resetChecks, continuedSummary } from '../../media/checks.mjs';
import { measureBrush, compoundClump, fitMoistStroke, measurePaper, enforcePaper, paperReady, strokeCells } from './wetdry.mjs';

const sheet=()=>({w:3,h:3,n:9,W:new Float32Array(9),s:new Float32Array(9),paper:{capacity:new Float32Array(9).fill(1)}});
test('GPU water is synchronized before a stroke; damp pores prevent a dry stroke',()=>{
 const s=sheet();let reads=0,dries=0;
 s._gpu={paused:false,ensureFresh:()=>{if(!reads++)s.s[4]=0.7;}};
 const events=[];
 enforcePaper({sheet:s,cells:[4],technique:'dry layer',O:{},step:()=>{},dry:()=>{dries++;s.W.fill(0);s.s.fill(0);},record:e=>events.push(e)});
 assert.ok(reads>=3);assert.equal(dries,1);assert.ok(events[0].passed);assert.equal(events[0].saturationMax,0);
});
test('wet blend waits out gloss without drying or silently accepting dry paper',()=>{
 const s=sheet();s.W[4]=0.5;s.s[4]=0.8;let steps=0;
 enforcePaper({sheet:s,cells:[4],technique:'wet blend',O:{},step:()=>{steps++;s.W[4]-=0.01;},dry:()=>assert.fail('must not dry')});
 assert.ok(steps>=20);assert.ok(paperReady(measurePaper(s,[4]),'wet blend'));
 resetChecks();const log=console.log;console.log=()=>{};try{assert.equal(enforcePaper({sheet:sheet(),cells:[4],technique:'wet blend',step:()=>{},dry:()=>assert.fail('must not dry')}),false);}finally{console.log=log;}
 assert.equal(continuedSummary().checks['wetdry precondition failed'].count,1);
 setStrict(true);try{assert.throws(()=>enforcePaper({sheet:sheet(),cells:[4],technique:'wet blend',step:()=>{},dry:()=>assert.fail('must not dry')}),/precondition failed/);}finally{resetChecks();}
});
test('dry gate verifies the entire sheet after drying; lingering water returns false, or stops under strict',()=>{
 const s=sheet();s.W[4]=1;
 resetChecks();const log=console.log;console.log=()=>{};try{assert.equal(enforcePaper({sheet:s,cells:[4],technique:'dry layer',dry:()=>{s.W[4]=0;s.s[0]=0.5;}}),false);}finally{console.log=log;}
 assert.equal(continuedSummary().checks['wetdry full-sheet drying failed'].count,1);
 setStrict(true);try{const s3=sheet();s3.W[4]=1;assert.throws(()=>enforcePaper({sheet:s3,cells:[4],technique:'dry layer',dry:()=>{s3.W[4]=0;s3.s[0]=0.5;}}),/full-sheet drying failed/);}finally{resetChecks();}
});
test('stroke envelope respects masks and includes interpolated path cells',()=>{
 const s=sheet();s.clip=Uint8Array.from({length:9},(_,i)=>i!==4?1:0);
 const cells=strokeCells(s,[{x:0.5,y:0.5},{x:2.5,y:2.5}],0.1);
 assert.ok(!cells.includes(4));assert.ok(cells.includes(0));assert.ok(cells.includes(8));
});

test('a shadow tip can move inside its moist clump without changing any paper water',()=>{
 const w=14,h=14,n=w*h,s={w,h,n,W:new Float32Array(n),s:new Float32Array(n),paper:{capacity:new Float32Array(n).fill(1)}};
 for(let i=0;i<n;i++)if(i%w<7){s.W[i]=0.05;s.s[i]=0.8;}
 const beforeW=s.W.slice(),beforeS=s.s.slice(),points=[{x:7,y:4,p:1},{x:7,y:9,p:1}];
 const result=fitMoistStroke(s,points,3);
 assert.ok(result.adjustment);assert.ok(measurePaper(s,result.cells).moistShare>=0.7);
 assert.deepEqual(s.W,beforeW);assert.deepEqual(s.s,beforeS);
 assert.ok(Math.abs(result.adjustment.dx)<=3);
});

test('one compound clump lifts across gaps without requiring or touching their dry paper',()=>{
 const touches=[[{x:5,y:10,p:1},{x:8,y:10,p:0.5}],[{x:30,y:10,p:1},{x:33,y:10,p:0.5}]];
 const points=compoundClump(touches);
 assert.equal(points.length,6);assert.equal(points[2].p,0);assert.equal(points[3].p,0);
 const s={w:40,h:20,n:800},cells=strokeCells(s,points,2);
 assert.ok(cells.includes(10*40+6));assert.ok(cells.includes(10*40+31));
 assert.ok(!cells.includes(10*40+20),'lifted connector must not count as contact');
});

test('non-finite water cannot pass a paper gate',()=>{
 const s=sheet();s.W[4]=NaN;
 assert.throws(()=>measurePaper(s,[4]),/Non-finite/);
});
test('a wet gate has a finite timeout and records failure instead of painting',()=>{
 const s=sheet();s.W[4]=1;s.s[4]=1;const records=[];
 resetChecks();const log=console.log;console.log=()=>{};try{assert.equal(enforcePaper({sheet:s,cells:[4],technique:'wet blend',step:()=>{},record:e=>records.push(e)}),false);}finally{console.log=log;resetChecks();}
 assert.equal(records[0].waits,20000);assert.equal(records[0].passed,false);
});


test('after waiting, the gate remeasures a revised footprint instead of using stale moisture',()=>{
 const s=sheet();s.W[4]=.5;s.s[4]=.8;s.W[3]=.05;s.s[3]=.8;
 const records=[];let moved=0;
 enforcePaper({sheet:s,cells:[4],technique:'wet blend',step:()=>{s.W[4]=0;s.s[4]=0;},
  refit:()=>{moved++;return [3];},record:e=>records.push(e)});
 assert.equal(moved,1);assert.equal(records[0].passed,true);
 assert.deepEqual(records[0].bounds,[0,1,0,1]);
 assert.ok(Math.abs(records[0].waterMax-.05)<1e-6);
});


test('brush audit settles GPU state and measures actual remaining pigment and water', () => {
 const b={K:2,resW:2,resP:[1,.5],hairs:[{water:1,pig:[.5,.25]}]};
 let reads=0;b._pend={hairs:true,link:{settleBrush:()=>{reads++;b.hairs[0].water=.5;}}};
 assert.deepEqual(measureBrush(b),{waterMass:2.5,pigmentMass:[1.5,.75],pigmentConcentration:[.6,.3]});
 assert.equal(reads,1);b.resW=NaN;assert.throws(()=>measureBrush(b),/Invalid/);
});
