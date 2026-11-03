import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lineModelDir, lineModelMap, traceLineModel } from './line-model.mjs';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'line-model-'));
  fs.mkdirSync(path.join(root, 'tools/seg'), { recursive: true });
  for (const name of ['sketch-map.py','copy-lines.py','lines.py','sketch-lines.py']) fs.writeFileSync(path.join(root,'tools/seg',name),'# script');
  fs.writeFileSync(path.join(root, 'target.png'), 'bytes');
  return root;
}
// a fake python: sketch-map.py writes the map and its record, copy-lines.py writes the line file
function fake(root, calls) {
  return (python, args) => {
    if (args[0] === '-c') return {status:0,stdout:JSON.stringify({python:'3.9.6',numpy:'2',opencv:'4',executable:python}),stderr:''};
    calls.push(args[0].split('/').at(-1));
    if (args[0].endsWith('sketch-map.py')) {
      const out = args[args.indexOf('--out') + 1];
      fs.writeFileSync(path.join(out, 'target.png'), 'map');
      fs.writeFileSync(path.join(out, 'target.json'), JSON.stringify({ width: 1080, height: 720 }));
    } else {
      const stem=args[args.indexOf('--out')+1];
      fs.writeFileSync(stem+'-lines.json', JSON.stringify({image:{w:1080,h:720},lines:[]}));
      fs.writeFileSync(stem+'-ink.png','ink');fs.writeFileSync(stem+'-skeleton.png','skeleton');
    }
    return { status: 0, stdout: '{"tracedPaths": 0}\n', stderr: '' };
  };
}

test('the lineart map is cached by the target hash, the size and the script', () => {
  const root = setup(), cacheDir = path.join(root, 'cache'), calls = [], run = fake(root, calls);
  try {
    const a = lineModelMap({ python: 'py', root, image: path.join(root, 'target.png'), cacheDir, run });
    const b = lineModelMap({ python: 'py', root, image: path.join(root, 'target.png'), cacheDir, run });
    assert.equal(a.cached, false);
    assert.equal(b.cached, true);
    assert.deepEqual(calls, ['sketch-map.py'], 'the models ran once');
    assert.equal(b.width, 1080);
    const other = lineModelMap({ python: 'py', root, image: path.join(root, 'target.png'), cacheDir, width: 720, run });
    assert.equal(other.cached, false, 'another size is another map');
    assert.notEqual(lineModelDir({ cacheDir, bytes: 'a', script: 's', width: 1, maxside: 1 }), lineModelDir({ cacheDir, bytes: 'b', script: 's', width: 1, maxside: 1 }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a failed model run throws and leaves no half cache', () => {
  const root = setup(), cacheDir = path.join(root, 'cache');
  try {
    const run = () => ({ status: 1, stdout: '', stderr: 'ModuleNotFoundError: No module named torch\n' });
    assert.throws(() => lineModelMap({ python: 'py', root, image: path.join(root, 'target.png'), cacheDir, run }), /lineart models failed: ModuleNotFoundError/);
    assert.deepEqual(fs.readdirSync(cacheDir), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the traced line file carries the target hash and the map size', () => {
  const root = setup(), calls = [];
  try {
    const stem = path.join(root, 'lines');
    const t = traceLineModel({ python: 'py', root, image: path.join(root, 'target.png'), stem, cacheDir: path.join(root, 'cache'), run: fake(root, calls) });
    assert.deepEqual(calls, ['sketch-map.py', 'copy-lines.py']);
    const doc = JSON.parse(fs.readFileSync(stem + '-lines.json', 'utf8'));
    assert.match(doc.targetSHA256, /^[0-9a-f]{64}$/);
    assert.deepEqual(doc.lineMap, { width: 1080, height: 720, cached: false });
    assert.equal(t.summary, '{"tracedPaths": 0}');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('with strokes the source itself is traced, gated by the map', () => {
  const root = setup(), calls = [], seen = [];
  try {
    const run = (python, args) => { seen.push(args); return fake(root, calls)(python, args); };
    traceLineModel({ python: 'py', root, image: path.join(root, 'target.png'), stem: path.join(root, 'lines'), cacheDir: path.join(root, 'cache'), strokes: true, run });
    const copy = seen.find(a => a[0].endsWith('copy-lines.py'));
    assert.equal(copy[1], path.join(root, 'target.png'));
    assert.equal(copy[copy.indexOf('--kind') + 1], 'stroke');
    assert.ok(copy[copy.indexOf('--gate') + 1].endsWith('target.png'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('trace cache copies patched artifacts and keys every numerical input',()=>{
 const root=setup(),cacheDir=path.join(root,'cache'),calls=[],run=fake(root,calls);
 const args={python:'py',root,image:path.join(root,'target.png'),stem:path.join(root,'first'),cacheDir,run};
 try {
  const a=traceLineModel(args),b=traceLineModel({...args,stem:path.join(root,'second')});
  assert.equal(a.traceCached,false);assert.equal(b.traceCached,true);
  assert.equal(calls.filter(x=>x==='copy-lines.py').length,1);
  assert.deepEqual(fs.readFileSync(args.stem+'-ink.png'),fs.readFileSync(path.join(root,'second-ink.png')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'second-lines.json'))).lineMap.cached,true);
  traceLineModel({...args,tolerance:.3});
  fs.writeFileSync(a.map,'changed map');traceLineModel(args);
  fs.writeFileSync(a.map.replace('.png','-fine.png'),'fine');traceLineModel(args);
  fs.appendFileSync(path.join(root,'tools/seg/copy-lines.py'),'changed');traceLineModel(args);
  traceLineModel({...args,python:'another-python'});
  assert.equal(calls.filter(x=>x==='copy-lines.py').length,6);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('trace cache rejects corrupt artifacts instead of silently reusing them',()=>{
 const root=setup(),cacheDir=path.join(root,'cache'),args={python:'py',root,image:path.join(root,'target.png'),stem:path.join(root,'first'),cacheDir,run:fake(root,[])};
 try{
  traceLineModel(args);
  const entry=fs.readdirSync(path.join(cacheDir,'traces'))[0];
  fs.writeFileSync(path.join(cacheDir,'traces',entry,'trace-ink.png'),'corrupt');
  assert.throws(()=>traceLineModel(args),/artifact hash mismatch/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
