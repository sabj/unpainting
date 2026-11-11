import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('ink score synthetic physical measurements', () => {
  const python = process.env.PAINTER_LINES_PYTHON || path.join(process.env.PAINTER_LINES_VENV || '.venv-lines', 'bin/python');
  const code = `import importlib.util,sys,runpy
s=importlib.util.spec_from_file_location('ink_score_module','tools/ink-score.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m);sys.modules['ink_score_module']=m
sys.argv=['tools/ink-score-test.py'];runpy.run_path('tools/ink-score-test.py',run_name='__main__')`;
  const r=spawnSync(python,['-c',code],{encoding:'utf8'});
  assert.equal(r.status,0,r.error?.message || r.stderr);
});

test('painter and planners cannot reach the offline ink scorecard', () => {
  // Check the entire production source and tool tree, including dynamic imports and subprocess calls.
  for (const root of ['src','tools','bench']) for (const f of fs.readdirSync(root,{recursive:true})) {
    if (!/\.(mjs|js|py)$/.test(f) || /(?:test|ink-score)/.test(f)) continue;
    const full=path.join(root,f);
    assert.doesNotMatch(fs.readFileSync(full,'utf8'), /ink-score(?:\.mjs|\.py|\b)/, full);
  }
});
