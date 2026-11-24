// The one paint-plate command of a run, built from a resolved subject (subjects.mjs), the mode and this run's
// settings, and the plain block printed before it starts. Pure: no file is read or written here.

import { SHEET_RULE } from './sheet-rule.mjs';

/** Options the harness sets itself; --set may not change them. */
const OWNED = new Set(['image', 'width', 'sheetmm', 'drawingfile', 'washplan', 'out', 'gpu', 'valuepreviewonly', 'allowdirty', 'thingmasks', 'things', 'planfile']);
/** Heap for the painter (MB): a full sheet's plan does not fit node's default. */
const HEAP_MB = { plan: 13312, paint: 18432 };

/** The --washplan value of the registered studies: FILE:FLOOR@name=value@name#FORM=value,... coarse to fine (#FORM: inside that named form only). */
export function washPlanOf(studies) {
  return studies.map(s => `${s.abs}${s.floorMm2 != null ? `:${s.floorMm2}` : ''}${Object.entries(s.read).map(([k, v]) => `@${k}=${v}`).join('')}${Object.entries(s.forms ?? {}).flatMap(([id, set]) => Object.entries(set).map(([k, v]) => `@${k}#${id}=${v}`)).join('')}`).join(',');
}

/** The pen's ink as a session or a command names it (`--set ink=...` on a command, `"ink": ...` beside a session's script) and the painter's --inkfast it stands for. */
const INK = Object.freeze({ waterproof: '1', soluble: '0', default: null });

/**
 * {cmd, args, env, argv (the paint-plate options alone), settings: [{name, value, default}], medium, heapMb}.
 * known: the painter's option names (scanOptions); script: {file, paints} when an author wrote the wash plan;
 * edit: {file} when an author edited the code planner's plan (the studies are read as always, then the edit applied);
 * dirty: the checkout has uncommitted changes (the painter refuses those unless told).
 * planOf: {file, paints} for a look painted from the final's own plan (src/paint/methods/plan-file.mjs): the plan's file
 * and its paints, which the look is mixed from as the final is.
 */
export function buildCommand(spec, { mode, out, known, script = null, edit = null, dirty = false, segEnv = {}, planOf = null }) {
  const settings = [], opts = new Map(spec.options);
  const set = (name, value, why) => { const was = opts.get(name) ?? null; if (was !== value) settings.push({ name, value, default: was ?? '(painter default)', why }); if (value === null) opts.delete(name); else opts.set(name, value); };
  if ((opts.get('targetguard') ?? 'gentle') !== 'gentle') throw new Error(`subject ${spec.id}: the record asks for --targetguard ${opts.get('targetguard')}; this command paints in gentle mode only`);
  opts.set('targetguard', 'gentle');
  let heapMb = HEAP_MB[mode];
  for (const [k, v] of spec.otherSets) {
    if (k === 'heapmb') { if (!(Number(v) >= 1024)) throw new Error('--set heapmb: megabytes, 1024 or more'); heapMb = Number(v); settings.push({ name: 'heapmb', value: v, default: String(HEAP_MB[mode]) }); continue; }
    // the pen's ink, by name: waterproof (set before the washes: a wash over it moves none) or soluble (it rewets and
    // bleeds into a wash; the painter stops a painting whose first wash moves more of it than its limit)
    if (k === 'ink') { if (!(v in INK)) throw new Error(`--set ink: ${Object.keys(INK).join(', ')} (got "${v}")`); set('inkfast', INK[v], `the pen's ink: ${v}`); continue; }
    if (k === 'targetguard') throw new Error('--set targetguard: gentle mode stays on');
    if (OWNED.has(k)) throw new Error(`--set ${k}: the command sets this itself${k === 'gpu' || k === 'valuepreviewonly' ? ' (plan makes the plan alone, paint the painting)' : ''}`);
    if (known && !known.has(k)) throw new Error(`--set ${k}: neither a setting of this command nor a paint-plate option`);
    set(k, v === 'default' ? null : v);
  }
  // the one-area rule sizes the sheet by paper, not by the file: a file with fewer pixels across than the sheet has
  // cells is painted enlarged, and the run states by how much (the painter stops on an unstated enlargement)
  const enlarged = spec.sheet.rule === SHEET_RULE && spec.source.px?.[0] > 0 ? spec.sheet.cells / spec.source.px[0] : 0;
  if (enlarged > 1 && !opts.has('sourcescale')) set('sourcescale', String(Math.ceil(enlarged * 100) / 100), `the standard sheet is ${spec.sheet.cells} cells across and the file ${spec.source.px[0]} px: the file is enlarged, as the one-area rule allows`);
  if (mode === 'plan') { opts.set('gpu', 'off'); opts.set('valuepreviewonly', '1'); } else opts.set('gpu', 'on');
  if (script) { opts.set('paints', script.paints.join(',')); opts.set('paintsextend', '0'); }
  // a script's first washes are broad and wet: over a pen drawing they lift ink that still rewets (the painter stops: "the
  // first wash moved N% of the pen's ink"), so a script is laid over ink that was set first, as pen and wash is done
  if (script && !opts.has('inkfast')) opts.set('inkfast', '1');
  if (planOf) { if (script) throw new Error('a look at a script is planned from the script, not from a plan file'); opts.set('paints', planOf.paints.join(',')); opts.set('paintsextend', '0'); opts.set('planfile', planOf.file); }
  const masksRead = Boolean(spec.masks?.receipt && !script && known?.has('thingmasks'));
  const argv = [...opts].flatMap(([k, v]) => [`--${k}`, v]);
  argv.push('--washplan', script ? `script:${script.file}` : `${edit ? `edit:${edit.file},` : ''}${washPlanOf(spec.studies)}`, '--drawingfile', spec.drawing.abs);
  // a script's run reads no forms in its plan, but its drawing does (a pencil lay-in keeps a face's named features)
  if (masksRead || (script && spec.masks?.receipt && known?.has('thingmasks'))) argv.push('--thingmasks', spec.masks.receipt, ...(spec.masks.labels ? ['--things', spec.masks.labels] : []));
  argv.push('--image', spec.source.abs, '--width', String(spec.sheet.cells), '--sheetmm', String(spec.sheet.widthMm), '--out', out);
  if (dirty) argv.push('--allowdirty', '1');
  const line = opts.get('outlinemedium') ?? 'graphite';
  return {
    cmd: 'node', args: [`--max-old-space-size=${heapMb}`, 'tools/paint-plate.mjs', ...argv], argv, env: segEnv, settings, heapMb, masksRead,
    medium: `${line === 'ink' ? 'ink' : line === 'graphite' ? 'pencil (graphite)' : line}${opts.get('inkrecipe') ? `, ink recipe ${opts.get('inkrecipe')}` : ''}`,
  };
}

const quote = s => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);
/** The command as one shell line, environment first. */
export function shellLine(c) {
  return [...Object.entries(c.env).map(([k, v]) => `${k}=${quote(v)}`), c.cmd, ...c.args.map(quote)].join(' ');
}

/** The block printed before a run, as lines. `run` is the record written to run.json (cli.mjs). */
export function describeRun(run) {
  const { subject: s, sheet, drawing, studies, masks, author, code } = run, L = [];
  const row = (k, v) => L.push(`${(k + ':').padEnd(10)}${v}`);
  row('subject', `${s.id} (${s.name})${s.variant ? `, variant "${s.variant}": ${s.variantWhy ?? ''}` : ''}`);
  row('source', `${s.source}${s.sourcePx ? `, ${s.sourcePx.join(' x ')} px` : ''}`);
  row('sheet', `${sheet.widthMm}${sheet.heightMm ? ` x ${sheet.heightMm}` : ''} mm, ${sheet.cells}${sheet.rows ? ` x ${sheet.rows}` : ''} cells, ${sheet.cellMm} mm a cell${sheet.rule ? `; ${sheet.rule === SHEET_RULE ? 'the standard area (a quarter sheet) in the picture\'s proportions' : sheet.rule}` : ''}`);
  row('drawing', `${drawing.stem}, ${drawing.medium}${drawing.pinned ? '' : ' (not the record\'s drawing; unpinned)'}`);
  studies.forEach((st, i) => row(`study ${i + 1}`, `${st.path}, ${st.role}, shapes from ${st.floorMm2 ?? '?'} mm2${Object.entries(st.read).map(([k, v]) => `, ${k} ${v}`).join('')}`));
  row('masks', masks.receipt ? `${masks.forms.length} named forms (${masks.forms.map(f => f.name).join(', ')}) from ${masks.receipt} (${masks.from === 'set' ? '--set masks' : 'the named-forms folder'}); ${masks.read ? 'given to the planner' : 'shown to the author and on the sheet: ' + masks.whyNotRead}` : `none (${masks.none})`);
  row('labels', s.labels ? `${s.labels}${s.labelCount ? `, ${s.labelCount} things` : ''}` : 'none');
  row('author', author.key === 'auto' ? 'the code planner alone (the control)' : ['script', 'edit', 'choice'].includes(author.cli) ? author.label : author.work === 'rounds' ? `${author.name}${author.effort ? `, ${author.effort} effort` : ''} (${author.id ?? 'no model'}, through ${author.cli}): fixed rounds at level ${author.level}, no shell and no tools; look budget ${author.looksMost} units` : author.work === 'session' ? `${author.name}${author.effort ? `, ${author.effort} effort` : ''} (${author.id}, through ${author.cli}): ${author.from ? 'what its earlier session handed over is painted; no model is called' : `a working session with a shell in its own folder, level ${author.level ?? 'L2'}, try ${author.tryNumber ?? 1}; the benchmark's budget for the try: ${author.budget?.looks ?? '?'} rendering units (looks, each a small real painting of its plan, dried), ${author.budget?.steps ?? '?'} steps, a safety stop at ${author.budget?.safetyMinutes ?? '?'} min, ${author.budget?.reverts ?? '?'} returns to an earlier choice; its work is measured, not capped; ${(author.level ?? 'L2') === 'L4' ? 'it gets the code planner\'s inputs and the studies\' traced shapes, nothing of Auto, and hands in its own script' : 'it gets the code planner\'s inputs, not its plan, and hands in its own script'}`}` : `${author.name}${author.effort ? `, ${author.effort} effort` : ''} (${author.id}, one read-only reply through ${author.cli}): ${author.label}`);
  row('mode', `${run.mode === 'plan' ? 'plan preview, not painted' : 'full painting'}; ${run.studiesMode === 'author' ? 'open tools (the author may brief and review its own studies)' : 'locked inputs'}; target guard gentle`);
  if (s.deviations.length) for (const d of s.deviations) row('DIFFERS', `${d.what}: ${d.now} (the record: ${d.record})`);
  if (run.settings.length) for (const d of run.settings) row('setting', `${d.name} = ${d.value ?? 'painter default'} (default ${d.default})`);
  else row('settings', 'all at their defaults');
  for (const [k, v] of Object.entries(run.switches)) row('SWITCH', `${k}=${v} (experiment switch in the environment)`);
  row('commit', `${code.commit ? code.commit.slice(0, 8) : 'none'}${code.dirty ? ` plus uncommitted changes (${code.tracked.length} tracked, ${code.untracked.length} new files)` : ', clean'}`);
  row('out', run.out);
  row('command', run.command);
  return L;
}

/** A run folder name safe on disk. */
export function runFolder(subject, author) { return `${subject.variant ? `${subject.id}-${subject.variant}` : subject.id}--${author}`.replace(/[^A-Za-z0-9._-]/g, '_'); }
