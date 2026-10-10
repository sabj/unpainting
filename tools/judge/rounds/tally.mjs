#!/usr/bin/env node
// Un-blind a stage-judge round written by run.mjs: every judge's answer.json against the key.
//
//   node tools/judge/rounds/tally.mjs <key base>.key.json [--json <out.json>]
//
// Strict: an answer needs exactly one entry per stage and run, per run, and per listed pair, and nothing else. A
// duplicate, an omission, an unknown letter, a score out of range or a score its own tells forbid rejects that judge's
// whole answer. Then each judge is calibrated on the hidden controls: the positive control must score above the
// negative on the primary endpoint, and the identical pair within 1. A judge that fails is flagged and left out of the
// verdict. The verdict is the protocol written into the key before any judge answered.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEVERITY = ['minor', 'moderate', 'severe'];
export const CAP = { minor: 5, moderate: 4, severe: 2 };
const TELLS = 'abcdefghij'.split('');
const CHOICES = ['tie', 'insufficient_evidence'];

/** Validate one answer against its judge's presentation. Returns { ok, errors, byRole } with scores by role. */
export function readAnswer(answer, judge, key) {
  const errors = [], err = m => errors.push(m);
  const role = Object.fromEntries(Object.entries(judge.letter).map(([r, l]) => [l, r]));
  const letters = Object.keys(role);
  if (!answer || typeof answer !== 'object') return { ok: false, errors: ['not a JSON object'] };
  const extra = Object.keys(answer).filter(k => !['packet', 'stages', 'runs', 'pairs'].includes(k));
  if (extra.length) err(`unexpected fields: ${extra.join(', ')}`);
  if (answer.packet !== judge.id) err(`packet is ${JSON.stringify(answer.packet)}, not ${judge.id}`);
  for (const k of ['stages', 'runs', 'pairs']) if (!Array.isArray(answer[k])) { err(`${k} is not an array`); return { ok: false, errors }; }
  const int15 = v => Number.isInteger(v) && v >= 1 && v <= 5;

  const fidelity = {};
  const seen = new Set();
  for (const e of answer.stages) {
    const id = `${e?.stage}/${e?.run}`;
    if (!key.stages.includes(e?.stage) || !letters.includes(e?.run)) { err(`stage entry ${id}: unknown stage or run`); continue; }
    if (seen.has(id)) { err(`stage entry ${id}: duplicate`); continue; }
    seen.add(id);
    if (!int15(e.fidelity)) err(`stage entry ${id}: fidelity ${JSON.stringify(e.fidelity)} is not 1 to 5`);
    if (!Array.isArray(e.tells) || e.tells.some(t => !TELLS.includes(t?.tell) || !SEVERITY.includes(t?.severity))) {
      err(`stage entry ${id}: tells must be [{tell: a..j, severity: minor|moderate|severe}]`);
      continue;
    }
    const cap = Math.min(5, ...e.tells.map(t => CAP[t.severity]));
    if (e.fidelity > cap) err(`stage entry ${id}: fidelity ${e.fidelity} over the cap ${cap} its own tells set`);
    const r = role[e.run];
    if (!key.runs[r].stages[e.stage]?.frame && e.fidelity !== 1) err(`stage entry ${id}: a grey tile scores 1, not ${e.fidelity}`);
    (fidelity[r] ??= {})[e.stage] = e.fidelity;
  }
  for (const l of letters) for (const s of key.stages) if (!seen.has(`${s}/${l}`)) err(`stage entry ${s}/${l}: missing`);

  const runs = {};
  for (const e of answer.runs) {
    if (!letters.includes(e?.run)) { err(`run entry ${JSON.stringify(e?.run)}: unknown run`); continue; }
    if (runs[role[e.run]]) { err(`run entry ${e.run}: duplicate`); continue; }
    if (!int15(e.process) || !int15(e.finish)) err(`run entry ${e.run}: process and finish must be 1 to 5`);
    runs[role[e.run]] = { process: e.process, finish: e.finish };
  }
  for (const l of letters) if (!runs[role[l]]) err(`run entry ${l}: missing`);

  const pairs = {};
  const expected = new Map(judge.pairs.map(([a, b]) => [`${judge.letter[a]}|${judge.letter[b]}`, [a, b]]));
  for (const e of answer.pairs) {
    const id = `${e?.left}|${e?.right}`;
    if (!expected.has(id)) { err(`pair ${id}: not a listed pair, or its sides are swapped`); continue; }
    if (pairs[id]) { err(`pair ${id}: duplicate`); continue; }
    const ok = v => v === e.left || v === e.right || CHOICES.includes(v);
    if (!ok(e.process) || !ok(e.finish)) err(`pair ${id}: process and finish must be ${e.left}, ${e.right}, tie or insufficient_evidence`);
    const toRole = v => (CHOICES.includes(v) ? v : role[v]);
    pairs[id] = { roles: expected.get(id), process: toRole(e.process), finish: toRole(e.finish) };
  }
  for (const id of expected.keys()) if (!pairs[id]) err(`pair ${id}: missing`);
  if (errors.length) return { ok: false, errors };

  const byRole = Object.fromEntries(Object.keys(judge.letter).map(r => {
    const f = key.stages.map(s => fidelity[r][s]);
    const fid = f.reduce((a, b) => a + b, 0) / f.length;
    return [r, { fidelity: fidelity[r], fidelityMean: fid, process: runs[r].process, finish: runs[r].finish, primary: runs[r].finish + fid }];
  }));
  return { ok: true, errors, byRole, pairs: Object.values(pairs) };
}

/** Calibration on the hidden controls. */
export function calibrate(byRole) {
  const pos = byRole.positive.primary, neg = byRole.negative.primary;
  const gap = Math.abs(byRole.control.primary - byRole['control-copy'].primary);
  const posOverNeg = pos > neg, identical = gap <= 1;
  return { posOverNeg, identical, gap, valid: posOverNeg && identical };
}

/** A pairwise choice between two roles, as seen by one judge: the role chosen, tie, insufficient_evidence or null. */
export function choice(pairs, a, b, what) {
  const p = pairs.find(x => x.roles.includes(a) && x.roles.includes(b));
  return p ? p[what] : null;
}

const sign = x => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** The verdict by the key's protocol, over valid judges only. */
export function verdict(judges) {
  const valid = judges.filter(j => j.calibration?.valid);
  const need = Math.max(4, Math.ceil((2 * valid.length) / 3));
  const pref = valid.map(j => sign(j.byRole.candidate.primary - j.byRole.control.primary));
  const forC = pref.filter(p => p > 0).length, forK = pref.filter(p => p < 0).length;
  const call = valid.length < 4 ? 'inconclusive' : forC >= need ? 'win' : forK >= need ? 'loss' : 'inconclusive';
  return { valid: valid.length, need, forCandidate: forC, forControl: forK, ties: pref.length - forC - forK, call };
}

/** Agreement between judges: for every pair of judges and every pair of runs, do their primaries order the runs alike? */
export function agreement(judges, roles) {
  let same = 0, total = 0;
  for (let a = 0; a < judges.length; a++) for (let b = a + 1; b < judges.length; b++) {
    for (let i = 0; i < roles.length; i++) for (let k = i + 1; k < roles.length; k++) {
      const s = j => sign(j.byRole[roles[i]].primary - j.byRole[roles[k]].primary);
      total++; if (s(judges[a]) === s(judges[b])) same++;
    }
  }
  return total ? same / total : null;
}

function main() {
  const argv = process.argv.slice(2);
  const keyFile = argv.find(a => a.endsWith('.key.json'));
  if (!keyFile) { console.error('usage: tally.mjs <key base>.key.json [--json <out.json>]'); process.exit(1); }
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const roles = Object.keys(key.runs);
  const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2);
  const judges = key.judges.map(j => {
    const file = path.join(j.dir, 'answer.json');
    let answer = null, read;
    try { answer = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { read = { ok: false, errors: [`${file}: ${e.message.split('\n')[0]}`] }; }
    read ??= readAnswer(answer, j, key);
    return { n: j.n, family: j.family, ...read, calibration: read.ok ? calibrate(read.byRole) : null };
  });

  console.log(`Round ${path.basename(keyFile, '.key.json')}, subject ${key.subject}: candidate ${key.roles.candidate}, control ${key.roles.control}.`);
  console.log(`Primary endpoint: ${key.protocol.primary}.`);
  for (const j of judges) {
    const head = `\nJudge ${j.n} (${j.family})`;
    if (!j.ok) { console.log(`${head}: answer rejected, ${j.errors.length} problems. ${j.errors.slice(0, 6).join('; ')}`); continue; }
    const c = j.calibration;
    console.log(`${head}: ${c.valid ? 'valid' : 'FLAGGED, excluded'}. Positive over negative ${c.posOverNeg ? 'yes' : 'no'}; identical pair differs by ${f2(c.gap)}.`);
    console.log('  role           A  B  D  H  I  fid   process finish primary');
    for (const r of roles) {
      const b = j.byRole[r];
      console.log(`  ${r.padEnd(13)}  ${key.stages.map(s => b.fidelity[s]).join('  ')}  ${f2(b.fidelityMean)}  ${b.process}       ${b.finish}      ${f2(b.primary)}`);
    }
    const ch = (a, b, w) => choice(j.pairs, a, b, w);
    console.log(`  pairs (process / finish): candidate v control ${ch('candidate', 'control', 'process')} / ${ch('candidate', 'control', 'finish')}; ` +
      `positive v control ${ch('positive', 'control', 'process')} / ${ch('positive', 'control', 'finish')}; ` +
      `positive v negative ${ch('positive', 'negative', 'process')} / ${ch('positive', 'negative', 'finish')}; ` +
      `identical pair ${ch('control', 'control-copy', 'process')} / ${ch('control', 'control-copy', 'finish')}`);
  }

  const ok = judges.filter(j => j.ok);
  console.log('\nPer family, mean primary over answers that parsed (valid judges only in brackets):');
  for (const fam of [...new Set(key.judges.map(j => j.family))]) {
    const all = ok.filter(j => j.family === fam), val = all.filter(j => j.calibration.valid);
    const m = (js, r) => (js.length ? f1(js.reduce((s, j) => s + j.byRole[r].primary, 0) / js.length) : '-');
    console.log(`  ${fam}: ${all.length} parsed, ${val.length} valid. ${roles.map(r => `${r} ${m(all, r)} [${m(val, r)}]`).join(', ')}`);
    if (all.length > 1) console.log(`    agreement within ${fam}: ${f2(agreement(all, roles))} of run orderings match`);
  }
  if (ok.length > 1) console.log(`  agreement across all parsed judges: ${f2(agreement(ok, roles))} of run orderings match`);

  const human = ok.map(j => sign(j.byRole.positive.primary - j.byRole.control.primary));
  console.log(`\nNoise floor: the person's keyframes over the control on the primary for ${human.filter(s => s > 0).length} of ${ok.length} judges, under for ${human.filter(s => s < 0).length}.`);
  const same = ok.map(j => j.calibration.gap);
  console.log(`Identical pair: primaries differ by ${same.map(f2).join(', ')} (mean ${same.length ? f2(same.reduce((a, b) => a + b, 0) / same.length) : '-'}).`);
  const v = verdict(judges);
  console.log(`\nVerdict: ${v.call}. ${v.valid} valid judges; ${v.forCandidate} prefer the candidate, ${v.forControl} the control, ${v.ties} neither; a call needs ${v.need}.`);
  const out = argv[argv.indexOf('--json') + 1];
  if (argv.includes('--json') && out) fs.writeFileSync(out, JSON.stringify({ judges, verdict: v }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
