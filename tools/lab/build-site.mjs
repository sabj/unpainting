#!/usr/bin/env node
// Builds the static GitHub Pages site from demos/ into one folder, keeping the public paths:
//   index.html, lab/     Paint Lab (demos/index.html and demos/lab/), with only the examples recorded.json ships
//   layers/, fungi/ ...  every other demos/ folder, copied as is (mushrooms/ redirects to fungi/)
// README.md files, tests (*.test.mjs) and dotfiles are not published. Every URL is relative, so the site works under a project path such as /unpainting/.
//
//   node tools/lab/build-site.mjs [OUT=_site]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, '_site'));
const DEMOS = path.join(ROOT, 'demos');

const copy = (from, to, filter = () => true) => fs.cpSync(from, to, { recursive: true, filter });

const notReadme = src => path.basename(src) !== 'README.md';
const published = src => notReadme(src) && !path.basename(src).startsWith('.') && !src.endsWith('.test.mjs');

function others() {
  for (const entry of fs.readdirSync(DEMOS, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'lab') continue;
    copy(path.join(DEMOS, entry.name), path.join(OUT, entry.name), published);
  }
}

function painter() {
  const dir = OUT;
  fs.copyFileSync(path.join(DEMOS, 'index.html'), path.join(dir, 'index.html'));
  const examples = path.join(DEMOS, 'lab', 'examples');
  copy(path.join(DEMOS, 'lab'), path.join(dir, 'lab'), src => notReadme(src) && src !== examples && !src.startsWith(examples + path.sep));
  const manifest = JSON.parse(fs.readFileSync(path.join(examples, 'recorded.json'), 'utf8'));
  const shipped = manifest.examples;
  const outExamples = path.join(dir, 'lab', 'examples');
  fs.mkdirSync(outExamples, { recursive: true });
  const files = new Set(shipped.flatMap(ex => [ex.target, ex.thumb, ex.film.paths, ex.film.final, ...ex.film.frames, ...Object.values(ex.live??{}), ...Object.values(ex.studies??{}).flatMap(s=>[s.painting,s.comparison,s.metrics,s.beforeComparison,s.beforeMetrics,s.run,s.budgetAudit,s.guard]), ...Object.values(ex.checkpoints??{}).flat().flatMap(c=>[c.state,c.image])].filter(Boolean)));
  for (const file of files) {
    const dest = path.join(dir, 'lab', file);
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    fs.copyFileSync(path.join(DEMOS, 'lab', file), dest);
  }
  fs.writeFileSync(path.join(outExamples, 'recorded.json'), JSON.stringify(manifest, null, 2));
  return shipped;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const shipped = painter();
others();
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
let bytes = 0, files = 0;
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else { bytes += fs.statSync(p).size; files++; } } };
walk(OUT);
console.log(`${path.relative(process.cwd(), OUT) || OUT}: ${files} files, ${(bytes / 1024 / 1024).toFixed(2)} MB; examples: ${shipped.map(e => e.id + (e.film ? ' (film)' : '')).join(', ')}`);
