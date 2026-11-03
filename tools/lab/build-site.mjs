#!/usr/bin/env node
// Builds the GitHub Pages site: demos/ is published as /demos/, file for file, and the site root opens it.
// Paint Lab's examples ship only what demos/lab/examples/recorded.json lists. README.md files, tests and dotfiles are left out.
// Every URL is relative, so the site works under a project path such as /unpainting/.
//
//   node tools/lab/build-site.mjs [OUT=_site]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, '_site'));
const DEMOS = path.join(ROOT, 'demos');
const SITE = path.join(OUT, 'demos');
const EXAMPLES = path.join(DEMOS, 'lab', 'examples');

const published = src => {
  const name = path.basename(src);
  return name !== 'README.md' && !name.startsWith('.') && !src.endsWith('.test.mjs') && src !== EXAMPLES && !src.startsWith(EXAMPLES + path.sep);
};

function examples() {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXAMPLES, 'recorded.json'), 'utf8'));
  const shipped = manifest.examples;
  const files = new Set(shipped.flatMap(ex => [ex.target, ex.thumb, ex.film.paths, ex.film.final, ...ex.film.frames, ...Object.values(ex.live??{}), ...Object.values(ex.studies??{}).flatMap(s=>[s.painting,s.comparison,s.metrics,s.beforeComparison,s.beforeMetrics,s.run,s.budgetAudit,s.guard]), ...Object.values(ex.checkpoints??{}).flat().flatMap(c=>[c.state,c.image])].filter(Boolean)));
  for (const file of files) {
    const dest = path.join(SITE, 'lab', file);
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    fs.copyFileSync(path.join(DEMOS, 'lab', file), dest);
  }
  fs.mkdirSync(path.join(SITE, 'lab', 'examples'), { recursive: true });
  fs.writeFileSync(path.join(SITE, 'lab', 'examples', 'recorded.json'), JSON.stringify(manifest, null, 2));
  return shipped;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DEMOS, SITE, { recursive: true, filter: published });
const shipped = examples();
fs.writeFileSync(path.join(OUT, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=demos/"><title>Unpainting</title>\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
let bytes = 0, files = 0;
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else { bytes += fs.statSync(p).size; files++; } } };
walk(OUT);
console.log(`${path.relative(process.cwd(), OUT) || OUT}: ${files} files, ${(bytes / 1024 / 1024).toFixed(2)} MB; examples: ${shipped.map(e => e.id + (e.film ? ' (film)' : '')).join(', ')}`);
