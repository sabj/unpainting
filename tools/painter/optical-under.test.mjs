import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpticalUnder} from './optical-under.mjs';
import {renderCells} from '../../src/media/km.mjs';
const pigments=[{K:[.8,.5,.3],S:[.02,.02,.02]}],base=Uint8Array.of(250,248,240),ink=[Float32Array.of(.1)];

test('the first archived ink is reconciled before capture; an immutable underlay avoids later dry drains',()=>{
 let drains=0,lowerReads=0;const sheet={layers:[ink]};
 const link=sheet._gpu={queuedDrys:0,flushDrys(){drains++;if(this.queuedDrys){sheet.layers.push([Float32Array.of(.2)]);this.queuedDrys=0;}},syncLower(_sheet,limit){assert.equal(limit,1);lowerReads++;}};
 const under=createOpticalUnder(()=>sheet,pigments,1);
 assert.deepEqual([...under(base)],[250/255,248/255,240/255]);
 link.queuedDrys=1;const actual=under(base),expected=new Float64Array(3);renderCells([ink],pigments.map(p=>p.K),pigments.map(p=>p.S),base,0,1,1,null,null,null,expected);
 assert.deepEqual([...actual],[...expected]);assert.equal(actual._immutable,true);assert.equal(lowerReads,1);assert.equal(drains,2);
 link.queuedDrys=1;assert.equal(under(base),actual);assert.equal(link.queuedDrys,1);assert.equal(drains,2);
 ink[0][0]=.3;ink._cacheVersion=1;assert.notEqual(under(base),actual);assert.equal(lowerReads,2);
 const replacement={layers:[[Float32Array.of(.7)],[Float32Array.of(.1)]],_gpu:link};Object.assign(sheet,replacement);assert.notEqual(under(base),actual);
});
