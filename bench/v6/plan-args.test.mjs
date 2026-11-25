import test from 'node:test';
import assert from 'node:assert/strict';
import { v6Args } from './plan-args.mjs';

test('a v6 plan maps to the drawing file, the study layers and the box', () => {
  const args = v6Args({ planDir: 'p', target: 't.png', width: 385, out: 'o', plan: { sheet: { widthMm: 100 }, drawing: { medium: 'ink', file: 'd-lines.json' },
    washes: { layers: [{ study: 's3.png', leastMm2: 150 }, { study: 's1.png', leastMm2: 120, glaze: true }], paints: ['ochre'] } } });
  const at = k => args[args.indexOf(k) + 1];
  assert.equal(at('--drawingfile'), 'p/d');
  assert.equal(at('--washplan'), 'p/s3.png:150,p/s1.png:120:glaze');
  assert.equal(at('--paints'), 'ochre');
  assert.throws(() => v6Args({ planDir: 'p', target: 't', width: 1, out: 'o', plan: { sheet: { widthMm: 100 }, drawing: { medium: 'ink' }, washes: { layers: [{ study: 's' }] } } }), /drawing.file/);
  assert.throws(() => v6Args({ planDir: 'p', target: 't', width: 1, out: 'o', plan: { sheet: { widthMm: 100 }, drawing: { medium: 'none' } } }), /washes.layers/);
});
