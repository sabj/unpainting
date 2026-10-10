import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BOX} from './box.mjs';
import {sampleSource,sampleError,renderedLab,renderedUnique,chooseBox} from './boxpick.mjs';
import {wideScore,localError,localColours,widePalette} from './palettewide.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./palettewide-score.fixture.json',import.meta.url)));
// The recorded palettes came from one machine. Transcendental Math functions (sin, cos, exp, log) may differ in the
// last bit between platforms, so recorded numbers match to a relative 1e-9; names, counts and structure match exactly.
const assertNear=(actual,expected,where='palette')=>{
 if(typeof expected==='number'){
  assert.equal(typeof actual,'number',where);
  const tol=1e-9*Math.max(1,Math.abs(expected));
  assert.ok(Math.abs(actual-expected)<=tol,`${where}: ${actual} differs from ${expected} by more than ${tol}`);
  return;
 }
 if(expected===null||typeof expected!=='object'){assert.equal(actual,expected,where);return;}
 assert.equal(Array.isArray(actual),Array.isArray(expected),where);
 assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),where);
 for(const k of Object.keys(expected))assertNear(actual[k],expected[k],`${where}.${k}`);
};
const oldScore=(sample,colours,paints,weight)=>sampleError(sample,paints)+weight*localError(sample,colours,paints).mean;
for(const row of fixture.rows) {
 test(row.name+': shared score, expanded Lab and final baseline palette match the recorded palette',()=>{
  const px=Uint8Array.from(row.rgb),sample=sampleSource(px,row.w,row.h,fixture.paper),colours=localColours(sample,{K:4});
  const lists=[[BOX[0]],[BOX[1],BOX[4],BOX[7]],[BOX[7],BOX[4],BOX[1]],BOX.slice(0,6)];
  for(const paints of lists){
   const prepared=renderedUnique(sample,paints);
   assert.deepEqual(renderedLab(sample,paints,prepared),renderedLab(sample,paints));
   for(const weight of [0,1,1.25])assert.equal(wideScore(sample,colours,paints,weight),oldScore(sample,colours,paints,weight));
  }
  assertNear(widePalette(px,row.w,row.h,fixture.paper,{monochrome:false,pigments:[{},{}]},row.options),row.expected,row.name);
 });
}
test('forward selection, dropping, swaps and selection trail match duplicate solve',()=>{
 const row=fixture.rows[0],px=Uint8Array.from(row.rgb),sample=sampleSource(px,row.w,row.h,fixture.paper),colours=localColours(sample,{K:4});
 const options={min:3,max:4,gain:.5};
 const before=chooseBox(px,row.w,row.h,fixture.paper,{...options,score:paints=>oldScore(sample,colours,paints,1)});
 const after=chooseBox(px,row.w,row.h,fixture.paper,{...options,score:paints=>wideScore(sample,colours,paints,1)});
 assert.deepEqual(after,before);
});
