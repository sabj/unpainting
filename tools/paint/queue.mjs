// The queue of a run of several paintings: which subjects `all` stands for, how many painters go at once, and the
// wait for a free GPU place when other paintings (this command's or anyone's) already hold them. Pure but for the
// clock: the process listing and the sleep are handed in.

/** The most GPU paintings at once when --jobs is not given: safe on a shared machine. Six held on an idle M5 Max (docs/running.md). */
export const DEFAULT_JOBS = 2;
/** CPU plans at once. */
export const PLAN_JOBS = 3;

/**
 * The subjects of a run with `all` filled in: `all` stands for every registered id not already named in the list
 * (by id, whatever its variant), in registry order, at the place `all` was written. So `a,b,all` paints a and b
 * first and then the rest. [{id, variant}]
 */
export function expandSubjects(subjects, registryIds) {
  if (!subjects.some(s => s.id === 'all')) return subjects;
  if (subjects.filter(s => s.id === 'all').length > 1 || subjects.some(s => s.id === 'all' && s.variant)) throw new Error('"all" is written once, without a variant');
  const named = new Set(subjects.filter(s => s.id !== 'all').map(s => s.id));
  const rest = registryIds.filter(id => !named.has(id)).map(id => ({ id, variant: null }));
  return subjects.flatMap(s => (s.id === 'all' ? rest : [s]));
}

/**
 * A pool of `n` places: slot(fn) runs fn when a place is free, first come first served, and gives the place back
 * when fn ends, whether it resolves or throws. A failed job never stops the queue.
 */
export function pool(n) {
  let free = n; const wait = [];
  return async fn => {
    if (free > 0) free--; else await new Promise(r => wait.push(r));
    try { return await fn(); } finally { const next = wait.shift(); if (next) next(); else free++; }
  };
}

/**
 * Resolves, with the number of GPU paintings then running, once fewer than `most` are: paintings started elsewhere
 * (another engineer's check) count against the same places. `most` may be a function, asked each time, so a running
 * queue can be given more or fewer places (jobsNow). `running()` gives the count now; it is asked again every
 * `everyMs`. onWait is told once, when a wait begins; tick(why) at every look while it waits (final-wait.mjs
 * waitTicker: a line a minute, and a stop past its limit).
 */
export async function gpuPlace({ most, running, sleep = ms => new Promise(r => setTimeout(r, ms)), everyMs = 15000, onWait = () => {}, tick = () => {} }) {
  let told = false;
  for (;;) {
    const n = running();
    if (n < (typeof most === 'function' ? most() : most)) return n;
    if (!told) { onWait(n); told = true; }
    tick(`${n} GPU paintings are running`);
    await sleep(everyMs);
  }
}

/**
 * What a finished queue measured, from its records ({seconds, startedMs, endedMs, failure, backend}): paintings an
 * hour over the whole wall time, and the mean and longest painter time. Records that never ran are left out.
 */
export function throughput(records) {
  const ran = records.filter(r => r.startedMs != null && r.endedMs != null);
  if (!ran.length) return { paintings: 0, failed: 0, wallSeconds: 0, meanSeconds: null, longestSeconds: null, perHour: null };
  const wall = (Math.max(...ran.map(r => r.endedMs)) - Math.min(...ran.map(r => r.startedMs))) / 1000;
  const secs = ran.map(r => (r.endedMs - r.startedMs) / 1000);
  const done = ran.filter(r => !r.failure).length;
  return {
    paintings: ran.length, failed: ran.length - done, wallSeconds: Math.round(wall),
    meanSeconds: Math.round(secs.reduce((a, b) => a + b, 0) / secs.length), longestSeconds: Math.round(Math.max(...secs)),
    perHour: wall > 0 ? +(done * 3600 / wall).toFixed(2) : null,
  };
}

/**
 * The places of a running queue: the whole number in the text of the queue's `jobs` file when there is one (written
 * by hand into the --out folder to change a queue that is already running), else the number it was started with.
 */
export function jobsNow(started, text) {
  const n = Number(String(text ?? '').trim());
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : started;
}
