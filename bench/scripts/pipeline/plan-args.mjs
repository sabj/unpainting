// The painter command for a V4 or V5 plan, and the checks on it. A plan is the model's files in one folder:
// config.json (regions, reserves, styles), drawing paths (*-lines.json), extra-args.json (painter settings), and
// variant.txt (recipe tokens). The painter is tools/paint-plate.mjs with no recipe of its own (--recipe none): every
// setting comes from the fixed template below, the base recipe tokens (BASE) and the plan, in that order.
//
// Layering: a model token replaces the base token in the same slot (_lay2 replaces _lay4). Stone-block tokens apply to
// architecture only, palette tokens to Trumbull only, and the base's sepia ink yields to a plan drawn in another ink.
// Settings the plan asks for that the painter never reads are noted against the painting (renderVerdict), and fail it
// under --strict-verdict. Base settings a subject has no use for are never noted.
//
// This file is copied into the model's worktree as bench/plan-args.mjs, so it imports only Node built-ins.
import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'region_w13_lay4_ink4_rec2x_rcl_sky3_leaf_sep8_cg13_vio_rg10_blk60_bmm40_bka20_birr_skyb_cpp_dk13_tv8_uncap_pgreen_dwg200_tp2_shs';
const DEFAULT_VARIANT = 'region_w13';
const ARCHITECTURE_ONLY = /^(blk|bmm|bka)\d+$|^birr$/;
const PALETTE = /^(pwarm|pgold|pgreen|pbs|rv)$/;
const LINES = name => `${name}-lines.json`;

const m = (v, re) => v.match(re);
const tenth = (v, re) => String(Number(m(v, re)[1]) / 10);
const hundredth = (v, re) => String(Number(m(v, re)[1]) / 100);

/**
 * The paint-plate command for a variant, as [script, --option, value, ...]. ctx: {planDir, target, width, sheetmm,
 * trumbull, out, compile, gpu, linesExist}. The regular expressions are the recipe tokens; bench/v4v5/TOKENS.md lists them.
 */
export function argsBuilder({ planDir, target, width, sheetmm, trumbull = false, out = 'out', compile = false, gpu = 'auto', targetPixels = [1, 1], linesExist = () => true }) {
  return v => {
    const shaped = v.startsWith('region_w13') || v.startsWith('region_w15');
    const paints = !trumbull ? [] : ['--paints', /_rv/.test(v) ? 'ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia,rose'
      : /_pgreen/.test(v) ? (/_pbs/.test(v) ? 'ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia,sapgreen' : 'ochre,rawsienna,hansa,ultramarine,cerulean,sepia,sapgreen')
        : /_pwarm/.test(v) ? 'ochre,rawsienna,hansa,ultramarine,cerulean,sepia' : /_pgold/.test(v) ? 'ochre,hansa,ultramarine,cerulean,sepia'
          : 'ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia'];
    const opening = /_opk/.test(v) ? 'closingink' : 'opening';
    const closing = (/_ink4/.test(v) ? ['closingink4', 'closing'] : /_ink[23]/.test(v) ? ['closingink', 'closing'] : ['closing']).find(f => linesExist(f));
    const t = (re, flags) => (re.test(v) ? flags() : []);
    return ['tools/paint-plate.mjs', '--recipe', 'none', '--image', target, '--width', String(width), '--scale', '1', '--sheetmm', String(sheetmm), '--palettewide', '1', ...paints,
      '--physical', '1', '--paperbase', /_cur/.test(v) ? 'white' : 'source', '--loadedcontact', '1', '--order', 'painter', '--valueplan', path.join(planDir, 'config.json'),
      '--brushchoice', v.startsWith('region_w15') ? '1' : '0', '--shapedmarks', shaped ? '1' : '0',
      ...t(/_onedom/, () => ['--middomain', '0']), ...t(/_nest/, () => ['--nestedmid', '1']), ...t(/_lay(\d)/, () => ['--midlayers', m(v, /_lay(\d)/)[1]]),
      ...t(/_dk(\d+)/, () => ['--darkgain', tenth(v, /_dk(\d+)/)]), ...t(/_lf/, () => ['--loadfeather', '1.5']),
      ...t(/_sg(\d+)/, () => ['--stylegain', tenth(v, /_sg(\d+)/)]), ...t(/_ls(\d+)/, () => ['--layersmooth', tenth(v, /_ls(\d+)/)]),
      ...t(/_acc(\d+)/, () => ['--accentshare', tenth(v, /_acc(\d+)/)]), ...t(/_lt/, () => ['--layertexture', '1']),
      ...(/_cur/.test(v) ? ['--paperlights', '1'] : /_relonly/.test(v) ? ['--paperrel', '1'] : ['--paperrel', '1', '--paperlights', '1']),
      ...(/_cur/.test(v) ? ['--paperrgb', '252,251,248'] : /_relonly/.test(v) ? [] : ['--paperrgb', 'auto']),
      ...t(/_cg(\d+)/, () => ['--coolgain', tenth(v, /_cg(\d+)/)]),
      ...(/_noslane/.test(v) ? [] : /_slane/.test(v) ? ['--skylanes', '1'] : ['--skylanes', '1', '--skylanemm', '6', '--skylanestep', '.8']),
      ...t(/_st(\d+)/, () => ['--shadowthresh', hundredth(v, /_st(\d+)/)]), ...t(/_mg(\d+)/, () => ['--midgain', tenth(v, /_mg(\d+)/)]),
      ...t(/_vio/, () => ['--violetshadow', '1']), ...t(/_shw(\d+)/, () => ['--shadowwater', hundredth(v, /_shw(\d+)/)]),
      ...t(/_rv/, () => ['--roseviolet', '1']), ...t(/_dkf/, () => ['--darkfirst', '1']), ...t(/_rg(\d+)/, () => ['--groundglaze', tenth(v, /_rg(\d+)/)]),
      ...t(/_blk(\d+)/, () => ['--stoneblocks', hundredth(v, /_blk(\d+)/)]), ...t(/_bka(\d+)/, () => ['--stoneblockamt', hundredth(v, /_bka(\d+)/)]),
      ...t(/_bmm(\d+)/, () => ['--stoneblockmm', tenth(v, /_bmm(\d+)/)]), ...t(/_dp(\d+)/, () => ['--deepaccent', m(v, /_dp(\d+)/)[1]]),
      ...t(/_ms(\d+)/, () => ['--minshapecells', m(v, /_ms(\d+)/)[1]]), ...t(/_birr/, () => ['--stoneirregular', '1']),
      ...t(/_dg(\d+)/, () => ['--deepgrow', m(v, /_dg(\d+)/)[1]]), ...t(/_ts(\d+)/, () => ['--texshare', tenth(v, /_ts(\d+)/)]),
      ...t(/_rx(\d+)/, () => ['--recessmax', m(v, /_rx(\d+)/)[1]]), ...t(/_bvar/, () => ['--stonecourses', '1']),
      ...t(/_tv(\d+)/, () => ['--texvariety', tenth(v, /_tv(\d+)/)]), ...t(/_rac/, () => ['--recessaccent', '1']),
      ...t(/_eye(\d+)/, () => ['--eyering', String(Number(m(v, /_eye(\d+)/)[1]) / targetPixels[0])]),
      ...t(/_skyb/, () => ['--skyblue', '1', '--skyfloc', '.5']), ...t(/_cpp/, () => ['--paper', 'coldpress']),
      ...t(/_tsh(\d+)/, () => ['--texshadow', tenth(v, /_tsh(\d+)/)]), ...t(/_tfl(\d+)/, () => ['--texflow', tenth(v, /_tfl(\d+)/)]),
      ...t(/_novar/, () => ['--physics', 'filmDiffuse=0']), ...t(/_sk1/, () => ['--skyonelayer', '1']),
      ...t(/_bcl(\d+)/, () => ['--stoneclusters', m(v, /_bcl(\d+)/)[1]]), ...t(/_leaf/, () => ['--foliagerefit', '1']),
      ...t(/_fs60/, () => ['--fastsettle', '60']), ...t(/_fl0/, () => ['--feedbacklag', '0']),
      ...(/_sep([3-9])/.test(v) ? ['--inkk', '.396,.481,.619', '--inkkscale', m(v, /_sep([3-9])/)[1]] : /_sep2/.test(v) ? ['--inkk', '.396,.481,.619', '--inkkscale', '2'] : /_sep/.test(v) ? ['--inkk', '.396,.481,.619'] : []),
      ...t(/_ink[234]/, () => ['--closinglines', '100000', '--closingpressure', '1', '--closingedgemin', '0']),
      ...(/_ink[24]/.test(v) ? ['--drawwant', '1'] : /_ink3/.test(v) ? ['--drawwant', '.75'] : []),
      ...(/_rec2x/.test(v) ? ['--recesslayers', '2', '--recessshare', '.75'] : /_rec2/.test(v) ? ['--recesslayers', '2'] : []),
      ...t(/_rcl/, () => ['--recessclean', '1']), ...t(/_swarm/, () => ['--stonewarm', '1']), ...t(/_ssp(\d+)/, () => ['--stonesplit', m(v, /_ssp(\d+)/)[1]]),
      ...t(/_tp(\d)/, () => ['--touchpoints', m(v, /_tp(\d)/)[1], '--touchgain', '.6']),
      ...t(/_spl(\d*)/, () => ['--strokeplan', '1', '--lanemm', m(v, /_spl(\d*)/)[1] || '6']), ...t(/_sml(\d+)/, () => ['--strokemm', m(v, /_sml(\d+)/)[1]]),
      ...t(/_wre(\d+)/, () => ['--washreach', tenth(v, /_wre(\d+)/)]), ...t(/_lit(\d+)/, () => ['--litlift', hundredth(v, /_lit(\d+)/)]),
      ...t(/_shs/, () => ['--shadowraw', '1']), ...t(/_lad/, () => ['--laneadapt', '1']), ...t(/_lw/, () => ['--litwarm', '1']),
      ...(/_sky/.test(v) ? ['--layerhue', '1', '--skysplit', '1'] : /_hue/.test(v) ? ['--layerhue', '1'] : []),
      ...t(/_efade/, () => ['--edgefade', '1.2']), ...t(/_stone/, () => ['--layertexture', '1', '--texshort', '1', '--texpress', '.5']),
      ...(/_stub2/.test(v) ? ['--texshort', '1', '--texpress', '.6'] : /_stub/.test(v) ? ['--texshort', '1'] : []),
      ...(/_softs/.test(v) ? ['--softsplit', '1', '--softarcs', '12', '--softarclen', '40', '--softmm', '0.7'] : /_soft/.test(v) ? ['--softarcs', '8', '--softarclen', '48', '--softmm', '1.0'] : []),
      ...t(/_ol(\d+)/, () => ['--openinglines', m(v, /_ol(\d+)/)[1]]), ...t(/_uncap/, () => ['--openinglines', '100000', '--closinglines', '100000']),
      ...t(/_opp(\d+)/, () => ['--openingpressure', hundredth(v, /_opp(\d+)/)]), ...t(/_och(\d+)/, () => ['--stoneochremin', hundredth(v, /_och(\d+)/)]),
      ...t(/_dwg(\d+)/, () => ['--drawwidthgain', hundredth(v, /_dwg(\d+)/)]), ...t(/_dwm(\d+)/, () => ['--drawwidthmin', hundredth(v, /_dwm(\d+)/)]),
      ...t(/_ew(\d+)/, () => ['--edgewobble', tenth(v, /_ew(\d+)/)]), ...t(/_smc(\d+)/, () => ['--stonemincells', m(v, /_smc(\d+)/)[1]]),
      ...t(/_sfa(\d+)/, () => ['--softarcs', m(v, /_sfa(\d+)/)[1], '--softarclen', '200', '--softmm', '1.0']),
      '--drawing', 'both', ...(linesExist(opening) ? ['--drawingfile', path.join(planDir, opening)] : []), ...(closing ? ['--drawinglast', path.join(planDir, closing)] : []),
      '--outlinemedium', 'ink', '--texture', '0', '--mode', 'fast', '--paperphysical', '1', '--frames', '8', '--marks', '1', '--video', '0', '--seed', '0',
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
  [/^rec2x?$/, 'rec', ['rec2', 'rec2x']], [/^lay\d$/, 'lay', ['lay2', 'lay4']], [/^(cur|relonly)$/, 'paper', ['cur', 'relonly']], [/^(no)?slane$/, 'slane', ['slane', 'noslane']],
  [/^softs?$/, 'soft', ['soft', 'softs']], [/^(stub2?|stone)$/, 'stub', ['stub', 'stub2', 'stone']], [/^(pwarm|pgold|pgreen|pbs|rv)$/, 'pal', ['pwarm', 'pgold', 'pgreen', 'rv']]];
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
 * architecture: stone blocks apply; trumbull: palette tokens apply; sepiaInk: false when the plan draws in another ink.
 */
export function layerBase({ variant, build, architecture = false, trumbull = false, sepiaInk = true, linesExist = () => true, base = BASE }) {
  const { prefix, tokens: mt } = variantParts(variant), { tokens: bt } = variantParts(base);
  const modelArgs = build(variant), modelSlots = new Set(mt.map(slotOf)), skipped = {}, applied = [];
  for (const b of bt) {
    if (modelSlots.has(slotOf(b))) { skipped[b] = 'plan chose ' + mt.filter(t => slotOf(t) === slotOf(b)).join(','); continue; }
    if (!architecture && ARCHITECTURE_ONLY.test(b)) { skipped[b] = 'architecture only'; continue; }
    if (!trumbull && PALETTE.test(b)) { skipped[b] = 'Trumbull only'; continue; }
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

// options a plan may never set: the subject, size, guard, seed, recording and stops are the harness's
const LOCKED_OPTIONS = new Set(['image', 'width', 'scale', 'sheetmm', 'out', 'targetguard', 'gpu', 'mode', 'seed', 'frames', 'marks', 'video', 'runcache', 'valueplan',
  'allowunused', 'allowunusedplan', 'physical', 'paperphysical', 'wetframes', 'passframes', 'pausedir', 'resumestate', 'recipe', 'valuepreviewonly']);
const isPathLike = v => path.isAbsolute(v) || v.includes('/') || v.includes('..');
/** Problems with extra-args.json (empty = fine): locked options, and path values that leave the plan folder. */
export function checkExtraArgs(extra, planDir) {
  const bad = []; if (!extra) return bad;
  if (!Array.isArray(extra) || !extra.every(a => typeof a === 'string')) return ['extra-args.json must be a JSON array of strings'];
  const root = fs.existsSync(planDir) ? fs.realpathSync(planDir) : path.resolve(planDir);
  for (const a of extra) {
    if (a.startsWith('--')) { const k = a.slice(2).split('=')[0]; if (LOCKED_OPTIONS.has(k)) bad.push('extra-args.json may not set --' + k); continue; }
    if (!isPathLike(a)) continue;
    if (!/\.json$/i.test(a)) bad.push('extra-args.json path values must be .json files inside the plan folder: ' + a);
    let r = path.resolve(planDir, a), tail = '';
    while (!fs.existsSync(r) && r !== path.dirname(r)) { tail = path.join(path.basename(r), tail); r = path.dirname(r); }
    try { r = path.join(fs.realpathSync(r), tail); } catch { /* keep the resolved path */ }
    const inside = d => r === d || r.startsWith(d + path.sep);
    if (!inside(root) && !inside(path.resolve(planDir))) bad.push('extra-args.json path leaves the plan folder: ' + a);
  }
  return bad;
}
/** Tokens that map to no painter option, and a prefix other than region_w13 or region_w15. */
export function unknownTokens(variant, build) {
  const { prefix, tokens } = variantParts(variant);
  if (prefix !== 'region_w13' && prefix !== 'region_w15') return ['prefix ' + prefix + ' (must be region_w13 or region_w15)'];
  return tokens.filter(t => delta(build, prefix, t).size === 0);
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
/** PNG width and height from the file header. */
export const pngSize = file => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

/**
 * Everything about one plan: the paint-plate args and the refusals that come before any painting.
 * spec: {crop, width, sheetmm, trumbull}. planDir: the plan folder; variant: the tokens (variant.txt).
 * Returns {args, problems, layering, modelOptions, baseOptions, extraOptions}.
 */
export function resolvePlan({ spec, planDir, variant, target, out, compile = false, gpu = 'auto', pausedir = null, resumestate = null }) {
  const problems = [];
  const linesExist = name => fs.existsSync(path.join(planDir, LINES(name)));
  const config = readJson(path.join(planDir, 'config.json'));
  if (!config || typeof config !== 'object' || Array.isArray(config)) problems.push('config.json is missing or not a JSON object');
  if (!/^[A-Za-z0-9_]+$/.test(variant)) problems.push('variant.txt must hold one recipe name of letters, digits and underscores');
  const safeVariant = /^[A-Za-z0-9_]+$/.test(variant) ? variant : DEFAULT_VARIANT;
  const extraFile = path.join(planDir, 'extra-args.json');
  let extra = null;
  if (fs.existsSync(extraFile)) { extra = readJson(extraFile); if (extra === null) problems.push('extra-args.json is not valid JSON'); }
  problems.push(...checkExtraArgs(extra, planDir));
  const extraArgs = Array.isArray(extra) ? extra.map(String) : [];
  const targetPixels = pngSize(target);
  const build = argsBuilder({ planDir, target, width: spec.width, sheetmm: spec.sheetmm, trumbull: spec.trumbull, out, compile, gpu, targetPixels, linesExist });
  problems.push(...unknownTokens(safeVariant, build).map(t => (t.startsWith('prefix') ? t : `unknown recipe token "${t}": it maps to no painter option, so nothing would read it`)));
  const styleName = config?.styleSelection?.style;
  const extraInk = extraArgs.includes('--inkprofile') ? extraArgs[extraArgs.lastIndexOf('--inkprofile') + 1] : null;
  const sepiaInk = !(extraInk && extraInk !== 'sepia-ink') && !extraArgs.includes('--inkk') && STYLE_INK[styleName] !== 'black';
  const layered = layerBase({ variant: safeVariant, build, architecture: spec.trumbull, trumbull: spec.trumbull, sepiaInk, linesExist });
  const args = [...layered.args];
  const valueFloor = valueFloorFor(config);
  if (valueFloor && !extraArgs.includes('--valuefloor')) args.push('--valuefloor', valueFloor);
  args.push(...extraArgs);
  if (pausedir) args.push('--pausedir', pausedir);
  if (resumestate) args.push('--resumestate', resumestate);
  const linesByName = {};
  for (const k of ['drawingfile', 'drawinglast']) {
    const i = args.lastIndexOf('--' + k); if (i < 0) continue;
    const f = args[i + 1] + '-lines.json', doc = readJson(f);
    if (!doc) problems.push(path.basename(f) + ' is missing or not valid JSON'); else linesByName[path.basename(f)] = doc;
  }
  if (config) problems.push(...checkPlanLimits(config, spec.sheetmm, linesByName, targetPixels));
  return {
    args, problems, variant: safeVariant, extraArgs,
    layering: { base: BASE, applied: layered.applied, skipped: layered.skipped, edits: layered.edits, valueFloor },
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
