import test from 'node:test';
import assert from 'node:assert/strict';
import { pencilDraw, pencilPigment } from './pencil-line.mjs';

const sheet = (w = 40, h = 20) => ({ w, h, paper: { height: new Float32Array(w * h).fill(0.7) }, D: [new Float32Array(w * h)] });

test('a pencil stroke does not pool where it slows or doubles back', () => {
  const a = sheet(), b = sheet();
  pencilDraw(a, [{ points: [{ x: 5, y: 10 }, { x: 35, y: 10 }] }], 0, { amount: 0.3, vary: 0 });
  // the same line with dense points and a retrace over its middle: still one pass of graphite per cell
  const dense = []; for (let x = 5; x <= 35; x += 0.1) dense.push({ x, y: 10 });
  dense.push({ x: 15, y: 10 }, { x: 25, y: 10 });
  pencilDraw(b, [{ points: dense }], 0, { amount: 0.3, vary: 0 });
  const max = s => Math.max(...s.D[0]);
  assert.ok(Math.abs(max(a) - max(b)) < 1e-6);
  assert.ok(max(a) <= 0.3 + 1e-6);
});

test('the line is continuous along the stroke', () => {
  const s = sheet();
  pencilDraw(s, [{ points: [{ x: 5, y: 10 }, { x: 35, y: 10 }] }], 0, { amount: 0.3, vary: 0.35 });
  for (let x = 6; x < 35; x++) assert.ok(s.D[0][10 * 40 + x] > 0.05, `gap at ${x}`);
});

test('the pigment keeps the measured line colour shape with unit mean', () => {
  const p = pencilPigment([0.2, 0.3, 0.4]);
  assert.ok(Math.abs((p.K[0] + p.K[1] + p.K[2]) / 3 - 1) < 1e-9);
  assert.ok(Math.abs(p.strength - 0.3) < 1e-9);
});

test('fixed reference preserves faint scaffold versus focal structural pressure', () => {
 const strong=sheet(),faint=sheet(),zero=sheet();
 const line=s=>[{points:[{x:5,y:10,s},{x:35,y:10,s}]}];
 for(const [dest,pressure] of [[strong,1],[faint,.2],[zero,0]])
  pencilDraw(dest,line(pressure),0,{amount:.3,vary:0,pressureReference:1});
 const sum=dest=>dest.D[0].reduce((a,v)=>a+v,0);
 assert.ok(Math.abs(sum(faint)/sum(strong)-.2)<1e-6);
 assert.equal(sum(zero),0);
});
test('fixed reference rejects invalid calibration without depositing', () => {
 for(const pressureReference of [0,-1,NaN,Infinity]){
  const dest=sheet();
  assert.throws(()=>pencilDraw(dest,[],0,{amount:.3,pressureReference}),/finite and positive/);
  assert.ok(dest.D[0].every(v=>v===0));
 }
});

test('dry graphite preserves resident prior deposits and publishes its new material',()=>{
 const dest=sheet(),events=[];
 dest._gpu={syncAll(sh){events.push('read');sh.D[0].fill(.2);},cpuWroteAll(){events.push('published');}};
 pencilDraw(dest,[{points:[{x:5,y:10,s:.2},{x:35,y:10,s:.2}]}],0,{amount:.3,vary:0,pressureReference:1});
 assert.deepEqual(events,['read','published']);
 assert.ok(dest.D[0][10*40+20]>.2);
 assert.ok(dest.D[0][0]>=.2);
});
