// One V4 or V5 try's painting, seen from the harness. The model runs `bash bench/paint.sh <command>` in its worktree;
// each command is a request file bench/paint-io/req-<seq>.json and gets an answer in res-<seq>.json. This class answers
// them and drives the painter (painting.mjs). It keeps the model's own clock (wall time minus the time the model was
// blocked waiting for the painter or the harness) and writes every start, stop decision, look and revision to
// CHECKPOINTS.jsonl in the try's raw folder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { checkPlan } from './check.mjs';
import { Painting, bkey } from './painting.mjs';

const ANSWER_AFTER = 90;   // seconds: a waiting command answers "still painting" after this (the client gives up at 100)
const CLIENT_WAIT = 100;   // seconds: bench/paint.mjs stops waiting after this, so a call blocks the model at most this long
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const PLAN_FILE = n => n === 'config.json' || n === 'extra-args.json' || n.endsWith('-lines.json');
const now = () => Date.now() / 1000;

/** Copy the model's plan files (bench/plan/ and bench/variant.txt, bench/PLAN.md) to dest. */
export function planSnapshot(ws, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const plan = path.join(ws, 'bench', 'plan');
  if (fs.existsSync(plan)) for (const f of fs.readdirSync(plan)) if (PLAN_FILE(f) && fs.statSync(path.join(plan, f)).isFile()) fs.copyFileSync(path.join(plan, f), path.join(dest, f));
  for (const f of ['variant.txt', 'PLAN.md']) if (fs.existsSync(path.join(ws, 'bench', f))) fs.copyFileSync(path.join(ws, 'bench', f), path.join(dest, f));
  return dest;
}
export const variantIn = dir => { const f = path.join(dir, 'variant.txt'); return (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '').replace(/\s+/g, '') || 'region_w13'; };

/** The look images: <n>-sheet.jpg (at most 1400 px wide) and <n>-compare.jpg (target | sheet, 820 px each, same height). */
async function lookImages(sheetPng, target, dir, n) {
  fs.mkdirSync(dir, { recursive: true });
  const meta = await sharp(sheetPng).metadata();
  await sharp(sheetPng).resize({ width: Math.min(1400, meta.width) }).jpeg({ quality: 92 }).toFile(path.join(dir, `${n}-sheet.jpg`));
  const W = 820, gap = 12;
  const a = await sharp(target).removeAlpha().resize({ width: W }).png().toBuffer(), b = await sharp(sheetPng).removeAlpha().resize({ width: W }).png().toBuffer();
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  await sharp({ create: { width: 2 * W + gap, height: Math.max(ma.height, mb.height), channels: 3, background: '#ffffff' } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: W + gap, top: 0 }]).jpeg({ quality: 92 }).toFile(path.join(dir, `${n}-compare.jpg`));
}

export class PaintSession {
  /** raw: the try's raw folder for this target; spec: {width, sheetmm, trumbull}; modelMinutes: the model-time cap. */
  constructor({ repo, ws, raw, spec, target, modelMinutes = 85, gpu = 'auto', log = () => {} }) {
    Object.assign(this, { repo, ws, raw, spec, target, gpu, log });
    this.io = path.join(ws, 'bench', 'paint-io');
    this.looksDir = path.join(ws, 'bench', 'looks');
    for (const d of [this.io, this.looksDir, raw]) fs.mkdirSync(d, { recursive: true });
    this.ckpt = path.join(raw, 'CHECKPOINTS.jsonl');
    this.limitS = modelMinutes * 60;
    this.t0 = now(); this.waitS = 0; this.blockedUntil = 0;
    this.pending = new Map(); this.handled = new Set();
    this.painting = null; this.started = false; this.restarts = 0; this.rev = 0; this.looks = 0; this.checks = 0;
    this.revising = []; this.ended = null; this.capped = false; this.palette = null; this.planHash = null; this.startCheck = null;
  }


  addBlocked(a, b) { const s = Math.max(a, this.blockedUntil); if (b > s) this.waitS += b - s; this.blockedUntil = Math.max(this.blockedUntil, b); }
  modelS() {
    let extra = 0, bu = this.blockedUntil; const t = now();
    for (const p of [...this.pending.values()].sort((x, y) => x.t - y.t)) {
      if (!p.blocking) continue;
      const a = Math.max(p.t, bu), b = Math.min(t, p.t + CLIENT_WAIT);
      if (b > a) { extra += b - a; bu = b; }
    }
    return Math.max(0, t - this.t0 - this.waitS - extra);
  }
  overTime() { return this.modelS() >= this.limitS; }
  record(kind, fields = {}) { fs.appendFileSync(this.ckpt, JSON.stringify({ t: new Date().toISOString(), kind, modelMinutes: +(this.modelS() / 60).toFixed(2), ...fields }) + '\n'); }

  answer(seq, text, exit = 0) {
    const p = this.pending.get(seq); this.pending.delete(seq);
    if (p?.blocking) this.addBlocked(p.t, Math.min(now(), p.t + CLIENT_WAIT));
    writeJson(path.join(this.io, `res-${seq}.json`), { text, exit, modelMinutes: +(this.modelS() / 60).toFixed(1) });
    for (const [s2, q] of [...this.pending]) if (q.kind === 'follow' && q.target === seq) this.answer(s2, text, exit);
  }


  finished() { return this.painting && ['done', 'failed'].includes(this.painting.state) ? this.painting : null; }
  /** Finished or failed with no restart remaining. A refused plan permits one restart. */
  paintingOver() {
    const f = this.finished(); if (!f) return false;
    if (f.state === 'done') return true;
    return !(f.planningRefused && this.restarts < 1 && !this.ended);
  }
  where() {
    if (this.finished()) return 'finished';
    if ([...this.pending.values()].some(q => q.kind === 'start' && q.phase === 'check')) return 'not started yet: the admission check for your start is running';
    const [b, o] = this.painting ? this.painting.currentStop() : [null, null];
    if (b !== null) return `stopped at ${o.label} (boundary ${b})`;
    if (!this.started) return 'not started';
    const p = this.painting.progress();
    if (p.label) return `painting (last boundary passed: ${p.label}, ${p.strokes ?? 0} brush strokes so far)`;
    return 'starting: the painter is planning your painting at full size; its first stop usually comes within a few minutes';
  }
  remainingText(o, limit = 60) {
    const rows = o.remaining || [];
    const lines = rows.slice(0, limit).map(r => (r.touchRound ? `  pass ${r.pass}: touch-up round ${r.touchRound} (the painter compares its sheet with the target's shape averages and adds corrective glazes)`
      : `  pass ${r.pass}: value ${r.value} ${r.pigment}${r.order ? ` (${r.order})` : ''}${r.touched ? ' touch-up' : ''}, ${r.passages} passages over ${(100 * (r.areaShare || 0)).toFixed(1)}% of the sheet; ${Object.entries(r.techniques || {}).map(([k, v]) => `${k} ${v}`).join(', ')}`));
    if (rows.length > limit) lines.push(`  ... and ${rows.length - limit} more`);
    if (o.closingDrawing && !o.closing) lines.push('  then the closing drawing');
    return lines.length ? lines.join('\n') : '  (nothing: the painting ends after this)';
  }
  statusText() {
    const hint = this.started && !this.finished() && (!this.painting || this.painting.currentStop()[0] === null) ? '\nWhile it paints, `bash bench/paint.sh wait` returns at the next stop; time spent in wait is not counted as yours.' : '';
    return `Painter: ${this.where()}.\nYour time: ${(this.modelS() / 60).toFixed(1)} of ${(this.limitS / 60).toFixed(0)} minutes used (waiting for the painter is not counted). Looks so far: ${this.looks}; revisions: ${this.rev}.${hint}`;
  }
  planFilesHash() {
    const h = {}, plan = path.join(this.ws, 'bench', 'plan');
    if (fs.existsSync(plan)) for (const f of fs.readdirSync(plan).sort()) if (PLAN_FILE(f)) h[f] = sha(path.join(plan, f));
    h['variant.txt'] = crypto.createHash('sha256').update(variantIn(path.join(this.ws, 'bench'))).digest('hex');
    return h;
  }
  refusalText(chk) { return chk.refusal.slice(-20).map(r => '- ' + r).join('\n') || '- the check did not admit the plan'; }


  tick() {
    this.advanceRevisions();
    const reqs = fs.existsSync(this.io) ? fs.readdirSync(this.io).map(f => /^req-(\d+)\.json$/.exec(f)).filter(Boolean).map(m => m[1]).sort((a, b) => a - b) : [];
    for (const seq of reqs) {
      if (this.handled.has(seq)) continue;
      const r = readJson(path.join(this.io, `req-${seq}.json`)); if (!r) continue;
      this.handled.add(seq);
      r.t = Math.min(now(), Date.parse(r.t) / 1000 || now());
      try { this.handle(seq, r); } catch (e) { this.log(`paint request ${seq} ${r.cmd}: ${e.stack || e}`); this.answer(seq, `The harness could not do that (${e.message}); try again or run \`bash bench/paint.sh status\`.`, 1); }
    }
    for (const [seq, p] of [...this.pending]) this.advance(seq, p);
  }

  handle(seq, r) {
    const { cmd } = r, args = r.args || [];
    if (this.ended) return this.answer(seq, `The session has ended (${this.ended}). Stop now.`, 1);
    if (cmd === 'status') return this.answer(seq, this.statusText());
    const busy = [...this.pending.values()].some(q => q.phase === 'check') || this.revising.length;
    if (['start', 'revise', 'next', 'run', 'finish'].includes(cmd) && busy) return this.answer(seq, 'A check or a revision is still under way; run `bash bench/paint.sh wait` first.', 1);
    if (cmd === 'wait') {
      const target = [...this.pending].find(([, q]) => ['start', 'revise'].includes(q.kind));
      if (target) { this.pending.set(seq, { ...r, kind: 'follow', target: target[0], blocking: true }); return; }
    }
    if (cmd === 'start') return this.doStart(seq, r);
    if (!this.started) return this.answer(seq, 'Nothing is painting yet. Run `bash bench/paint.sh start` when `bash bench/check.sh` ends with ADMITTED.', 1);
    if (cmd === 'look') return this.doLook(seq, r);
    if (cmd === 'wait') {
      const [b, o] = this.painting.currentStop();
      if (b !== null) return this.answer(seq, `Stopped: ${o.label} (boundary ${b}). Run look, next, run <pass>, run closing, finish or revise.`);
      this.pending.set(seq, { ...r, kind: 'wait', blocking: true, from: null }); return;
    }
    if (['next', 'run', 'finish'].includes(cmd)) return this.doGo(seq, r, cmd, args);
    if (cmd === 'revise') return this.doRevise(seq, r, args);
    return this.answer(seq, `Unknown command ${cmd}.`, 2);
  }

  checkAsync(seq) {
    const p = this.pending.get(seq);
    p.before = this.planFilesHash();
    const dir = path.join(this.raw, 'checks', `c${++this.checks}`);
    const snap = planSnapshot(this.ws, path.join(dir, 'plan'));
    p.snapshot = snap;
    const t = now();
    checkPlan({ repo: this.repo, spec: this.spec, planDir: snap, variant: variantIn(snap), target: this.target, work: path.join(dir, 'work') })
      .then(chk => { p.chk = chk; writeJson(path.join(dir, 'check.json'), { ok: chk.ok, failures: chk.failures, layering: chk.layering, palette: chk.palette, seconds: +(now() - t).toFixed(1) }); })
      .catch(e => { p.chk = { crash: String(e.stack || e) }; });
  }

  doStart(seq, r) {
    const f = this.finished();
    if (this.started && !(f?.state === 'failed' && f.planningRefused)) return this.answer(seq, `A painting is already under way: ${this.where()}.`, 1);
    if (this.started) {
      if (this.restarts >= 1) return this.answer(seq, 'The painter refused this plan once already and you have started again once; no more starts.', 1);
      this.restartArchive();
    }
    this.pending.set(seq, { ...r, kind: 'start', blocking: true, phase: 'check' });
    this.checkAsync(seq);
  }

  /** Start painting a checked plan snapshot. initialStop: 0 (the model watches) or 'end' (no stops). */
  beginPainting(snapshot, chk, initialStop) {
    const dir = path.join(this.raw, this.restarts ? `painting-r${this.restarts}` : 'painting');
    fs.rmSync(dir, { recursive: true, force: true });
    this.painting = new Painting({ repo: this.repo, spec: this.spec, target: this.target, dir, gpu: this.gpu, initialStop });
    const plan = path.join(dir, 'plan-1'); fs.cpSync(snapshot, plan, { recursive: true });
    fs.rmSync(path.join(this.raw, 'plan'), { recursive: true, force: true }); fs.cpSync(snapshot, path.join(this.raw, 'plan'), { recursive: true });
    this.painting.run(plan, variantIn(plan));
    this.started = true; this.palette = chk.palette; this.startCheck = chk;
    this.record('start', { variant: variantIn(plan), stops: initialStop === 'end' ? 'none' : 'every passage boundary' });
  }

  startChecked(seq) {
    const p = this.pending.get(seq), chk = p.chk; delete p.chk;
    if (JSON.stringify(this.planFilesHash()) !== JSON.stringify(p.before)) return this.answer(seq, 'Your plan files changed while the check ran; nothing was started. Run `bash bench/paint.sh start` again.', 1);
    if (chk.crash) return this.answer(seq, 'The admission check could not run (a harness problem); try `bash bench/paint.sh start` again.', 1);
    if (!chk.ok) { this.record('start-refused', { reasons: chk.refusal }); return this.answer(seq, 'REFUSED by the admission check, nothing painted:\n' + this.refusalText(chk) + '\nFix the files and start again.', 1); }
    this.planHash = p.before;
    this.beginPainting(p.snapshot, chk, 0);
    p.phase = 'queued';
  }

  restartArchive() {
    this.restarts++;
    this.record('restart', { n: this.restarts });
    this.started = false; this.rev = 0; this.painting = null;
  }

  async makeLook(seq, b, o, sheet) {
    const n = String(++this.looks).padStart(2, '0');
    await lookImages(sheet, this.target, this.looksDir, n);
    const keep = path.join(this.raw, 'looks'); fs.mkdirSync(keep, { recursive: true });
    fs.copyFileSync(path.join(this.looksDir, `${n}-sheet.jpg`), path.join(keep, `${n}-b${b}-sheet.jpg`));
    if (b === 'final') { this.record('look', { n: this.looks, boundary: 'final' }); return this.answer(seq, `The finished painting: bench/looks/${n}-compare.jpg (target | painting) and bench/looks/${n}-sheet.jpg.`); }
    this.record('look', { n: this.looks, boundary: b, strokes: o.strokes, penLines: o.penLines, passesDone: o.passesDone, passesPlanned: o.passesPlanned });
    let txt = `Look ${this.looks}: ${o.label}. Open bench/looks/${n}-compare.jpg (target left, your sheet right) or bench/looks/${n}-sheet.jpg.\n`
      + `So far: ${o.strokes} brush strokes and ${o.penLines} pen lines; ${o.passesDone} of ${o.passesPlanned} passes painted.\nStill to come:\n${this.remainingText(o)}`;
    if (o.revisable === false) txt += `\n(Revisions are not available for this painting: ${(o.notRevisable || []).join(', ')}.)`;
    this.answer(seq, txt);
  }

  doLook(seq, r) {
    const [b, o] = this.painting.currentStop();
    if (b === null) {
      const f = this.finished(), png = path.join(this.painting.out, 'painting.png');
      if (f?.state === 'done' && fs.existsSync(png)) { this.pending.set(seq, { ...r, kind: 'look', blocking: true, phase: 'busy' }); this.makeLook(seq, 'final', null, png).catch(e => this.answer(seq, 'The look image could not be made: ' + e.message, 1)); return; }
      return this.answer(seq, `The painter is not stopped (${this.where()}); a look shows the sheet at a stop. Use \`bash bench/paint.sh wait\`.`, 1);
    }
    this.pending.set(seq, { ...r, kind: 'look', blocking: true, phase: 'busy' });
    this.makeLook(seq, b, o, this.painting.sheetImage(b)).catch(e => this.answer(seq, 'The look image could not be made: ' + e.message, 1));
  }

  targetOf(b, cmd, args) {
    if (cmd === 'finish') return 'end';
    if (cmd === 'next') return String(b) === 'closing' ? 'end' : Number(b) + 1;
    if (!args.length) throw new Error('run needs a pass number or "closing"');
    if (args[0] === 'closing') return 'closing';
    const k = Number(args[0]); if (!Number.isInteger(k)) throw new Error('run needs a pass number or "closing"');
    return k;
  }

  doGo(seq, r, cmd, args) {
    const [b, o] = this.painting.currentStop();
    let stopAt;
    try { stopAt = this.targetOf(b ?? this.painting.progress().boundary ?? 0, cmd, args); } catch (e) { return this.answer(seq, e.message, 2); }
    if (b === null && this.finished()) return this.answer(seq, 'The painting is finished. Stop now.');
    if (b !== null && stopAt !== 'end' && stopAt !== 'closing' && stopAt <= bkey(b)) return this.answer(seq, `The painter is stopped at boundary ${b}; ask for a later pass.`, 2);
    this.painting.go(b, stopAt);
    this.record('continue', { boundary: b, stopAt, strokes: o?.strokes });
    this.pending.set(seq, { ...r, kind: 'go', blocking: true, from: b, stopAt });
  }

  doRevise(seq, r, args) {
    const [b, o] = this.painting.currentStop();
    if (b === null) return this.answer(seq, `Revisions are made at a stop; the painter is ${this.where()}.`, 1);
    if (o.revisable === false) return this.answer(seq, `This painting cannot be revised (painter features without saved state: ${(o.notRevisable || []).join(', ')}).`, 1);
    const then = args[0] === 'then' ? [args[1] || 'next', args.slice(2)] : ['next', []];
    const cur = this.planFilesHash(), changed = [...new Set([...Object.keys(cur), ...Object.keys(this.planHash || {})])].filter(k => cur[k] !== this.planHash?.[k]).sort();
    if (!changed.length) return this.answer(seq, 'No plan file changed since the painter last planned; nothing to revise. Use next, run or finish.', 1);
    if (changed.includes('opening-lines.json')) return this.answer(seq, 'opening-lines.json changed, but the opening drawing is already on the paper. Put it back as it was (the painted copy is in your previous plan) and revise again.', 1);
    this.pending.set(seq, { ...r, kind: 'revise', blocking: true, b, phase: 'check', then, changed, cur });
    this.checkAsync(seq);
  }

  reviseChecked(seq) {
    const p = this.pending.get(seq), chk = p.chk; delete p.chk;
    const { b, changed } = p, o = this.painting.currentStop()[1] || {};
    if (JSON.stringify(this.planFilesHash()) !== JSON.stringify(p.before)) return this.answer(seq, 'Your plan files changed while the check ran; nothing was revised. Run `bash bench/paint.sh revise` again.', 1);
    if (chk.crash) return this.answer(seq, 'The check could not run (a harness problem); nothing changed. Try again.', 1);
    if (!chk.ok) { this.record('revise-refused', { boundary: b, strokes: o.strokes, changed, reasons: chk.refusal }); return this.answer(seq, 'REFUSED by the check; nothing changed and the painter is still stopped:\n' + this.refusalText(chk), 1); }
    const cur = this.palette, next = chk.palette;
    if (cur && next && JSON.stringify(cur) !== JSON.stringify(next)) {
      this.record('revise-refused', { boundary: b, strokes: o.strokes, changed, reasons: ['palette change'], palette: { now: cur, revised: next } });
      return this.answer(seq, `REFUSED: this revision changes the pigments the painter paints with (now: ${cur.palette.join(', ')}; revised: ${next.palette.join(', ')}; inks now: ${cur.inks.join(', ')}, revised: ${next.inks.join(', ')}). `
        + 'Paint already on the paper is in the current pigments, so the palette and inks cannot change once painting has started: keep the paints, the palette tokens and the ink as they are. Nothing changed; the painter is still stopped.', 1);
    }
    const k = ++this.rev, snap = path.join(this.raw, 'revisions', `r${k}`);
    fs.cpSync(p.snapshot, snap, { recursive: true });
    this.revising.push({ k, seq, b, then: p.then, changed, snap, phase: 'saving' });
    p.phase = 'sent'; p.k = k;
    this.painting.go(b, null, 'save-exit');
    this.planHash = p.cur;
    this.record('revise', { boundary: b, revision: k, strokes: o.strokes, passesDone: o.passesDone, changed, variant: variantIn(snap) });
  }

  thenStop(rv) {
    const [cmd, args] = rv.then;
    if (cmd === 'finish') return 'end';
    if (cmd === 'run' && args.length) return args[0] === 'closing' ? 'closing' : Number(args[0]);
    return String(rv.b) === 'closing' ? 'end' : Number(rv.b) + 1;
  }

  /** A revision in flight: once the painter has saved, a fresh process takes the painting over with the revised plan. */
  advanceRevisions() {
    if (!this.revising.length || !this.painting) return;
    const rv = this.revising[0];
    if (rv.phase === 'saving' && this.painting.state === 'saved') {
      const plan = path.join(this.painting.dir, `plan-${this.painting.segments.length + 1}`);
      fs.cpSync(rv.snap, plan, { recursive: true });
      this.painting.resume(plan, variantIn(plan), this.ended ? 'end' : this.thenStop(rv));
      rv.phase = 'resumed';
    }
    if (rv.phase === 'resumed' || ['done', 'failed'].includes(this.painting.state)) {
      if (rv.phase !== 'resumed') this.record('revise-unfinished', { revision: rv.k, painting: this.painting.state });
      this.revising.shift();
    }
  }

  advance(seq, p) {
    if (p.kind === 'follow' || p.phase === 'busy') return;
    if (p.phase === 'check') { if (p.chk) return p.kind === 'start' ? this.startChecked(seq) : this.reviseChecked(seq); return; }
    const age = now() - p.t, f = this.finished();
    const [b, o] = this.painting ? this.painting.currentStop() : [null, null];
    const inFlight = p.kind === 'revise' && this.revising.some(rv => rv.seq === seq);
    if (b !== null && !inFlight && (p.kind !== 'go' || String(b) !== String(p.from))) {
      const pre = p.kind === 'revise' ? `Revision ${p.k} applied (${p.changed.join(', ')}); the painter planned again and went on.\n` : p.kind === 'start' ? 'Painting started. ' : '';
      return this.answer(seq, `${pre}Stopped: ${o.label} (boundary ${b}). ${o.strokes} brush strokes so far. Run \`bash bench/paint.sh look\` to see it, or next / run <pass> / run closing / finish, or revise.`);
    }
    if (f && !this.revising.length) {
      if (f.state === 'done') { this.record('finished', { strokes: this.painting.progress().strokes }); return this.answer(seq, 'The painting is finished. `bash bench/paint.sh look` shows it once; then stop.'); }
      if (f.planningRefused) return this.answer(seq, `The painter refused your plan while painting: ${f.planningRefused}\nNothing will be judged from this painting. You may fix the plan and run \`bash bench/paint.sh start\` once more (a clean sheet).`, 1);
      return this.answer(seq, `The painting failed: the painter exited ${f.segments.at(-1).exit}.`, 1);
    }
    if (age > ANSWER_AFTER) {
      if (p.kind === 'revise') return this.answer(seq, `Revision ${p.k} passed the check (${p.changed.join(', ')}); the painter is saving the painting and planning again from your revised files, then goes on. Run \`bash bench/paint.sh wait\` to see where it stops.`);
      return this.answer(seq, `Still ${this.where()}. Run \`bash bench/paint.sh wait\` to keep waiting.`);
    }
  }

  /** The model's session is over: the painter finishes the current plan without stopping again. */
  end(why) {
    if (this.ended) return;
    this.ended = why;
    if (this.painting && this.painting.state === 'running') this.painting.noMoreStops();
    for (const seq of [...this.pending.keys()]) this.answer(seq, `The session has ended (${why}). The painter finishes your current plan without stopping. Stop now.`, 1);
    this.record('session-end', { why, looks: this.looks, revisions: this.rev });
  }

  /** A repair turn after the painter refused the plan: the model's clock starts again and one fresh start is allowed. */
  reopen() { this.ended = null; this.capped = false; this.t0 = now(); this.waitS = 0; this.blockedUntil = 0; this.record('reopen', { why: 'repair turn' }); }

  /** After the model's process exited: let a start or revise whose check is still running finish. */
  async settle(limitS = 900) {
    const t = now();
    while (now() - t < limitS && [...this.pending.values()].some(q => q.phase === 'check')) { this.tick(); await new Promise(r => setTimeout(r, 500)); }
    this.tick();
  }

  /** Wait until the painting has ended (no stops after the session), resuming any revision in flight. */
  async finish() {
    if (!this.painting) return null;
    if (this.painting.state === 'running') this.painting.noMoreStops();
    while (!['done', 'failed'].includes(this.painting.state) || this.revising.length) {
      this.advanceRevisions();
      if (this.painting.state === 'running') { const [b] = this.painting.currentStop(); if (b !== null) this.painting.go(b, 'end'); }
      await new Promise(r => setTimeout(r, 500));
    }
    return this.painting;
  }
}
