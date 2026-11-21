// The numbers of a finished queue, one row a painting, for the table beside its contact sheet: what was planned
// (shapes, washes, strokes), the widest wash brush on the whole sheet and inside the living forms, the soft joins
// the planner logged, the cheat-risk, the time and the commit. Pure: the run record, the value plan and the log
// are handed in.

/** Kinds of named form in which a wide wash brush is a fault: a face or a body is not laid with the mop. */
export const LIVING = new Set(['face', 'eye', 'figure', 'animal', 'fur', 'hair']);

/** The widest brush (mm) over all passes, and over the passes that lie more than half inside living forms. */
export function widestBrushes(passes) {
  let all = 0, living = 0, livingPass = null;
  for (const p of passes ?? []) {
    const w = Number(p.widestBrushMm) || 0; all = Math.max(all, w);
    const share = (p.forms ?? []).filter(f => LIVING.has(f.kind)).reduce((a, f) => a + (Number(f.share) || 0), 0);
    if (share > 0.5 && w > living) { living = w; livingPass = p.id ?? null; }
  }
  return { all: all || null, living: living || null, livingPass };
}

/** "N laid against a damp neighbour" of the planner's summary line in a run log; null when the line is not there. */
export function softJoinsOf(logText) {
  const m = /(\d+) laid against a damp neighbour/.exec(logText ?? '');
  return m ? Number(m[1]) : null;
}

/** One row of the table from a run record (run.json), its value plan and its log. */
export function resultRow(record, plan, logText) {
  const res = record.results ?? {}, p = res.plan, b = widestBrushes(plan?.passes), risk = res.cheatRisk;
  return {
    subject: record.subject.variant ? `${record.subject.id}:${record.subject.variant}` : record.subject.id,
    commit: `${record.code?.commit?.slice(0, 8) ?? '?'}${record.code?.dirty ? '+dirty' : ''}`,
    minutes: record.seconds != null ? +(record.seconds / 60).toFixed(1) : null,
    shapes: p?.shapes ?? null, washes: p?.washes ?? null, strokes: p?.strokes ?? null,
    widestMm: b.all, widestLivingMm: b.living, softJoins: softJoinsOf(logText),
    risk: risk?.level ? `${risk.level} ${risk.risk}` : risk?.error ? 'not measured' : null,
    backend: res.backend ? `${res.backend.backend}${res.backend.fallback ? ' (FELL BACK)' : ''}` : null,
    error: record.failure ?? null,
  };
}

const cell = v => (v == null || v === '' ? '-' : String(v).replace(/\|/g, '/').replace(/\s+/g, ' '));
/** The rows as a Markdown table. */
export function resultsTable(rows) {
  const cols = [['subject', 'Subject'], ['commit', 'Commit'], ['minutes', 'Wall min'], ['shapes', 'Shapes'], ['washes', 'Washes'], ['strokes', 'Strokes'], ['widestMm', 'Widest wash brush mm'], ['widestLivingMm', 'Widest in face/figure/animal/fur mm'], ['softJoins', 'Soft joins'], ['risk', 'Cheat-risk'], ['backend', 'Backend'], ['error', 'Error']];
  return [`| ${cols.map(c => c[1]).join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map(r => `| ${cols.map(c => cell(c[0] === 'error' && r.error ? r.error.slice(0, 160) : r[c[0]])).join(' | ')} |`)].join('\n');
}
