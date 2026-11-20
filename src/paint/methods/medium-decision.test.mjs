// The drawing medium is decided from what declares it, not from a per-subject table.
// Subject names appear here only as test expectations (Sam's statements); nothing in the painter reads them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideMedium, planDeclaration, inkRequestedBy, INK_STYLES } from './medium-decision.mjs';

const inkStyle = style => ({ styleSelection: { style, reason: 'r', regions: {} } });
const PEN_FIRST = 0.5;

// Measured pen share (per cent, 1200 px read) of each verify target, with the flags its batch passes and the plan's
// declarations. `sam` is what Sam said; `expect` is what the rule must give. `disagree` lists where the two differ.
const SUBJECTS = {
  h36: { share: 0.801, argv: ['--inkrecipe', 'wash'], plan: null, sam: 'pen', expect: 'pen' },
  h34: { share: 0.545, argv: ['--inkrecipe', 'wash'], plan: null, sam: 'pen', expect: 'pen' },
  cma: { share: 0.234, argv: ['--outlinemedium', 'ink'], plan: { drawing: { medium: 'ink' }, ...inkStyle('ink-and-wash') }, sam: 'pen', expect: 'pen' },
  hills: { share: 0.378, argv: ['--outlinemedium', 'ink'], plan: inkStyle('ink-and-wash'), sam: 'pen', expect: 'pen' },
  'south-france': { share: 0.333, argv: ['--outlinemedium', 'ink'], plan: inkStyle('urban-sketch'), sam: 'pen', expect: 'pen' },
  mittens: { share: 0.318, argv: ['--outlinemedium', 'graphite'], plan: { drawing: { medium: 'graphite' } }, sam: 'pencil', expect: 'pencil' },
  'dog-paint': { share: 0.234, argv: ['--outlinemedium', 'graphite'], plan: inkStyle('precise-watercolor'), sam: 'none', expect: 'pencil' },
  sargent: { share: 0.136, argv: ['--outlinemedium', 'graphite'], plan: inkStyle('precise-watercolor'), sam: 'none', expect: 'pencil' },
  overlook: { share: 0.141, argv: ['--outlinemedium', 'graphite'], plan: null, sam: 'none', expect: 'pencil' },
  homer: { share: 0.341, argv: ['--outlinemedium', 'graphite'], plan: { drawing: { medium: 'graphite' } }, sam: 'none', expect: 'pencil' },
  // Where the rule and Sam differ. Trumbull's plan names no ink style for any region, so nothing declares ink. dog-ink's
  // plan declares ink and the source reads as pen (0.854), so the pixel evidence cannot tell that Sam saw no ink.
  trumbull: { share: 0.441, argv: ['--outlinemedium', 'graphite'], plan: { styleSelection: { style: 'precise-watercolor', reason: 'r', regions: {} } }, sam: 'pen', expect: 'pencil', disagree: true },
  'dog-ink': { share: 0.854, argv: ['--outlinemedium', 'ink', '--washinkfree', '1'], plan: { drawing: { medium: 'ink' }, ...inkStyle('ink-and-wash') }, sam: 'pencil', expect: 'pen', disagree: true },
};

for (const [name, s] of Object.entries(SUBJECTS)) {
  test(`${name}: medium ${s.expect} from what declares it`, () => {
    const d = decideMedium({ argv: s.argv, plan: s.plan, penSharePct: s.share, penFirstPct: PEN_FIRST });
    assert.equal(d.medium, s.expect, JSON.stringify(d));
    assert.equal(Boolean(s.disagree), (s.sam === 'pen') !== (s.expect === 'pen'), 'the disagreement list matches Sam');
  });
}

test('the rule agrees with Sam on every subject except the two listed', () => {
  const off = Object.entries(SUBJECTS).filter(([, s]) => (decideMedium({ argv: s.argv, plan: s.plan, penSharePct: s.share, penFirstPct: PEN_FIRST }).medium === 'pen') !== (s.sam === 'pen')).map(([k]) => k);
  assert.deepEqual(off.sort(), ['dog-ink', 'trumbull']);
});

test('a plan that declares graphite or none wins over ink flags and over a high pen share', () => {
  for (const medium of ['graphite', 'none']) {
    const d = decideMedium({ argv: ['--outlinemedium', 'ink', '--washinkfree', '1'], plan: { drawing: { medium } }, penSharePct: 0.9, penFirstPct: PEN_FIRST });
    assert.equal(d.medium, 'pencil');
    assert.equal(d.basis, 'plan');
    assert.equal(d.vetoed, true);
  }
});

test('a plan that declares ink wins over a low pen share', () => {
  const d = decideMedium({ argv: ['--outlinemedium', 'ink'], plan: { drawing: { medium: 'ink' } }, penSharePct: 0.05, penFirstPct: PEN_FIRST });
  assert.deepEqual([d.medium, d.basis, d.vetoed], ['pen', 'plan', false]);
});

test('with no declaration an ink flag needs the source to show pen line; below the bar it is vetoed', () => {
  const low = decideMedium({ argv: ['--inkrecipe', 'wash', '--washinkfree', '1'], plan: null, penSharePct: 0.3, penFirstPct: PEN_FIRST });
  assert.deepEqual([low.medium, low.basis, low.vetoed], ['pencil', 'source', true]);
  const high = decideMedium({ argv: ['--inkrecipe', 'wash'], plan: null, penSharePct: 0.5, penFirstPct: PEN_FIRST });
  assert.deepEqual([high.medium, high.basis, high.vetoed], ['pen', 'source', false]);
});

test('the pen share never switches ink on', () => {
  const d = decideMedium({ argv: [], plan: null, penSharePct: 9, penFirstPct: PEN_FIRST });
  assert.equal(d.medium, 'pencil');
  assert.equal(d.basis, 'default');
  assert.equal(d.addArgs.length, 0);
  assert.equal(d.vetoed, false);
});

test('a plan style of ink-and-wash or urban-sketch, global or on one region, declares ink and asks for it', () => {
  assert.deepEqual(INK_STYLES, ['ink-and-wash', 'urban-sketch']);
  const region = { styleSelection: { style: 'precise-watercolor', reason: 'r', regions: { wall: { style: 'ink-and-wash', reason: 'r' } } } };
  for (const plan of [inkStyle('ink-and-wash'), inkStyle('urban-sketch'), region]) {
    assert.equal(planDeclaration(plan).medium, 'ink');
    const d = decideMedium({ argv: [], plan, penSharePct: 0.01, penFirstPct: PEN_FIRST });
    assert.equal(d.medium, 'pen');
    assert.deepEqual(d.addArgs, ['--outlinemedium', 'ink']);
  }
  assert.equal(planDeclaration(inkStyle('precise-watercolor')).medium, null);
  assert.equal(planDeclaration({ styleSelection: { style: 'precise-watercolor', reason: 'ink only restores structure ink-and-wash', regions: {} } }).medium, null, 'free text is not read');
});

test('a plan drawing medium outranks its style, and an explicit outline medium is never overwritten', () => {
  assert.equal(planDeclaration({ drawing: { medium: 'graphite' }, ...inkStyle('ink-and-wash') }).medium, 'graphite');
  assert.equal(planDeclaration({ drawing: { medium: 'auto' }, ...inkStyle('ink-and-wash') }).medium, 'ink');
  const d = decideMedium({ argv: ['--outlinemedium', 'ink'], plan: inkStyle('ink-and-wash'), penSharePct: 0.01, penFirstPct: PEN_FIRST });
  assert.deepEqual(d.addArgs, []);
});

test('--subjectmedium given on the command line is an explicit override and says so', () => {
  const d = decideMedium({ argv: ['--subjectmedium', 'pencil', '--outlinemedium', 'ink'], plan: { drawing: { medium: 'ink' } }, penSharePct: 0.9, penFirstPct: PEN_FIRST });
  assert.deepEqual([d.medium, d.basis], ['pencil', 'flag']);
});

test('the decision lists its evidence for the run card', () => {
  const d = decideMedium({ argv: ['--inkrecipe', 'wash'], plan: null, penSharePct: 0.3, penFirstPct: PEN_FIRST });
  assert.deepEqual(Object.keys(d.evidence).sort(), ['inkRequestedBy', 'penFirstPct', 'penSharePct', 'planDeclared', 'planStyles', 'preparedDrawing']);
  assert.deepEqual(d.evidence.inkRequestedBy, ['--inkrecipe wash']);
  assert.equal(d.evidence.penSharePct, 0.3);
  assert.match(d.note, /pen share 0\.30% is under 0\.5%/);
});

test('which flags ask for ink', () => {
  assert.deepEqual(inkRequestedBy(['--outlinemedium', 'auto']), ['--outlinemedium auto']);
  assert.deepEqual(inkRequestedBy(['--stages', 'prep,finishink']), ['--stages finishink']);
  assert.deepEqual(inkRequestedBy(['--drawinglast', 'x']), [], 'a closing file is graphite unless the outline medium says ink');
  assert.deepEqual(inkRequestedBy(['--outlinemedium', 'graphite', '--drawing', 'first']), []);
  assert.deepEqual(inkRequestedBy(['--outlinemedium', 'none']), []);
});

test('a missing pen share with an ink request and no declaration fails loudly', () => {
  assert.throws(() => decideMedium({ argv: ['--inkrecipe', 'wash'], plan: null, penSharePct: null, penFirstPct: PEN_FIRST }), /pen share/);
});

test('a prepared drawing declares the medium: the pen share is not consulted, and a plan or flag naming another medium stops', () => {
  const argv = ['--inkrecipe', 'wash', '--drawingfile', 'x'];
  const ink = decideMedium({ argv, plan: null, penSharePct: 0.11, penFirstPct: 0.5, drawing: { file: 'x-lines.json', medium: 'ink', from: 'the drawing file' } });
  assert.equal(ink.medium, 'pen'); assert.equal(ink.basis, 'drawing'); assert.equal(ink.vetoed, false); assert.match(ink.note, /pen share is not consulted/);
  const pencil = decideMedium({ argv: ['--drawingfile', 'x'], plan: null, penFirstPct: 0.5, drawing: { file: 'x-lines.json', medium: 'graphite', from: '--outlinemedium' } });
  assert.equal(pencil.medium, 'pencil'); assert.equal(pencil.subjectMedium, 'pencil');
  assert.throws(() => decideMedium({ argv, plan: { drawing: { medium: 'graphite' } }, penFirstPct: 0.5, drawing: { file: 'x-lines.json', medium: 'ink', from: 'the drawing file' } }), /plan declares graphite/);
  assert.throws(() => decideMedium({ argv: [...argv, '--subjectmedium', 'pencil'], plan: null, penFirstPct: 0.5, drawing: { file: 'x-lines.json', medium: 'ink', from: 'the drawing file' } }), /--subjectmedium is pencil/);
  assert.throws(() => decideMedium({ argv, plan: null, penFirstPct: 0.5, drawing: { file: 'x-lines.json', medium: null, from: 'nothing' } }), /declares no medium/);
});

test('without a prepared drawing the pen-share decision stands and says which medium and why', () => {
  const low = decideMedium({ argv: ['--inkrecipe', 'wash'], plan: null, penSharePct: 0.2, penFirstPct: 0.5 });
  assert.equal(low.medium, 'pencil'); assert.match(low.note, /^medium pencil: .*pen share 0\.20% is under 0\.5%/);
  const high = decideMedium({ argv: ['--inkrecipe', 'wash'], plan: null, penSharePct: 0.8, penFirstPct: 0.5 });
  assert.equal(high.medium, 'pen'); assert.match(high.note, /^medium pen: .*at least 0\.5%/);
});
