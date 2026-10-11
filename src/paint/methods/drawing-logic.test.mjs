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

import fs from 'node:fs';
import { reviewedFaceFeatures, drawingLogic } from './drawing-logic.mjs';
import { scaleLines } from '../../crop/lines.mjs';
// A face region in normalised coordinates, as a reviewed subject file gives it.
const facePoly = [[0.5,0.33],[0.58,0.3],[0.7,0.3],[0.82,0.32],[0.88,0.38],[0.86,0.5],[0.8,0.6],[0.72,0.66],[0.62,0.66],[0.54,0.6],[0.5,0.5]];
// The reviewed subject, its trace and its target are private and stay outside the repository.
const subjectPath = new URL('../../../work/subjects/portrait.json', import.meta.url);
test('reviewed focal path selection preserves geometry and measured weight, validates region and cap', () => {
  const g = line(60, 50, 65, 50, 6, { length: 5, weight: .2 });
  const instruction = { maxPaths: 1, features: [{ ordinal: 0, name: 'lid' }] };
  const selected = reviewedFaceFeatures([g], instruction, { w: 100, h: 100, facePoly });
  assert.equal(selected[0].object, 'face');assert.equal(selected[0].points, g.points);assert.equal(selected[0].weight, .2);
  assert.throws(() => reviewedFaceFeatures([line(0, 0, 5, 0, 6, {length:5})], instruction, {w:100,h:100,facePoly}), /outside its registered face/);
  assert.throws(() => reviewedFaceFeatures([g], {...instruction,maxPaths:0}, {w:100,h:100,facePoly}), /capped path count/);
});
// The private subject file names its own trace and target, so nothing private is named here.
const privateSubject = fs.existsSync(subjectPath) ? JSON.parse(fs.readFileSync(subjectPath)).drawingFeatures : null;
const traceBase = privateSubject?.traceBase ?? '';
const targetFile = privateSubject?.target?.path ?? '';
const tracePath = new URL(`../../../work/lines/${traceBase}-lines.json`, import.meta.url);
const targetPath = new URL(`../../../${targetFile}`, import.meta.url);
test('reviewed subject lids, irises and under-eye paths survive capped selection; other face texture remains sparse', {skip:!privateSubject||!fs.existsSync(tracePath)||!fs.existsSync(targetPath)}, async () => {
  const sharp = (await import('sharp')).default;
  const doc = JSON.parse(fs.readFileSync(tracePath));
  const portrait = JSON.parse(fs.readFileSync(subjectPath)), instruction = portrait.drawingFeatures, required = new Set(instruction.features.map(f=>f.ordinal));
  assert.equal(instruction.features.length,8);
  for (const w of [540,1086]) {
    const h = Math.round(w*1448/1086), K = 1;
    const rgb = await sharp(targetPath.pathname).resize(w,h).removeAlpha().raw().toBuffer();
    const D = Float32Array.from({length:w*h},(_,i)=>Math.max(0,-Math.log(Math.max(.02,(.2126*rgb[3*i]+.7152*rgb[3*i+1]+.0722*rgb[3*i+2])/255))));
    const original=scaleLines(doc,w,h,{keepOrder:true});
    const marked=reviewedFaceFeatures(original,instruction,{w,h,facePoly});
    const ranked=rankLines(marked,{w,h,D,K});
    const baseline=splitForm(rankLines(original,{w,h,D,K}),{cells:0,features:40});
    const selected=splitForm(ranked,{cells:0,features:40});
    const selectedIds=new Set(selected.form.map(g=>g.index));
    assert.ok([...required].every(i=>selectedIds.has(i)),'each reviewed lid/iris/under-eye path reaches opening selection');
    assert.ok(selected.form.length<=40,'focal paths displace other features instead of adding a new budget');
    const faceTexture=ranked.filter(g=>g.tier===2&&!required.has(g.index)&&g.points.every(q=>q.x/w>.5&&q.x/w<.88&&q.y/h>.47&&q.y/h<.66));
    assert.ok(faceTexture.some(g=>!selectedIds.has(g.index)),'unrelated lower-face texture is not retained wholesale');
    assert.ok([...required].some(i=>!baseline.form.some(g=>g.index===i)),'actual input demonstrates the old omission');
    for(const i of required){assert.equal(marked[i].points,original[i].points);assert.equal(marked[i].weight,original[i].weight);}
    const options={image:targetFile,drawinglogic:1};
    const logs=[];const gestures=drawingLogic({base:traceBase,first:true,w,h,D,cells:0,K,opt:(n,f)=>options[n]??f,num:(n,f)=>options[n]??f,log:s=>logs.push(s)});
    assert.ok(gestures.length>0);assert.ok(logs.some(s=>s.includes('target/trace hashes matched')));
    const deliveredPoints=new Set(gestures.flatMap(g=>g.points.map(q=>`${q.x},${q.y}`)));
    for(const i of required){
      if(instruction.openingPolicies?.[i]?.kind==='pale-plane'){
        const cue=gestures.find(g=>g.reviewedOrdinal===i),sourcePoints=new Set(original[i].points.map(q=>`${q.x},${q.y}`));
        assert.ok(cue?.points.length>=2,'pale-plane cue retains a connected original span');
        assert.ok(cue.points.every(q=>sourcePoints.has(`${q.x},${q.y}`)),'pale-plane control only removes original geometry');
      }else assert.ok(original[i].points.every(q=>deliveredPoints.has(`${q.x},${q.y}`)),'structural geometry survives default joining, ranking and stroke splitting');
    }
  }
});

import {prepareReviewedCropDrawing,projectSelectedDrawing,shapeReviewedOpening} from './drawing-logic.mjs';
import os from 'node:os';
import path from 'node:path';
test('registered crop projection retains literal point lineage and role metadata',()=>{
 const source=[{reviewedOrdinal:2,openingRole:'iris',points:[{x:510,y:480,nw:1.2,s:.3,sourcePointIndex:7,contactRole:'structural iris rim'},{x:520,y:485,nw:1.8,s:.4,sourcePointIndex:8,contactRole:'upper lid wing'}]},{points:[{x:0,y:0},{x:5,y:5}]}];
 const copy=structuredClone(source),got=projectSelectedDrawing(source,{box:{left:505,top:475,width:415,height:265}});
 assert.equal(got.length,1);assert.equal(got[0].reviewedOrdinal,2);assert.equal(got[0].openingRole,'iris');
 assert.deepEqual(got[0].points,[{...source[0].points[0],x:5,y:5},{...source[0].points[1],x:15,y:10}]);assert.deepEqual(source,copy);
 const reviewed=shapeReviewedOpening({reviewedOrdinal:2,openingPolicy:{kind:'iris-rim',maxContactWidthCells:2},points:source[0].points.map(q=>({...q,weight:.5,openingPolicy:{kind:'iris-rim',maxContactWidthCells:2}}))},{D:new Float32Array(40*40),w:40,h:40,shape:{base:.6,floor:.7}});
 assert.ok(reviewed.points.every(q=>q.nw<=2));assert.ok(reviewed.points.every(q=>Number.isInteger(q.sourcePointIndex)));
});
test('unreviewed opening remains identical to ordinary shape and projection preserves all fields',()=>{
 const g=line(3,4,12,4,10,{weight:.2});const shape={base:.6,floor:.7};const actual=shapeReviewedOpening(g,{D:new Float32Array(100),w:10,h:10,shape});const expected=shapeGesture(g,shape);assert.deepEqual(actual.points,expected.points);
 const point={x:510,y:480,nw:2,s:.13,sourcePointIndex:29,contactRole:'upper lid wing'};assert.deepEqual(projectSelectedDrawing([{points:[point,{...point,x:520}]}],{box:{left:505,top:475,width:415,height:265}})[0].points[0],{...point,x:5,y:5});
});

import { scaleDrawingGestures, handDrawing } from './drawing-hand.mjs';
test('sheet conversion preserves hybrid contact, speed, pauses and reservoir instructions at 2x', () => {
 const gestures=[{dip:.4,low:.03,tier:1,role:'structure',length:10,points:[{x:2,y:3,s:.2,v:.6,dwell:1.2},{x:12,y:3,s:.8,v:2.4,nw:2}]}];
 const copy=structuredClone(gestures),fine=scaleDrawingGestures(gestures,2)[0];
 assert.equal(fine.dip,.4);assert.equal(fine.low,.03);assert.equal(fine.role,'structure');
 assert.equal(fine.points[0].dwell,1.2);assert.equal(fine.points[0].v,1.2);assert.equal(fine.points[1].nw,4);
 assert.equal(fine.points[0].s,.2);assert.deepEqual(gestures,copy);
});
test('reviewed hand route joins continuations but preserves distinct roles and tapered light breaks', () => {
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
