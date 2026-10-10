import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingFlags, strongestShare, planLines, regionRanked } from './drawing-plan.mjs';

const pairs = argv => Object.fromEntries(argv.flatMap((a, i) => (i % 2 ? [] : [[a, argv[i + 1]]])));

test('no drawing section, or auto fields, adds no flags', () => {
  assert.deepEqual(drawingFlags(null), []);
  assert.deepEqual(drawingFlags({}), []);
  assert.deepEqual(drawingFlags({ medium: 'auto', inkColor: 'auto', amount: 'auto', lines: 'auto', weight: 'auto', closingLines: 'auto' }), []);
});

test('medium none turns the pen off', () => {
  assert.deepEqual(drawingFlags({ medium: 'none', weight: 1 }), ['--drawing', 'none']);
});

test('the heaviest plan reproduces the old forced ink flags', () => {
  const f = pairs(drawingFlags({ medium: 'ink', inkColor: 'sepia', amount: 1, lines: 'all', weight: 1, closingLines: 1 }));
  assert.deepEqual(f, {
    '--outlinemedium': 'ink', '--inkprofile': 'sepia-ink', '--openinglines': '100000', '--closinglines': '100000',
    '--drawshare': '1', '--inkkscale': '8', '--drawwidthgain': '2', '--drawwant': '1', '--closingpressure': '1', '--closingedgemin': '0',
  });
});

test('weight 0 and closingLines 0.5 give the painter defaults', () => {
  const f = pairs(drawingFlags({ weight: 0, closingLines: 0.5 }));
  assert.equal(f['--inkkscale'], '1');
  assert.equal(f['--drawwidthgain'], '1.39');
  assert.equal(f['--closingedgemin'], '0.22');
});

test('closingLines 0 draws only the opening pen; lines pick roles', () => {
  assert.equal(pairs(drawingFlags({ closingLines: 0 }))['--drawing'], 'first');
  assert.equal(pairs(drawingFlags({ lines: 'contours' }))['--drawingskip'], 'dark fill');
  assert.equal(pairs(drawingFlags({ lines: 'subject' }))['--drawingskip'], 'setting');
  assert.deepEqual(drawingFlags({ lines: 'all' }), []);
});

test('bad values are refused', () => {
  assert.throws(() => drawingFlags({ medium: 'charcoal' }), /drawing.medium/);
  assert.throws(() => drawingFlags({ amount: 2 }), /drawing.amount/);
  assert.throws(() => drawingFlags({ inkColor: 'red' }), /drawing.inkColor/);
});

test('strongestShare keeps the strongest lines in their own order, a short fragment below a long line', () => {
  const g = [{ id: 'a', strength: 0.2, length: 10 }, { id: 'b', strength: 0.9, length: 10 }, { id: 'c', strength: 0.5, length: 10 }, { id: 'd', strength: 0.9, length: 1 }];
  assert.deepEqual(strongestShare(g, 0.5).map(x => x.id), ['b', 'c']);
  assert.equal(strongestShare(g, 1), g);
  assert.deepEqual(strongestShare(g, 0), []);
});

test('lines "regions" ranks subject first and maxLines caps the count', () => {
  const f = pairs(drawingFlags({ lines: 'regions', maxLines: 3 }));
  assert.equal(f['--drawregions'], '1');
  assert.equal(f['--drawmax'], '3');
  assert.equal(f['--openinglines'], '100000');
  assert.throws(() => drawingFlags({ maxLines: 2.5 }), /drawing.maxLines/);
  const line = (region, strength, length = 10) => ({ region, strength, length, points: [[0, 0], [length, 0]] });
  const lines = [line('background', 9), line('clothing', 2), line('head', 1), line('dark wash', 50), line('hands', 3), line('chair', 5)];
  const num = flags => (name, fallback) => Number(flags[name] ?? fallback);
  // head, hands and book before clothing before setting, strongest first within a tier; the dark wash last
  assert.deepEqual(planLines(lines, num({ drawregions: 1, drawmax: 3 })).map(g => g.region), ['clothing', 'head', 'hands']);
  assert.deepEqual(planLines(lines, num({ drawregions: 1, drawmax: 5 })).map(g => g.region), ['background', 'clothing', 'head', 'hands', 'chair']);
  assert.deepEqual(regionRanked(lines, { skip: 4 }).length, 5);
  // without regions, the cap keeps the strongest
  assert.deepEqual(planLines(lines, num({ drawmax: 2 })).map(g => g.region), ['background', 'dark wash']);
  // no flags: every line
  assert.equal(planLines(lines, num({})).length, lines.length);
});
