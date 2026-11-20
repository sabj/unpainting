// The painter command for a V4 or V5 area plan, and the checks on it. The area route is the second way a model plans:
// instead of config.json + recipe tokens + painter settings (plan-args.mjs, the token route), the model writes one area
// plan (bench/plan/area-plan.json, the contract of tools/painter/semantic-areas.mjs) and the drawing section: the
// plan's `drawing` {medium, reason}, `paints` (the pigments), and optional opening/closing line files.
//
// The area route has no recipe tokens, no BASE and no forced painter settings: the plan's areas and passes say what is
// painted, in what order, with which brush, load and edges. What stays with the harness is the same as on the token
// route: the fixed template (paper, physics, speed, recording, seed), the target guard and strict mode, the subject's
// drawing medium (subjectMediumRule), the plan limits on drawing files, and refusing gains.
//
// This file is copied into the model's worktree as bench/area-args.mjs, beside plan-args.mjs and copy.mjs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { subjectMediumRule, checkPlanLimits, pngSize, GAIN_OPTION } from './plan-args.mjs';
import { lineSources } from './copy.mjs';

export const AREA_PLAN_FILE = 'area-plan.json';
// where the model's worktree keeps the target; the harness points the plan at the real file before it runs
export const AREA_TARGET_PATH = 'bench/plan/target.png';
const DRAWING_MEDIA = Object.freeze(['graphite', 'ink', 'none']);
const INKS = Object.freeze(['sepia-ink', 'black-ink']);
// plan keys that would bring the token route back in through the area plan: none of them is read on the area route
const TOKEN_ROUTE_KEYS = Object.freeze(['styleSelection', 'families', 'reserves', 'washes', 'variant', 'extraArgs', 'tokens']);

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readLines = f => {
  try {
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    if (fs.existsSync(f + '.gz')) return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8'));
  } catch { /* not JSON */ }
  return null;
};

/**
 * Problems with the parts of an area plan the harness owns (empty = fine). The painter validates the areas and passes
 * itself (semantic-areas.mjs) in the planning step; this checks the drawing section, the paints and the refusals.
 */
export function checkAreaDocument(doc) {
  const bad = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [`${AREA_PLAN_FILE} is missing or not a JSON object`];
  const d = doc.drawing;
  if (!d || typeof d !== 'object') bad.push(`${AREA_PLAN_FILE} needs a drawing section: {"medium": "graphite" | "ink" | "none", "reason": "..."}`);
  else {
    if (!DRAWING_MEDIA.includes(d.medium)) bad.push(`drawing.medium must be ${DRAWING_MEDIA.join(', ')}, not ${JSON.stringify(d.medium)}`);
    if (!(typeof d.reason === 'string' && d.reason.trim())) bad.push('drawing.reason must say why, in one sentence');
    if (d.ink !== undefined && !INKS.includes(d.ink)) bad.push(`drawing.ink must be ${INKS.join(' or ')}, not ${JSON.stringify(d.ink)}`);
    for (const k of Object.keys(d)) if (!['medium', 'reason', 'ink'].includes(k)) bad.push(`drawing.${k} is not read: the drawing section has medium, reason and ink`);
  }
  if (!Array.isArray(doc.paints) || !doc.paints.length || !doc.paints.every(p => typeof p === 'string' && /^[a-z]+$/.test(p))) bad.push(`${AREA_PLAN_FILE} needs paints: a list of pigment names (src/paint/methods/material-profiles.mjs), for example ["ochre", "ultramarine"]`);
  for (const k of TOKEN_ROUTE_KEYS) if (Object.hasOwn(doc, k)) bad.push(`${AREA_PLAN_FILE}: ${k} belongs to the token route (config.json) and is not read on the area route`);
  if (doc.target?.path !== AREA_TARGET_PATH) bad.push(`target.path must be "${AREA_TARGET_PATH}"`);
  for (const a of Array.isArray(doc.areas) ? doc.areas : []) for (const p of Array.isArray(a?.passes) ? a.passes : []) {
    const key = `${a?.id}/${p?.id}`;
    // a scale on every load's pigment moves paint by a factor to cover what the engine delivers: the plan states values
    // (valueRange), the engine delivers them. Same rule as the token route's refused gains (docs/honesty.md).
    if (p?.load && p.load.pigmentScale !== 1) bad.push(`${key}: load.pigmentScale must be 1: a pigment scale is a gain on delivery; the pass's valueRange states the value`);
    for (const k of Object.keys(p ?? {})) if (GAIN_OPTION.test(k.toLowerCase())) bad.push(`${key}: ${k} is refused: a gain or calibration covers an engine error`);
  }
  return bad;
}

/** The fixed template every area-route painting runs on. compile: the planning step only (--areaplanonly). */
export function areaArgs({ planFile, target, width, sheetmm, out, compile = false, gpu = 'auto', paints, outlineMedium, drawing, opening = null, closing = null, inkProfile = null }) {
  return ['tools/paint-plate.mjs', '--recipe', 'none', '--inkrecipe', 'v2', '--image', target, '--width', String(width), '--scale', '1', '--sheetmm', String(sheetmm),
    '--palettewide', '1', '--paints', paints.join(','), '--physical', '1', '--paperbase', 'source', '--loadedcontact', '1', '--paper', 'coldpress',
    '--drawing', drawing, ...(opening ? ['--drawingfile', opening] : []), ...(closing ? ['--drawinglast', closing] : []), '--outlinemedium', outlineMedium,
    ...(inkProfile ? ['--inkprofile', inkProfile] : []),
    '--mode', 'fast', '--paperphysical', '1', '--frames', '8', '--marks', '1', '--video', '0', '--seed', '0',
    '--out', out, '--targetguard', 'gentle', '--areaplan', planFile, ...(compile ? ['--areaplanonly', '1'] : ['--gpu', gpu])];
}

/**
 * Everything about one area plan: the paint-plate args and the refusals that come before any painting. The plan the
 * painter reads is a copy beside the model's (`area-plan.run.json` in work) with target.path pointing at the real target;
 * nothing else in it changes. Returns {args, problems, layering, planFile, extraOptions, templateOptions}.
 */
export function resolveAreaPlan({ spec, planDir, target, out, work, compile = false, gpu = 'auto', pausedir = null, resumestate = null }) {
  const problems = [];
  const doc = readJson(path.join(planDir, AREA_PLAN_FILE));
  problems.push(...checkAreaDocument(doc));
  for (const stray of ['config.json', 'extra-args.json']) if (fs.existsSync(path.join(planDir, stray))) problems.push(`${stray} belongs to the token route; an area plan is ${AREA_PLAN_FILE} and the line files only`);
  const has = name => fs.existsSync(path.join(planDir, `${name}-lines.json`)) || fs.existsSync(path.join(planDir, `${name}-lines.json.gz`));
  const asked = DRAWING_MEDIA.includes(doc?.drawing?.medium) ? doc.drawing.medium : 'none';
  const requestedNoDrawing = asked === 'none';
  // the subject's medium decides when the plan asks for ink on a subject that shows none (same rule as the token route)
  const rule = subjectMediumRule({ medium: spec.medium, planMedium: requestedNoDrawing ? null : asked, outlineMedium: requestedNoDrawing ? 'none' : asked, extraArgs: [], noDrawing: requestedNoDrawing });
  const noDrawing = requestedNoDrawing || rule.outlineMedium === 'none';
  const medium = noDrawing ? 'none' : rule.outlineMedium;
  const opening = !noDrawing && has('opening') ? path.join(planDir, 'opening') : null;
  const closing = !noDrawing && !rule.firstOnly && has('closing') ? path.join(planDir, 'closing') : null;
  if (!noDrawing && !opening && !closing) problems.push(`drawing.medium is ${asked} but there is no opening-lines.json or closing-lines.json; trace lines (bench/tools/trace-ink.mjs) or set drawing.medium to none`);
  const drawing = noDrawing ? 'none' : closing ? (opening ? 'both' : 'last') : 'first';
  let mediumOverride = rule.override;
  if (mediumOverride) mediumOverride = { ...mediumOverride, closingDropped: has('closing') };
  if (mediumOverride && asked === 'graphite' && !has('closing')) mediumOverride = null;
  const runFile = path.join(work ?? path.dirname(out), 'area-plan.run.json');
  if (doc && typeof doc === 'object' && doc.target && typeof doc.target === 'object') {
    fs.mkdirSync(path.dirname(runFile), { recursive: true });
    fs.writeFileSync(runFile, JSON.stringify({ ...doc, target: { ...doc.target, path: path.resolve(target) } }, null, 1));
  }
  const paints = Array.isArray(doc?.paints) ? doc.paints.filter(p => typeof p === 'string') : [];
  let args = areaArgs({ planFile: runFile, target, width: spec.width, sheetmm: spec.sheetmm, out, compile, gpu, paints: paints.length ? paints : ['none'], outlineMedium: medium, drawing,
    opening, closing, inkProfile: medium === 'ink' && doc?.drawing?.ink ? doc.drawing.ink : null });
  const templateOptions = [];
  for (let i = 1; i < args.length; i += 2) templateOptions.push(args[i].slice(2));
  // ink safety stays with the harness: washes do not lift an opening ink drawing (as on the token route)
  if (medium === 'ink' && opening) args.push('--washinkfree', '1');
  if (spec.medium === 'none' || spec.medium === 'pencil') args.push('--subjectmedium', spec.medium);
  if (spec.recordingMarks != null) args.push('--marks', String(spec.recordingMarks));
  if (spec.segments != null) args.push('--segments', String(spec.segments));
  if (spec.noTargetLooks === true) args.push('--notargetlooks', '1');
  if (spec.offlineFixture === true) args.push('--allowdirty', '1');
  args.push('--wetgate', '0');
  if (pausedir) args.push('--pausedir', pausedir);
  if (resumestate) args.push('--resumestate', resumestate);
  const linesByName = {};
  for (const base of [opening, closing].filter(Boolean)) {
    const f = base + '-lines.json', l = readLines(f);
    if (!l) problems.push(path.basename(f) + ' is missing or not valid JSON'); else linesByName[path.basename(f)] = l;
  }
  problems.push(...checkPlanLimits({}, spec.sheetmm, linesByName, pngSize(target)));
  return {
    args, problems, planFile: runFile, variant: null, extraArgs: [],
    layering: { route: 'area', base: null, applied: [], skipped: {}, edits: {}, valueFloor: null, mediumOverride, lines: lineSources(linesByName, { painterOwnDrawing: false }) },
    modelOptions: [], baseOptions: [], extraOptions: [], templateOptions,
  };
}
