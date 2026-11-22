// A kept session's choice is painted whole or refused (kept-session.mjs): no silent fallback to the standard drawing
// or to the automatic plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { neededOfSession, checkSessionFolder, sessionOfFile, linesOfKept } from './kept-session.mjs';

/** A kept session folder as a run leaves it: run.json, author/S.commands.txt, the model's folder, the kept copy of its choice. */
function session({ kind = 'script', lines = 'my-lines.json', reusedFrom = null } = {}) {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-session-')), put = (f, v) => { fs.mkdirSync(path.dirname(path.join(run, f)), { recursive: true }); fs.writeFileSync(path.join(run, f), typeof v === 'string' ? v : JSON.stringify(v, null, 1)); };
  const submitted = { kind, what: `${kind === 'script' ? 'own script' : 'edited plan'}${lines ? ' with its choice of lines' : ''}`, script: kind === 'script' ? 'script.json' : null, plan: kind === 'plan' ? 'my-plan.json' : null, tools: lines ? { lines, forms: null, perForm: null } : null };
  put('run.json', { author: { key: 'opus', session: { submitted, ...(reusedFrom ? { reusedFrom } : {}) } } });
  put('author/S.commands.txt', 'ls\n');
  if (kind === 'script') { put('author/folder/script.json', { format: 'painting-script 2', passages: [{ id: 'p1' }] }); put('author/script.json', { format: 'painting-script 2', passages: [{ id: 'p1' }] }); put('author/folder/script-look3.json', { format: 'painting-script 2', passages: [{ id: 'early' }] }); }
  else { put('author/folder/my-plan.json', { format: 'plan-edit 1', washes: [1] }); put('author/plan-edit.json', { format: 'plan-edit 1', washes: [1] }); put('author/plans/auto/plan-to-edit.json', { washes: [] }); }
  if (lines) put(`author/folder/${lines}`, { rules: [{ where: { tagged: 'drop' }, do: 'drop' }] });
  return run;
}

test('--from: a session folder is painted only when it holds every file its choice names; the missing files are named', () => {
  const run = session(), sub = JSON.parse(fs.readFileSync(path.join(run, 'run.json'), 'utf8')).author.session.submitted;
  assert.deepEqual(neededOfSession(sub), ['author/S.commands.txt', 'author/folder/script.json', 'author/folder/my-lines.json']);
  assert.doesNotThrow(() => checkSessionFolder(run, sub));
  // the slimmed copy of 22 Nov: run.json, the script, the lines, and no record of the session's commands
  fs.rmSync(path.join(run, 'author', 'S.commands.txt'));
  assert.throws(() => checkSessionFolder(run, sub), /--from: the session folder .* lacks author\/S\.commands\.txt: a session is painted from its whole folder as it was kept \(own script with its choice of lines\), and nothing else is painted in its place/);
  fs.rmSync(path.join(run, 'author', 'folder', 'my-lines.json'));
  assert.throws(() => checkSessionFolder(run, sub), /lacks author\/S\.commands\.txt, author\/folder\/my-lines\.json:/);
  const plan = session({ kind: 'plan' }), psub = JSON.parse(fs.readFileSync(path.join(plan, 'run.json'), 'utf8')).author.session.submitted;
  assert.deepEqual(neededOfSession(psub), ['author/S.commands.txt', 'author/folder/my-plan.json', 'author/plans/auto/plan-to-edit.json', 'author/folder/my-lines.json']);
  fs.rmSync(path.join(plan, 'author', 'plans'), { recursive: true });
  assert.throws(() => checkSessionFolder(plan, psub), /lacks author\/plans\/auto\/plan-to-edit\.json:/);
});

test('script:FILE of a session that chose its lines: the lines come with it, from the kept copy or the model\'s own folder', () => {
  const run = session();
  for (const f of ['author/script.json', 'author/folder/script.json']) {
    const got = linesOfKept(path.join(run, f), 'script');
    assert.equal(got.lines, 'my-lines.json'); assert.equal(got.linesFile, path.join(run, 'author', 'folder', 'my-lines.json')); assert.equal(got.run, run); assert.equal(got.what, 'own script with its choice of lines');
  }
  assert.equal(sessionOfFile(path.join(run, 'author', 'script.json')).run, run);
  const plan = session({ kind: 'plan' });
  assert.equal(linesOfKept(path.join(plan, 'author', 'plan-edit.json'), 'plan').linesFile, path.join(plan, 'author', 'folder', 'my-lines.json'));
});

test('script:FILE whose session\'s lines file is missing is refused, the file named; never the standard drawing in its place', () => {
  const run = session(); fs.rmSync(path.join(run, 'author', 'folder', 'my-lines.json'));
  assert.throws(() => linesOfKept(path.join(run, 'author', 'script.json'), 'script'), e => e.message.includes(`the lines file is missing: ${path.join(run, 'author', 'folder', 'my-lines.json')}`) && /not painted with the standard drawing in their place/.test(e.message));
  // a painting made --from a session keeps the script and the session's record, not the model's folder: the lines are found in the folder it was painted from
  const first = session(), final = session({ reusedFrom: first }); fs.rmSync(path.join(final, 'author', 'folder'), { recursive: true });
  assert.equal(linesOfKept(path.join(final, 'author', 'script.json'), 'script').linesFile, path.join(first, 'author', 'folder', 'my-lines.json'));
});

test('a file in a session\'s folder that is not what the session handed over is refused, not painted as the session\'s work', () => {
  const run = session();
  assert.throws(() => linesOfKept(path.join(run, 'author', 'folder', 'script-look3.json'), 'script'), /is not the script it handed over \(author\/folder\/script\.json\): it is not painted with that session's lines, nor with the standard drawing/);
  assert.throws(() => linesOfKept(path.join(run, 'author', 'script.json'), 'plan'), /is not the plan edit it handed over/);
});

test('a kept file of no session, or of a session that chose no lines, is painted as before: nothing to carry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-alone-')); fs.writeFileSync(path.join(dir, 'script.json'), '{}');
  assert.equal(linesOfKept(path.join(dir, 'script.json'), 'script'), null); assert.equal(sessionOfFile(path.join(dir, 'script.json')), null);
  const plain = session({ lines: null });
  assert.equal(linesOfKept(path.join(plain, 'author', 'script.json'), 'script'), null);
  assert.equal(linesOfKept(path.join(plain, 'author', 'folder', 'script-look3.json'), 'script'), null);
});
