import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { subjectInputs } from './subject-inputs.mjs';

const base = path.resolve('/registry');
const subject = id => ({
  id, source: { path: `sources/${id}.png`, sha256: 'a', px: [100, 80] }, sheet: { widthMm: 100, cellsAcross: { full: 100 } },
  inputs: { drawingVectors: { stem: `vectors/${id}`, files: [{ path: `vectors/${id}-lines.json`, sha256: 'b' }] }, studies: [{ path: `studies/${id}-1.png`, sha256: 'c', minArea: 6 }] },
  labels: { path: `labels/${id}.json`, sha256: 'd' },
});
const registry = { file: path.join(base, 'SUBJECTS.json'), base, subjects: [subject('one'), subject('two')] };

test('a batch ships the subject list, each pinned input once, and a named-forms folder that is there', () => {
  const checked = [];
  const got = subjectInputs(['one', 'two'], { registry, check: s => (checked.push(s.id), s), exists: f => f === path.join(base, 'named-forms', 'one') });
  assert.deepEqual(checked, ['one', 'two']);
  assert.equal(got.registry, registry.file);
  assert.deepEqual(got.files, ['SUBJECTS.json', 'sources/one.png', 'vectors/one-lines.json', 'studies/one-1.png', 'labels/one.json', 'named-forms/one',
    'sources/two.png', 'vectors/two-lines.json', 'studies/two-1.png', 'labels/two.json'].map(f => path.join(base, f)));
});

test('a subject whose inputs fail their check stops the batch', () => {
  assert.throws(() => subjectInputs(['one'], { registry, check: () => { throw new Error('inputs do not match the record'); } }), /do not match/);
});

test('a variant and a --set drawing ship the drawing they name', () => {
  const variants = { one: { old: { why: 'an earlier drawing', set: { drawing: 'vectors/one-old' } } } };
  const viaVariant = subjectInputs(['one:old'], { registry, check: s => s, exists: () => false, variants });
  assert.ok(viaVariant.files.includes(path.join(base, 'vectors/one-old-lines.json')) && viaVariant.files.includes(path.join(base, 'vectors/one-old-vectors.json')));
  const viaSet = subjectInputs(['two'], { registry, check: s => s, exists: () => false, sets: [['drawing', 'vectors/two-b']] });
  assert.ok(viaSet.files.includes(path.join(base, 'vectors/two-b-lines.json')) && !viaSet.files.includes(path.join(base, 'vectors/two-lines.json')));
  assert.throws(() => subjectInputs(['one:none'], { registry, variants }), /no variant "none"/);
});
