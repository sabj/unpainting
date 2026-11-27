import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { seatbelt } from './session.mjs';
import { eyesOnlyOf, isOriginal, viewersOf, eyesRule, pictureReadsByCode, guardRecord, isProgram } from './eyes-only.mjs';

test('which files are pictures: the subject, the studies and every handed picture; the forms and the drawing are data', () => {
  const files = ['inputs/source.png', 'inputs/drawing.png', 'inputs/study-1.png', 'inputs/study-2.png', 'inputs/study-3.png', 'inputs/forms.png'];
  assert.deepEqual(eyesOnlyOf(files, ['previous/final-beside-subject.jpg']), ['inputs/source.png', 'inputs/study-1.png', 'inputs/study-2.png', 'inputs/study-3.png', 'previous/final-beside-subject.jpg']);
  assert.equal(isOriginal('inputs/source.png'), true); assert.equal(isOriginal('inputs/study-2.png'), false);
  assert.ok(isProgram('trace.py') && isProgram('a/b.mjs') && !isProgram('notes.md') && !isProgram('script.json'));
});

test('under the session\'s profile a program is refused every picture and reads all the data; only the viewer reads a picture', { skip: process.platform !== 'darwin' && 'the profile is macOS seatbelt' }, () => {
  // real processes under the real profile, no model: /usr/bin/head stands for the model command's own program
  const tmp = fs.realpathSync(os.tmpdir()), cwd = fs.mkdtempSync(path.join(tmp, 'unpaint-session-eyes-'));
  const put = (f, text = 'x') => { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.writeFileSync(path.join(cwd, f), text); };
  const pictures = ['inputs/source.png', 'inputs/study-1.png', 'previous/final-beside-subject.jpg'], looks = ['looks/1/beside.png', 'looks/1/stages.png'];
  const data = ['inputs/forms.json', 'inputs/forms-ids.png', 'inputs/forms.png', 'inputs/drawing.png', 'drawing/lines.json', 'drawing/all-lines.png', 'resources/shapes.json', 'looks/1/numbers.txt', 'looks/1/plan.json', 'looks/1/plan.png', 'looks/1/sheet.png', 'previous/submitted/script.json', 'mine/drawing.png', 'my-own-plot.png'];
  try {
    for (const f of [...pictures, ...looks, ...data]) put(f, 'bytes');
    const profile = seatbelt({ deny: [], write: [tmp, '/private/tmp', '/private/var/folders'], cwd, local: true, eyes: { pictures, viewers: ['/usr/bin/head'] } });
    const can = (cmd, ...a) => { try { execFileSync('sandbox-exec', ['-p', profile, cmd, ...a], { stdio: 'pipe', cwd }); return true; } catch { return false; } };
    for (const f of [...pictures, ...looks]) {
      assert.equal(can('/bin/cat', f), false, `cat is refused ${f}`);
      assert.equal(can(process.execPath, '-e', `require('fs').readFileSync(${JSON.stringify(f)})`), false, `a node script is refused ${f}`);
      assert.equal(can('/bin/cp', f, 'copy.bin'), false, `a copy of ${f} is refused`);
      assert.equal(can('/bin/mv', f, 'moved.bin'), false, `${f} cannot be moved out to an ordinary name`);
      assert.equal(can('/bin/ln', f, 'linked.bin'), false, `${f} cannot be hard linked`);
      assert.equal(can('/bin/sh', '-c', `cat < ${f}`), false, `a shell redirect of ${f} is refused`);
      assert.equal(can('/usr/bin/head', '-c', '1', f), true, `the viewer reads ${f}`);
    }
    execFileSync('sandbox-exec', ['-p', profile, '/bin/ln', '-s', 'inputs/source.png', 'link.png'], { cwd }); assert.equal(can('/bin/cat', 'link.png'), false, 'a symbolic link to a picture reads no more than the picture');
    for (const d of ['inputs', 'looks', 'previous']) assert.equal(can('/bin/mv', d, `${d}-2`), false, `the folder ${d} cannot be moved`);
    assert.equal(can('/bin/mv', cwd, `${cwd}-2`), false, 'the session\'s folder cannot be moved');
    assert.equal(can('/bin/sh', '-c', 'echo x > inputs/source.png'), false, 'a picture cannot be written over');
    for (const f of data) assert.equal(can('/bin/cat', f), true, `the data ${f} is read by a program`);
    assert.equal(can('/bin/ls', 'inputs'), true, 'the folder is listed');
    assert.equal(can('/usr/bin/touch', 'script.json'), true, 'its own files are written');
    // a picture shown later (written by the harness's side) is held the same: the rule is by its place
    fs.rmSync(path.join(cwd, 'inputs/source.png')); assert.equal(can('/bin/cat', 'inputs/source.png'), false); fs.writeFileSync(path.join(cwd, 'inputs/source.png'), 'again');
    assert.equal(can('/bin/cat', 'inputs/source.png'), false); assert.equal(can('/usr/bin/head', '-c', '1', 'inputs/source.png'), true);
    put('looks/2/beside.png'); assert.equal(can('/bin/cat', 'looks/2/beside.png'), false, 'a later look\'s picture is held too');
    // what the refusal reads like, for the record
    let said = ''; try { execFileSync('sandbox-exec', ['-p', profile, process.execPath, '-e', 'require("fs").readFileSync("inputs/source.png")'], { cwd, stdio: 'pipe' }); } catch (e) { said = String(e.stderr); }
    const found = pictureReadsByCode({ steps: [{ kind: 'shell', text: 'node trace.js', output: said.slice(0, 2000), denied: said.split('\n').filter(l => /not permitted/.test(l)) }], pictures });
    assert.equal(found.blocked.length, 1, said); assert.equal(guardRecord(found, { held: true }).cheat.disqualified, true);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); fs.rmSync(`${cwd}-2`, { recursive: true, force: true }); }
});

test('the rule names the viewer by its program; with none, no process reads a picture', () => {
  const rule = eyesRule({ cwd: '/t/unpaint-session-a.b', pictures: ['inputs/source.png'], viewers: ['/opt/bin/model'] }).join('\n');
  assert.match(rule, /\(deny file-write\* \(subpath "\/t\/unpaint-session-a\.b\/inputs"\) \(subpath "\/t\/unpaint-session-a\.b\/looks"\)\)/);
  assert.match(rule, /\(deny file-read-data \(require-all \(require-any \(literal "\/t\/unpaint-session-a\.b\/inputs\/source\.png"\) \(regex #"\^\/t\/unpaint-session-a\\\.b\/looks\/\[0-9\]\+\/\(beside\|stages\)\\\.png\$"\)\) \(require-not \(require-any \(process-path "\/opt\/bin\/model"\)\)\)\)\)/);
  assert.doesNotMatch(eyesRule({ cwd: '/t/s', pictures: [], viewers: [] }).join('\n'), /process-path/);
  assert.throws(() => viewersOf('model', () => { throw new Error('not found'); }), /eyes only: the `model` command is not on PATH/);
  assert.deepEqual(viewersOf('model', () => '/no/such/place/model'), ['/no/such/place/model']);
  // muse is a launcher script beside muse-bin-*: both the launcher and its exec'd binary are recognised as viewers
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'unpaint-muse-viewer-'));
  try {
    const launcher = path.join(dir, 'muse'), bin = path.join(dir, 'muse-bin-1.4.25');
    fs.writeFileSync(launcher, '#!/bin/sh\n'); fs.writeFileSync(bin, ''); fs.writeFileSync(path.join(dir, '.muse-version'), '1.4.25\n');
    assert.deepEqual(viewersOf('muse', () => launcher), [launcher, bin]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a refused read or a script that names a picture disqualifies the try, in level 1\'s words; showing and looking do not', () => {
  const pictures = ['inputs/source.png', 'inputs/study-2.png', 'previous/final-beside-subject.jpg'];
  const clean = pictureReadsByCode({ pictures, scripts: [{ name: 'forms.py', text: 'import cv2\nids = cv2.imread("inputs/forms-ids.png", 0)\nmine = cv2.imread("looks/2/sheet.png")\n' }, { name: 'notes.md', text: 'inputs/source.png: a cat' }],
    steps: [{ kind: 'shell', text: './unpaint show inputs/source.png', output: 'SHOWN: `inputs/source.png` is in your folder' }, { kind: 'shell', text: 'ls -la inputs/ && python3 forms.py', output: 'source.png\nforms.json' }, { kind: 'read', text: 'inputs/source.png' }, { kind: 'read', text: 'looks/1/beside.png' },
      { kind: 'shell', text: 'cat /etc/hosts.private', output: 'cat: /etc/hosts.private: Permission denied', denied: ['cat: /etc/hosts.private: Permission denied'] }] });
  assert.deepEqual(clean, { blocked: [], scripts: [], commands: [] });
  assert.deepEqual(guardRecord(clean, { held: true }).cheat, { disqualified: false, readTargetPixels: false, reason: null });
  const blocked = pictureReadsByCode({ pictures, steps: [{ kind: 'shell', text: 'python3 t.py', output: 'Traceback', denied: ['PermissionError: [Errno 1] Operation not permitted: \'inputs/study-2.png\''] }, { kind: 'shell', text: 'cp looks/1/beside.png b.bin', output: 'cp: looks/1/beside.png: Operation not permitted' }] });
  assert.equal(blocked.blocked.length, 2);
  const b = guardRecord(blocked, { held: true }); assert.deepEqual(b.cheat, { disqualified: true, readTargetPixels: true, reason: '2 blocked picture read(s) by code' }); assert.equal(b.guard.blockedImageReads, 2); assert.match(b.guard.how, /^refused by the session's sandbox/);
  const named = pictureReadsByCode({ pictures, scripts: [{ name: 'trace.py', text: 'from PIL import Image\ntry:\n  im = Image.open("inputs/source.png")\nexcept Exception: pass\n' }],
    steps: [{ kind: 'shell', text: 'python3 - <<EOF\nimport cv2\ncv2.imread("previous/final-beside-subject.jpg")\nEOF', output: '' }, { kind: 'shell', text: 'file inputs/study-2.png 2>/dev/null', output: '' }] });
  assert.deepEqual(named.scripts.map(s => [s.name, s.names]), [['a program in a shell command', 'previous/final-beside-subject.jpg'], ['trace.py', 'inputs/source.png']]);
  assert.equal(named.commands.length, 1, 'another command that names a picture is recorded');
  const n = guardRecord(named, { held: true }); assert.equal(n.cheat.disqualified, true); assert.equal(n.cheat.reason, 'scripts refer to the picture files: previous/final-beside-subject.jpg, inputs/source.png');
  assert.equal(guardRecord({ blocked: [], scripts: [], commands: named.commands }, { held: false }).cheat.disqualified, false, 'a command that only names a picture is recorded, not a disqualification');
});

test('comments and required seen.md notes mentioning picture names do not trigger false-positive disqualifications', () => {
  const pictures = ['inputs/source.png', 'auto-result/auto-painting.png'];
  const clean = pictureReadsByCode({
    pictures,
    scripts: [
      { name: 'generate_v1.py', text: '# Look at auto-painting.png vs source.png!\nimport json\ndata = json.load(open("resources/shapes.json"))\n' },
      { name: 'build.mjs', text: '// compared visually with inputs/source.png\n/* auto-result/auto-painting.png note */\nconsole.log("ok");\n' },
    ],
    steps: [
      { kind: 'shell', text: "/bin/zsh -lc \"cat > seen.md <<'EOF'\nauto-result/auto-painting.png: Too blue and speckled.\nEOF\npython3 - <<'PY'\nimport json\nprint(len(json.load(open('resources/shapes.json'))))\nPY\"", output: '12' },
      { kind: 'shell', text: "/bin/zsh -lc \"python3 - <<'PY'\nimport json\nopen('seen.md','w').write('auto-result/auto-painting.png: Broad pale wash.')\nPY\"", output: '' },
      { kind: 'shell', text: "/bin/zsh -lc \"printf '%s\\n' 'auto-result/auto-painting.png: Notes' > seen.md\npython3 - <<'PY'\nprint(1)\nPY\"", output: '1' },
      { kind: 'shell', text: "python3 - <<'EOF'\n# keep sketchy lines seen in source.png!\nimport json\njson.load(open('drawing/lines.json'))\nEOF", output: '' },
    ],
  });
  assert.deepEqual(clean, { blocked: [], scripts: [], commands: [] });
  assert.equal(guardRecord(clean, { held: true }).cheat.disqualified, false);
  // Real code read inside a script that also writes seen.md still disqualifies
  const stillCheat = pictureReadsByCode({
    pictures,
    steps: [{ kind: 'shell', text: "python3 - <<'PY'\nopen('seen.md','w').write('auto-result/auto-painting.png: ok')\nfrom PIL import Image\nImage.open('inputs/source.png')\nPY", output: '' }],
  });
  assert.equal(stillCheat.scripts.length, 1);
  assert.equal(guardRecord(stillCheat, { held: true }).cheat.disqualified, true);
});
