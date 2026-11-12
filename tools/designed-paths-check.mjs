#!/usr/bin/env node
// A finished run must prove its required designed paths. No flag alone proves execution.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const registryFile = fileURLToPath(new URL('../bench/designed-paths.json', import.meta.url));
const read = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const options = args => { const m = new Map(); for (let i = 0; i < (args?.length ?? 0); i++) if (String(args[i]).startsWith('--')) m.set(args[i].slice(2), args[i + 1]); return m; };

export function checkDesignedPaths(folder, { registry = read(registryFile), logFiles = [] } = {}) {
  if (!registry || registry.paths?.length !== 23 || registry.paths.map(r => r.row).sort((a,b) => a-b).some((row,i) => row !== i+1)) throw Error('designed-paths registry must name all 23 rows exactly once');
  const card = read(path.join(folder, 'run-card.json'));
  const logs = [...new Set([path.join(folder, 'paint.log'), `${folder}.log`, path.join(folder, 'remote/paint.log'), ...logFiles])];
  const lines = logs.flatMap(f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').map((text, i) => ({ text, evidence: `${f}:${i + 1}: ${text}` })) : []);
  const line = re => lines.find(l => re.test(l.text))?.evidence;
  const opts = options(card?.expandedArgs ?? card?.args);
  const jsonEvidence = (file, test, show = d => d) => { const d = read(path.join(folder, file)); return d && test(d) ? `${file}: ${JSON.stringify(show(d)).slice(0, 640)}` : null; };
  const checks = {
    'subject-medium': () => jsonEvidence('run-card.json', c => ['none', 'pencil'].includes(options(c.args).get('subjectmedium')) && c.drawing?.medium !== 'ink', c => ({ subjectMedium: options(c.args).get('subjectmedium'), drawingMedium: c.drawing?.medium })),
    'small-marks': () => opts.get('washjoin') === '1' && line(/^small marks: \d+ small lights reserved, \d+ small darks laid once, last/),
    'wash-rules': () => jsonEvidence('pipeline-plan.json', d => d.plan?.washes?.colour && opts.get('huechroma') === '30' && opts.get('lightfamilies') === '1', d => ({ washes: d.plan.washes, huechroma: opts.get('huechroma'), lightfamilies: opts.get('lightfamilies') })),
    'brush-lanes': () => jsonEvidence('designed-execution.json', d => d.laneStrokes > 0 || d.brushChoiceStrokes > 0),
    'linked-drawing-stages': () => jsonEvidence('linework.json', d => d.stages != null) && line(/^(prep stage:|drawing stages:|opening stage:|closing stage:)/),
    'linework-stage': () => jsonEvidence('linework-stage.json', d => d != null),
    'paper-state-checks': () => jsonEvidence('run-card.json', c => c.continuedChecks?.strict === true && c.continuedChecks.total === 0, c => c.continuedChecks),
    'stroke-gate': () => jsonEvidence('stroke-gate.json', d => d.status !== 'unverified' && Array.isArray(d.flags)),
    'graded-washes': () => line(/^graded washes: [1-9]\d* soft passages/),
    'dry-brush-laid': () => line(/^techniques:.*dry brush [1-9]\d*/),
    'drawing-hand-joins': () => line(/^drawing hand: \d+ reviewed lines, [1-9]\d* joins/),
    'final-darks': () => jsonEvidence('step-backs.json', d => d.taken?.some?.(x => x.id === 'accents')),
    'ink-model-lines': () => jsonEvidence('linework.json', d => /model|lineart/.test(d.extractor ?? '')) && jsonEvidence('ink-labels.json', () => true),
  };
  const rows = registry.paths.map(r => {
    let applicable = !([4,7,17].includes(r.row) && opts.has('areaplan'));
    if (r.row === 3) applicable = ['none', 'pencil'].includes(opts.get('subjectmedium')) || ['none', 'pencil'].includes(card?.drawing?.subjectMedium?.medium);
    if (r.row === 17) applicable = opts.get('brushchoice') === '1' || opts.get('strokeplan') === '1' || read(path.join(folder, 'designed-execution.json'))?.plannedStyle === 'ink-and-wash';
    if ([11,12].includes(r.row)) applicable = card?.drawing?.medium === 'ink' && card?.drawing?.order !== 'none';
    const evidence = card ? checks[r.check ?? r.id]?.() : null;
    const ran = Boolean(evidence);
    return { row: r.row, id: r.id, required: r.required, applicable, status: ran ? 'RAN' : 'DID NOT RUN', evidence: evidence || (!card ? 'run-card.json missing or invalid' : !applicable ? 'not applicable to this run' : r.required ? 'required execution evidence absent' : `not yet on (row ${r.row}): ${r.reason ?? r.why ?? 'no execution evidence'}`) };
  });
  return { ok: Boolean(card) && rows.every(r => !r.required || !r.applicable || r.status === 'RAN'), rows };
}

export function reportDesignedPaths(folder, options = {}) {
  const result = checkDesignedPaths(folder, options);
  const text = result.rows.map(r => `${r.row}. ${r.id}: ${r.status} [${r.required ? 'required' : 'not yet on'}${r.applicable ? '' : '; not applicable'}] — ${r.evidence}`).join('\n') + '\n';
  fs.writeFileSync(path.join(folder, 'designed-paths-check.txt'), text);
  fs.writeFileSync(path.join(folder, 'designed-paths-check.json'), JSON.stringify(result, null, 2) + '\n');
  return { ...result, text };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const folder = process.argv[2];
    if (!folder) throw Error('usage: node tools/designed-paths-check.mjs <finished-run-folder> [--log <file>]');
    const at = process.argv.indexOf('--log');
    const result = reportDesignedPaths(path.resolve(folder), { logFiles: at < 0 ? [] : [process.argv[at + 1]] });
    process.stdout.write(result.text);
    process.exitCode = result.ok ? 0 : 4;
  } catch (e) { console.error(`designed paths: ${e.message}`); process.exitCode = 4; }
}
