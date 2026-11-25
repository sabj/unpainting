// The drawing medium, decided from what declares it. Pure: no I/O.
//   1. --subjectmedium on the command line is an explicit override.
//   2. A plan that declares a medium wins: drawing.medium, or a style selection of ink-and-wash or urban-sketch (global or
//      on one region). Free-text reasons are never read.
//   3. With no declaration the painter lays graphite and no ink. An ink request on the command line (--outlinemedium
//      ink or auto, --inkrecipe wash, an ink stage) is honoured only when the source shows pen line at
//      --penfirst per cent or more; below that it is removed, and the washes are not touched by ink flags (subject-medium.mjs).
// The pen share is evidence for that veto. It never switches ink on.
//   0. A prepared drawing file (--drawingfile of inputKind drawing) declares its own medium (the file's `medium`, else
//      --outlinemedium): that is the medium, and the pen share is not consulted. A plan or --subjectmedium naming another
//      medium stops the run.
import { subjectMediumOf } from './../subject-medium.mjs';

/** The plan styles that declare a pen drawing. */
export const INK_STYLES = Object.freeze(['ink-and-wash', 'urban-sketch']);
const INK_STAGE_WORDS = ['prepink', 'finishink'];
const isGraphite = v => v === 'graphite' || /^graphite-/.test(String(v));

const last = (argv, name) => { const at = argv.lastIndexOf(name); return at >= 0 ? argv[at + 1] : undefined; };

/** The styles a plan's style selection names, the global one first. */
function planStyles(plan) {
  const s = plan?.styleSelection;
  if (!s || typeof s !== 'object') return [];
  return [s.style, ...Object.values(s.regions && typeof s.regions === 'object' ? s.regions : {}).map(r => r?.style)].filter(v => typeof v === 'string');
}

/**
 * What a plan declares: { medium: 'ink' | 'graphite' | 'none' | null, by, styles }. A drawing medium of graphite, none or
 * ink is the plan's word. A drawing medium of auto or none given leaves the style selection to declare ink.
 */
export function planDeclaration(plan) {
  const styles = planStyles(plan), d = plan?.drawing;
  const m = d && typeof d === 'object' ? d.medium : undefined;
  if (m === 'none') return { medium: 'none', by: 'drawing.medium', styles };
  if (isGraphite(m)) return { medium: 'graphite', by: 'drawing.medium', styles };
  if (m === 'ink') return { medium: 'ink', by: 'drawing.medium', styles };
  const stages = d && typeof d === 'object' && d.stages && typeof d.stages === 'object' ? d.stages : {};
  if (stages.prepInk || stages.finishInk) return { medium: 'ink', by: 'drawing.stages', styles };
  if (styles.some(s => INK_STYLES.includes(s))) return { medium: 'ink', by: 'style', styles };
  return { medium: null, by: null, styles };
}

/** The command-line options that ask for ink, as written ('--outlinemedium ink'). Empty when none does. */
export function inkRequestedBy(argv) {
  const out = [];
  const outline = last(argv, '--outlinemedium');
  if (outline !== undefined && outline !== 'none' && !isGraphite(outline)) out.push(`--outlinemedium ${outline}`);
  if (last(argv, '--inkrecipe') === 'wash') out.push('--inkrecipe wash');
  const stages = String(last(argv, '--stages') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(s => INK_STAGE_WORDS.includes(s));
  for (const s of stages) out.push(`--stages ${s}`);
  return out;
}

/**
 * @param {{ argv: string[], plan: object|null, penSharePct: number|null, penFirstPct: number }} input penSharePct is the
 *   source's pen-line share in per cent (pen-share.mjs); it is read only when an ink request has no plan declaration.
 * @returns {{ medium: 'pen'|'pencil', basis: 'flag'|'plan'|'source'|'default', vetoed: boolean, addArgs: string[],
 *   subjectMedium: string|null, evidence: object, note: string }} subjectMedium is what to hand to expandRecipe for a
 *   graphite subject, so no ink option or closing file survives and no ink flag can reach the washes; addArgs are the flags
 *   a declared style adds.
 */
export function decideMedium({ argv, plan, penSharePct = null, penFirstPct, drawing = null }) {
  const declared = planDeclaration(plan), requested = inkRequestedBy(argv), flag = subjectMediumOf(argv);
  const evidence = {
    planDeclared: declared.medium ? `${declared.medium} (${declared.by})` : null, planStyles: declared.styles,
    inkRequestedBy: requested, penSharePct: Number.isFinite(penSharePct) ? penSharePct : null, penFirstPct,
    preparedDrawing: drawing ? `${drawing.medium} (${drawing.from})` : null,
  };
  const out = (medium, basis, { vetoed = false, addArgs = [], note }) => ({ medium, basis, vetoed, addArgs, subjectMedium: medium === 'pencil' && basis !== 'flag' ? 'pencil' : null, evidence, note: `medium ${medium}: ${note}` });
  if (drawing) {
    const medium = drawing.medium === 'ink' ? 'pen' : drawing.medium === 'pencil' || isGraphite(drawing.medium) ? 'pencil' : null;
    if (!medium) throw new Error(`medium decision: the prepared drawing ${drawing.file} declares no medium (ink or pencil): give it a "medium" or pass --outlinemedium`);
    const planMedium = declared.medium === 'ink' ? 'pen' : declared.medium === 'graphite' ? 'pencil' : null;
    if (planMedium && planMedium !== medium) throw new Error(`medium decision: the prepared drawing ${drawing.file} is ${drawing.medium} (${drawing.from}) but the plan declares ${declared.medium} (${declared.by})`);
    if (flag && (flag === 'pen' ? 'pen' : 'pencil') !== medium) throw new Error(`medium decision: the prepared drawing ${drawing.file} is ${drawing.medium} (${drawing.from}) but --subjectmedium is ${flag}`);
    return { ...out(medium, 'drawing', { note: `the prepared drawing ${drawing.file} is ${drawing.medium} (${drawing.from}); the source's pen share is not consulted` }), subjectMedium: medium === 'pencil' ? 'pencil' : null };
  }
  if (flag) return out(flag === 'pen' ? 'pen' : 'pencil', 'flag', { note: `--subjectmedium ${flag} given on the command line` });
  if (declared.medium === 'ink') {
    const addArgs = declared.by === 'style' && !argv.includes('--outlinemedium') ? ['--outlinemedium', 'ink'] : [];
    return out('pen', 'plan', { addArgs, note: `the plan declares ink (${declared.by})` });
  }
  if (declared.medium) {
    return out('pencil', 'plan', { vetoed: requested.length > 0, note: `the plan declares ${declared.medium} (${declared.by})${requested.length ? `; ${requested.join(', ')} is removed` : ''}` });
  }
  if (!requested.length) return out('pencil', 'default', { note: 'no plan declares a medium and no ink is asked for, so the drawing is graphite' });
  if (!Number.isFinite(penSharePct)) throw new Error(`medium decision: ${requested.join(', ')} asks for ink and no plan declares it, so the source's pen share is needed and was not measured`);
  const pen = penSharePct >= penFirstPct;
  const share = `pen share ${penSharePct.toFixed(2)}%`;
  return out(pen ? 'pen' : 'pencil', 'source', { vetoed: !pen, note: pen
    ? `no plan declares a medium; ${requested.join(', ')} asks for ink and the ${share} is at least ${penFirstPct}%`
    : `no plan declares a medium; ${requested.join(', ')} asks for ink but the ${share} is under ${penFirstPct}%, so ink is removed and the drawing is graphite` });
}

/**
 * The command line with its ink requests turned into the graphite drawing: the outline medium becomes graphite, the wash
 * recipe, the ink stages and the closing file go. Pen-only options such as --washinkfree go with --subjectmedium pencil
 * (subject-medium.mjs).
 */
export function argvWithoutInk(argv) {
  const out = [];
  for (let i = 0; i < argv.length;) {
    const key = argv[i++], value = i < argv.length && !argv[i].startsWith('--') ? argv[i++] : undefined;
    if (key === '--outlinemedium' && value !== undefined && value !== 'none' && !isGraphite(value)) { out.push(key, 'graphite'); continue; }
    if (key === '--inkrecipe' && value === 'wash') continue;
    if (key === '--drawinglast') continue;
    if (key === '--stages' && value !== undefined) {
      const keep = value.split(',').filter(s => !INK_STAGE_WORDS.includes(s.trim().toLowerCase()));
      if (keep.length) out.push(key, keep.join(','));
      continue;
    }
    out.push(key, ...(value === undefined ? [] : [value]));
  }
  return out;
}
