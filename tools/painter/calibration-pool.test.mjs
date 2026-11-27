import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCalibrationPool} from './calibration-pool.mjs';
import {createSwatchCalibration} from './calibration-swatches.mjs';
import {DEFAULTS} from '../../src/media/sheet.mjs';
const dry={name:'wet on dry',water:.62,wetMix:.55,bridge:.78,bridgeSoft:2.2,intoWet:false,passes:1};
const wet={...dry,name:'wet on wet',water:.88,intoWet:true};
const config={PIGS:[{K:[.8,.5,.3],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.15}],O:{...DEFAULTS,edgeEvap:0},PAPER_OPTS:{seed:9,mmPerCell:.52},GCHUNK:4,BRUSH:4,FINAL_W:1086,UPRIGHT:true,WASH_FLAT_SPLAY:.03,SPEED_PAPER:true,NATIVE_PAINT_MODE:{mode:'fast'},PB:true,w:543,valuePlan:true,brush:{radius:4,flat:false},channels:3,spacing:true,coverage:true,uniform:true,options:{},CAL:{'wet on wet':1},STOCK_TECHNIQUES:[dry,wet]};
const mark={radiusMm:2,lengthMm:10,pressure:.6,points:[[0,0,.5],[10,0,.7]],depth:1,damp:false};

test('parallel mark, damp and lane swatches are exact, ordered, cached and invalidated by inputs and code',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'calibration-')),cache={dir,code:'v1',enabled:true};
 const jobs=[{kind:'mark',T:dry,mark},{kind:'mark',T:dry,mark:{...mark,damp:true}},{kind:'wash',T:dry},{kind:'damp',T:dry}];
 const serial=createSwatchCalibration(config);
 const expected=jobs.map(job=>job.kind==='mark'?serial.scrapMark(job.T,job.mark):serial.scrapSwatches([job.T],undefined,{damp:job.kind==='damp'})[0]);
 const pool=createCalibrationPool(config,cache,2);
 try{
  const cold=await Promise.all(jobs.map(job=>pool.run(job)));cold.forEach((result,i)=>{assert.equal(result.error,undefined);assert.deepEqual(result.value,expected[i]);assert.equal(result.cached,false);});
  const warm=await Promise.all(jobs.map(job=>pool.run(job)));warm.forEach((result,i)=>{assert.deepEqual(result.value,expected[i]);assert.equal(result.cached,true);});
  const changed=await pool.run({...jobs[0],mark:{...mark,pressure:.65}});assert.equal(changed.cached,false);
  const bad=await pool.run({...jobs[0],T:{...dry,passes:0}});assert.match(bad.error.message,/passes/);assert.deepEqual((await pool.run(jobs[0])).value,expected[0]);
 }finally{await pool.close();}
 const next=createCalibrationPool(config,{...cache,code:'v2'},1);try{assert.equal((await next.run(jobs[0])).cached,false);}finally{await next.close();fs.rmSync(dir,{recursive:true,force:true});}
});
