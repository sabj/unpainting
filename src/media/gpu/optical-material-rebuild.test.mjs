import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuLink} from './link.mjs';
import {createSheet,applyResist,liftResist} from '../sheet.mjs';
import {makePaper} from '../paper.mjs';
import {renderLayers} from '../km.mjs';

test('graded resist removal rebuilds optical archive from changed physical lower layers',()=>{
 const pigment={K:[.8,.5,.3],S:[.02,.02,.02]},sheet=createSheet(makePaper(2,1),[pigment]);
 sheet.layers=[[Float32Array.of(.1,.1)]];
 applyResist(sheet,Uint8Array.of(1,1),Float32Array.of(.5,1));
 sheet.layers.push([Float32Array.of(.6,.6)],[Float32Array.of(.03,.03)]);
 const before=renderLayers(sheet.layers,[pigment],Uint8Array.of(255,255,255,255,255,255),2);
 liftResist(sheet);
 assert.deepEqual(Array.from(sheet.layers[1][0]),[Math.fround(.3),0]);
 const calls=[],link=Object.assign(Object.create(GpuLink.prototype),{stats:{},opticalReady:true,flushDrys(){},syncLower(){},call(m){calls.push(m);}});
 link.initOptical(sheet,null);assert.equal(calls.length,0);
 link.invalidateOptical();link.initOptical(sheet,null);
 assert.equal(calls.length,1);assert.equal(calls[0].op,'opticalInit');assert.equal(calls[0].lower[0],sheet.layers[1]);
 const rebuilt=renderLayers([sheet.layers[0],...calls[0].lower,sheet.layers.at(-1)],[pigment],Uint8Array.of(255,255,255,255,255,255),2);
 assert.deepEqual(rebuilt,renderLayers(sheet.layers,[pigment],Uint8Array.of(255,255,255,255,255,255),2));
 assert(rebuilt[0]>before[0]);assert(rebuilt[3]>rebuilt[0]);assert.equal(link.stats.opticalInvalidations,1);
 link.initOptical(sheet,null);assert.equal(calls.length,1,'Unchanged archive should not rebuild repeatedly');
});
