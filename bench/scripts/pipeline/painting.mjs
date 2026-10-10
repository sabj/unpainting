// One V4 or V5 painting on this machine, across the model's revisions. The painter (tools/paint-plate.mjs) runs with a
// pause folder (tools/aware/pause.mjs) and stops where the harness asks. A revision makes it save the painting and exit
// 75; the next segment is a fresh process that takes the painting over (--resumestate) with the revised plan files.
// Every segment writes to one output folder. The last one ends the painting, and the verdict reads all of them.
//
// Folder layout (dir): plan-<k>/ the plan files segment k painted with; aware/ the pause folder; out/ the painter's
// output; segment-<k>.log the painter's log.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolvePlan, renderVerdict } from './plan-args.mjs';

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); };
export const bkey = b => (String(b) === 'closing' ? 1e9 : Number(b));

export class Painting {
  /** spec: {width, sheetmm, trumbull}; dir: this painting's folder; initialStop: 0 (stop before the first wash) or 'end'. */
  constructor({ repo, spec, target, dir, gpu = 'auto', initialStop = 0, env = {} }) {
    Object.assign(this, { repo, spec, target, dir, gpu, env });
    this.aware = path.join(dir, 'aware');
    this.out = path.join(dir, 'out');
    fs.mkdirSync(this.aware, { recursive: true });
    this.seq = 1;
    writeJson(path.join(this.aware, 'control.json'), { stopAt: initialStop, seq: this.seq });
    this.segments = [];
    this.state = 'idle';     // running | saved | done | failed
    this.released = new Set();
    this.planningRefused = null;
  }

  /** Start segment k from a plan folder (a copy the harness owns). resume: the saved state folder, or null. */
  run(planDir, variant, resume = null) {
    const k = this.segments.length + 1;
    const plan = resolvePlan({ spec: this.spec, planDir, variant, target: this.target, out: this.out, gpu: this.gpu, pausedir: this.aware, resumestate: resume });
    const seg = { k, planDir, variant, resume, args: plan.args, plan, start: Date.now(), exit: undefined, log: path.join(this.dir, `segment-${k}.log`) };
    this.segments.push(seg);
    this.state = 'running';
    const log = fs.openSync(seg.log, 'w');
    const child = spawn(process.execPath, plan.args, { cwd: this.repo, env: { ...process.env, ...this.env }, stdio: ['ignore', log, log] });
    this.child = child;
    child.on('close', code => {
      fs.closeSync(log);
      seg.exit = code; seg.seconds = (Date.now() - seg.start) / 1000;
      this.child = null;
      if (code === 75 && fs.existsSync(path.join(this.aware, 'saved.json'))) { this.saved = readJson(path.join(this.aware, 'saved.json')); fs.rmSync(path.join(this.aware, 'saved.json')); this.state = 'saved'; return; }
      if (k === 1 && code !== 0 && code !== 3 && !fs.existsSync(path.join(this.aware, 'progress.json'))) {
        const text = fs.readFileSync(seg.log, 'utf8');
        this.planningRefused = (text.split('\n').find(l => /^(Error|[A-Za-z]*Error)[: ]/.test(l)) || `the painter exited ${code} before painting`).trim();
      }
      this.state = code === 0 || code === 3 ? 'done' : 'failed';
    });
    return seg;
  }

  /** Stops the painter offers and has not been released from, newest last, as [b, offer]. */
  currentStop() {
    if (this.state !== 'running') return [null, null];
    const live = fs.readdirSync(this.aware).map(f => /^offer-(.+)\.json$/.exec(f)).filter(Boolean).map(m => m[1]).filter(b => !this.released.has(b));
    if (!live.length) return [null, null];
    live.sort((a, b) => bkey(a) - bkey(b));
    const b = live.at(-1);
    return [b, readJson(path.join(this.aware, `offer-${b}.json`))];
  }
  progress() { return readJson(path.join(this.aware, 'progress.json')) || {}; }
  sheetImage(b) { return path.join(this.aware, `sheet-${b}.png`); }

  /** Set the next stop; release the painter from stop b (if any). action: continue | save-exit. */
  go(b, stopAt, action = 'continue') {
    this.seq++;
    if (action !== 'save-exit') writeJson(path.join(this.aware, 'control.json'), { stopAt, seq: this.seq });
    if (b !== null && b !== undefined) {
      writeJson(path.join(this.aware, `go-${b}.json`), action === 'save-exit' ? { action, seq: this.seq } : { action, stopAt, seq: this.seq });
      this.released.add(String(b));
    }
  }

  /** After a save: take the painting over with a revised plan, stopping next at stopAt. */
  resume(planDir, variant, stopAt) {
    const saved = this.saved; this.saved = null;
    for (const f of fs.readdirSync(this.aware)) if (/^(offer|go)-.+\.json$/.test(f)) fs.renameSync(path.join(this.aware, f), path.join(this.aware, `seg${this.segments.length}-${f}`));
    this.released = new Set();
    this.seq++;
    writeJson(path.join(this.aware, 'control.json'), { stopAt, seq: this.seq });
    return this.run(planDir, variant, saved.dir);
  }

  /** The session is over: no more stops. */
  noMoreStops() { const [b] = this.currentStop(); this.go(b, 'end'); }

  kill() { if (this.child) this.child.kill('SIGKILL'); }

  /** The verdict once the painting has ended: the unread-setting rule, dropped passages and the outputs. */
  verdict() {
    const last = this.segments.at(-1);
    const readEarlier = new Set(fs.existsSync(this.out) ? fs.readdirSync(this.out).filter(f => /^aware-options-read-\d+\.json$/.test(f)).flatMap(f => readJson(path.join(this.out, f)) || []) : []);
    const uf = path.join(this.out, 'unused-options.txt');
    const unused = (fs.existsSync(uf) && last.exit !== 75 ? fs.readFileSync(uf, 'utf8').split('\n').filter(Boolean) : []).filter(k => !readEarlier.has(k.replace(/^--/, '')));
    const union = key => [...new Set(this.segments.flatMap(s => s.plan[key]))];
    const text = fs.existsSync(last.log) ? fs.readFileSync(last.log, 'utf8') : '';
    const dm = [...text.matchAll(/(\d+) passages yielded no brush path and were never painted, carrying ([\d.]+)% of the planned mass/g)].at(-1);
    const finished = fs.existsSync(path.join(this.out, 'painting.png'));
    const v = renderVerdict({ paintExit: last.exit, unused, modelOptions: union('modelOptions'), extraOptions: union('extraOptions'), baseOptions: union('baseOptions'),
      templateOptions: union('templateOptions'), dropped: dm ? Number(dm[1]) : 0, droppedPct: dm ? Number(dm[2]) : 0, finished });
    return { ...v, unused, segments: this.segments.map(s => ({ k: s.k, variant: s.variant, resumed: Boolean(s.resume), exit: s.exit, seconds: s.seconds })), layering: last.plan.layering, args: last.args };
  }
}
