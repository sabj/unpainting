#!/usr/bin/env node
// Builds the static GitHub Pages site into one folder:
//   index.html         a landing page: one sentence, a WebGPU check, and a link into the painter
//   painter/           Paint Lab (docs/index.html and docs/lab/), with the recorded early-stroke excerpts and shared media
// Every URL is relative, so the site works under a project path such as /unpainting/.
//
//   node tools/lab/build-site.mjs [OUT=_site]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, '_site'));
const DOCS = path.join(ROOT, 'docs');

const copy = (from, to, filter = () => true) => fs.cpSync(from, to, { recursive: true, filter });

function painter() {
  const dir = path.join(OUT, 'painter');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(DOCS, 'index.html'), path.join(dir, 'index.html'));
  const examples = path.join(DOCS, 'lab', 'examples');
  copy(path.join(DOCS, 'lab'), path.join(dir, 'lab'), src => src !== examples && !src.startsWith(examples + path.sep));
  const manifest = JSON.parse(fs.readFileSync(path.join(examples, 'recorded.json'), 'utf8'));
  const shipped = manifest.examples;
  const outExamples = path.join(dir, 'lab', 'examples');
  fs.mkdirSync(outExamples, { recursive: true });
  const files = new Set(shipped.flatMap(ex => [ex.target, ex.thumb, ex.film.paths, ex.film.final, ...ex.film.frames, ...Object.values(ex.live??{}), ...Object.values(ex.checkpoints??{}).flat().flatMap(c=>[c.state,c.image])].filter(Boolean)));
  for (const file of files) {
    const dest = path.join(dir, 'lab', file);
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    fs.copyFileSync(path.join(DOCS, 'lab', file), dest);
  }
  fs.writeFileSync(path.join(outExamples, 'recorded.json'), JSON.stringify(manifest, null, 2));
  return shipped;
}

const LANDING = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>unpainting</title>
<meta name="description" content="A watercolor and ink painting simulator that runs in the browser.">
<style>
:root{--paper:#f6f3eb;--ink:#39362f;--muted:#6f665c;--accent:#99543a}
@media (prefers-color-scheme:dark){:root{--paper:#1f1d1a;--ink:#ece6da;--muted:#b3aa9c;--accent:#e09a78}}
body{margin:0;background:var(--paper);color:var(--ink);font:18px/1.5 Georgia,'Times New Roman',serif}
main{max-width:640px;margin:0 auto;padding:48px 16px}
h1{font-weight:500;font-size:2.4rem;margin:0 0 .5rem}
p{margin:0 0 1rem}
.open{display:inline-block;margin:.5rem 0 1.5rem;padding:10px 20px;border:1px solid var(--accent);border-radius:4px;color:var(--ink);text-decoration:none}
.open:hover{background:var(--accent);color:var(--paper)}
.gpu{font-size:.95rem;color:var(--muted)}
ul{padding-left:1.2rem}
a{color:inherit;text-underline-offset:.18em}
</style>
</head>
<body>
<main>
<h1>unpainting</h1>
<p>A watercolor and ink painting simulator. It turns a picture into a list of brush strokes, then paints them one at a time on simulated wet paper.</p>
<a class="open" href="painter/">Open the painter</a>
<p class="gpu" id="gpu">Checking for WebGPU…</p>
<ul>
<li><a href="https://github.com/sabj/unpainting">Source code on GitHub</a></li>
<li>Essays: <a href="https://samjackson.org/writing/whats-a-painting-anyway-part-1/">What's a Painting Anyway? Part 1</a> and <a href="https://samjackson.org/writing/whats-a-painting-anyway-part-2/">Part 2</a></li>
</ul>
</main>
<script>
(async () => {
  const note = document.getElementById('gpu');
  let adapter = null;
  try { adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null; } catch { adapter = null; }
  note.textContent = adapter
    ? 'This browser has WebGPU. The painter runs its physics on the GPU.'
    : 'This browser has no WebGPU. The painter still works, with its physics on the CPU, which is slower. Recent Chrome, Edge and Safari have WebGPU.';
})();
</script>
</body>
</html>
`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const shipped = painter();
fs.writeFileSync(path.join(OUT, 'index.html'), LANDING);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
let bytes = 0, files = 0;
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else { bytes += fs.statSync(p).size; files++; } } };
walk(OUT);
console.log(`${path.relative(process.cwd(), OUT) || OUT}: ${files} files, ${(bytes / 1024 / 1024).toFixed(2)} MB; examples: ${shipped.map(e => e.id + (e.film ? ' (film)' : '')).join(', ')}`);
