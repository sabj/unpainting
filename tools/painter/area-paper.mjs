// The paper is not a shape (eye 14:45 #7; painting-rules 3, 24). A painter tones the sheet first when the subject sits
// on a toned page, and ignores the page's own blemishes: foxing, stains, a sheet border, ruled guide lines.
//   pass.tone {paint, amount, reason}: the pass lays one wash of `paint` over its whole area (off reserved lights), at
//     `amount` of pigment per cell in the value ladder's units, whatever the ladder holds there; it takes no ladder paint
//     and has no valueRange. On the area that holds the whole sheet this is toning the page first.
//   doc.ignore [{polygon, reason}]: marks of the page itself that the painter does not paint; the ladder's paint inside
//     them is dropped and counted (diagnostics.ignoredDemandCells), never laid.
// Nothing here reads the target: the planner names the tone and the blemishes.
import { paintMix } from './area-washes.mjs';

const fail = m => { throw Error(`semantic areas: ${m}`); };
const finite = x => typeof x === 'number' && Number.isFinite(x);

export const AREA_PAPER_CONTRACT = Object.freeze({
  tone: 'Optional pass.tone:{paint:{pigment:share},amount,reason} on a wet on wet or wet on dry pass (not authored, no valueRange): one wash of paint over the whole area at amount (0..1] of pigment per cell in the value ladder units, whatever the ladder holds there; on the sheet-wide area it tones the page first.',
  ignore: 'Optional ignore:[{polygon,reason}]: blemishes of the page itself (foxing, stains, a sheet border, ruled lines) that are not painted; the ladder paint inside is dropped and counted.',
});

/** Checks pass.tone (document level). */
export function validateTone(pass, key) {
  const t = pass.tone;
  if (t === undefined) return;
  if (typeof t !== 'object' || t === null) fail(`tone ${key}`);
  for (const k of Object.keys(t)) if (!['paint', 'amount', 'reason'].includes(k)) fail(`tone ${key}: unknown field ${k}`);
  if (pass.source === 'authored') fail(`tone ${key}: not on authored passes`);
  if (!['wet on wet', 'wet on dry'].includes(pass.move)) fail(`tone ${key}: a tone is a wash, wet on wet or wet on dry`);
  if (pass.valueRange !== undefined) fail(`tone ${key}: a tone pass takes no ladder paint, so it has no valueRange`);
  if (typeof t.reason !== 'string' || !t.reason.trim()) fail(`tone ${key}.reason required`);
  if (typeof t.paint !== 'object' || t.paint === null || !Object.keys(t.paint).length || !Object.values(t.paint).every(v => finite(v) && v > 0)) fail(`tone ${key}: paint {pigment: share} required`);
  if (!finite(t.amount) || t.amount <= 0 || t.amount > 1) fail(`tone ${key}: amount (0, 1]`);
}

/** Checks doc.ignore (document level). polygonCheck validates a polygon; text a reason. */
export function validateIgnore(doc, polygonCheck, text) {
  if (doc.ignore === undefined) return;
  if (!Array.isArray(doc.ignore)) fail('ignore must be a list');
  for (const x of doc.ignore) { polygonCheck(x?.polygon, 'ignore'); text(x.reason, 'ignore.reason'); }
}

/** The tone pass's one wash: the area's cells off reserved lights, holding paint shares at the stated amount. */
export function toneShape(plan, s, palette) {
  const a = plan.doc.areas.indexOf(s.area), cells = new Uint8Array(plan.owner.length);
  let count = 0;
  for (let i = 0; i < cells.length; i++) if (plan.owner[i] === a && !plan.reserves[i] && !plan.film[i]) { cells[i] = 1; count++; }
  return { cells, count, mix: paintMix(s.pass.tone.paint, palette, s.pass.tone.amount, `tone ${s.key}`) };
}
