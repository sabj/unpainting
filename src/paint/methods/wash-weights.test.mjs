import test from 'node:test';
import assert from 'node:assert/strict';

import {normalizeWashWeights,shapeMix} from './wash-weights.mjs';
import {shapeDeficit,shapeCharge} from './shape-deficit.mjs';

test('band shares over the whole are scaled back to the whole; shares under it are left alone',()=>{
 const weights=[.1,.2,.2,.5,.5].map(v=>Float32Array.of(v,v/3));
 normalizeWashWeights(weights);
 assert.ok(Math.abs(weights.reduce((s,a)=>s+a[0],0)-1)<1e-6);
 assert.ok(Math.abs(weights[1][0]-.2/1.5)<1e-6);
 assert.ok(Math.abs(weights.reduce((s,a)=>s+a[1],0)-.5)<1e-6);
});

test('feedback follows the passage mixture when the first pan is already complete',()=>{
 const target=[.02,.5],held=[.02,.1],booked=[.01,.1],mix=shapeMix({mix:target});
 const factor=shapeCharge(shapeDeficit(target,held,{mix}),shapeDeficit(target,booked,{mix}));
 assert.ok(factor>.99&&factor<=1);
 assert.equal(shapeCharge(shapeDeficit(target,held,{pigment:0}),shapeDeficit(target,booked,{pigment:0})),0);
});
