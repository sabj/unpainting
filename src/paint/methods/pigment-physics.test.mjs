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

// --boxphys 1: each chosen box paint's published physics on the sheet; picking is not touched.
import { BOX, boxPigment } from '../../crop/box.mjs';
import { physicalOf } from '../../../demos/lab/media/pigment-physical.js';
const boxed = keys => keys.map(k => boxPigment(BOX.find(p => p.key === k)));
test('--boxphys defaults off: pigments pass unchanged, same objects', () => {
 const ps = boxed(['ultramarine', 'phthaloblue']);
 const out = run(ps);
 assert.equal(out[0], ps[0]); assert.equal(out[1], ps[1]);
 assert.equal(run(ps, { boxphys: 0 })[0], ps[0]);
});
test('--boxphys 1 gives each box paint its own physics and leaves colour and picking constants alone', () => {
 const keys = ['ultramarine', 'phthaloblue', 'cadyellow'], ps = boxed(keys);
 const out = run(ps, { boxphys: 1 });
 out.forEach((p, i) => {
  const row = physicalOf(keys[i]);
  assert.deepEqual(p.K, ps[i].K); assert.equal(p.gamma, row.gamma); assert.equal(p.omega, row.omega); assert.equal(p.rho, row.rho); assert.deepEqual(p.S, row.scatter);
 });
 assert.ok(out[0].floc > 0); assert.equal('floc' in out[1], false);
 assert.equal(ps[0].gamma, 0.25, 'the input pigment is not mutated');
});
test('--boxphys leaves pigments with no box key alone and composes with --pigphys', () => {
 const loose = pigment([.8, .3, .1], { floc: .27 }), ps = [loose, ...boxed(['ultramarine'])];
 const out = run(ps, { boxphys: 1 });
 assert.equal(out[0], loose);
 const both = run(ps, { boxphys: 1, pigphys: 1 });
 assert.equal(both[1].gamma, physicalOf('ultramarine').gamma, 'authored physics survive the hue heuristic');
 assert.equal(both[1].floc, physicalOf('ultramarine').floc);
});
test('an explicit flag still overrides the table', () => {
 const out = run(boxed(['ultramarine']), { boxphys: 1, gammablue: 0.3, flocblue: 0.1 });
 assert.equal(out[0].gamma, 0.3); assert.equal(out[0].floc, 0.1);
});
