import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Parse balanced function bodies, then follow calls transitively. Counting all
// module declarations would incorrectly charge unused bindings to every stage.
function storageUses(source) {
  let depth = 0;
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const bindings = [...code.matchAll(/((?:@\w+\s*\([^)]*\)\s*)+)var\s*<\s*storage\b[^>]*>\s*(\w+)/g)].map(m => {
    const group = m[1].match(/@group\s*\(\s*(\d+)\s*\)/);
    const binding = m[1].match(/@binding\s*\(\s*(\d+)\s*\)/);
    assert(group && binding, `storage variable ${m[2]} lacks binding attributes`);
    return {name:m[2], key:`${group[1]}:${binding[1]}`};
  });
  const functions = new Map(), entries = [];
  const starts = /((?:@\w+(?:\s*\([^)]*\))?\s*)*)\bfn\s+(\w+)\s*\(/g;
  for (const m of code.matchAll(starts)) {
    const begin = code.indexOf('{', m.index + m[0].length);
    assert(begin >= 0, `missing body for ${m[2]}`);
    depth = 1; let end = begin + 1;
    while (depth && end < code.length) {
      if (code[end] === '{') depth++;
      if (code[end] === '}') depth--;
      end++;
    }
    assert.equal(depth, 0, `unclosed body for ${m[2]}`);
    functions.set(m[2], code.slice(begin + 1, end - 1));
    if (/@compute\b/.test(m[1])) entries.push(m[2]);
  }
  return entries.map(entry => {
    const seen = new Set(), used = new Set();
    function visit(name) {
      if (seen.has(name)) return;
      seen.add(name);
      const body = functions.get(name);
      for (const b of bindings) if (new RegExp(`\\b${b.name}\\b`).test(body)) used.add(b.key);
      for (const call of body.matchAll(/\b(\w+)\s*\(/g)) if (functions.has(call[1])) visit(call[1]);
    }
    visit(entry);
    return {entry, bindings:[...used]};
  });
}

function shaders(directory) {
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(item => {
    const path = new URL(item.name + (item.isDirectory() ? '/' : ''), directory);
    return item.isDirectory() ? shaders(path) : item.name.endsWith('.wgsl') ? [path] : [];
  });
}

test('every WGSL compute entry point fits the Metal 10-storage-buffer ceiling', () => {
  const paths = shaders(new URL('./', import.meta.url));
  assert(paths.length > 0);
  for (const path of paths) {
    const entries = storageUses(fs.readFileSync(path, 'utf8'));
    assert(entries.length > 0, `no compute entries parsed in ${path.pathname}`);
    for (const {entry, bindings} of entries) {
      assert(bindings.length <= 10, `${path.pathname}: ${entry} binds ${bindings.length} storage buffers (${bindings.join(', ')})`);
    }
  }
});

test('buffer counting follows shared helpers and ignores comments, uniforms and unused storage', () => {
  const declarations = Array.from({length:11}, (_, i) => `@binding(${i}) @group(1) var<storage, read> b${i}: array<f32>;`).join('\n');
  const source = `${declarations}
    @group(0) @binding(0) var<uniform> u: vec4<f32>;
    fn inner() { ${Array.from({length:11}, (_, i) => `let v${i} = b${i}[0];`).join(' ')} }
    fn outer() { inner(); }
    @compute @workgroup_size(1) fn excessive() { outer(); }
    @compute\n@workgroup_size(1) fn small() { let x = b0[0] + u.x; /* b1[0] */ // b2[0]
    }
  `;
  assert.deepEqual(storageUses(source).map(e => [e.entry, e.bindings.length]), [['excessive',11], ['small',1]]);
});
