import test from 'node:test';
import assert from 'node:assert/strict';
import { ignoredSettings, badNumbers, isSwitchWord, GATES, INERT } from './option-check.mjs';

const valueOf = flags => name => flags[name];

test('a gated setting typed while its switch is off or absent is reported with the switch it needs', () => {
  const none = ignoredSettings({ given: ['skylanemm'], value: valueOf({ skylanemm: '4' }) });
  assert.deepEqual(none.map(r => r.flag), ['skylanemm']);
  assert.match(none[0].reason, /--skylanes/);
  const off = ignoredSettings({ given: ['skylanemm'], value: valueOf({ skylanemm: '4', skylanes: '0' }) });
  assert.deepEqual(off.map(r => r.flag), ['skylanemm']);
  const junk = ignoredSettings({ given: ['skylanestep'], value: valueOf({ skylanestep: '.8', skylanes: 'yes' }) });
  assert.deepEqual(junk.map(r => r.flag), ['skylanestep']);
});

test('a gated setting is fine while its switch is on, wherever the switch came from', () => {
  assert.deepEqual(ignoredSettings({ given: ['skylanemm', 'skylanestep'], value: valueOf({ skylanemm: '4', skylanestep: '.8', skylanes: '1' }) }), []);
});

test('only typed settings are reported, so a recipe default never fails a run', () => {
  assert.deepEqual(ignoredSettings({ given: [], value: valueOf({ skylanemm: '4' }) }), []);
});

test('settings no switch can make act are reported whatever else is on', () => {
  for (const flag of ['texvariety', 'texflow', 'texshort', 'texpress']) {
    const r = ignoredSettings({ given: [flag], value: valueOf({ [flag]: '1', layertexture: '1' }) });
    assert.deepEqual(r.map(x => x.flag), [flag], flag);
    assert.match(r[0].reason, /texture/);
  }
});

test('every gate names a switch that is not itself gated or inert', () => {
  for (const [flag, parent] of Object.entries(GATES)) {
    assert.ok(!(parent in GATES) && !(parent in INERT), `${flag} needs ${parent}`);
    assert.ok(!(flag in INERT), flag);
  }
});

test('a number option given a word is reported unless the painter also reads it as text', () => {
  assert.deepEqual(badNumbers(new Map([['recesses', 'yes'], ['rescue', 'marks']]), new Set(['rescue'])), [{ flag: 'recesses', value: 'yes' }]);
  assert.deepEqual(badNumbers(new Map(), new Set()), []);
});

test('a 0/1 switch given a word such as false or off is reported, since the painter reads only 0 and 1', () => {
  for (const word of ['false', 'off', 'No', 'true', 'on', 'YES']) assert.equal(isSwitchWord('1', word), true, word);
  assert.equal(isSwitchWord('0', 'off'), true);
  assert.equal(isSwitchWord('1', '0'), false);
  assert.equal(isSwitchWord('1', 'frisket'), false);
  // an option whose default is a word may take words
  assert.equal(isSwitchWord('auto', 'off'), false);
  assert.equal(isSwitchWord(undefined, 'off'), false);
});
