#!/usr/bin/env node
// A level 1 target for a registered benchmark picture (bench/v3/crops.json): the picture at the standard sheet's cells
// (tools/paint/sheet-rule.mjs: a quarter sheet's area in the picture's proportions, 0.26 mm a cell, one cell a target
// pixel), its coarse map, its credit, and its rendering unit for the runaway guard. Level 1 needs nothing else of a
// picture. The run sets file (bench/run-sets.json "levelOne") is pointed at it.
//   node bench/scripts/add-level-one-target.mjs <subject id> --name <Name> --style <style: what is in it> \
//     --source <credit> --licence <licence> [--medium pen|pencil|none] [--unit <prepared.json>] [--task <id>-full]
//   node bench/scripts/add-level-one-target.mjs <subject id> --unit <prepared.json>     (an existing target: its unit only)
// The picture is the subject's registered source (SUBJECTS.json: $UNPAINT_SUBJECTS), checked against its sha256; it is
// brought down to the sheet's cells and never enlarged. --medium defaults to the registry's class of the line.
// --unit: the prepared folder's prepared.json of this subject (npm run paint -- <id> prepare): the sweeps, dryings and
// water steps of one full look of the automatic plan. Without a unit the target is written and level 1 refuses to run
// it (it would have no runaway guard).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { pathToFileURL } from 'node:url';
import { BENCH, readJson, writeJson } from './lib.mjs';
import { coarseMap } from './add-target.mjs';
import { standardSheet, SHEET_RULE } from '../../tools/paint/sheet-rule.mjs';
import { loadRegistry } from '../../tools/paint/subjects.mjs';

const MEDIUM = { ink: 'pen', pencil: 'pencil', none: 'pencil' };   // the kit's `medium` of a target: the pen only where the picture is pen-led

/** A prepared folder's record as a target's unit: {sweeps, dryings, waterSteps, from, cellsAcross}. */
export function unitFrom(prepared, id) {
  const u = prepared.unit ?? {}, sid = prepared.subject?.id;
  if (sid !== id) throw new Error(`--unit: that prepared folder is of ${sid ?? 'no named subject'}, not ${id}`);
  if (!(u.waterSteps > 0) || !(u.planWork?.sweeps > 0)) throw new Error('--unit: the prepared record has no counted look of the automatic plan (unit.waterSteps, unit.planWork)');
  return { sweeps: u.planWork.sweeps, dryings: u.planWork.dryings ?? 0, waterSteps: u.waterSteps,
    from: `prepared ${id} at ${String(prepared.commit ?? 'an unnamed commit').slice(0, 8)}: one full look of the automatic plan, ${u.cells} cells across`, cellsAcross: u.cells ?? null };
}

/**
 * Write (or complete) the level 1 target of subject `id`. root: the bench folder (a copy in tests). Returns the
 * crops.json entry. An existing target is only given its unit; its picture is never rewritten.
 */
export async function addLevelOneTarget({ id, registry, task = `${id}-full`, name, style, medium = null, source, licence, unit = null, root = BENCH }) {
  const cropsFile = path.join(root, 'v3', 'crops.json'), setsFile = path.join(root, 'run-sets.json');
  const spec = readJson(cropsFile), sets = readJson(setsFile), has = spec.crops.find(c => c.task === task);
  const picture = sets.pictures.find(p => p.id === id);
  if (!picture) throw new Error(`${id} is not one of the benchmark's pictures (bench/run-sets.json)`);
  let entry;
  if (has) {
    if (!unit) throw new Error(`level 1 target ${task} already exists; give --unit to set its rendering unit`);
    entry = { ...has, unit };
  } else {
    const rec = registry.subjects.find(s => s.id === id);
    if (!rec) throw new Error(`subject ${id} is not in the registry ${registry.file}`);
    for (const [k, v] of Object.entries({ name, style, source, licence })) if (!v) throw new Error(`--${k} is required`);
    const file = path.resolve(registry.base, rec.source.path);
    if (!fs.existsSync(file)) throw new Error(`${id}: its source picture ${rec.source.path} is not beside the registry`);
    const bytes = fs.readFileSync(file), sha = crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha !== rec.source.sha256) throw new Error(`${id}: the source picture is not the registered one (sha256 ${sha.slice(0, 12)}, registered ${String(rec.source.sha256).slice(0, 12)})`);
    const meta = await sharp(bytes).rotate().metadata(), sheet = standardSheet([meta.width, meta.height]);
    if (sheet.cells > meta.width) throw new Error(`${id}: the picture is ${meta.width} px wide and the standard sheet ${sheet.cells} cells: a target is never enlarged. Register a larger file`);
    const buf = await sharp(bytes).rotate().removeAlpha().resize({ width: sheet.cells, height: sheet.rows, fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const map = coarseMap(task, data, info.width, info.height);
    fs.mkdirSync(path.join(root, 'v3', 'targets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'v3', 'targets', `${task}.png`), buf);
    writeJson(path.join(root, 'v3', 'targets', `${task}-coarse.json`), map);
    entry = { task, name, width: info.width, height: info.height, coarse: { cols: map.cols, rows: map.rows }, style, medium: medium ?? MEDIUM[rec.class?.value] ?? 'pencil', source,
      distributed: true, file: `targets/${task}.png`, coarseFile: `targets/${task}-coarse.json`, licence,
      subject: { id, sourceSha256: sha, sourcePx: [meta.width, meta.height], sheet: { rule: SHEET_RULE, widthMm: sheet.widthMm, heightMm: sheet.heightMm, cellMm: sheet.cellMm } },
      ...(unit ? { unit } : {}) };
  }
  writeJson(cropsFile, { ...spec, crops: has ? spec.crops.map(c => (c.task === task ? entry : c)) : [...spec.crops, entry] });
  // the run sets file keeps its layout (one picture a line): only this picture's "levelOne" is rewritten
  const text = fs.readFileSync(setsFile, 'utf8'), line = new RegExp(`("id": ${JSON.stringify(id).replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')},[^\n]*?"levelOne": )(null|"[^"]*")`);
  if (line.test(text)) fs.writeFileSync(setsFile, text.replace(line, (_, a) => a + JSON.stringify(task)));
  else writeJson(setsFile, { ...sets, pictures: sets.pictures.map(p => (p.id === id ? { ...p, levelOne: task } : p)) });
  return entry;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const id = argv[0];
    if (!id || id.startsWith('--')) throw new Error('usage: add-level-one-target.mjs <subject id> --name <Name> --style <style> --source <credit> --licence <licence> [--medium pen|pencil|none] [--unit <prepared.json>]');
    const unit = opt('unit') ? unitFrom(readJson(opt('unit')), id) : null;
    const e = await addLevelOneTarget({ id, registry: loadRegistry(), task: opt('task'), name: opt('name'), style: opt('style'), medium: opt('medium') ?? null, source: opt('source'), licence: opt('licence'), unit });
    console.log(`level 1 target ${e.task}: ${e.width} x ${e.height} cells${e.unit ? `, unit ${e.unit.waterSteps} water steps` : ', NO UNIT YET: level 1 will not run it until its Auto is prepared and --unit is given'}`);
  } catch (e) { console.error(`add-level-one-target: ${e.message}`); process.exit(2); }
}
