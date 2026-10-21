import test from 'node:test';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';import {measure} from './measure-brush.mjs';
test('the actual shipped browser brush keeps eased edges on slow curves and fast straight strokes',async()=>{
 const report=await measure(fileURLToPath(new URL('../../demos/lab/media/',import.meta.url)));
 for(const [name,r]of Object.entries(report))assert.ok(r.meanRms<1.1,`${name}: ${r.meanRms} cells RMS`);
});
