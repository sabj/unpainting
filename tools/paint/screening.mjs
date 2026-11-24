#!/usr/bin/env node
// The benchmark's first stage (bench/run-sets.json, "rounds"): every model of the roster paints the screening
// pictures at level 2 in fixed rounds; the ranking names who goes on to the remaining core pictures and the other
// levels (the top half by default, and never fewer than one of each family).
//   node tools/paint/screening.mjs plan [--pictures a,b] [--authors k1,k2] [--out DIR]   the stage's command; starts nothing
//   node tools/paint/screening.mjs rank DIR/results.json [--keep N]                      who goes on (after bench:score04)
// Every (model, picture) is its own run, so the one command runs them all at once: model replies in parallel (agy
// three at a time), looks and finals on the render pool (UNPAINT_RENDER=pool, UNPAINT_POOL_CAP pods).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const FILE = new URL('../../bench/run-sets.json', import.meta.url);

/** The rounds stage of the run sets file, checked: {roster: [{key, name, family}], screening: {level, pictures, keep, leastPerFamily}}. */
export function loadRounds(doc = JSON.parse(fs.readFileSync(FILE, 'utf8'))) {
  const bad = why => { throw new Error(`bench/run-sets.json, rounds: ${why}`); }, r = doc.rounds;
  if (!r) bad('no "rounds" section');
  if (!Array.isArray(r.roster) || !r.roster.length || r.roster.some(m => !m.key || !m.name || !m.family)) bad('roster: a list of {key, name, family}');
  if (new Set(r.roster.map(m => m.key)).size !== r.roster.length) bad('roster: a key is listed twice');
  // the roster of the run sets file is the one list of models: the rounds stage gives each its family, and names no other
  const named = doc.roster?.models; if (named && (named.length !== r.roster.length || r.roster.some(m => !named.includes(m.key)))) bad(`roster: its models are not those of the file's "roster" (${named.join(', ')})`);
  const s = r.screening ?? bad('no "screening" stage'), ids = new Set((doc.pictures ?? []).map(p => p.id));
  if (!Array.isArray(s.pictures) || !s.pictures.length) bad('screening: its pictures');
  for (const p of s.pictures) if (!ids.has(p)) bad(`screening: ${p} is not one of the benchmark's pictures`);
  if (s.keep != null && !(Number.isInteger(s.keep) && s.keep >= 1)) bad('screening: keep is a whole number, or null for the top half');
  return { roster: r.roster, screening: { level: s.level ?? 'L2', pictures: s.pictures, keep: s.keep ?? null, leastPerFamily: s.leastPerFamily ?? 1 } };
}

/** The screening stage's command, as a person types it. The final of every run records the full film (240 frames). */
export function screeningCommand(rounds, { pictures = null, authors = null, out = null } = {}) {
  return `UNPAINT_RENDER=pool npm run paint -- ${(pictures ?? rounds.screening.pictures).join(',')} paint --work rounds --level ${rounds.screening.level} --author ${(authors ?? rounds.roster.map(m => m.key)).join(',')} --set video=1 --set frames=240${out ? ` --out ${out}` : ''}`;
}

/**
 * Who goes on. `scores`: [{author, subject, score (0 to 100, or null: failed, counted as 0)}], the screening
 * pictures' level 2 paintings. {ranked: [{key, name, family, mean, paintings, failed, missing, on, why}], keep}.
 * A model with a scheduled painting missing is ranked with that painting as 0, and it is said.
 */
export function rank(rounds, scores, { keep = rounds.screening.keep } = {}) {
  const n = keep ?? Math.ceil(rounds.roster.length / 2), pictures = rounds.screening.pictures;
  const rows = rounds.roster.map(m => {
    const mine = pictures.map(p => scores.find(s => s.author === m.key && (s.subject === p || `${s.subject}-qs` === p)) ?? null);
    const got = mine.map(s => (s && Number.isFinite(s.score) ? s.score : 0));
    return { ...m, mean: +(got.reduce((a, b) => a + b, 0) / pictures.length).toFixed(1), paintings: mine.filter(s => s && Number.isFinite(s.score)).length, failed: mine.filter(s => s && !Number.isFinite(s.score)).length, missing: mine.filter(s => !s).length, on: false, why: null };
  }).sort((a, b) => b.mean - a.mean || a.key.localeCompare(b.key));
  rows.slice(0, n).forEach(r => { r.on = true; r.why = `in the top ${n}`; });
  for (const family of new Set(rows.map(r => r.family))) {
    const of = rows.filter(r => r.family === family);
    for (const r of of.filter(x => !x.on).slice(0, Math.max(0, rounds.screening.leastPerFamily - of.filter(x => x.on).length))) { r.on = true; r.why = `the best of its family (${family}): never fewer than ${rounds.screening.leastPerFamily} of each`; }
  }
  return { keep: n, ranked: rows };
}

/** results.json's paintings (bench:score04) as rank's scores: the level 2 paintings of models. */
export const scoresOf = (results, level = 'L2') => (results.paintings ?? []).filter(p => !p.auto && p.level === level).map(p => ({ author: p.author, subject: p.subject, score: p.failed ? null : p.combined ?? null }));

function main(argv) {
  const [word, ...rest] = argv, opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; }, rounds = loadRounds();
  if (word === 'plan') {
    console.log(`Screening: ${rounds.roster.length} models x ${rounds.screening.pictures.length} pictures at ${rounds.screening.level}, fixed rounds; nothing is started here.\n`);
    console.log(screeningCommand(rounds, { pictures: opt('--pictures')?.split(','), authors: opt('--authors')?.split(','), out: opt('--out') }));
    console.log('\nThen: npm run bench:score04 -- <the run folders> --out DIR; node tools/paint/screening.mjs rank DIR/results.json');
  } else if (word === 'rank' && rest[0]) {
    const got = rank(rounds, scoresOf(JSON.parse(fs.readFileSync(rest[0], 'utf8')), rounds.screening.level), { keep: opt('--keep') ? Number(opt('--keep')) : rounds.screening.keep });
    console.log(`Screening, ${rounds.screening.pictures.join(' and ')} at ${rounds.screening.level}: the mean combined figure (0 to 100; a failed or missing painting counts 0). ${got.ranked.filter(r => r.on).length} go on.\n`);
    for (const [i, r] of got.ranked.entries()) console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(22)} ${String(r.mean).padStart(5)}  ${r.on ? `GOES ON (${r.why})` : 'stops here'}${r.failed ? `; ${r.failed} failed` : ''}${r.missing ? `; ${r.missing} not painted` : ''}`);
  } else { console.error('screening: plan [--pictures a,b] [--authors k,k] [--out DIR] | rank RESULTS.json [--keep N]'); process.exit(2); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
