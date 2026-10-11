#!/usr/bin/env node
// Copy the painter's physical media (src/media) into Paint Lab as .js files with './name.js' imports, so the lab paints
// with the painter's own paper, sheet, brush, pen, pencil and optics. The painter repo is the source; the lab's copy is
// generated. It follows each module's relative imports, so a helper the brush comes to need is copied with it; a
// module that imports Node (node:*, sharp) stops the copy, since the browser could not load it.
//   node tools/lab/sync-site-media.mjs                 write docs/lab/media
//   node tools/lab/sync-site-media.mjs --check         exit 1 if docs/lab/media differs from src/media
//   node tools/lab/sync-site-media.mjs --out DIR       write somewhere else (a scratch copy to test first)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(ROOT, 'src', 'media');
export const ROOTS = ['paper', 'sheet', 'brush', 'pen', 'pencil', 'graphite', 'km'];
const HEADER = from => `// Generated from src/media/${from} by tools/lab/sync-site-media.mjs. Edit the source.\n`;

const relImports = code => [...code.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm)].map(m => m[1] ?? m[2]);

/** Every generated file as { rel path under the lab's media folder: contents }. */
export function generate() {
  const out = new Map(), todo = ROOTS.map(n => `${n}.mjs`);
  while (todo.length) {
    const rel = todo.pop(); if (out.has(rel.replace(/\.mjs$/, '.js'))) continue;
    const file = path.join(SRC, rel);
    if (!file.startsWith(SRC + path.sep)) throw new Error(`${rel} lies outside src/media; the lab copies only src/media`);
    const code = fs.readFileSync(file, 'utf8');
    for (const spec of relImports(code)) {
      if (!spec.startsWith('.')) throw new Error(`src/media/${rel} imports ${spec}, which the browser cannot load`);
      todo.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
    }
    out.set(rel.replace(/\.mjs$/, '.js'), HEADER(rel) + code.replace(/(from\s+'\.{1,2}\/[^']+)\.mjs'/g, "$1.js'"));
  }
  return out;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const argv = process.argv.slice(2), oi = argv.indexOf('--out'), check = argv.includes('--check');
  const dest = oi >= 0 ? path.resolve(argv[oi + 1] ?? '') : path.join(ROOT, 'docs', 'lab', 'media');
  const files = generate();
  let stale = 0;
  for (const [rel, code] of files) {
    const to = path.join(dest, rel);
    const same = fs.existsSync(to) && fs.readFileSync(to, 'utf8') === code;
    if (check) { if (!same) { stale++; console.error('stale', path.relative(ROOT, to)); } continue; }
    if (same) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, code); console.log('wrote', path.relative(ROOT, to));
  }
  if (check && stale) { console.error('run: node tools/lab/sync-site-media.mjs'); process.exit(1); }
}
