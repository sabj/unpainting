import test from 'node:test';import assert from 'node:assert/strict';
import {demandPolicy} from './demand-policy.mjs';
const native={tracked:true,instrument:'brush',planOverflow:true,periodic:true,flowEvery:184,rect:[77,180,673,359]};
test('accepted bounded AUTO admits only tested native oversized trusted periodic brush regime',()=>{
 assert.equal(demandPolicy(native),true);for(const flowEvery of[76,173,184,187,296])assert.equal(demandPolicy({...native,flowEvery}),true);assert.equal(demandPolicy({...native,mode:'auto'}),true);
 for(const patch of [{tracked:false},{instrument:'pen'},{instrument:undefined},{periodic:false},{planOverflow:false},{flowEvery:24},{flowEvery:75},{flowEvery:297},{flowEvery:187.5},{flowEvery:0},{rect:[0,0,96,128]},{rect:[0,0,673,358]},{rect:[0,0,673.5,359]},{mode:'unexpected'}])assert.equal(demandPolicy({...native,...patch}),false,JSON.stringify(patch));
});
test('explicit zero retains ordinary route and one retains tracked experimental override',()=>{
 assert.equal(demandPolicy({...native,mode:'0'}),false);
 assert.equal(demandPolicy({mode:'1',tracked:true,instrument:'pen',rect:[0,0,96,128]}),true);
 assert.equal(demandPolicy({...native,mode:'1',tracked:false}),false);
});
