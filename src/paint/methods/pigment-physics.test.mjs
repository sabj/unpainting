import test from 'node:test';
import assert from 'node:assert/strict';
import { pigmentPhysics } from './pigment-physics.mjs';
const pigment = (K, extra = {}) => ({K, rho:.03, gamma:.12, ...extra});
const run = (pigments, flags = {}) => pigmentPhysics({pigments, opt:(k,d)=>k in flags?String(flags[k]):d, num:(k,d)=>k in flags?Number(flags[k]):d, log:()=>{}});
test('physics off preserves the actual pigment properties', () => {
 const p=pigment([.8,.3,.1],{floc:.27}); assert.equal(run([p])[0],p);
});
test('every pigment family accepts an explicit flocculation setting', () => {
 const ps=[pigment([.8,.3,.1]),pigment([.4,.4,.4]),pigment([.1,.8,.3]),pigment([.2,.4,.8])];
 assert.deepEqual(run(ps,{flocblue:.1,flocgrey:.2,flocviolet:.3,flocearth:.4}).map(p=>p.floc),[.1,.2,.3,.4]);
 assert.equal(run([pigment([.1,.1,.8])],{gammayellow:.1,flocyellow:.5})[0].floc,.5);
});
test('explicit zero clears a pigment floc while unset overrides preserve it', () => {
 const p=pigment([.8,.3,.1],{floc:.27});
 const authored=run([p],{pigphys:1})[0];
 assert.equal(authored.floc,.27);assert.equal(authored.rho,.03);assert.equal(authored.gamma,.12);
 assert.equal(run([p],{flocblue:0})[0].floc,0);
 assert.equal(run([p],{flocblue:2})[0].floc,1);
});
