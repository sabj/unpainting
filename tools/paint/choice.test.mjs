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

test('beside its kind a choice may name its lines, its forms and settings for single forms', () => {
  const c = readChoice({ kind: 'settings', settings: {}, lines: 'my-lines.json', forms: 'my-forms.json', perForm: { 'cat face': { 'study1.clusters': 24, 'study1.brush': 10, 'study3.lay': 1 }, 'left eye': { 'study3.floor': 0.5 } } });
  assert.equal(c.tools.lines, 'my-lines.json'); assert.equal(c.tools.forms, 'my-forms.json');
  assert.deepEqual(c.tools.perForm, [['cat face', [[1, 'clusters', 24], [1, 'formbrush', 10], [3, 'lay', 1]]], ['left eye', [[3, 'floor', 0.5]]]]);
  assert.equal(choiceKind(c), 'the code planner with its choice of lines, its own forms, settings per form'); assert.notEqual(choiceKey(c), choiceKey(readChoice({ kind: 'settings', settings: {} })));
  assert.equal(readChoice({ kind: 'settings', settings: {} }).tools, undefined, 'no tools: the choice is as it was');
  assert.equal(choiceKind(readChoice({ kind: 'script', script: 's.json', lines: 'l.json' })), 'own script with its choice of lines'); assert.equal(choiceKind(readChoice({ kind: 'plan', plan: 'p.json', lines: 'l.json' })), 'edited plan with its choice of lines');
  // the text of its lines is part of its key once the session has read it
  const a = readChoice({ kind: 'settings', settings: {}, lines: 'l.json' }), b = readChoice({ kind: 'settings', settings: {}, lines: 'l.json' }); a.tools.linesEdit = { rules: [1] }; b.tools.linesEdit = { rules: [2] }; assert.notEqual(choiceKey(a), choiceKey(b));
  assert.throws(() => readChoice({ kind: 'script', script: 's.json', forms: 'f.json' }), /go with kind "settings"; a script is laid as written/);
  assert.throws(() => readChoice({ kind: 'plan', plan: 'p.json', perForm: { face: { 'study1.clusters': 8 } } }), /an edited plan is an edit of the plan made from the forms as given/);
  assert.throws(() => readChoice({ kind: 'settings', lines: '../l.json' }), /"lines" names its file in this folder/);
  assert.throws(() => readChoice({ kind: 'settings', perForm: { face: { 'study2.clusters': 8 } } }), /"study2.clusters" is not a setting of a form/); assert.throws(() => readChoice({ kind: 'settings', perForm: { face: { 'study1.lay': 0 } } }), /not a setting of a form/);
  assert.match(readChoice({ kind: 'settings', perForm: { face: { 'study1.clusters': 900 } } }).warnings[0], /"study1\.clusters" is 900, outside the usual 2 to 64; it is given to the planner as you wrote it/); assert.throws(() => readChoice({ kind: 'settings', perForm: { face: { 'study1.clusters': 'many' } } }), /is a number \(usually 2 to 64\)/); assert.throws(() => readChoice({ kind: 'settings', perForm: { face: {} } }), /an object of setting: number/);
  // when the drawing is laid is the author's to set; the drawing file itself, the sheet, the guard and the seed stay locked
  for (const k of ['drawingorder', 'drawinglast', 'drawinglastmin', 'drawinglastlogic']) assert.deepEqual(readChoice({ kind: 'settings', settings: { [k]: 'last' } }).sets, [[k, 'last']], k);
  for (const k of ['drawing', 'seed', 'targetguard', 'masks']) assert.throws(() => readChoice({ kind: 'settings', settings: { [k]: 'x' } }), /is locked/, k);
  const l = settingsList(spec), by = Object.fromEntries(l.map(x => [x.set, x]));
  assert.equal(by['study3.lay'].now, 1); assert.equal(by['study2.largest'].now, 15); assert.equal(by['study3.lightest'].now, 40); assert.equal(by['study1.lay'], undefined, 'a later study\'s setting is not listed for the block-in');
});

test('the medium of the drawing is chosen with any kind of choice: pencil, pen or none', () => {
  for (const [given, what] of [[{ kind: 'script', script: 's.json', medium: 'pen' }, 'own script with the drawing in pen'], [{ kind: 'plan', plan: 'p.json', medium: 'none' }, 'edited plan with the drawing left out'], [{ kind: 'settings', medium: 'pencil' }, 'the code planner with the drawing in pencil']]) {
    const c = readChoice(given); assert.equal(c.tools.medium, given.medium); assert.equal(choiceKind(c), what); assert.deepEqual(c.warnings, []);
  }
  assert.throws(() => readChoice({ kind: 'settings', medium: 'charcoal' }), /"medium" is the drawing's medium, one of pencil, pen, none/);
  assert.notEqual(choiceKey(readChoice({ kind: 'settings', medium: 'pen' })), choiceKey(readChoice({ kind: 'settings', medium: 'pencil' })), 'another medium is another choice');
  assert.equal(readChoice({ kind: 'settings', settings: {} }).tools, undefined);
});

test('at every level a choice is the model\'s own script with its lines and medium; settings and the code\'s plan are refused', () => {
  const own = readChoice({ kind: 'script', script: 'script.json', lines: 'my-lines.json', medium: 'pen', why: 'mine' }, { codePlan: false });
  assert.equal(own.kind, 'script'); assert.equal(choiceKind(own), 'own script with its choice of lines, the drawing in pen');
  for (const bad of [{ kind: 'settings', settings: {} }, { kind: 'settings', settings: { floors: '8,4,2' } }, { kind: 'plan', plan: 'my-plan.json' }, {}, { kind: 'script', script: 'script.json', forms: 'f.json' }, { kind: 'script', script: 'script.json', perForm: { face: { 'study1.clusters': 4 } } }, { kind: 'script', script: 'script.json', plan: 'p.json' }]) {
    assert.throws(() => readChoice(bad, { codePlan: false }), /^Error: choice\.json: the code's plan, its planner and its settings are handed over at no level: every level hands in its own script\. Here your choice is your own painting script/, JSON.stringify(bad));
  }
  assert.throws(() => readChoice([], { codePlan: false }), /one JSON object, \{"kind": "script"/);
  assert.equal(readChoice({ kind: 'settings', settings: {} }).kind, 'settings', 'the preflight and kept choices still read every kind');
});

test('the pen\'s ink is a choice a model sets beside its own script, at every level', () => {
  const c = readChoice({ kind: 'script', script: 'script.json', medium: 'pen', ink: 'soluble' }, { codePlan: false });
  assert.equal(c.tools.ink, 'soluble'); assert.equal(choiceKind(c), 'own script with the drawing in pen, soluble ink');
  assert.equal(readChoice({ kind: 'script', script: 'script.json', ink: 'waterproof' }, { codePlan: false }).tools.ink, 'waterproof');
  assert.throws(() => readChoice({ kind: 'script', script: 'script.json', ink: 'india' }, { codePlan: false }), /"ink" is the pen's ink, waterproof or soluble/);
  assert.notEqual(choiceKey(readChoice({ kind: 'script', script: 's.json', ink: 'soluble' })), choiceKey(readChoice({ kind: 'script', script: 's.json' })), 'another ink is another choice');
});
