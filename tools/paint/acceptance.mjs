#!/usr/bin/env node
// Two points of the acceptance checklist before a scored run, checked from the run folders themselves:
//   3. What is chosen is painted: a parity row for every final. The kept session folder still holds, hash for hash,
//      the files the session handed over (handed-over.json), and the painting is finished and was painted from it.
//   4. Later tries provably receive their previous painting, replay and arrows: the three sheets lie in the kept
//      folder of the retry and are, by hash, the files that were handed; the retry's first message names each; the
//      painting they were made from is still, by hash, the painting of the run named as previous; each has the
//      model's own line in seen.md; and the row says what the command's log shows of a read (yes, no, or cannot show).
//   node tools/paint/acceptance.mjs <run folder> [<run folder> ...] [--json FILE]
// Prints one table for each point and ends with exit 1 when any row fails. Nothing is painted or changed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHandedOver } from './parity.mjs';
import { SHEET_FILES } from './work-sheets.mjs';

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** The parity row of one final (checklist point 3). `run`: a run folder. {run, subject, author, level, what, files, ok, why}. */
export function parityRow(run) {
  const r = readJson(path.join(run, 'run.json')), base = { run, subject: r?.subject?.id ?? '?', author: r?.author?.name ?? '?', level: r?.author?.session?.level ?? r?.author?.level ?? '?', what: r?.author?.session?.submitted?.what ?? '?' };
  if (!r) return { ...base, files: '', ok: false, why: 'no run.json: not a finished run' };
  if (!r.author?.session) return { ...base, files: '', ok: false, why: 'not a model session\'s run' };
  // the folder the choice was painted from: this run's own kept folder, or the kept session it was painted --from
  const from = r.author.session.reusedFrom ?? run, record = readJson(path.join(from, 'author', 'handed-over.json'));
  if (!record) return { ...base, files: '', ok: false, why: `no handed-over.json in ${path.join(from, 'author')}: what the session handed over was not written down` };
  let files = Object.keys(record.files ?? {}).join(', ') || 'settings only';
  try { checkHandedOver(path.join(from, 'author', 'folder'), record); } catch (e) { return { ...base, files, ok: false, why: e.message }; }
  if (r.failure) return { ...base, files, ok: false, why: `the run failed: ${r.failure}` };
  if (r.mode === 'paint' && r.results?.state !== 'finished') return { ...base, files, ok: false, why: 'the painting is not finished' };
  if (r.author.parity?.same !== true) return { ...base, files, ok: false, why: `the run did not record a parity check when it painted (${r.author.parity?.why ?? 'none'})` };
  if (record.kind !== r.author.session.submitted?.kind) return { ...base, files, ok: false, why: `the record says ${record.kind}, the run painted ${r.author.session.submitted?.kind}` };
  return { ...base, files, ok: true, why: null };
}

/** The handoff row of one retry (checklist point 4), or null for a run that is no retry. {run, subject, author, level, sheets, described, log, assessment, ok, why}. */
export function handoffRow(run) {
  const r = readJson(path.join(run, 'run.json')), s = r?.author?.session;
  if (!s || !r.author.previousTry) return null;
  const from = s.reusedFrom ?? run, base = { run, subject: r.subject.id, author: r.author.name, level: s.level ?? '?' }, need = Object.values(SHEET_FILES).map(f => `previous/${f}`);
  const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  // each sheet as recorded when it was handed: named in the first message, and the file kept in the retry's folder is that file, by hash
  const recorded = Object.fromEntries((r.author.handed ?? []).flatMap(h => h.files.map(f => [`${h.folder}/${f.name}`, f])));
  const there = need.filter(f => { const at = path.join(from, 'author', 'folder', f); return fs.existsSync(at) && fs.statSync(at).size > 0 && recorded[f]?.sha256 === sha(at); });
  const first = (() => { try { return fs.readFileSync(path.join(from, 'author', 'session-prompt.txt'), 'utf8'); } catch { return ''; } })(), named = need.filter(f => first.includes(`\`${f}\``));
  // the previous painting itself: the file the sheets were made from is still the painting of the run named as previous
  const prev = r.author.previousTry, prevNow = prev.painting && fs.existsSync(prev.painting) ? sha(prev.painting) : null;
  const said = need.filter(f => s.pictures?.said?.[f]), log = need.map(f => s.pictures?.logShowsRead?.[f]), logWord = log.every(v => v === true) ? 'read in the log' : log.every(v => v == null) ? 'this command\'s log cannot show a read' : `${log.filter(v => v === true).length} of 3 read in the log`;
  const row = { ...base, sheets: `${there.length} of 3`, firstMessage: `${named.length} of 3 named`, previousPainting: prevNow == null ? 'not on this machine' : prevNow === prev.paintingSha256 ? 'same by hash' : 'CHANGED', described: `${said.length} of 3`, log: logWord, assessment: s.assessment?.written ? 'written' : 'not written' };
  if (there.length < 3) return { ...row, ok: false, why: `the retry's folder lacks, or holds another file than was handed (by hash): ${need.filter(f => !there.includes(f)).join(', ')}` };
  if (named.length < 3) return { ...row, ok: false, why: `the retry's first message (author/session-prompt.txt) does not name ${need.filter(f => !named.includes(f)).join(', ')}` };
  if (prevNow != null && prevNow !== prev.paintingSha256) return { ...row, ok: false, why: `the painting of the run named as previous (${prev.painting}) is not the one the sheets were made from` };
  if (said.length < 3) return { ...row, ok: false, why: `no line of the model's own in seen.md for ${need.filter(f => !said.includes(f)).join(', ')}` };
  return { ...row, ok: true, why: null };
}

/** Rows as a plain table. */
export function table(rows, cols) {
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  return [cols.map((c, i) => c.padEnd(w[i])).join('  '), ...rows.map(r => cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  '))].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--json'), json = at < 0 ? null : args.splice(at, 2)[1];
  if (!args.length) { console.error('usage: node tools/paint/acceptance.mjs <run folder> [<run folder> ...] [--json FILE]'); process.exit(2); }
  const say = r => ({ ...r, run: path.basename(r.run), result: r.ok ? 'ok' : `FAIL: ${r.why}` });
  const parity = args.map(parityRow), handoff = args.map(handoffRow).filter(Boolean);
  console.log(`3. What is chosen is painted: ${parity.filter(r => r.ok).length} of ${parity.length} finals have a parity row that holds\n`);
  console.log(table(parity.map(say), ['run', 'subject', 'author', 'level', 'what', 'files', 'result']));
  console.log(`\n4. Later tries receive their previous painting, replay and arrows: ${handoff.filter(r => r.ok).length} of ${handoff.length} retries${handoff.length ? '' : ' (no retry among these runs)'}\n`);
  if (handoff.length) console.log(table(handoff.map(say), ['run', 'subject', 'author', 'level', 'sheets', 'firstMessage', 'previousPainting', 'described', 'log', 'assessment', 'result']));
  if (json) fs.writeFileSync(json, JSON.stringify({ parity, handoff }, null, 1) + '\n');
  process.exit(parity.some(r => !r.ok) || handoff.some(r => !r.ok) ? 1 : 0);
}
