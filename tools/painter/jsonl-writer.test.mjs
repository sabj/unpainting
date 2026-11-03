import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createJSONLWriter } from './jsonl-writer.mjs';
import { onCheckFailure, check, setStrict, resetChecks } from '../../src/media/checks.mjs';

test('buffered JSONL snapshots, bounds, append order and failure flush', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jsonl-')), file=path.join(dir,'a.jsonl');
  const writer=createJSONLWriter({maxBytes:32}), remove=onCheckFailure(writer.flush);
  try {
    const record={a:[1]}; writer.append(file,JSON.stringify(record)+'\n'); record.a.push(2);
    assert.equal(fs.existsSync(file),false);
    setStrict(true); assert.throws(()=>check('test',false),/test/);
    assert.equal(fs.readFileSync(file,'utf8'),'{"a":[1]}\n');
    writer.append(file,JSON.stringify({text:'é'.repeat(40)})+'\n');
    assert.equal(fs.readFileSync(file,'utf8').trim().split('\n').length,2);
    writer.append(file,'{"last":true}\n'); writer.close(); writer.close();
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8').trim().split('\n').at(-1)).last,true);
  } finally {remove();resetChecks();writer.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('exit and uncaught throw hooks preserve pending lines', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jsonl-exit-'));
  try { for(const action of ['process.exit(0)','throw Error("expected")']) {
    const file=path.join(dir,action.startsWith('throw')?'throw.jsonl':'exit.jsonl');
    const run=spawnSync(process.execPath,['--input-type=module','-e',`
      import {createJSONLWriter} from ${JSON.stringify(new URL('./jsonl-writer.mjs',import.meta.url).href)};
      const w=createJSONLWriter();process.on('exit',w.close);process.on('uncaughtExceptionMonitor',w.flush);
      w.append(${JSON.stringify(file)},'{"evidence":true}\\n');${action};
    `]);
    assert.equal(run.status,action.startsWith('throw')?1:0);
    assert.equal(fs.readFileSync(file,'utf8'),'{"evidence":true}\n');
  }} finally {fs.rmSync(dir,{recursive:true,force:true});}
});
