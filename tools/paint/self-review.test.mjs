import test from 'node:test';
import assert from 'node:assert/strict';
import { readSelfReview, returnPrompt, LEAST_MINUTES_LEFT } from './self-review.mjs';

const five = n => Array.from({ length: n }, (_, i) => `${i + 1}. (${100 + i}, 200 mm) the ear is paler than the subject's; a second glaze of sienna`).join('\n');
test('a self-review lets a session end only when it is of the last look, lists five placed differences and says no major fault remains', () => {
  assert.equal(readSelfReview(null, 3).why, 'there is no self-review.md');
  assert.match(readSelfReview(`# Self-review of look 2\n${five(5)}\nMajor faults remaining: none`, 3).why, /reviews look 2, and your last look is look 3/);
  assert.match(readSelfReview(`# Self-review of look 3\n${five(3)}\nMajor faults remaining: none`, 3).why, /lists 3 differences/);
  assert.match(readSelfReview(`# Self-review of look 3\n${five(5)}`, 3).why, /last line must say/);
  const open = readSelfReview(`# Self-review of look 3\n${five(5)}\nMajor faults remaining: 2`, 3);
  assert.equal(open.ok, false); assert.equal(open.major, 2); assert.match(open.why, /2 major faults remain/);
  assert.deepEqual(readSelfReview(`# Self-review of look 3\n${five(5)}\n\nMajor faults remaining: none\n`, 3), { look: 3, items: 5, major: 'none', ok: true, why: null });
  assert.match(readSelfReview(`# Self-review of look 1\n${five(5)}\nMajor faults remaining: none`, 0).why, /no look has been taken/);
});
test('a session is sent back while a major fault and time remain, a few times at most; never shown a score', () => {
  const open = readSelfReview(null, 2);
  assert.match(returnPrompt(open, { minutesLeft: 60, turn: 1 }), /about 60 of your minutes left[\s\S]*self-review\.md[\s\S]*Major faults remaining: none/);
  assert.ok(!/score of|scored/i.test(returnPrompt(open, { minutesLeft: 60, turn: 1 }).replace('No score is shown', '')));
  assert.equal(returnPrompt(open, { minutesLeft: LEAST_MINUTES_LEFT - 1, turn: 1 }), null, 'out of time: it ends');
  assert.equal(returnPrompt(open, { minutesLeft: 60, turn: 4 }), null, 'sent back three times at most');
  assert.equal(returnPrompt({ ok: true }, { minutesLeft: 60, turn: 1 }), null);
});
