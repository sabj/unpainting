// A thread of the sheet's pool (sheet-par.mjs): it waits on the pool's counter, runs its band of each phase in
// sheet-kernel.mjs, and counts itself done. Sheets and their arrays arrive as messages, read synchronously at each
// phase so they are in place before the phase that needs them.
import { workerData, receiveMessageOnPort } from 'node:worker_threads';
import { runChunk, claim, PH, GEN, PHASE, SHEET, DONE, ERR, READY, NCH } from './sheet-kernel.mjs';
import { runJob } from './jobs-kernel.mjs';

const { ctrl, prm, p, port } = workerData;
const SPIN = 2000;
const sheets = new Map();
let job = null;

function drain() {
  for (let m; (m = receiveMessageOnPort(port)); ) {
    const msg = m.message;
    if (msg.t === 'reg') sheets.set(msg.id, { ...msg.fields, ctrl, prm });
    else if (msg.t === 'set') { const C = sheets.get(msg.id); if (C) C[msg.key] = msg.value; }
    else if (msg.t === 'drop') sheets.delete(msg.id);
    else if (msg.t === 'job') job = msg.args;
  }
}

let gen = Atomics.load(ctrl, GEN);
Atomics.add(ctrl, READY, 1); Atomics.notify(ctrl, READY);
for (;;) {
  let spins = 0;
  while (Atomics.load(ctrl, GEN) === gen) { if (++spins > SPIN) Atomics.wait(ctrl, GEN, gen); }
  gen = Atomics.load(ctrl, GEN);
  const phase = ctrl[PHASE];
  if (phase === PH.QUIT) break;
  drain();
  try {
    const C = phase === PH.JOB ? null : sheets.get(ctrl[SHEET]);
    for (let c; (c = claim(ctrl, gen)) >= 0; ) {
      if (phase === PH.JOB) runJob(job, c, ctrl[NCH]);
      else if (!C) throw new Error(`sheet worker ${p}: no sheet ${ctrl[SHEET]}`);
      else runChunk(C, c, phase);
      if (Atomics.add(ctrl, DONE, 1) + 1 === ctrl[NCH]) Atomics.notify(ctrl, DONE);
    }
  } catch (e) { console.error(e); ctrl[ERR] = 1; Atomics.notify(ctrl, DONE); }
}
