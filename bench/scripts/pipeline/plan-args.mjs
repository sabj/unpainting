// The painter command for a V4 or V5 plan, and the checks on it. A plan is the model's files in one folder:
// config.json (regions, reserves, styles), drawing paths (*-lines.json), extra-args.json (painter settings), and
// variant.txt (recipe tokens). The painter is tools/paint-plate.mjs with no recipe of its own (--recipe none): every
// setting comes from the fixed template below, the base recipe tokens (BASE) and the plan, in that order.
//
// Layering: a model token replaces the base token in the same slot (_lay2 replaces _lay4), and the base's sepia ink
// yields to a plan drawn in another ink. Every subject gets the same base; no token applies to one subject only.
// Settings the plan asks for that the painter never reads are noted against the painting (renderVerdict), and fail it
// under --strict-verdict. Base settings a subject has no use for are never noted.
//
// This file is copied into the model's worktree as bench/plan-args.mjs, so it imports only Node built-ins and
// copy.mjs, which is copied beside it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { lineSources } from './copy.mjs';

// tv8 was dropped in 0.3.1: texture variety acts only on dry-brush texture passages, which are never planned.
// Removed in 0.3.3 with the rules they set, all fitted on Trumbull: the stone-block, ground-glaze, recess and lit-stone
// tokens (blk, bka, bmm, birr, bvar, bcl, rg, rec2, rec2x, rcl, rac, rx, lw, lit), the palette tokens (pwarm, pgold,
// pgreen, pbs, rv) and the Trumbull-only paint box, and the fitted sky-lane radius and step (6 mm, .8) and sky mottle
// (.5) of the base, which made _slane (sky lanes at the painter's own radius) a token of its own. A plan that names a
// removed token gets the unknown-token problem.
// _sg (--stylegain) and _tp (--touchgain) are not model-settable: a gain that covers an engine error is a calibration, not a
// painter's choice (docs/honesty.md). The two touch-up rounds the base always had stay a fixed painter setting below; the
// touch-up gain is the painter's own default.
export const BASE = 'region_w13_lay4_sky3_skyb_cpp';
const DEFAULT_VARIANT = 'region_w13';
const LINES = name => `${name}-lines.json`;

const m = (v, re) => v.match(re);
const tenth = (v, re) => String(Number(m(v, re)[1]) / 10);
const hundredth = (v, re) => String(Number(m(v, re)[1]) / 100);

/**
 * The paint-plate command for a variant, as [script, --option, value, ...]. ctx: {planDir, target, width, sheetmm,
 * out, compile, gpu, linesExist}. The regular expressions are the recipe tokens; bench/v4v5/TOKENS.md lists them.
 */
export function argsBuilder({ planDir, target, width, sheetmm, out = 'out', compile = false, gpu = 'auto', targetPixels = [1, 1], linesExist = () => true, outlineMedium = 'auto' }) {
  return v => {
    const shaped = v.startsWith('region_w13') || v.startsWith('region_w15');
    const opening = /_opk/.test(v) ? 'closingink' : 'opening';
    const closing = (/_ink4/.test(v) ? ['closingink4', 'closing'] : /_ink[23]/.test(v) ? ['closingink', 'closing'] : ['closing']).find(f => linesExist(f));
    const t = (re, flags) => (re.test(v) ? flags() : []);
    return ['tools/paint-plate.mjs', '--recipe', 'none', '--inkrecipe', 'v2', '--image', target, '--width', String(width), '--scale', '1', '--sheetmm', String(sheetmm), '--palettewide', '1',
      '--physical', '1', '--paperbase', /_cur/.test(v) ? 'white' : 'source', '--loadedcontact', '1', '--order', 'painter', '--valueplan', path.join(planDir, 'config.json'),
      '--brushchoice', v.startsWith('region_w15') ? '1' : '0', '--shapedmarks', shaped ? '1' : '0',
      ...t(/_onedom/, () => ['--middomain', '0']), ...t(/_nest/, () => ['--nestedmid', '1']), ...t(/_lay(\d)/, () => ['--midlayers', m(v, /_lay(\d)/)[1]]),
      ...t(/_lf/, () => ['--loadfeather', '1.5']),
      ...t(/_ls(\d+)/, () => ['--layersmooth', tenth(v, /_ls(\d+)/)]),
      ...t(/_acc(\d+)/, () => ['--accentshare', tenth(v, /_acc(\d+)/)]), ...t(/_lt/, () => ['--layertexture', '1']),
      ...(/_cur/.test(v) ? ['--paperlights', '1'] : /_relonly/.test(v) ? ['--paperrel', '1'] : ['--paperrel', '1', '--paperlights', '1']),
      ...(/_cur/.test(v) ? ['--paperrgb', '252,251,248'] : /_relonly/.test(v) ? [] : ['--paperrgb', 'auto']),
      ...(/_noslane/.test(v) ? [] : ['--skylanes', '1']),
      ...t(/_st(\d+)/, () => ['--shadowthresh', hundredth(v, /_st(\d+)/)]),
      ...t(/_shw(\d+)/, () => ['--shadowwater', hundredth(v, /_shw(\d+)/)]),
      ...t(/_dkf/, () => ['--darkfirst', '1']),
      ...t(/_ms(\d+)/, () => ['--minshapecells', m(v, /_ms(\d+)/)[1]]),
      ...t(/_tv(\d+)/, () => ['--texvariety', tenth(v, /_tv(\d+)/)]),
      ...t(/_skyb/, () => ['--skyblue', '1']), ...t(/_cpp/, () => ['--paper', 'coldpress']),
      ...t(/_tfl(\d+)/, () => ['--texflow', tenth(v, /_tfl(\d+)/)]),
      ...t(/_novar/, () => ['--physics', 'filmDiffuse=0']), ...t(/_sk1/, () => ['--skyonelayer', '1']),
      ...t(/_fs60/, () => ['--fastsettle', '60']), ...t(/_fl0/, () => ['--feedbacklag', '0']),
      '--touchpoints', '2',
      ...t(/_spl(\d*)/, () => ['--strokeplan', '1', '--lanemm', m(v, /_spl(\d*)/)[1] || '6']), ...t(/_sml(\d+)/, () => ['--strokemm', m(v, /_sml(\d+)/)[1]]),
      ...t(/_wre(\d+)/, () => ['--washreach', tenth(v, /_wre(\d+)/)]),
      ...t(/_lad/, () => ['--laneadapt', '1']),
      ...(/_sky(?=\d|_|$)/.test(v) ? ['--layerhue', '1', '--skysplit', '1'] : /_hue/.test(v) ? ['--layerhue', '1'] : []),
      ...t(/_efade/, () => ['--edgefade', '1.2']), ...t(/_stone/, () => ['--layertexture', '1', '--texshort', '1', '--texpress', '.5']),
      ...(/_stub2/.test(v) ? ['--texshort', '1', '--texpress', '.6'] : /_stub/.test(v) ? ['--texshort', '1'] : []),
      ...(/_softs/.test(v) ? ['--softsplit', '1', '--softarcs', '12', '--softarclen', '40', '--softmm', '0.7'] : /_soft/.test(v) ? ['--softarcs', '8', '--softarclen', '48', '--softmm', '1.0'] : []),
      ...t(/_ew(\d+)/, () => ['--edgewobble', tenth(v, /_ew(\d+)/)]), 
      ...t(/_sfa(\d+)/, () => ['--softarcs', m(v, /_sfa(\d+)/)[1], '--softarclen', '200', '--softmm', '1.0']),
      '--drawing', closing ? 'both' : 'first', ...(linesExist(opening) ? ['--drawingfile', path.join(planDir, opening)] : []), ...(closing ? ['--drawinglast', path.join(planDir, closing)] : []),
      '--outlinemedium', outlineMedium, '--texture', '0', '--mode', 'fast', '--paperphysical', '1', '--frames', '8', '--marks', '1', '--video', '0', '--seed', '0',
      '--out', out, '--targetguard', 'gentle', ...(compile ? ['--valuepreviewonly', '1'] : ['--gpu', gpu])];
  };
}

/** args -> Map(option -> value of its last occurrence, as paint-plate's opt() reads it) */
export function optionMap(args) {
  if (args[0] !== 'tools/paint-plate.mjs' || args.length % 2 !== 1) throw new Error('paint-plate args must be the script then --option value pairs');
  const map = new Map();
  for (let i = 1; i < args.length; i += 2) {
    if (!args[i].startsWith('--')) throw new Error(`expected an option at ${i}: ${args[i]}`);
    map.set(args[i].slice(2), args[i + 1]);
  }
  return map;
}
const variantParts = v => { const p = v.split('_'); return { prefix: p.slice(0, 2).join('_'), tokens: p.slice(2).filter(Boolean) }; };

// tokens in one slot are alternatives: a model token takes every option any alternative in its slot sets
const GROUPS = [[/^(hue|sky\d*)$/, 'hue', ['hue', 'sky', 'sky3']], [/^sep\d?$/, 'sep', ['sep', 'sep2', 'sep4', 'sep8']], [/^ink[234]d?$/, 'ink', ['ink2', 'ink3', 'ink4']],
  [/^lay\d$/, 'lay', ['lay2', 'lay4']], [/^(cur|relonly)$/, 'paper', ['cur', 'relonly']], [/^noslane$/, 'slane', ['noslane']],
  [/^softs?$/, 'soft', ['soft', 'softs']], [/^(stub2?|stone)$/, 'stub', ['stub', 'stub2', 'stone']]];
function slotOf(t) { for (const [re, name] of GROUPS) if (re.test(t)) return name; return t.replace(/\d+/g, 'N'); }
const alternatives = t => GROUPS.find(([re]) => re.test(t))?.[2] ?? [];
// options a token sets or removes, against the bare prefix
function delta(build, prefix, token) {
  const a = optionMap(build(prefix)), b = optionMap(build(prefix + '_' + token)), d = new Set();
  for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) d.add(k);
  return d;
}

/**
 * The base recipe under the plan's own tokens. Returns the args to run and an account of the layers.
 * sepiaInk: false when the plan draws in another ink.
 */
export function layerBase({ variant, build, sepiaInk = true, linesExist = () => true, base = BASE }) {
  const { prefix, tokens: mt } = variantParts(variant), { tokens: bt } = variantParts(base);
  const modelArgs = build(variant), modelSlots = new Set(mt.map(slotOf)), skipped = {}, applied = [];
  for (const b of bt) {
    if (modelSlots.has(slotOf(b))) { skipped[b] = 'plan chose ' + mt.filter(t => slotOf(t) === slotOf(b)).join(','); continue; }
    if (!sepiaInk && slotOf(b) === 'sep') { skipped[b] = 'plan draws in another ink'; continue; }
    applied.push(b);
  }
  const modelOwned = new Set();
  for (const t of mt) for (const alt of new Set([t, ...alternatives(t), ...bt.filter(b => slotOf(b) === slotOf(t))])) for (const k of delta(build, prefix, alt)) modelOwned.add(k);
  const baseTouched = new Set(); for (const b of applied) for (const k of delta(build, prefix, b)) baseTouched.add(k);
  const champ = optionMap(build([prefix, ...applied].join('_'))), edits = {};
  let args = [...modelArgs];
  for (const k of baseTouched) {
    if (modelOwned.has(k)) continue;
    // drawing files: the base's closingink4 lines are used only where the plan has them
    if ((k === 'drawinglast' || k === 'drawingfile') && champ.has(k) && !linesExist(path.basename(champ.get(k)))) continue;
    const at = []; for (let i = 1; i < args.length; i += 2) if (args[i] === '--' + k) at.push(i);
    if (!champ.has(k)) { if (at.length) { args = args.filter((_, i) => !at.some(j => i === j || i === j + 1)); edits[k] = null; } continue; }
    if (at.length) { if (args[at.at(-1) + 1] !== champ.get(k)) { args[at.at(-1) + 1] = champ.get(k); edits[k] = champ.get(k); } }
    else { args.push('--' + k, champ.get(k)); edits[k] = champ.get(k); }
  }
  const modelOptions = new Set(); for (const t of mt) for (const k of delta(build, prefix, t)) modelOptions.add(k);
  return { args, applied, skipped, edits, modelOptions: [...modelOptions].sort(), baseOptions: [...baseTouched].filter(k => !modelOwned.has(k)).sort() };
}

// urban-sketch's own wash is a single 25% band (near-blank sheets); its cells get the ink-and-wash value floor
const valueFloorFor = config => { const s = config?.styleSelection; const styles = [s?.style, ...Object.values(s?.regions ?? {}).map(r => r?.style)]; return styles.includes('urban-sketch') ? 'ink-and-wash' : null; };

// Only artistic controls belong to model plans; execution, delivery (charging, calibration) and ink safety stay with
// the harness and the engine.
const numeric = (min, max) => v => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;
const choice = values => v => values.includes(v);
export const ALLOWED_EXTRA_ARGS = Object.freeze({
  midlayers: v => numeric(0, 8)(v) && Number.isInteger(Number(v)),
  paints: v => /^[a-z]+(?:,[a-z]+)*$/.test(v),
  drawing: choice(['first', 'both', 'last', 'none']),
  outlinemedium: choice(['graphite', 'ink', 'none', 'auto']),
  inkprofile: choice(['sepia-ink', 'black-ink']),
  valuefloor: choice(['ink-and-wash', 'precise-watercolor', 'urban-sketch', 'atmospheric-wet']),
  focusmap: v => /\.json$/i.test(v),
  brushchoice: choice(['0', '1']),
  strokeplan: choice(['0', '1']),
  lanemm: v => v === 'auto' || numeric(0, 40)(v),
  strokemm: numeric(0, 300),
  paperrule: choice(['0', '1']),
  drawinghand: choice(['0', '1']),
  washinkfree: choice(['0', '1']),
  inkdarkskip: numeric(0, 1),
  skylanes: choice(['0', '1']),
  skylanemm: numeric(1, 40),
  skylanestep: numeric(0.1, 2),
  softsplit: choice(['0', '1']),
  softmm: numeric(0.1, 10),
});
// any gain or calibration option is refused even if it is ever added to the list above
export const GAIN_OPTION = /gain|calibrat|cal$|cal(?:from|max|min|extent|mode)$/;
const isPathLike = (k, v) => k === 'focusmap' || path.isAbsolute(v) || v.includes('/') || v.includes('..');
/** Problems with extra-args.json (empty = fine): locked options, and path values that leave the plan folder. */
export function checkExtraArgs(extra, planDir) {
  const bad = []; if (!extra) return bad;
  if (!Array.isArray(extra) || !extra.every(a => typeof a === 'string')) return ['extra-args.json must be a JSON array of strings'];
  const root = fs.existsSync(planDir) ? fs.realpathSync(planDir) : path.resolve(planDir);
  for (let i = 0; i < extra.length;) {
    const flag = extra[i++];
    const key = flag.startsWith('--') ? flag.slice(2) : '';
    const gain = GAIN_OPTION.test(key.replace(/=.*$/, ''));
    const validate = !gain && Object.hasOwn(ALLOWED_EXTRA_ARGS, key) ? ALLOWED_EXTRA_ARGS[key] : null;
    if (gain) bad.push('extra-args.json may not set ' + flag + ': a gain or calibration covers an engine error; the plan states values');
    else if (Object.hasOwn(REMOVED_EXTRA_ARGS, key)) bad.push(`extra-args.json: ${flag} was removed: ${REMOVED_EXTRA_ARGS[key]}`);
    else if (!validate) bad.push('extra-args.json may not set ' + flag);
    if (i === extra.length || extra[i].startsWith('--')) { bad.push('extra-args.json missing value for ' + flag); continue; }
    const a = extra[i++];
    if (validate && !validate(a)) bad.push('extra-args.json invalid value for ' + flag + ': ' + a);
    if (!isPathLike(key, a)) continue;
    if (!/\.json$/i.test(a)) bad.push('extra-args.json path values must be .json files inside the plan folder: ' + a);
    let r = path.resolve(planDir, a), tail = '';
    while (!fs.existsSync(r) && r !== path.dirname(r)) { tail = path.join(path.basename(r), tail); r = path.dirname(r); }
    try { r = path.join(fs.realpathSync(r), tail); } catch { /* keep the resolved path */ }
    const inside = d => r === d || r.startsWith(d + path.sep);
    if (!inside(root) && !inside(path.resolve(planDir))) bad.push('extra-args.json path leaves the plan folder: ' + a);
  }
  return bad;
}
// Gains and calibrations a plan may not set, in any mode: each moves paint by a factor or a threshold to cover what the
// engine delivers, instead of stating a value or a technique (docs/honesty.md). Refused with the reason, before painting.
export const REFUSED_TOKENS = Object.freeze({
  dp: 'a value gain: doubles dark weight sheet-wide wherever the target is darker than a threshold',
  acc: 'a value gain: moves middle demand into the accent band',
  lit: 'a value gain: removes a share of the middle layers',
  novar: 'a physics switch: turns off film diffusion, a physical process, which can hide engine faults',
});
// Tokens whose painter setting was removed (src/paint/removed-options.mjs): a stored plan that names one is refused
// with the reason, never painted as if the setting had acted.
const DEEP_ACCENT_REMOVED = 'the deep accents (--deepaccent) were removed: they restated every cell darker than a threshold as two late dark layers, a rule over target pixels; the plan names its last darks';
export const REMOVED_TOKENS = Object.freeze({
  dg: DEEP_ACCENT_REMOVED,
  eye: 'the eye ring (--eyering) was removed: it drew an iris ring round each catchlight reserve inside the deep accents, a rule shaped to one kind of subject',
});
// extra-args.json options whose painter setting was removed, with the reason
const REMOVED_EXTRA_ARGS = Object.freeze({ deepaccent: DEEP_ACCENT_REMOVED, deepgrow: DEEP_ACCENT_REMOVED, deepaccentin: DEEP_ACCENT_REMOVED, eyering: REMOVED_TOKENS.eye });
const tokenName = t => t.replace(/\d+$/, '');
const refusedReason = t => REFUSED_TOKENS[tokenName(t)] ?? REMOVED_TOKENS[tokenName(t)];
/** Refused gain and calibration tokens, and tokens whose setting was removed, in a variant, as plain-language problems. */
export function refusedTokens(variant) {
  return variantParts(variant).tokens.filter(t => refusedReason(t)).map(t => Object.hasOwn(REFUSED_TOKENS, tokenName(t))
    ? `recipe token "${t}" is refused: ${REFUSED_TOKENS[tokenName(t)]}; the plan states values, the engine delivers them`
    : `recipe token "${t}" is refused: ${REMOVED_TOKENS[tokenName(t)]}`);
}
// plan fields with the same job: washes.charge picks the demand quantile each passage is charged at (delivery)
export const REFUSED_PLAN_FIELDS = Object.freeze({ 'washes.charge': 'a delivery calibration: the quantile of demand each passage is charged at; the engine owns charging' });
// plan fields whose painter setting was removed (src/paint/pipeline-plan.mjs refuses them too)
const REMOVED_PLAN_FIELDS = Object.freeze({ 'washes.deepAccent': DEEP_ACCENT_REMOVED });
/** Refused plan fields present in config.json, as plain-language problems. */
export function refusedPlanFields(config) {
  const at = (o, k) => k.split('.').reduce((v, part) => (v && typeof v === 'object' && Object.hasOwn(v, part) ? v[part] : undefined), o);
  return [...Object.entries(REFUSED_PLAN_FIELDS).filter(([k]) => at(config, k) !== undefined).map(([k, why]) => `config.json may not set ${k}: ${why}`),
    ...Object.entries(REMOVED_PLAN_FIELDS).filter(([k]) => at(config, k) !== undefined).map(([k, why]) => `config.json: ${k} was removed: ${why}`)];
}

/** Tokens that map to no painter option, and a prefix other than region_w13 or region_w15. */
export function unknownTokens(variant, build) {
  const { prefix, tokens } = variantParts(variant);
  if (prefix !== 'region_w13' && prefix !== 'region_w15') return ['prefix ' + prefix + ' (must be region_w13 or region_w15)'];
  return tokens.filter(t => /^(ink[234]|sep\d*|uncap|dw[gm]\d+|ol\d+|opp\d+)$/.test(t) || delta(build, prefix, t).size === 0);
}

const PLAN_LIMITS = { families: 64, reserves: 64, familyMinMm: 2, reserveMinMm: 1, lines: 4000, points: 400000, margin: 1 };
const boundsProblem = (b, sheetW, sheetH, minMm) => {
  if (!Array.isArray(b) || b.length !== 4 || !b.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return 'bounds must be [x0,y0,x1,y1], four numbers from 0 to 1';
  if (!(b[0] < b[2] && b[1] < b[3])) return 'bounds must have x0<x1 and y0<y1';
  const w = (b[2] - b[0]) * sheetW, h = (b[3] - b[1]) * sheetH, short = Math.min(w, h);
  return short >= minMm ? null : `bounds are ${w.toFixed(1)} x ${h.toFixed(1)} mm on the sheet; the short side must be at least ${minMm} mm`;
};
/** Plain-language problems with the plan's size limits (empty = within limits). */
export function checkPlanLimits(config, sheetmm, linesByName, targetPixels) {
  const bad = [], L = PLAN_LIMITS, [tw, th] = targetPixels, sheetW = sheetmm, sheetH = sheetW * th / tw;
  for (const [key, max, minMm, what] of [['families', L.families, L.familyMinMm, 'family'], ['reserves', L.reserves, L.reserveMinMm, 'reserve']]) {
    const list = config?.[key] ?? [];
    if (!Array.isArray(list)) { bad.push(`config.${key} must be a list`); continue; }
    if (list.length > max) bad.push(`config.${key} has ${list.length} entries; at most ${max} are allowed`);
    list.forEach((e, i) => {
      if (key === 'reserves' && !(typeof e?.reason === 'string' && e.reason.trim())) bad.push(`config.reserves[${i}] needs a reason`);
      const pr = boundsProblem(e?.bounds, sheetW, sheetH, minMm); if (pr) bad.push(`config.${key}[${i}] (${what}${e?.id ? ' ' + e.id : ''}): ${pr}`);
    });
  }
  for (const [name, doc] of Object.entries(linesByName)) {
    const im = doc?.image, lines = doc?.lines;
    if (!im || im.w !== tw || im.h !== th) { bad.push(`${name}: image is ${im?.w}x${im?.h} but the target is ${tw}x${th}`); continue; }
    if (!Array.isArray(lines)) { bad.push(`${name}: no lines list`); continue; }
    if (lines.length > L.lines) bad.push(`${name}: ${lines.length} lines; at most ${L.lines} are allowed`);
    let pts = 0, off = 0, nan = 0;
    for (const ln of lines) for (const q of ln.points ?? []) { pts++; const [x, y] = q ?? []; if (!Number.isFinite(x) || !Number.isFinite(y)) nan++; else if (x < -L.margin || y < -L.margin || x > tw + L.margin || y > th + L.margin) off++; }
    if (pts > L.points) bad.push(`${name}: ${pts} points; at most ${L.points} are allowed`);
    if (nan) bad.push(`${name}: ${nan} points are not finite numbers`);
    if (off) bad.push(`${name}: ${off} points lie outside the ${tw}x${th} image`);
  }
  return bad;
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const STYLE_INK = { 'urban-sketch': 'black' };

/** A subject's drawing medium, as a person looking at the target would name it (bench/v4v5/subjects.json `medium`). */
export const SUBJECT_MEDIA = Object.freeze(['none', 'pencil', 'pen']);
const isGraphite = v => v === 'graphite' || /^graphite-/.test(v);
// settings only a pen reads; dropped with the pen so they are not held against the plan as unread
const INK_ONLY = ['inkprofile', 'washinkfree', 'drawinghand', 'inkdarkskip'];
/**
 * The subject-medium rule: the source decides the drawing medium, whether or not the plan asks. A target with no pen
 * lines is not drawn in ink: any drawing a plan asks for or leaves to the template (ink in config.drawing.medium or
 * --outlinemedium, `auto`, graphite, or nothing said) is drawn as a light graphite preparatory drawing before the
 * washes: the opening lines stay, closing lines and pen-only settings go. A plan may draw nothing. On a pen subject a
 * plan that says nothing is drawn in ink (resolvePlan), and a plan that chooses a medium keeps it. The painter enforces the rule itself under --subjectmedium (src/paint/subject-medium.mjs),
 * because it gives the plan's drawing section the last word; this function makes the harness arguments and the record agree.
 * @returns {{ outlineMedium: string, extraArgs: string[], firstOnly: boolean, override: object|null }}
 */
export function subjectMediumRule({ medium, planMedium, outlineMedium, extraArgs, noDrawing }) {
  const keep = { outlineMedium, extraArgs, firstOnly: false, override: null };
  if (medium == null) return keep;
  if (!SUBJECT_MEDIA.includes(medium)) throw new Error(`subject medium must be none, pencil or pen, not ${JSON.stringify(medium)}`);
  if (medium === 'pen' || noDrawing) return keep;
  // the painter gives a plan's drawing section the last word, then extra-args, then the template (src/paint/recipe.mjs)
  const at = extraArgs.lastIndexOf('--outlinemedium'), extraMedium = at >= 0 && at + 1 < extraArgs.length ? extraArgs[at + 1] : null;
  const asked = planMedium ?? extraMedium ?? outlineMedium;
  if (asked === 'none') return keep;
  const out = [], removed = [];
  for (let i = 0; i < extraArgs.length; i += 2) {
    const key = extraArgs[i].replace(/^--/, ''), value = extraArgs[i + 1];
    if (INK_ONLY.includes(key)) { removed.push(`${extraArgs[i]} ${value}`); continue; }
    out.push(extraArgs[i], ...(value === undefined ? [] : [key === 'outlinemedium' && value !== 'none' ? 'graphite' : key === 'drawing' && value !== 'none' ? 'first' : value]));
  }
  return { outlineMedium: 'graphite', extraArgs: out, firstOnly: true,
    override: { subjectMedium: medium, asked, drawn: 'graphite', closingDropped: false, removed,
      reason: `the subject's medium is ${medium}: the target shows no pen lines, so the ${asked === 'auto' ? 'drawing left to the painter' : asked + ' drawing'} is a light graphite preparatory drawing before the washes, with no closing lines` } };
}
/** PNG width and height from the file header. */
export const pngSize = file => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

/**
 * Everything about one plan: the paint-plate args and the refusals that come before any painting.
 * spec: {crop, width, sheetmm}. planDir: the plan folder; variant: the tokens (variant.txt).
 * Returns {args, problems, layering, modelOptions, baseOptions, extraOptions}.
 */
export function resolvePlan({ spec, planDir, variant, target, out, compile = false, gpu = 'auto', pausedir = null, resumestate = null }) {
  const problems = [];
  const linesExist = name => fs.existsSync(path.join(planDir, LINES(name))) || fs.existsSync(path.join(planDir, LINES(name) + '.gz'));
  const config = readJson(path.join(planDir, 'config.json'));
  if (!config || typeof config !== 'object' || Array.isArray(config)) problems.push('config.json is missing or not a JSON object');
  if (!/^[A-Za-z0-9_]+$/.test(variant)) problems.push('variant.txt must hold one recipe name of letters, digits and underscores');
  const safeVariant = /^[A-Za-z0-9_]+$/.test(variant) ? variant : DEFAULT_VARIANT;
  const extraFile = path.join(planDir, 'extra-args.json');
  let extra = null;
  if (fs.existsSync(extraFile)) { extra = readJson(extraFile); if (extra === null) problems.push('extra-args.json is not valid JSON'); }
  problems.push(...checkExtraArgs(extra, planDir));
  const planExtraArgs = Array.isArray(extra) ? extra.map(String) : [];
  const targetPixels = pngSize(target);
  const planMedium = config?.drawing?.medium && config.drawing.medium !== 'none' ? config.drawing.medium : null;
  const isPenWash = spec?.taskStyle === 'penwash' || (typeof spec?.taskStyle === 'string' && (spec.taskStyle.includes('penwash') || spec.taskStyle.includes('ink-and-watercolor')));
  // the subject's medium decides when the plan does not: a pen subject is drawn in ink, a subject with no pen
  // (spec.medium none or pencil) gets a graphite preparatory drawing only, whatever the plan asks; see subjectMediumRule
  const planOff = k => { const i = planExtraArgs.lastIndexOf('--' + k); return i >= 0 && planExtraArgs[i + 1] === 'none'; };
  // a drawing section with ink stages and no medium is an ink drawing too
  const inkStages = ['prepInk', 'finishInk'].some(k => config?.drawing?.stages?.[k]);
  const noDrawing = config?.drawing?.medium === 'none' || planOff('drawing');
  const mediumRule = subjectMediumRule({ medium: spec.medium, planMedium: planMedium ?? (inkStages ? 'ink' : null), outlineMedium: planMedium ?? (isPenWash || (spec.medium === 'pen' && !noDrawing) ? 'ink' : 'graphite'), extraArgs: planExtraArgs, noDrawing });
  const { outlineMedium, extraArgs } = mediumRule;
  let mediumOverride = mediumRule.override;
  const build = argsBuilder({ planDir, target, width: spec.width, sheetmm: spec.sheetmm, out, compile, gpu, targetPixels, linesExist, outlineMedium });
  problems.push(...refusedTokens(safeVariant));
  if (config && typeof config === 'object') problems.push(...refusedPlanFields(config));
  problems.push(...unknownTokens(safeVariant, build).filter(t => !refusedReason(t)).map(t => (t.startsWith('prefix') ? t : `unknown recipe token "${t}": it maps to no painter option, so nothing would read it`)));
  const styleName = config?.styleSelection?.style;
  const extraInk = extraArgs.includes('--inkprofile') ? extraArgs[extraArgs.lastIndexOf('--inkprofile') + 1] : null;
  const sepiaInk = !(extraInk && extraInk !== 'sepia-ink') && !extraArgs.includes('--inkk') && STYLE_INK[styleName] !== 'black';
  const layered = layerBase({ variant: safeVariant, build, sepiaInk, linesExist });
  let args = [...layered.args];
  if (mediumRule.firstOnly) {
    // a preparatory drawing comes before the washes: no closing lines
    const last = args.indexOf('--drawinglast');
    mediumOverride.closingDropped = last >= 0 || optionMap(args).get('drawing') !== 'first' || planExtraArgs.some((a, i) => planExtraArgs[i - 1] === '--drawing' && a !== 'first' && a !== 'none');
    if (last >= 0) args = args.filter((_, i) => i !== last && i !== last + 1);
    args[args.lastIndexOf('--drawing') + 1] = 'first';
    // a graphite drawing that was opening only already, with nothing removed, was not overridden
    if (isGraphite(mediumOverride.asked) && !mediumOverride.closingDropped && !mediumOverride.removed.length) mediumOverride = null;
  }
  // the painter applies the same rule to the plan's own drawing section, which the harness arguments cannot override
  if (spec.medium === 'none' || spec.medium === 'pencil') args.push('--subjectmedium', spec.medium);
  const hasDrawingFile = args.includes('--drawingfile');
  const extraVal = name => { const i = extraArgs.lastIndexOf('--' + name); return i >= 0 && i + 1 < extraArgs.length && !extraArgs[i + 1].startsWith('--') ? extraArgs[i + 1] : null; };
  const effMedium = extraVal('outlinemedium') ?? (config?.drawing?.medium === 'none' ? 'none' : outlineMedium);
  const effDrawing = extraVal('drawing') ?? (config?.drawing?.medium === 'none' ? 'none' : optionMap(args).get('drawing') ?? 'first');
  const inkActive = effDrawing !== 'none' && effMedium === 'ink';
  if (inkActive) {
    if (hasDrawingFile && effDrawing !== 'last' && !args.includes('--washinkfree') && !extraArgs.includes('--washinkfree')) args.push('--washinkfree', '1');
    if ((hasDrawingFile || args.includes('--drawinglast')) && !args.includes('--drawinghand') && !extraArgs.includes('--drawinghand')) args.push('--drawinghand', '1');
  }
  const valueFloor = valueFloorFor(config);
  if (valueFloor && !extraArgs.includes('--valuefloor')) args.push('--valuefloor', valueFloor);
  args.push(...extraArgs);
  if (spec.recordingMarks != null) args.push('--marks', String(spec.recordingMarks));
  // the harness's segmentation backend (dry runs: off); absent, the painter's own default (SAM) applies
  if (spec.segments != null) args.push('--segments', String(spec.segments));
  if (spec.noTargetLooks === true) args.push('--notargetlooks', '1');
  // Offline scripted fixtures deliberately remove tracked benchmark data from their worktree.
  // Keep the dirty-tree evidence; ordinary contestant runs retain the painter's refusal.
  if (spec.offlineFixture === true) args.push('--allowdirty', '1');
  // Since 0.1.1 a wet-on-wet stroke on uneven paper is logged, not a stop that loses the painting (tag v0.1.0 has the old rule)
  if (!args.includes('--wetgate')) args.push('--wetgate', '0');
  if (pausedir) args.push('--pausedir', pausedir);
  if (resumestate) args.push('--resumestate', resumestate);
  const linesByName = {};
  const readLineJson = f => {
    try {
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
      if (fs.existsSync(f + '.gz')) return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8'));
      return null;
    } catch { return null; }
  };
  for (const k of ['drawingfile', 'drawinglast']) {
    const i = args.lastIndexOf('--' + k); if (i < 0) continue;
    const f = args[i + 1] + '-lines.json', doc = readLineJson(f);
    if (!doc) problems.push(path.basename(f) + ' is missing or not valid JSON'); else linesByName[path.basename(f)] = doc;
  }
  if (config) problems.push(...checkPlanLimits(config, spec.sheetmm, linesByName, targetPixels));
  return {
    args, problems, variant: safeVariant, extraArgs,
    layering: { base: BASE, applied: layered.applied, skipped: layered.skipped, edits: layered.edits, valueFloor, mediumOverride,
      // where the drawn lines come from (a tracer's stamp, or the painter's own reading of the target); see copy.mjs
      lines: lineSources(linesByName, { painterOwnDrawing: effMedium !== 'none' && ((['first', 'both'].includes(effDrawing) && !hasDrawingFile) || (['both', 'last'].includes(effDrawing) && !args.includes('--drawinglast'))) }) },
    modelOptions: layered.modelOptions, baseOptions: layered.baseOptions, extraOptions: extraArgs.filter(a => a.startsWith('--')).map(a => a.slice(2)),
    templateOptions: [...optionMap(build(variantParts(safeVariant).prefix)).keys()],
  };
}

/**
 * The painting's verdict. unused: options the painter read nowhere (every segment counted). A finished painting
 * (painting.png, painter exit 0 or 3) counts as painted. Settings the plan chose that nothing read, unused options
 * nobody asked for and passages with no brush path are kept as notes against the plan. strict (--strict-verdict)
 * makes those three fail the painting again, as in the published 0.1 results. A painter killed by a signal, any other
 * painter exit and a missing painting always fail.
 */
export function renderVerdict({ paintExit, unused = [], modelOptions = [], extraOptions = [], baseOptions = [], templateOptions = [], dropped = 0, droppedPct = 0, finished = true, strict = false }) {
  const failures = [], notes = [], fail = (code, reason) => failures.push({ code, reason });
  const note = (code, reason) => (strict ? fail(code, reason) : notes.push({ code, reason }));
  const model = new Set([...modelOptions, ...extraOptions]), base = new Set([...baseOptions, ...templateOptions, 'valuefloor']);
  const check = { model: [], base: [], unknown: [] };
  for (const raw of unused) { const k = raw.replace(/^--/, ''); (model.has(k) ? check.model : base.has(k) ? check.base : check.unknown).push(k); }
  if (paintExit === null || paintExit === undefined) fail(137, 'paint process was killed by a signal');
  else if (paintExit !== 0 && paintExit !== 3) fail(paintExit, 'paint process exited ' + paintExit);
  if (check.model.length) note(4, 'settings the plan chose were read by nothing: --' + check.model.join(' --'));
  if (check.unknown.length) note(4, 'unused options nobody asked for: --' + check.unknown.join(' --'));
  if (dropped > 0) note(5, `passages with no executed paths: ${dropped} dropped (${droppedPct.toFixed(1)}% of the planned mass)`);
  if (!finished) fail(6, 'no finished painting');
  return { exit: failures.length ? failures[0].code : 0, failures, notes, optionCheck: check, strict };
}
