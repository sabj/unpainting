// node --test bench/scripts/tips.test.mjs   (part of npm run bench:test)
// The harness tips (bench/v3/TIPS.md): every picture it shows exists, every worked example has its script, its
// dried result, its stroke paths and its full-size cost, the examples paint a blank sheet only, and the kit keeps a film of a painting the Studio can play.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { BENCH, V2, loadCrops, loadLevelOneCrops } from './lib.mjs';

const REPO = path.resolve(BENCH, '..'), V3 = path.join(BENCH, 'v3'), TIPS = path.join(V3, 'tips');

test('TIPS.md shows only pictures that exist, and every example has its script, its result and (for the shapes) its arrows', () => {
  const text = fs.readFileSync(path.join(V3, 'TIPS.md'), 'utf8');
  const shown = [...text.matchAll(/!\[\]\((tips\/[^)]+)\)/g)].map(m => m[1]);
  for (const f of shown) assert.ok(fs.existsSync(path.join(V3, f)), f);
  const scripts = fs.readdirSync(TIPS).filter(f => /^\d+-.*\.mjs$/.test(f)), costs = JSON.parse(fs.readFileSync(path.join(TIPS, 'costs.json'), 'utf8'));
  assert.ok(scripts.length >= 10);
  for (const s of scripts) {
    const stem = s.replace(/\.mjs$/, ''), code = fs.readFileSync(path.join(TIPS, s), 'utf8');
    assert.ok(shown.includes(`tips/${stem}.png`) && shown.includes(`tips/${stem}-arrows.png`), `${stem} is shown, with its stroke paths`);
    // sized by the sheet, so it paints the same at any size, and painted at full size with its cost recorded
    assert.ok(/\b[WH] \* /.test(code), `${s} places its marks as shares of the sheet`);
    assert.ok(costs[stem]?.sheet?.[0] >= 1000 && Number.isInteger(costs[stem].waterSteps), `${stem} has its full-size cost in costs.json`);
    // a blank sheet only: no benchmark target is opened, read or named
    assert.deepEqual([...code.matchAll(/kit\.open\('([^']+)'/g)].map(m => m[1]), ['tips'], s);
    assert.ok(!/kit\.coarse|readFile|targets?\//.test(code), `${s} reads nothing`);
    // the kit moves the water: no example steps it or hooks into a stroke
    assert.ok(!/between:|kit\.step|kit\.dry\(|flowEvery/.test(code), `${s} leaves the water to the kit`);
    for (const c of [...loadCrops(), ...loadLevelOneCrops()]) assert.ok(!new RegExp(`\\b${c.task}\\b`).test(code), `${s} does not name ${c.task}`);
  }
  assert.match(fs.readFileSync(path.join(V3, 'BRIEF.md'), 'utf8'), /bench\/TIPS\.md/);
});

test('level 1 has its own targets, outside the public suite', () => {
  const mine = loadLevelOneCrops(), pub = new Set(loadCrops().map(c => c.task));
  assert.ok(mine.some(c => c.task === 'mittens-closeup-full') && mine.some(c => c.task === 'white-ships-full'));
  for (const c of mine) { assert.ok(!pub.has(c.task), `${c.task} is not a public crop`); for (const f of [c.file, c.coarseFile]) assert.ok(fs.existsSync(path.join(c.base, f)), f); }
});

test('the kit keeps a film of a painting: frames.json and lossless frames, ending on the finished sheet', async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'kitfilm-')), wb = path.join(ws, 'ws', 'bench');
  try {
    fs.mkdirSync(path.join(wb, 'tasks'), { recursive: true });
    fs.symlinkSync(path.join(REPO, 'src'), path.join(ws, 'ws', 'src')); fs.symlinkSync(path.join(REPO, 'tools'), path.join(ws, 'ws', 'tools')); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ws, 'ws', 'node_modules')); fs.copyFileSync(path.join(REPO, 'package.json'), path.join(ws, 'ws', 'package.json'));
    for (const f of ['kit.mjs', 'guard.mjs']) fs.copyFileSync(path.join(V2, 'kit', f), path.join(wb, f));
    fs.copyFileSync(path.join(V2, 'targets', 'sargent-coarse.json'), path.join(wb, 'tasks', 'sargent-coarse.json'));
    fs.writeFileSync(path.join(wb, 'p.mjs'), `import * as kit from './kit.mjs';
const { sheet, O } = await kit.open('sargent', { gpu: false });
const b = kit.createBrush({ radius: 8, bristles: 16, capacity: 60 });
for (let k = 0; k < 9; k++) { kit.dip(b, { water: 0.8, conc: kit.mix({ ultramarine: 0.3 }) }); kit.stroke(b, sheet, [{ x: 20, y: 20 + 12 * k, p: 0.8 }, { x: 200, y: 24 + 12 * k, p: 0.8 }]); }
kit.dryAll(sheet, O); await kit.finish('film');`);
    // the pen's ink is a named choice, by the session painter's names; anything else is refused before a sheet is made
    fs.writeFileSync(path.join(wb, 'i.mjs'), `import * as kit from './kit.mjs';\ntry { await kit.open('sargent', { gpu: false, ink: 'indian' }); console.log('OPENED'); } catch (e) { console.log(e.message); }\nconst { sheet } = await kit.open('sargent', { gpu: false, ink: 'waterproof' }); console.log('WATERPROOF ' + sheet.pigments.filter(p => p.omega === 60 && !/graphite/.test(p.name)).length); process.exit(0);`);
    const said = execFileSync(process.execPath, ['i.mjs'], { cwd: wb }).toString();
    assert.match(said, /ink must be "soluble"/); assert.ok(!said.includes('OPENED')); assert.match(said, /WATERPROOF 2/, 'the two inks, and only they, are set');
    execFileSync(process.execPath, ['p.mjs'], { cwd: wb, stdio: 'ignore' });
    const out = path.join(wb, 'out', 'sargent'), doc = JSON.parse(fs.readFileSync(path.join(out, 'film', 'frames.json'), 'utf8'));
    // the untouched paper; after strokes 2, 4, 6, 8; wet before the drying (after 9); dried; finished
    assert.deepEqual(doc.frames.map(f => [f.stage, f.strokes]), [['paper', 0], ['painting', 2], ['painting', 4], ['painting', 6], ['painting', 8], ['painting', 9], ['dried', 9], ['finished', 9]]);
    assert.deepEqual(doc.frames.map(f => f.src), doc.frames.map((_, i) => `f${String(i).padStart(4, '0')}.webp`));
    assert.deepEqual(fs.readdirSync(path.join(out, 'film')).sort(), [...doc.frames.map(f => f.src), 'frames.json'].sort(), 'nothing else is left in the folder');
    const last = await sharp(path.join(out, 'film', doc.frames.at(-1).src)).raw().toBuffer(), final = await sharp(path.join(out, 'final.png')).raw().toBuffer();
    assert.ok(last.equals(final), 'the last frame is the finished sheet, lossless');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'stats.json'), 'utf8')).film, { frames: 8, saved: 8 });
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
});
