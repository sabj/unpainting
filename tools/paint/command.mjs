// The one paint-plate command of a run, built from a resolved subject (subjects.mjs), the mode and this run's
// settings, and the plain block printed before it starts. Pure: no file is read or written here.

/** Options the harness sets itself; --set may not change them. */
const OWNED = new Set(['image', 'width', 'sheetmm', 'drawingfile', 'washplan', 'out', 'gpu', 'valuepreviewonly', 'allowdirty', 'thingmasks', 'things', 'paints']);
/** Heap for the painter (MB): a full sheet's plan does not fit node's default. */
const HEAP_MB = { plan: 13312, paint: 18432 };

/** The --washplan value of the registered studies: FILE:FLOOR@name=value,... coarse to fine. */
export function washPlanOf(studies) {
  return studies.map(s => `${s.abs}${s.floorMm2 != null ? `:${s.floorMm2}` : ''}${Object.entries(s.read).map(([k, v]) => `@${k}=${v}`).join('')}`).join(',');
}

/**
 * {cmd, args, env, argv (the paint-plate options alone), settings: [{name, value, default}], medium, heapMb}.
 * known: the painter's option names (scanOptions); script: {file, paints} when an author wrote the wash plan;
 * edit: {file} when an author edited the code planner's plan (the studies are read as always, then the edit applied);
 * dirty: the checkout has uncommitted changes (the painter refuses those unless told).
 */
export function buildCommand(spec, { mode, out, known, script = null, edit = null, dirty = false, segEnv = {} }) {
  const settings = [], opts = new Map(spec.options);
  const set = (name, value, why) => { const was = opts.get(name) ?? null; if (was !== value) settings.push({ name, value, default: was ?? '(painter default)', why }); if (value === null) opts.delete(name); else opts.set(name, value); };
  if ((opts.get('targetguard') ?? 'gentle') !== 'gentle') throw new Error(`subject ${spec.id}: the record asks for --targetguard ${opts.get('targetguard')}; this command paints in gentle mode only`);
  opts.set('targetguard', 'gentle');
  let heapMb = HEAP_MB[mode];
  for (const [k, v] of spec.otherSets) {
    if (k === 'heapmb') { if (!(Number(v) >= 1024)) throw new Error('--set heapmb: megabytes, 1024 or more'); heapMb = Number(v); settings.push({ name: 'heapmb', value: v, default: String(HEAP_MB[mode]) }); continue; }
    if (k === 'targetguard') throw new Error('--set targetguard: gentle mode stays on');
    if (OWNED.has(k)) throw new Error(`--set ${k}: the command sets this itself${k === 'gpu' || k === 'valuepreviewonly' ? ' (plan is the CPU plan, paint is the GPU painting)' : ''}`);
    if (known && !known.has(k)) throw new Error(`--set ${k}: neither a setting of this command nor a paint-plate option`);
    set(k, v === 'default' ? null : v);
  }
  if (mode === 'plan') { opts.set('gpu', 'off'); opts.set('valuepreviewonly', '1'); } else opts.set('gpu', 'on');
  if (script) { opts.set('paints', script.paints.join(',')); opts.set('paintsextend', '0'); }
  const masksRead = Boolean(spec.masks?.receipt && !script && known?.has('thingmasks'));
  const argv = [...opts].flatMap(([k, v]) => [`--${k}`, v]);
  argv.push('--washplan', script ? `script:${script.file}` : `${edit ? `edit:${edit.file},` : ''}${washPlanOf(spec.studies)}`, '--drawingfile', spec.drawing.abs);
  if (masksRead) argv.push('--thingmasks', spec.masks.receipt, ...(spec.masks.labels ? ['--things', spec.masks.labels] : []));
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
  row('sheet', `${sheet.widthMm}${sheet.heightMm ? ` x ${sheet.heightMm}` : ''} mm, ${sheet.cells}${sheet.rows ? ` x ${sheet.rows}` : ''} cells, ${sheet.cellMm} mm a cell`);
  row('drawing', `${drawing.stem}, ${drawing.medium}${drawing.pinned ? '' : ' (not the record\'s drawing; unpinned)'}`);
  studies.forEach((st, i) => row(`study ${i + 1}`, `${st.path}, ${st.role}, shapes from ${st.floorMm2 ?? '?'} mm2${Object.entries(st.read).map(([k, v]) => `, ${k} ${v}`).join('')}`));
  row('masks', masks.receipt ? `${masks.forms.length} named forms (${masks.forms.map(f => f.name).join(', ')}) from ${masks.receipt} (${masks.from === 'set' ? '--set masks' : 'the named-forms folder'}); ${masks.read ? 'given to the planner' : 'shown to the author and on the sheet: ' + masks.whyNotRead}` : `none (${masks.none})`);
  row('labels', s.labels ? `${s.labels}${s.labelCount ? `, ${s.labelCount} things` : ''}` : 'none');
  row('author', author.key === 'auto' ? 'the code planner alone (the control)' : author.cli === 'script' || author.cli === 'edit' ? author.label : author.work === 'session' ? `${author.name}${author.effort ? `, ${author.effort} effort` : ''} (${author.id}, through ${author.cli}): ${author.from ? 'what its earlier session handed over is painted; no model is called' : `a working session with a shell in its own folder, ${author.minutesMost} min of its own time, ${author.looksMost} looks (each a small real painting of its plan, dried); it starts from the code planner's plan`}` : `${author.name}${author.effort ? `, ${author.effort} effort` : ''} (${author.id}, one read-only reply through ${author.cli}): ${author.label}`);
  row('mode', `${run.mode === 'plan' ? 'plan only, CPU' : 'full painting, GPU'}; ${run.studiesMode === 'author' ? 'open tools (the author may brief and review its own studies)' : 'locked inputs'}; target guard gentle`);
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
