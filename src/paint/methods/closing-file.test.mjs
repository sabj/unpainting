import test from 'node:test';
import assert from 'node:assert/strict';
import {drawsWholeFile,selectValueInk,valueInkVerdict} from './light-to-dark.mjs';
import {prepareDrawing,sourceDrawingCaps,CLOSING_PRESSURE_MAX} from './material-profiles.mjs';

const w=12,h=12,density=new Float32Array(w*h),line={points:[{x:1,y:6},{x:10,y:6}]};

test('a closing file is drawn whole under a graphite opening; the walker is still filtered', () => {
 assert.equal(drawsWholeFile({first:false,fine:false,closingFile:'plan/closing'}),true);
 assert.equal(drawsWholeFile({first:false,fine:false,closingFile:''}),false);
 assert.equal(drawsWholeFile({first:false,fine:true,closingFile:'plan/closing'}),false,'the finishing pass reads no file');
 assert.equal(drawsWholeFile({first:true,graphiteFirst:true,drawingFile:'plan/opening'}),true);
 assert.equal(drawsWholeFile({first:true,graphiteFirst:false,drawingFile:'plan/opening',closingFile:'plan/closing'}),false);
 assert.equal(drawsWholeFile({first:false,sourceInk:true}),true);
});

test('closing lines on flat planned tone or beside a reserve survive when drawn whole', () => {
 const reserves=new Uint8Array(w*h);reserves[6*w+1]=1;
 assert.deepEqual(selectValueInk([line],{first:false,w,h,density,reserves}),[],'the filter alone drops the line');
 assert.deepEqual(selectValueInk([line],{first:false,w,h,density,reserves,sourceInk:true}),[line]);
});

test('valueInkVerdict names why a line is dropped', () => {
 const reserves=new Uint8Array(w*h);reserves[6*w+1]=1;
 assert.equal(valueInkVerdict(line,{first:false,w,h,density,reserves}),'reserve');
 assert.equal(valueInkVerdict(line,{first:false,w,h,density}),'low contrast');
 assert.equal(valueInkVerdict({points:[]},{first:false,w,h,density}),'no points');
 assert.equal(valueInkVerdict({points:[{x:1,y:1},{x:1.3,y:1}]},{first:true,w,h,density}),'short');
 assert.equal(valueInkVerdict({points:[{x:1,y:1},{x:1.3,y:1}],outline:true},{first:true,w,h,density}),'kept');
});

test('a planned closing file is not cut to the sparse closing caps', () => {
 const planned=sourceDrawingCaps({medium:'sepia-ink',stage:'closing',plannedDrawing:true});
 assert.deepEqual([planned.lines,planned.pressure,planned.edgeMin],[100000,CLOSING_PRESSURE_MAX,0]);
 const sparse=sourceDrawingCaps({medium:'sepia-ink',stage:'closing'});
 assert.deepEqual([sparse.lines,sparse.edgeMin],[24,.22],'a closing pass with no file keeps the sparse caps');
 const lines=Array.from({length:40},(_,i)=>({points:[{x:1,y:i%12},{x:10,y:i%12}]}));
 const edgeStrength=new Float32Array(w*h);
 const out=prepareDrawing(lines,{medium:'sepia-ink',stage:'closing',mmPerCell:.5,edgeStrength,w,h,caps:planned});
 assert.equal(out.length,40,'no line lost to the line cap or to flat target edges');
 assert.ok(out.every(g=>g.points.every(p=>p.p<=CLOSING_PRESSURE_MAX)),'the pressure ceiling still holds');
});
