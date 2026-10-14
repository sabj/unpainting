import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect, handOrder, shapeGesture, personStrokes } from './drawing-hand.mjs';
import { rankLines, splitForm, toneRuns, subjectRegion } from './drawing-rank.mjs';

const line = (x0, y0, x1, y1, n = 11, extra = {}) => ({ points: Array.from({ length: n }, (_, k) => ({ x: x0 + (x1 - x0) * k / (n - 1), y: y0 + (y1 - y0) * k / (n - 1) })), ...extra });

test('connect joins two lines that continue one another and leaves a crossing line alone', () => {
  const r = connect([line(0, 10, 20, 10), line(23, 10, 40, 10), line(30, 0, 30, 30)], { gap: 4 });
  assert.equal(r.joined, 1);
  assert.equal(r.gestures.length, 2);
});

test('handOrder draws tier 1 before tier 2 and takes the nearer end', () => {
  const g = handOrder([line(50, 0, 60, 0, 3, { tier: 2 }), line(20, 0, 0, 0, 3, { tier: 1 }), line(40, 0, 25, 0, 3, { tier: 1 })]);
  assert.deepEqual(g.map(x => x.tier), [1, 1, 2]);
  assert.equal(g[0].points[0].x, 0, 'the first line is reversed so it starts at the top left');
  assert.equal(g[1].points[0].x, 25, 'the second starts at its end nearer the last lift');
});

test('shapeGesture presses in, holds and lifts off, narrowing the contact at the ends', () => {
  const g = line(0, 0, 40, 0, 41);
  g.points.forEach(q => { q.width = 3; q.weight = 1; });
  const s = shapeGesture(g, { base: 0.6, inLen: 3, outLen: 5 });
  const mid = s.points[20], a = s.points[0], b = s.points[40];
  assert.ok(Math.abs(mid.s - 0.6) < 1e-9);
  assert.ok(a.s < mid.s && b.s < a.s, 'the lift-off is lighter than the press-in');
  assert.ok(b.nw < mid.nw);
});

test('personStrokes cuts a long gesture into strokes and keeps every point', () => {
  const s = personStrokes(line(0, 0, 100, 0, 101), 30);
  assert.equal(s.length, 4);
  assert.ok(s.every(x => x.tier === 1));
});

test('hand taper and stroke splits retain prepared instrument controls and drawing roles', () => {
  const g = line(0, 0, 60, 0, 61, {tier: 2, role: 'landmark', low: .03, dip: .4});
  g.points[20] = {...g.points[20], nw: 1.2, v: .8, dwell: 2, sourcePointIndex: 7};
  const prepared = shapeGesture(g);
  const strokes = personStrokes(prepared, 25);
  assert.ok(strokes.every(s => s.tier === 2 && s.role === 'landmark' && s.low === .03));
  assert.equal(strokes[0].dip, .4);
  assert.ok(strokes.slice(1).every(s => s.dip === false), 'a split continuation keeps the reservoir rather than dipping again');
  const contact = strokes.flatMap(s => s.points).find(p => p.sourcePointIndex === 7);
  assert.equal(contact.nw, 1.2);
  assert.equal(contact.v, .8);
  assert.equal(contact.dwell, 2);
});

test('subjectRegion fills the inside of a closed outline', () => {
  const box = [line(10, 10, 50, 10), line(50, 10, 50, 50), line(50, 50, 10, 50), line(10, 50, 10, 10)].map(g => ({ ...g, role: 'subject' }));
  const R = subjectRegion(box, 60, 60, { cell: 2, close: 1 });
  assert.equal(R.mask[15 * R.gw + 15], 1, 'the middle is inside');
  assert.equal(R.mask[2 * R.gw + 2], 0, 'the corner is outside');
});

test('rankLines and splitForm: silhouette and features to the first pen, strands to the toning, features past the budget', () => {
  const w = 100, h = 100, D = new Float32Array(w * h);
  const outline = [line(20, 20, 80, 20), line(80, 20, 80, 80), line(80, 80, 20, 80), line(20, 80, 20, 20)].map(g => ({ ...g, role: 'subject', kind: 'line', weight: 0.8 }));
  const eye = { ...line(40, 40, 45, 40, 6), role: 'subject', kind: 'line', weight: 0.9 };
  const hair = { ...line(30, 30, 36, 31), role: 'subject', kind: 'strand', weight: 0.5 };
  const ranked = rankLines([...outline, eye, hair], { w, h, D });
  assert.deepEqual(ranked.map(g => g.tier), [1, 1, 1, 1, 2, 0]);
  const { form, tone } = splitForm(ranked, { cells: 0 });
  assert.deepEqual(form.map(g => g.tier), [2], 'with no budget only the feature is drawn');
  assert.equal(tone.length, 5);
});

test('toneRuns never draws in the lights and keeps where the painting needs darkening', () => {
  const w = 40, h = 10, D = new Float32Array(w * h), want = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { D[y * w + x] = x < 20 ? 0.05 : 0.5; want[y * w + x] = x < 20 ? 0 : 0.3; }
  const r = toneRuns([{ ...line(0, 5, 39, 5, 40), index: 0 }], { w, h, D, want });
  assert.equal(r.lines.length, 1);
  assert.ok(r.lines[0].points.every(q => q.x >= 20));
});

test('walkOnLines lays a walker gesture on the file lines along it and bridges a short gap', async () => {
  const { walkOnLines } = await import('./drawing-hybrid.mjs');
  const w = 60, h = 20, field = new Float32Array(w * h).fill(1);
  const file = [line(2, 10, 20, 10.5, 10), line(24, 10.5, 50, 10, 12), line(10, 0, 10, 19, 10)];
  file.forEach(g => g.points.forEach(q => { q.width = 2; }));
  const walker = [{ points: [{ x: 1, y: 9 }, { x: 25, y: 11 }, { x: 52, y: 9 }] }];
  const r = walkOnLines(walker, file, field, w, h, { reach: 3, bridge: 8 });
  assert.equal(r.gestures.length, 1, 'one gesture across the gap');
  assert.deepEqual([...r.used].sort(), [0, 1], 'the crossing line is left to the toning');
  assert.ok(r.gestures[0].points.every(q => Math.abs(q.y - 10.25) < 0.6), 'the geometry is the file\'s, not the walker\'s');
});

test('shapeHybrid: fast on a straight run, slow at the ends, a rest where the pen lands and lifts, no contact override', async () => {
  const { shapeHybrid } = await import('./drawing-hybrid.mjs');
  const g = line(0, 0, 60, 0, 61); g.points.forEach(q => { q.width = 2; q.s = 0.8; });
  const r = shapeHybrid(g).points;
  assert.ok(r[0].dwell > 0 && r[r.length - 1].dwell > 0);
  const mid = r[Math.floor(r.length / 2)], near = r[2];
  assert.ok(mid.v > near.v, 'faster in the middle of a straight run');
  assert.ok(r.every(q => q.nw == null), 'the width comes from pressure through the nib');
});

test('splitForm: every short line on the face is a feature, ahead of higher-contrast lines elsewhere', () => {
  const mk = (object, rank, index) => ({ ...line(0, 0, 5, 0, 6), tier: 2, rank, index, object, length: 5 });
  const ranked = [mk('animal', 9, 0), mk('animal', 8, 1), mk('face', 1, 2), mk('face', 0.5, 3)];
  const { form } = splitForm(ranked, { cells: 0, features: 2 });
  assert.deepEqual(form.map(g => g.index).sort(), [2, 3]);
});

import { scaleDrawingGestures, handDrawing } from './drawing-hand.mjs';
test('sheet conversion preserves hybrid contact, speed, pauses and reservoir instructions at 2x', () => {
 const gestures=[{dip:.4,low:.03,tier:1,role:'structure',length:10,points:[{x:2,y:3,s:.2,v:.6,dwell:1.2},{x:12,y:3,s:.8,v:2.4,nw:2}]}];
 const copy=structuredClone(gestures),fine=scaleDrawingGestures(gestures,2)[0];
 assert.equal(fine.dip,.4);assert.equal(fine.low,.03);assert.equal(fine.role,'structure');
 assert.equal(fine.points[0].dwell,1.2);assert.equal(fine.points[0].v,1.2);assert.equal(fine.points[1].nw,4);
 assert.equal(fine.points[0].s,.2);assert.deepEqual(gestures,copy);
});
test('hand route joins continuations but preserves distinct roles and tapered light breaks', () => {
 const gs=[line(2,8,20,8,19,{role:'structure',weight:.8}),line(22,8,40,8,19,{role:'structure',weight:.8}),line(42,8,58,8,17,{role:'hatch',weight:.5})];
 const D=new Float32Array(60*16).fill(.4);for(let y=0;y<16;y++)for(let x=28;x<34;x++)D[y*60+x]=.01;
 const r=handDrawing(gs,{gap:3,strokeLength:100,D,w:60,h:16,lit:.1});
 assert.equal(r.joined,1);assert.equal(r.gestures,2);assert.equal(r.runs,3);
 assert.ok(r.strokes.every(g=>g.points.every(p=>p.x<28||p.x>=34)));
 assert.ok(r.strokes[0].points[0].s<r.strokes[0].points[3].s);
});
test('hybrid walker revisits do not redraw or double back on a file contour', async () => {
 const {walkOnLines}=await import('./drawing-hybrid.mjs');
 const file=[line(5,10,70,10,66)],walk=[{points:[{x:5,y:10},{x:55,y:10},{x:15,y:10},{x:70,y:10}]}];
 const r=walkOnLines(walk,file,new Float32Array(80*20).fill(1),80,20,{reach:2,bridge:4});
 assert.equal(r.gestures.length,1);const P=r.gestures[0].points;
 assert.ok(P.every((p,i)=>i===0||p.x>=P[i-1].x));assert.equal(new Set(P.map(p=>p.x)).size,P.length);
});

test('hybrid file width inverts the actual physical material pressure law',async()=>{
 const {shapeHybrid}=await import('./drawing-hybrid.mjs');
 const profile={nib:.2,flex:8,pressureExponent:1.3},g=line(0,0,60,0,61);
 g.points.forEach(p=>{p.width=2;p.s=1;});
 const r=shapeHybrid(g,{...profile,pressureFloor:0,pressureGain:1,gain:1,margin:0,mix:1,want:1,land:0,lift:0,turnDwell:0}).points;
 const s=r[30].s;assert.ok(Math.abs(profile.nib+profile.flex*s**profile.pressureExponent-2)<1e-9);
 assert.ok(r.every(p=>!p.dwell));
});
