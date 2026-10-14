import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, deposit, step, DEFAULTS } from '../../src/media/sheet.mjs';
import { measurePaper } from '../../src/paint/methods/wetdry.mjs';
import { resetChecks, setStrict, continuedSummary } from '../../src/media/checks.mjs';
import { layIntoWetBed } from './wet-bed-wait.mjs';

const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
// a fresh glossy wash on a tiny sheet, and a footprint that runs past it onto dry paper
const glossyWash = () => {
  const w = 24, sheet = createSheet(makePaper(w, w, { seed: 9 }), pigments), wash = [], wide = [];
  for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) { deposit(sheet, y * w + x, .8, [.05]); wash.push(y * w + x); }
  for (let y = 4; y < 20; y++) for (let x = 0; x < w; x++) wide.push(y * w + x);
  step(sheet);
  return { sheet, wash, wide };
};
const quiet = fn => { const log = console.log, lines = []; console.log = (...a) => lines.push(a.join(' ')); try { return [fn(), lines]; } finally { console.log = log; } };
const lay = (sheet, cells) => layIntoWetBed({ paper: measurePaper(sheet, cells), observe: () => measurePaper(sheet, cells), step: o => step(sheet, o), O: DEFAULTS, info: { id: 'test' } });

test('a wet-on-wet stroke into a fresh glossy wash waits for the shine to go off, then is laid', () => {
  resetChecks();
  const { sheet, wash } = glossyWash();
  assert.ok(measurePaper(sheet, wash).waterMax > .15, 'the wash starts glossy');
  const [{ paper, wetWaits }] = quiet(() => lay(sheet, wash));
  assert.ok(wetWaits > 0, 'it waited');
  assert.ok(paper.waterMax <= .15 || paper.moistShare < .7, 'it stopped waiting at the shine or the damp limit');
  resetChecks();
});

test('a footprint that is never evenly wet is laid, logged and counted, not thrown', () => {
  resetChecks();
  const { sheet, wide } = glossyWash();
  const [{ wetWaits }, lines] = quiet(() => lay(sheet, wide));
  assert.equal(wetWaits, 0, 'too little of it is damp to wait for');
  assert.match(lines.join('\n'), /continued past wet wash laid on uneven paper .*"id":"test"/);
  assert.equal(continuedSummary().checks['wet wash laid on uneven paper'].count, 1);
  resetChecks();
});

test('--strict 1 restores the wet-wash stop', () => {
  resetChecks(); setStrict(true);
  try { const { sheet, wide } = glossyWash(); assert.throws(() => lay(sheet, wide), /wet wash laid on uneven paper/); }
  finally { resetChecks(); }
});
