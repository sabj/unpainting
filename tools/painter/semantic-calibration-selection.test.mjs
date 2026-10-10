import test from 'node:test';import assert from 'node:assert/strict';
import {semanticCalibrationSelection,requireAuthoredCalibration} from './semantic-areas.mjs';
const doc={areas:[{id:'original.sky',passes:[{id:'body',stage:'atmosphere',source:'authored'},{id:'turn',stage:'atmosphere',source:'authored'}]},{id:'original.hill',passes:[{id:'body',stage:'first-wash',source:'authored'}]}]};
test('explicit authored stages skip unreached profiles while full default preserves all',()=>{
 const bounded=semanticCalibrationSelection(doc,'atmosphere');assert.deepEqual(bounded.selectedStages,['atmosphere']);assert.deepEqual(bounded.selectedPasses.map(s=>s.key),['original.sky/body','original.sky/turn']);
 const full=semanticCalibrationSelection(doc);assert.deepEqual(full.selectedStages,['atmosphere','first-wash']);assert.equal(full.selectedPasses.length,3);
 assert.throws(()=>semanticCalibrationSelection(doc,'unknown'),/calibration stages/);
 assert.throws(()=>semanticCalibrationSelection(doc,''),/calibration stages/);
});
test('reached actual authored pass requires its binding; explicit legacy remains compatible',()=>{
 const intent={key:'original.hill/body',pass:{source:'authored'}};
 assert.throws(()=>requireAuthoredCalibration(intent,'actual',{}),/original.hill\/body/);
 const records={[intent.key]:{samples:[{lengthMm:1,gain:2}]}};
 assert.doesNotThrow(()=>requireAuthoredCalibration(intent,'legacy',{}));
 assert.doesNotThrow(()=>requireAuthoredCalibration(intent,'actual',records));
 assert.doesNotThrow(()=>requireAuthoredCalibration(null,'legacy',{}));
});
test('legacy defaults still select first-wash only',()=>{
 const legacy={areas:[{id:'a',passes:[{id:'a',stage:'first-wash'},{id:'b',stage:'dry-shadow'}]}]};assert.deepEqual(semanticCalibrationSelection(legacy).selectedPasses.map(s=>s.key),['a/a']);
});
