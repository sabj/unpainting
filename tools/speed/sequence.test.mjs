import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSpeedSequence } from './sequence.mjs';

test('sequence uses fresh processes, shares a private cache and retains each measured output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-sequence-'));
  try {
    const script = path.join(root, 'fake.mjs'), out = path.join(root, 'paint');
    fs.writeFileSync(script, `import fs from 'node:fs'; import path from 'node:path';
      import {prepareOutputDirectory} from ${JSON.stringify(new URL('../../src/paint/output-directory.mjs', import.meta.url).href)};
      const args=process.argv.slice(2),out=args[args.lastIndexOf('--out')+1],cache=process.env.W2_CACHE_DIR;
      prepareOutputDirectory(out);
      fs.mkdirSync(cache,{recursive:true}); const hit=fs.existsSync(path.join(cache,'value'));
      fs.writeFileSync(path.join(cache,'value'),'stored');
      fs.writeFileSync(path.join(out,'painting.png'),String(args[args.lastIndexOf('--variant')+1]));
      fs.writeFileSync(path.join(out,'backend.json'),JSON.stringify({pid:process.pid,hit,guard:args[args.lastIndexOf('--targetguard')+1],marks:args[args.lastIndexOf('--marks')+1]}));
      fs.writeFileSync(path.join(out,'f0001.jpg'),'frame'); console.log('finished');`);
    assert.equal(await runSpeedSequence(['--out', out, '--targetguard', 'strict', '--marks', '1', '--speedsequence', JSON.stringify([['--variant', 'before'], ['--variant', 'after', '--marks', '1']])], script), true);
    const rows = JSON.parse(fs.readFileSync(path.join(out, 'sequence.json')));
    const a = JSON.parse(fs.readFileSync(path.join(out, 'sequence/0/backend.json'))), b = JSON.parse(fs.readFileSync(path.join(out, 'sequence/1/backend.json')));
    assert.notEqual(a.pid, b.pid); assert.equal(a.hit, false); assert.equal(b.hit, true);
    assert.equal(a.guard, 'strict'); assert.equal(b.guard, 'strict');
    assert.equal(a.marks, '0'); assert.equal(b.marks, '0');
    assert.ok(rows.every(r => r.seconds > 0 && r.exit === 0 && r.sha256));
    assert.equal(fs.readFileSync(path.join(out, 'painting.png'), 'utf8'), 'after');
    assert.equal(fs.readFileSync(path.join(out, 'sequence/0/painting.png'), 'utf8'), 'before');
    assert.equal(fs.existsSync(path.join(out, '.sequence-cache')), false);
    assert.equal(fs.existsSync(path.join(out, 'sequence/0/f0001.jpg')), false);
    assert.equal(fs.existsSync(path.join(out, 'f0001.jpg')), false);
    await assert.rejects(runSpeedSequence(['--out', out, '--speedsequence', '[["--image","other.png"]]'], script), /cannot override/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
