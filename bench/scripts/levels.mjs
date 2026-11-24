// The 0.4 benchmark levels: Auto and L1 to L4, and each model's score measured against Auto. See ../docs/levels.md.
// Pure functions over flat painting records. Nothing here reads a file or a run folder (summary04.mjs does that).
//
// A record is one painting:
//   { level: 'Auto' | 'L1' | 'L2' | 'L3' | 'L4', subject, model (not for Auto), try (default 1), score (on the scale),
//     failed (true when the run failed, the painter refused the script or there is no painting), commit, judgeVersion,
//     judgeProfile, autoCommit (optional, on a model record: the Auto commit it was given or compared with),
//     progression, cheatRisk, likeness (side readings, shown beside and never part of a score) }
// Every level is ONE fresh, independent session (the definition, 24 Nov 2026: L1 picture + format + tips; L2 +
// prepared studies, drawing, named forms, traced shapes; L3 + Auto's plan and finished painting; L4 L3's inputs in an
// open session with tools). Where a level holds several tries (a test run), the LAST counts, never the best.
import { mean, bootstrapMean } from './lib.mjs';

/** The levels in order. `was` is the old round the level grew out of, for display only. */
export const LEVELS = [
  { id: 'Auto', header: 'Code planner alone', was: null },
  { id: 'L1', header: 'Picture, format and painting tips', was: 'V3' },
  { id: 'L2', header: 'Prepared studies, drawing, named forms and traced shapes', was: 'V4' },
  { id: 'L3', header: 'L2 plus Auto\'s plan and finished painting', was: 'V5' },
  { id: 'L4', header: 'L3\'s inputs in an open session with tools', was: null },
];
const MODEL_LEVELS = ['L1', 'L2', 'L3', 'L4'];
/** Adjacent levels whose pairwise delta is reported whenever both ran on the same pictures. */
const STEPS = { L3: 'L2', L4: 'L3' };
export const LEVEL_NOTE = 'Each level is one fresh, independent session (L1: picture, format and tips; L2: + prepared studies, drawing, named forms and traced shapes; L3: + Auto\'s plan and finished painting; L4: L3\'s inputs in an open session with tools).';

/** Old round name to new level name, for labels only. V1 and V2 have no new name: they are not in the new benchmark. */
export const ALIASES = Object.freeze({ V3: 'L1', V4: 'L2', V5: 'L3' });   // the rounds the first three levels grew out of; level 4 has none
/** The new name of an old round, or null for a round that was dropped (V1, V2) or never existed. */
export const levelFor = oldRound => ALIASES[oldRound] ?? null;
export const headerFor = id => LEVELS.find(l => l.id === id)?.header ?? null;

/** The two score scales. With a win rate against Auto, Auto is 0.5 by definition and is never measured. */
export const SCALES = Object.freeze({
  score10: Object.freeze({ id: 'score10', min: 0, max: 10 }),
  winRate: Object.freeze({ id: 'winRate', min: 0, max: 1, auto: 0.5 }),
});
export const DEFAULT_FLOOR_SHARE = 0.2;

function checkScale(scale, floorShare) {
  if (!(Number.isFinite(scale?.min) && Number.isFinite(scale?.max) && scale.max > scale.min)) throw new Error('levels: the scale needs a min and a larger max');
  if (!(floorShare > 0 && floorShare <= 1)) throw new Error('levels: the headroom floor is a share of the scale, above 0 and at most 1; without a floor a subject Auto paints perfectly has no headroom to divide by');
}
const onScale = (v, scale) => Number.isFinite(v) && v >= scale.min && v <= scale.max;

/** Room left above Auto on one subject: the top of the scale minus Auto's score, never less than the floor. */
export function headroom(autoScore, { scale = SCALES.score10, floorShare = DEFAULT_FLOOR_SHARE } = {}) {
  checkScale(scale, floorShare);
  if (!onScale(autoScore, scale)) throw new Error(`levels: Auto score ${autoScore} is outside the scale ${scale.min} to ${scale.max}`);
  return Math.max(scale.max - autoScore, floorShare * (scale.max - scale.min));
}

/** The share of the headroom a model closed on one subject. 0 is level with Auto, negative is worse than Auto. */
export function adjustedScore(modelScore, autoScore, opts = {}) {
  const scale = opts.scale ?? SCALES.score10;
  const room = headroom(autoScore, opts);
  if (!onScale(modelScore, scale)) throw new Error(`levels: model score ${modelScore} is outside the scale ${scale.min} to ${scale.max}`);
  return (modelScore - autoScore) / room;
}

const judgeOf = r => `${r.judgeVersion ?? ''}${r.judgeProfile ? ` ${r.judgeProfile}` : ''}`;
const one = (values, what, why) => {
  const set = [...new Set(values)];
  if (set.length !== 1) throw new Error(`levels: ${what}: ${set.map(v => v || '(none)').join(', ')}. ${why}`);
  return set[0];
};

/** The score a record counts with: the bottom of the scale for a failed painting, never blank. A painting that exists but has no score is refused. */
function counted(r, scale, label) {
  if (r.failed === true) return { score: scale.min, failed: true };
  if (!onScale(r.score, scale)) throw new Error(`levels: ${label} has no valid score on the scale ${scale.min} to ${scale.max} and is not marked failed. Finish its judging, or mark it failed if there is no painting`);
  return { score: r.score, failed: false };
}
const side = r => ({ progression: r?.progression ?? null, cheatRisk: r?.cheatRisk ?? null });

/** Auto's score per subject, from one frozen commit and one judge. Throws when the records cannot stand as one baseline. */
function autoBaseline(autoRecords, scale) {
  if (!autoRecords.length) throw new Error('levels: no Auto records. Every subject needs Auto painted and judged before a model can be scored against it');
  if (autoRecords.some(r => !r.commit)) throw new Error('levels: an Auto record has no commit. Auto must come from one frozen commit, so every Auto record names it');
  if (autoRecords.some(r => !r.judgeVersion)) throw new Error('levels: an Auto record has no judge version');
  const commit = one(autoRecords.map(r => r.commit), 'Auto records come from different commits',
    'Headroom is measured from Auto, so a changed Auto would move every model score. Repaint Auto for every subject on one frozen commit');
  const judge = one(autoRecords.map(judgeOf), 'Auto records were scored by different judges',
    'Scores from different judge versions or profiles are not comparable. Score every Auto painting with one judge');
  const bySubject = new Map();
  for (const r of autoRecords) {
    if (bySubject.has(r.subject)) throw new Error(`levels: two Auto records for ${r.subject}. Auto is one painting per subject`);
    let score;
    if (scale.auto != null) {
      if (r.failed === true) throw new Error(`levels: Auto has no painting of ${r.subject}, so nothing can be compared with it`);
      if (r.score != null && r.score !== scale.auto) throw new Error(`levels: Auto on ${r.subject} is given as ${r.score}; on the ${scale.id} scale Auto is ${scale.auto} by definition`);
      score = scale.auto;
    } else score = counted(r, scale, `Auto on ${r.subject}`).score;
    bySubject.set(r.subject, { score, failed: r.failed === true, ...side(r) });
  }
  return { commit, judge, bySubject };
}

/**
 * One model's results against Auto.
 * `scheduled`: {level: [subjects]}, the pictures the benchmark runs at each level (bench/run-sets.json: the core on
 * the whole ladder, the others at Auto and level 2). Without it every subject Auto painted is scheduled at every
 * level the model entered. A scheduled picture the model has no painting of, or whose run failed, scores the bottom
 * of the scale: it is counted, never dropped. A level counts its last try. Throws rather than combine records that do
 * not belong together.
 */
export function summarize(records, { scale = SCALES.score10, floorShare = DEFAULT_FLOOR_SHARE, model, seed = 7, scheduled = null } = {}) {
  checkScale(scale, floorShare);
  for (const r of records) {
    if (ALIASES[r.level] || r.level === 'V1' || r.level === 'V2') throw new Error(`levels: a record is labelled ${r.level}. Old rounds are published history and are never recomputed or mixed with the new levels; the old names are for labels only`);
    if (!LEVELS.some(l => l.id === r.level)) throw new Error(`levels: unknown level ${r.level}`);
    if (!r.subject) throw new Error('levels: a record has no subject');
  }
  const auto = autoBaseline(records.filter(r => r.level === 'Auto'), scale);
  const mine = records.filter(r => r.level !== 'Auto' && (model == null || r.model === model));
  if (!mine.length) throw new Error(`levels: no model records${model == null ? '' : ` for ${model}`}`);
  const name = one(mine.map(r => r.model), 'records from more than one model', 'Summarize one model at a time: pass { model }');
  for (const r of mine) {
    const label = `${name} ${r.level} ${r.subject}`;
    if (!auto.bySubject.has(r.subject)) throw new Error(`levels: ${label} has no Auto painting of that subject to measure against`);
    if (r.failed !== true && judgeOf(r) !== auto.judge) throw new Error(`levels: ${label} was scored by ${judgeOf(r) || '(no judge)'} and Auto by ${auto.judge}. Scores from different judges are not comparable; rescore one side`);
    if (r.autoCommit != null && r.autoCommit !== auto.commit) throw new Error(`levels: ${label} was run against Auto at ${r.autoCommit}, but these Auto scores are from ${auto.commit}. A model is only measured against the Auto it was given`);
    if (scheduled && !(scheduled[r.level] ?? []).includes(r.subject)) throw new Error(`levels: ${label} is not in the schedule: ${r.subject} is not run at ${r.level}. A painting outside the schedule is never averaged in`);
  }
  const tryOf = r => r.try ?? 1;
  const at = (level, subject) => mine.filter(r => r.level === level && r.subject === subject);
  const entered = Object.fromEntries(MODEL_LEVELS.map(l => [l, mine.some(r => r.level === l)]));
  const runsAt = level => (scheduled ? (scheduled[level] ?? []) : [...auto.bySubject.keys()]);
  for (const level of MODEL_LEVELS.filter(l => entered[l])) for (const sub of runsAt(level)) if (!auto.bySubject.has(sub)) throw new Error(`levels: ${sub} is scheduled at ${level} and Auto has no record of it. Every scheduled picture needs Auto painted and judged`);
  const opts = { scale, floorShare };
  const missing = { score: scale.min, failed: true, missing: true, try: null, progression: null, cheatRisk: null, likeness: null };
  const cell = (r, autoScore, label) => {
    const c = r ? { ...counted(r, scale, label), try: tryOf(r), ...side(r), likeness: r.likeness ?? null, why: r.failed === true ? r.why ?? null : null } : { ...missing };
    return { ...c, adjusted: adjustedScore(c.score, autoScore, opts) };
  };

  const subjects = [...auto.bySubject].map(([subject, a]) => {
    const room = headroom(a.score, opts);
    const row = { subject, auto: a, headroom: room, floored: room > scale.max - a.score, levels: {} };
    for (const level of MODEL_LEVELS.filter(l => entered[l] && runsAt(l).includes(subject))) {
      const rs = at(level, subject), label = `${name} ${level} ${subject}`;
      const tries = rs.map(tryOf);
      if (new Set(tries).size !== tries.length) throw new Error(`levels: ${label} has two records for the same try`);
      // one try a level; where a test run made several, the last counts and never the best
      row.levels[level] = { ...cell(rs.sort((x, y) => tryOf(y) - tryOf(x))[0], a.score, label), triesMade: rs.length };
    }
    return row;
  });

  const levels = {};
  for (const level of MODEL_LEVELS.filter(l => entered[l])) {
    const rows = subjects.filter(s => s.levels[level]);
    if (!rows.length) throw new Error(`levels: no picture is scheduled at ${level}, and ${name} has ${level} records`);
    const cells = rows.map(s => s.levels[level]), adj = cells.map(c => c.adjusted), rooms = rows.map(s => s.headroom);
    const total = rooms.reduce((x, y) => x + y, 0);
    levels[level] = {
      header: headerFor(level), subjects: cells.length, failed: cells.filter(c => c.failed).length, missing: cells.filter(c => c.missing).length,
      adjusted: mean(adj), interval: bootstrapMean(adj, { seed }),
      rawMean: mean(cells.map(c => c.score)),
      weightedRaw: cells.reduce((x, c, i) => x + c.score * rooms[i], 0) / total,
      autoWeightedRaw: rows.reduce((x, s, i) => x + s.auto.score * rooms[i], 0) / total,
      autoRawMean: mean(rows.map(s => s.auto.score)),
    };
  }
  // each adjacent step on the pictures both levels ran (levels are independent, so either may be absent)
  const steps = {};
  for (const [l, before] of Object.entries(STEPS)) {
    if (!entered[l] || !entered[before]) continue;
    const rows = subjects.filter(s => s.levels[l] && s.levels[before]);
    const d = rows.map(s => s.levels[l].adjusted - s.levels[before].adjusted);
    steps[l] = { from: before, subjects: d.length, adjusted: d.length ? mean(d) : null, interval: d.length ? bootstrapMean(d, { seed }) : null, raw: d.length ? mean(rows.map(s => s.levels[l].score - s.levels[before].score)) : null };
  }
  return { model: name, scale: scale.id ?? `${scale.min}..${scale.max}`, floorShare, auto: { commit: auto.commit, judge: auto.judge }, subjects, levels, steps, learned: steps.L3 ?? null };
}

const num = (v, digits = 2) => (v == null ? 'n/a' : (+v.toFixed(digits)).toString());
const signed = v => (v == null ? 'n/a' : `${v > 0 ? '+' : ''}${num(v)}`);
const scoreCell = c => (c ? `${num(c.score)}${c.missing ? ' (no painting)' : c.failed ? ' (failed)' : ''}` : 'not run');
const sideCell = (row, key) => ['Auto', ...MODEL_LEVELS].map(l => [l, l === 'Auto' ? row.auto : row.levels[l]])
  .filter(([, c]) => c).map(([l, c]) => `${l} ${num(c[key])}`).join(', ');

/** One model's subjects as a Markdown table. The last row is the model's headline for each level. */
export function subjectTable(summary) {
  const head = ['Subject', 'Auto', ...MODEL_LEVELS, 'Headroom', ...MODEL_LEVELS.map(l => `Adjusted ${l}`), 'Progression', 'Cheat-risk'];
  const rows = summary.subjects.map(s => [s.subject, num(s.auto.score),
    ...MODEL_LEVELS.map(l => scoreCell(s.levels[l])),
    `${num(s.headroom)}${s.floored ? ' (floor)' : ''}`,
    ...MODEL_LEVELS.map(l => (s.levels[l] ? signed(s.levels[l].adjusted) : 'not run')),
    sideCell(s, 'progression'), sideCell(s, 'cheatRisk')]);
  const headline = l => { const v = summary.levels[l]; return v ? `${signed(v.adjusted)}${v.interval ? ` (${signed(v.interval[0])} to ${signed(v.interval[1])})` : ''}` : 'not run'; };
  const meanCell = l => { const v = summary.levels[l]; return v ? `${num(v.rawMean)} (${v.subjects} pictures${v.failed ? `, ${v.failed} failed` : ''})` : 'not run'; };
  rows.push(['Mean', '', ...MODEL_LEVELS.map(meanCell), '', ...MODEL_LEVELS.map(headline), '', '']);
  const line = cells => `| ${cells.join(' | ')} |`;
  const out = [line(head), line(head.map((_, i) => (i === 0 || i >= head.length - 2 ? '---' : '---:'))), ...rows.map(line)];
  out.push('');
  for (const [l, st] of Object.entries(summary.steps ?? {})) if (st.subjects) out.push(`${l} minus ${st.from}, the ${st.subjects} pictures both ran: ${signed(st.adjusted)} of headroom${st.interval ? ` (${signed(st.interval[0])} to ${signed(st.interval[1])})` : ''}.`);
  out.push(LEVEL_NOTE, '', 'A failed run, or a scheduled picture with no painting, counts as the bottom of the scale; none is left out of a mean.',
    `Auto: commit ${summary.auto.commit}, judge ${summary.auto.judge}. Progression and cheat-risk are shown beside the score and are not part of it.`);
  return out.join('\n');
}
