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

// Box paints always settle with their published physics; colour, scattering and picking are not touched.
import { BOX, boxPigment } from '../../crop/box.mjs';
import { physicalOf } from '../../../demos/lab/media/pigment-physical.js';
const boxed = keys => keys.map(k => boxPigment(BOX.find(p => p.key === k)));
test('each box paint carries its own granulation, flocculation, staining and density; colour and scattering kept', () => {
 const keys = ['ultramarine', 'phthaloblue', 'cadyellow', 'sienna'], ps = boxed(keys);
 const out = run(ps);
 out.forEach((p, i) => {
  const row = physicalOf(keys[i]);
  assert.deepEqual(p.K, ps[i].K); assert.deepEqual(p.S, ps[i].S);
  assert.equal(p.gamma, row.gamma); assert.equal(p.omega, row.omega); assert.equal(p.rho, row.rho);
 });
 assert.ok(out[0].gamma > out[3].gamma && out[3].gamma > out[1].gamma, 'ultramarine granulates more than sienna, and phthalo blue not at all');
 assert.ok(out[0].floc > 0); assert.equal('floc' in out[1], false);
 assert.equal(ps[0].gamma, 0.25, 'the input pigment is not mutated');
});
test('a pigment with no box name passes unchanged, and box physics survive the hue heuristic', () => {
 const loose = pigment([.8, .3, .1], { floc: .27 }), ps = [loose, ...boxed(['ultramarine'])];
 assert.equal(run(ps)[0], loose);
 const both = run(ps, { pigphys: 1 });
 assert.equal(both[1].gamma, physicalOf('ultramarine').gamma, 'authored physics survive the hue heuristic');
 assert.equal(both[1].floc, physicalOf('ultramarine').floc);
});
test('an explicit flag still overrides the table', () => {
 const out = run(boxed(['ultramarine']), { gammablue: 0.3, flocblue: 0.1 });
 assert.equal(out[0].gamma, 0.3); assert.equal(out[0].floc, 0.1);
});
