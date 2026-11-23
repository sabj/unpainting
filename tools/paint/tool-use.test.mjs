import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toolUseOf, listFiles } from './tool-use.mjs';
import { readTranscript } from './session.mjs';
import { usageOf } from './usage.mjs';

const own = '/tmp/unpaint-session-argon-m-X1';
const step = (i, x) => ({ event: 'step_update', step_update: { step_index: i, step_type: 'tool', ...x } });
const tool = (i, state, name, parameters, output) => step(i, { state, tool_name: name, tool_info: { name, parameters, ...(output ? { output } : {}) } });
const sh = (i, c, output) => [tool(i, 'ACTIVE', 'run_command', { CommandLine: c }), tool(i, 'DONE', 'run_command', { CommandLine: c }, output)];

test('tool use from an agy transcript and the folder: commands, scripts and their runs, pictures, unpaint calls, files made, what failed, installs and network tried', () => {
  const out = [
    tool(1, 'ACTIVE', 'read_file', { Path: `${own}/inputs/source.png` }), tool(1, 'DONE', 'read_file', { Path: `${own}/inputs/source.png` }),
    tool(2, 'ACTIVE', 'read_file', { Path: `${own}/README.md` }), tool(2, 'DONE', 'read_file', { Path: `${own}/README.md` }, '10 lines'),
    ...sh(3, './unpaint plan', 'Command exited with code 0.\n\nCommand output:\nIt compiles'),
    tool(4, 'ACTIVE', 'write_to_file', { TargetFile: `${own}/measure.py`, CodeContent: 'print(1)\nprint(2)\n' }), tool(4, 'DONE', 'write_to_file', { TargetFile: `${own}/measure.py` }),
    ...sh(5, 'python3 measure.py', 'Command exited with code 0.'), ...sh(6, 'cat measure.py', 'Command exited with code 0.'), ...sh(7, '/opt/homebrew/bin/python3.14 measure.py && ./unpaint look', 'Command exited with code 0.\nLOOK 1'),
    ...sh(8, "python3 -c 'import json'", 'Command exited with code 0.'), ...sh(9, 'pip install scipy', 'Command exited with code 1.\nCommand output:\nERROR: Could not connect'),
    ...sh(10, 'curl https://example.com', 'Command exited with code 6.'), ...sh(11, './unpaint look', 'Command exited with code 0.\nREFUSED, nothing was planned: there is no file my-plan.json'),
    tool(12, 'ACTIVE', 'read_file', { Path: '/repo/x.png' }), tool(12, 'ERROR', 'read_file', { Path: '/repo/x.png' }),
  ].map(x => JSON.stringify(x)).join('\n');
  const seen = readTranscript('agy', out);
  assert.equal(seen.steps.length, 12); assert.deepEqual(seen.steps[2], { kind: 'shell', text: './unpaint plan', exit: 0, failed: false, output: 'Command exited with code 0.\n\nCommand output:\nIt compiles' });
  assert.equal(seen.steps[11].failed, true, 'a step that ended in ERROR failed');
  const u = toolUseOf({ steps: seen.steps, startFiles: ['README.md', 'inputs/source.png'], endFiles: ['README.md', 'inputs/source.png', 'measure.py', 'choice.json'], read: f => (f === 'measure.py' ? 'print(1)\nprint(2)\n' : null), own: [own] });
  assert.equal(u.shellCommands, 8); assert.equal(u.fileReads, 3); assert.equal(u.fileWrites, 1);
  assert.deepEqual(u.unpaint, { plan: 1, look: 2 });
  assert.deepEqual(u.scripts, [{ name: 'measure.py', language: 'python', lines: 2, runs: 2 }], 'cat of a script is not a run of it');
  assert.deepEqual(u.inlinePrograms, { python: 1 }); assert.deepEqual(u.picturesOpened, ['inputs/source.png', '/repo/x.png']);
  assert.deepEqual(u.filesCreated, ['measure.py', 'choice.json']);
  assert.deepEqual(u.failedOrRefused.map(f => [f.text, f.exit]), [['pip install scipy', 1], ['curl https://example.com', 6], ['./unpaint look', 0], ['/repo/x.png', null]]);
  assert.match(u.failedOrRefused[2].said, /^REFUSED/);
  assert.deepEqual(u.installsTried, [{ text: 'pip install scipy', exit: 1 }]); assert.deepEqual(u.networkTried, [{ text: 'curl https://example.com', exit: 6 }]);
  assert.deepEqual(toolUseOf({ steps: [{ kind: 'shell', text: 'security dump-keychain | wc -l', exit: 0 }, { kind: 'read', text: '/u/Library/Keychains/login.keychain-db' }] }).keychainTried.map(k => k.text), ['security dump-keychain | wc -l', '/u/Library/Keychains/login.keychain-db']);
  assert.equal(toolUseOf({ steps: [] }).filesCreated, null, 'no listing before the start: files made are not guessed');
});

test('tool steps from claude and codex transcripts; usage.json carries tool use', () => {
  const claude = [{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'Bash', input: { command: 'npm install x' } }, { type: 'tool_use', id: 'b', name: 'Read', input: { file_path: 'inputs/s.png' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'Exit code 1\nnpm error' }] } }].map(x => JSON.stringify(x)).join('\n');
  const c = readTranscript('claude', claude).steps;
  assert.deepEqual(c.map(s => [s.kind, s.text, s.failed]), [['shell', 'npm install x', true], ['read', 'inputs/s.png', false]]);
  const codex = JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'ls', exit_code: 2, aggregated_output: 'ls: x: No such file or directory' } });
  assert.deepEqual(readTranscript('codex', codex).steps.map(s => [s.text, s.exit, s.failed]), [['ls', 2, true]]);
  const toolUse = toolUseOf({ steps: readTranscript('claude', claude).steps, startFiles: [], endFiles: [] });
  assert.equal(usageOf({ subject: 's', author: { key: 'k', name: 'K' }, level: 'L2', tryNumber: 1, budget: {}, session: { ended: 'done', toolUse } }).toolUse.installsTried.length, 1);
  assert.equal(usageOf({ subject: 's', author: { key: 'k', name: 'K' }, level: 'L2', tryNumber: 1, budget: {}, session: { ended: 'done' } }).toolUse, null);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-use-')); try { fs.mkdirSync(path.join(d, 'a')); fs.writeFileSync(path.join(d, 'a', 'x.py'), ''); fs.writeFileSync(path.join(d, 'b.txt'), ''); assert.deepEqual(listFiles(d), ['a/x.py', 'b.txt']); } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
