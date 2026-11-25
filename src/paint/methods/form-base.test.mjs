import test from 'node:test';
import assert from 'node:assert/strict';
import { formBases } from './form-base.mjs';
import { namedForms } from './named-forms.mjs';

// a 40 x 20 grid of 1 mm2 cells: the left half a face, the right half the ground. Shapes: 0 a pale skin over most of the
// face, 1 a darker cheek, 2 a white light in the face (paper), 3 the ground
const pw = 40, ph = 20, label = Int32Array.from({ length: pw * ph }, (_, q) => { const x = q % pw, y = (q / pw) | 0; return x >= 20 ? 3 : x < 4 && y < 4 ? 2 : x >= 12 && y >= 10 ? 1 : 0; });
const shapes = [{ lab: [80, 10, 20], paper: false }, { lab: [60, 15, 25], paper: false }, { lab: [99, 0, 0], paper: true }, { lab: [70, 0, 30], paper: false }].map((s, i) => ({ ...s, cells: [...label.keys()].filter(q => label[q] === i) }));
const mask = kind => ({ width: pw, height: ph, ids: Uint8Array.from({ length: pw * ph }, (_, q) => (q % pw < 20 ? 1 : 2)), names: ['a face', 'the ground'], kinds: [kind, 'ground'] });
const paper = Uint8Array.from(label, s => (s === 2 ? 1 : 0));

test('a soft form gets one base wash over its painted cells, at its light value; the ground, a small form and no masks get none', () => {
  const { bases, baseOf } = formBases(namedForms(mask('face'), pw, ph), label, shapes, paper, 1);
  assert.equal(bases.length, 1);
  assert.deepEqual([bases[0].name, bases[0].kind, bases[0].light, bases[0].cells.length], ['a face', 'face', 0, 400 - 16]);
  assert.deepEqual([...baseOf], [0, 0, -1, -1]);
  assert.equal(formBases(namedForms(mask('other'), pw, ph), label, shapes, paper, 1).bases.length, 0);
  assert.equal(formBases(namedForms(mask('face'), pw, ph), label, shapes, paper, 0.1).bases.length, 0, 'under the least size');
  assert.deepEqual(formBases(null, label, shapes, paper, 1), { bases: [], baseOf: new Int32Array(4).fill(-1) });
});
