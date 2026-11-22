import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS, settingsList, readChoice, choiceKind, choiceKey, withChoice } from './choice.mjs';

const spec = { studies: [{ role: 'block-in (the broad shapes)', floorMm2: 6, read: {} }, { role: 'middle study (later washes)', floorMm2: 4, read: { clusters: 20 } }, { role: 'fine study (details and accents)', floorMm2: 2, read: {} }] };

test('the settings are listed with their present values and a meaning in plain words', () => {
  const l = settingsList(spec), by = Object.fromEntries(l.map(x => [x.set, x]));
  assert.equal(by.floors.now, '6,4,2'); assert.equal(by['study1.shapes'].now, 160); assert.equal(by['study2.clusters'].now, 20); assert.equal(by['study3.join'].now, 10);
  assert.equal(by['study2.shapes'], undefined, 'a setting of the first study is listed once'); assert.equal(by['study1.formbase'].now, 1);
  for (const x of l) assert.ok(x.meaning.length > 30, x.set);
  assert.ok(SETTINGS.every(s => s.meaning));
});

test('a choice is the code planner tuned, or a script; nothing changed is the code planner alone', () => {
  const none = readChoice({ kind: 'settings', settings: {} });
  assert.deepEqual(none.sets, []); assert.equal(choiceKind(none), 'nothing changed');
  const tuned = readChoice({ kind: 'settings', settings: { 'study1.shapes': 60, floors: '8,4,2' }, why: 'broader' });
  assert.deepEqual(tuned.sets, [['floors', '8,4,2'], ['study1.shapes', '60']]); assert.equal(choiceKind(tuned), 'settings'); assert.equal(tuned.why, 'broader');
  const own = readChoice({ kind: 'script', script: 'script.json' });
  assert.equal(own.script, 'script.json'); assert.equal(choiceKind(own), 'own script');
});

test('an edited plan names its file; it takes no settings and its text is part of its key', () => {
  const e = readChoice({ kind: 'plan', plan: 'my-plan.json', why: 'one wash for the face' });
  assert.equal(e.plan, 'my-plan.json'); assert.equal(e.script, null); assert.deepEqual(e.sets, []); assert.equal(choiceKind(e), 'edited plan');
  assert.notEqual(choiceKey(e, '{"a":1}'), choiceKey(e, '{"a":2}'));
  assert.throws(() => readChoice({ kind: 'plan', edits: [] }), /names its file in this folder, your edited copy of auto\/plan-to-edit.json/);
  assert.throws(() => readChoice({ kind: 'plan', plan: '../x.json' }), /names its file in this folder/);
  assert.throws(() => readChoice({ kind: 'plan', plan: 'p.json', settings: { floors: '1,1,1' } }), /takes no planner settings/);
});

test('locked settings, paths and odd values are refused with the reason', () => {
  for (const k of ['masks', 'drawing', 'width', 'sheetmm', 'targetguard', 'notargetlooks', 'valueplan', 'seed']) assert.throws(() => readChoice({ kind: 'settings', settings: { [k]: '1' } }), /is locked/, k);
  assert.throws(() => readChoice({ kind: 'settings', settings: { paints: '../x/y.json' } }), /a number or a plain word/);
  assert.throws(() => readChoice({ kind: 'settings', settings: { 'Bad Key': 1 } }), /not a setting name/);
  assert.throws(() => readChoice({ kind: 'script', script: '../other/script.json' }), /names its file in this folder/);
  assert.throws(() => readChoice({ kind: 'script', script: 's.json', settings: { floors: '1,1,1' } }), /takes no planner settings/);
  assert.throws(() => readChoice({ kind: 'both' }), /"settings" .*"plan" .* or "script"/); assert.throws(() => readChoice([]), /one JSON object/);
});

test('the same choice has the same key, and a choice is laid over the run\'s own settings', () => {
  const a = readChoice({ kind: 'settings', settings: { floors: '8,4,2', 'study1.shapes': 60 } }), b = readChoice({ kind: 'settings', settings: { 'study1.shapes': '60', floors: '8,4,2' }, why: 'other words' });
  assert.equal(choiceKey(a), choiceKey(b)); assert.notEqual(choiceKey(a), choiceKey(readChoice({ kind: 'settings', settings: {} })));
  const s = readChoice({ kind: 'script', script: 's.json' }); assert.notEqual(choiceKey(s, '{"a":1}'), choiceKey(s, '{"a":2}'));
  assert.deepEqual(withChoice([['threads', '2'], ['floors', '6,4,2']], a), [['threads', '2'], ['floors', '8,4,2'], ['study1.shapes', '60']]);
  assert.deepEqual(withChoice([['threads', '2']], readChoice({ kind: 'settings', settings: {} })), [['threads', '2']], 'nothing changed: the run is the code planner\'s');
});
