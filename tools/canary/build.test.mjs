import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {drawingLabel,renderRecord} from './build.mjs';
test('drawing labels describe linked stages instead of the default ink medium',()=>{
 assert.equal(drawingLabel({drawing:{medium:'ink',order:'first'}},{stages:{prep:{lines:12},prepInk:{lines:0}}}),'graphite preparation (12 planned paths)');
 assert.equal(drawingLabel({drawing:{medium:'ink',order:'none'}},null),'none');
});
test('a render must have one recorded commit across its artifacts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canary-record-'));
 try{
  fs.writeFileSync(path.join(dir,'backend.json'),JSON.stringify({commit:'aaa',release:'0.2.0-rc.6'}));
  fs.writeFileSync(path.join(dir,'frames.json'),JSON.stringify({commit:'bbb',frames:[]}));
  assert.throws(()=>renderRecord(dir),/inconsistent render commits/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
