// The 0.4 benchmark levels: Auto, L1, L2 and L3, and each model's score measured against Auto. See ../docs/levels.md.
// Pure functions over flat painting records. Nothing here reads a file or a run folder.
//
// A record is one painting:
//   { level: 'Auto' | 'L1' | 'L2' | 'L3', subject, model (not for Auto), try (default 1), score (on the scale),
//     failed (true when the painter refused the plan or there is no painting), commit, judgeVersion, judgeProfile,
//     autoCommit (optional, on a model record: the Auto commit it was given or compared with),
//     progression, cheatRisk (side indexes, shown beside and never part of a score) }
import { mean, bootstrapMean } from './lib.mjs';

/** The levels in order. `was` is the old round name, for display only. */
export const LEVELS = [
  { id: 'Auto', header: 'Code planner alone', was: null },
  { id: 'L1', header: 'Freehand, own tries', was: 'V3' },
  { id: 'L2', header: 'Tuning the code planner, one try', was: 'V4' },
  { id: 'L3', header: 'Tuning the code planner, third try', was: 'V5' },
];
const MODEL_LEVELS = ['L1', 'L2', 'L3'];
const L3_TRIES = 3;

/** Old round name to new level name, for labels only. V1 and V2 have no new name: they are not in the new benchmark. */
export const ALIASES = Object.freeze({ V3: 'L1', V4: 'L2', V5: 'L3' });
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
 * Every subject Auto painted counts at every level the model entered: a subject the model has no painting of scores
 * the bottom of the scale. L3 counts its third try; the best of the three tries (the L2 try is the first) is kept
 * beside it. Throws rather than combine records that do not belong together.
 */
export function summarize(records, { scale = SCALES.score10, floorShare = DEFAULT_FLOOR_SHARE, model, seed = 7 } = {}) {
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
    if (judgeOf(r) !== auto.judge) throw new Error(`levels: ${label} was scored by ${judgeOf(r) || '(no judge)'} and Auto by ${auto.judge}. Scores from different judges are not comparable; rescore one side`);
    if (r.autoCommit != null && r.autoCommit !== auto.commit) throw new Error(`levels: ${label} was run against Auto at ${r.autoCommit}, but these Auto scores are from ${auto.commit}. A model is only measured against the Auto it was given`);
  }
  const tryOf = r => r.try ?? 1;
  const at = (level, subject) => mine.filter(r => r.level === level && r.subject === subject);
  const entered = Object.fromEntries(MODEL_LEVELS.map(l => [l, mine.some(r => r.level === l)]));
  if (entered.L3 && !entered.L2) throw new Error(`levels: ${name} has L3 records and no L2 records. The first of the three L3 tries is the L2 try`);
  const opts = { scale, floorShare };
  const missing = { score: scale.min, failed: true, missing: true, try: null, progression: null, cheatRisk: null };
  const cell = (r, autoScore, label) => {
    const c = r ? { ...counted(r, scale, label), try: tryOf(r), ...side(r) } : { ...missing };
    return { ...c, adjusted: adjustedScore(c.score, autoScore, opts) };
  };

  const subjects = [...auto.bySubject].map(([subject, a]) => {
    const room = headroom(a.score, opts);
    const row = { subject, auto: a, headroom: room, floored: room > scale.max - a.score, levels: {} };
    for (const level of MODEL_LEVELS.filter(l => entered[l])) {
      const rs = at(level, subject), label = `${name} ${level} ${subject}`;
      const tries = rs.map(tryOf);
      if (new Set(tries).size !== tries.length) throw new Error(`levels: ${label} has two records for the same try`);
      if (level === 'L2' && rs.length > 1) throw new Error(`levels: ${label} has ${rs.length} tries. L2 is one try`);
      if (level === 'L3') {
        if (tries.some(t => t !== 2 && t !== L3_TRIES)) throw new Error(`levels: ${label} may only hold tries 2 and 3. Try 1 is the L2 record`);
        const third = cell(rs.find(r => tryOf(r) === L3_TRIES), a.score, label);
        const earlier = [at('L2', subject)[0], rs.find(r => tryOf(r) === 2)].filter(Boolean).map(r => ({ try: r.level === 'L2' ? 1 : 2, ...counted(r, scale, label) }));
        const best = [...earlier, { try: L3_TRIES, score: third.score }].sort((x, y) => y.score - x.score || y.try - x.try)[0];
        row.levels.L3 = { ...third, try: L3_TRIES, triesMade: 1 + rs.length - (at('L2', subject).length ? 0 : 1), best: { try: best.try, score: best.score } };
      } else {
        // L1 may hold several tries; the last one counts, as at L3
        row.levels[level] = cell(rs.sort((x, y) => tryOf(y) - tryOf(x))[0], a.score, label);
      }
    }
    return row;
  });

  const levels = {};
  for (const level of MODEL_LEVELS.filter(l => entered[l])) {
    const cells = subjects.map(s => s.levels[level]), adj = cells.map(c => c.adjusted), rooms = subjects.map(s => s.headroom);
    const total = rooms.reduce((a, b) => a + b, 0);
    levels[level] = {
      header: headerFor(level), subjects: cells.length, failed: cells.filter(c => c.failed).length,
      adjusted: mean(adj), interval: bootstrapMean(adj, { seed }),
      rawMean: mean(cells.map(c => c.score)),
      weightedRaw: cells.reduce((a, c, i) => a + c.score * rooms[i], 0) / total,
      autoWeightedRaw: subjects.reduce((a, s, i) => a + s.auto.score * rooms[i], 0) / total,
      ...(level === 'L3' ? { bestOfThreeRawMean: mean(cells.map(c => c.best.score)) } : {}),
    };
  }
  let learned = null;
  if (entered.L3) {
    const d = subjects.map(s => s.levels.L3.adjusted - s.levels.L2.adjusted);
    learned = { subjects: d.length, adjusted: mean(d), interval: bootstrapMean(d, { seed }), raw: mean(subjects.map(s => s.levels.L3.score - s.levels.L2.score)) };
  }
  return { model: name, scale: scale.id ?? `${scale.min}..${scale.max}`, floorShare, auto: { commit: auto.commit, judge: auto.judge }, subjects, levels, learned };
}

const num = (v, digits = 2) => (v == null ? 'n/a' : (+v.toFixed(digits)).toString());
const signed = v => (v == null ? 'n/a' : `${v > 0 ? '+' : ''}${num(v)}`);
const scoreCell = c => (c ? `${num(c.score)}${c.missing ? ' (no painting)' : c.failed ? ' (failed)' : ''}` : 'not run');
const sideCell = (row, key) => ['Auto', ...MODEL_LEVELS].map(l => [l, l === 'Auto' ? row.auto : row.levels[l]])
  .filter(([, c]) => c).map(([l, c]) => `${l} ${num(c[key])}`).join(', ');

/** One model's subjects as a Markdown table. The last row is the model's headline for each level. */
export function subjectTable(summary) {
  const head = ['Subject', 'Auto', 'L1', 'L2', 'L3 (third try)', 'Headroom', 'Adjusted L1', 'Adjusted L2', 'Adjusted L3', 'Progression', 'Cheat-risk'];
  const rows = summary.subjects.map(s => [s.subject, num(s.auto.score),
    scoreCell(s.levels.L1), scoreCell(s.levels.L2),
    s.levels.L3 ? `${scoreCell(s.levels.L3)}, best of three ${num(s.levels.L3.best.score)}` : 'not run',
    `${num(s.headroom)}${s.floored ? ' (floor)' : ''}`,
    ...MODEL_LEVELS.map(l => (s.levels[l] ? signed(s.levels[l].adjusted) : 'not run')),
    sideCell(s, 'progression'), sideCell(s, 'cheatRisk')]);
  const headline = l => { const v = summary.levels[l]; return v ? `${signed(v.adjusted)}${v.interval ? ` (${signed(v.interval[0])} to ${signed(v.interval[1])})` : ''}` : 'not run'; };
  rows.push(['Mean', '', ...MODEL_LEVELS.map(l => (summary.levels[l] ? num(summary.levels[l].rawMean) : 'not run')), '', ...MODEL_LEVELS.map(headline), '', '']);
  const line = cells => `| ${cells.join(' | ')} |`;
  const out = [line(head), line(head.map((_, i) => (i === 0 || i >= 9 ? '---' : '---:'))), ...rows.map(line)];
  if (summary.learned) out.push('', `Learned (L3 minus L2, same subjects): ${signed(summary.learned.adjusted)} of headroom${summary.learned.interval ? ` (${signed(summary.learned.interval[0])} to ${signed(summary.learned.interval[1])})` : ''}.`);
  out.push('', `Auto: commit ${summary.auto.commit}, judge ${summary.auto.judge}. Progression and cheat-risk are shown beside the score and are not part of it.`);
  return out.join('\n');
}
