import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BRUSH_PRESETS, studioShortcut, createChargeMeter, engineLabel } from '../../demos/lab/ui/studio.js';

const key = (key, code = '', extra = {}) => studioShortcut({ key, code, target: { closest: () => null }, ...extra });
test('studio shortcuts preserve tools and distinguish shifted physical digit keys', () => {
  for (const [letter, tool] of Object.entries({ r: 'round', f: 'flat', w: 'water', i: 'pen', p: 'pencil', d: 'dryer' })) assert.deepEqual(key(letter), { tool });
  for (let i = 1; i <= 9; i++) assert.deepEqual(key(String(i), `Digit${i}`), { pigment: i - 1 });
  for (const [index, preset] of Object.keys(BRUSH_PRESETS).entries()) assert.deepEqual(key('!@#$'[index], `Digit${index + 1}`, { shiftKey: true }), { preset });
  for (const [letter, action] of Object.entries({ x: 'redip', h: 'focus-view', 0: 'reset-view' })) assert.deepEqual(key(letter), { action });
  assert.deepEqual(key('R', 'KeyR', { shiftKey: true }), { tool: 'round' });
  assert.equal(key('%', 'Digit5', { shiftKey: true }), null);
  assert.deepEqual(key('D', 'KeyD', { shiftKey: true }), { action: 'dry-layer' });
  assert.deepEqual(key('['), { resize: -.5 }); assert.deepEqual(key(']'), { resize: .5 });
  for (const extra of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { target: { closest: () => ({}) } }]) assert.equal(key('h', 'KeyH', extra), null);
  assert.deepEqual(key('!', 'Digit1'), { pigment: 0 }); // Physical digits work across keyboard layouts.
});

test('presets keep the requested independent water, pigment and pressure settings', () => {
  assert.deepEqual(Object.values(BRUSH_PRESETS).map(({ water, amount, pressure }) => [water, amount, pressure]), [[2.4, .45, .7], [1.6, .25, .75], [.35, .75, .55], [.9, .85, .85]]);
  assert.equal(BRUSH_PRESETS.detail.sizeMm, 3);
  assert.ok(BRUSH_PRESETS.wash.sizeMm > BRUSH_PRESETS.glaze.sizeMm);
});

test('charge shows independent depletion and resets for a new dip without guessing capacity', () => {
  const meter = createChargeMeter(); assert.equal(meter.update(null).water, 0);
  assert.equal(meter.update({ water: 12, pigment: 4 }).water, 1);
  const half = meter.update({ water: 6, pigment: 1 }); assert.equal(half.water, .5); assert.equal(half.pigment, .25);
  assert.match(half.text, /Water 6.0 · paint 1.0/);
  meter.reset(); assert.equal(meter.update({ water: 6, pigment: 1 }).pigment, 1);
  assert.equal(meter.update({ water: 0, pigment: 0 }).water, 0);
});

test('engine pill uses the actual backend, cell size and measured latency only', () => {
  assert.equal(engineLabel('webgpu', 203.2, 15.7), 'WebGPU · 0.125 mm · 16 ms');
  assert.equal(engineLabel('cpu', 60), 'CPU · 0.423 mm');
  assert.equal(engineLabel('pending', 60), 'Starting engine…');
});

test('studio additions keep every existing page ID unique and imports resolvable', () => {
  const html = fs.readFileSync(new URL('../../demos/lab/index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['welcome','canvas','sheet','state','run-settings','mode-note','current-materials','redip','load-state','auto-redip','painting-controls','focus-view','exit-focus','focus-dock','brush-presets','engine-pill']) assert.ok(ids.includes(id), id);
  const lab = fs.readFileSync(new URL('../../demos/lab/lab.js', import.meta.url), 'utf8');
  for (const [, file] of lab.matchAll(/from ['"](.+?)['"]/g)) assert.ok(fs.existsSync(new URL(`../../demos/lab/${file}`, import.meta.url)), file);
  for (const preset of Object.keys(BRUSH_PRESETS)) assert.ok(html.includes(`data-preset="${preset}"`));
  assert.deepEqual([...html.matchAll(/data-model="([^"]+)"[^>]*>([^<]+)</g)].map(m => [m[1], m[2]]),
    [['row', 'Row'], ['tuft', 'Tuft'], ['section', 'Section']]);
});
