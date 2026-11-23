// A finished session is never thrown away for want of a place to paint its final. The full-size final waits for a
// GPU place (this Mac's places, or the render pool's workers) and says so once a minute; a worker that fails (the
// machine or the link went, the painter was killed) is tried again; and only after a long, stated limit does the
// run stop, with the session kept so its final can be painted later with --from. Pure but for the clock and sleep.

/** The most a final waits for a place and for its workers, in all: then the run stops and the session is kept. */
export const FINAL_WAIT_HOURS = 6;
export const FINAL_WAIT_MS = FINAL_WAIT_HOURS * 3600 * 1000;
/** A final is painted up to this many times when its worker fails (each pool try already has its own second worker). */
export const FINAL_TRIES = 3;
/** A waiting painting says so this often. */
export const SAY_EVERY_MS = 60 * 1000;
/** A run that stopped with its session kept and handed in, its final not painted: the exit code a chain can tell apart. */
export const EXIT_KEPT = 4;

/** A wait for a place that passed its limit. */
export class WaitLimit extends Error {}

/** The plain line of a wait still going on: "waiting 3 min for <what> (<why>); waits up to 6 h". */
export const waitingLine = (what, ms, why = '') => `waiting ${Math.round(ms / 60000)} min for ${what}${why ? ` (${why})` : ''}; waits up to ${FINAL_WAIT_HOURS} h, then stops with the session kept`;

/**
 * A ticker for a wait: tick(why) says a line once each SAY_EVERY_MS and throws WaitLimit once limitMs has passed
 * since the ticker was made. `what`: what is waited for.
 */
export function waitTicker({ what, say, limitMs = FINAL_WAIT_MS, now = Date.now, everyMs = SAY_EVERY_MS }) {
  const t0 = now(); let saidAt = t0;
  return why => {
    const t = now();
    if (t - t0 > limitMs) throw new WaitLimit(`waited ${Math.round((t - t0) / 60000)} min for ${what}, past the limit of ${Math.round(limitMs / 60000)} min${why ? ` (${why})` : ''}`);
    if (t - saidAt >= everyMs) { saidAt = t; say(waitingLine(what, t - t0, why)); }
  };
}

/**
 * Paint a final, trying again when its worker failed. `once()` resolves {failure, workerFailure, ...}: workerFailure
 * true when the machine failed and not the painting (a painter that ended with its own exit is the painting's answer
 * and is never tried again). Before a new try `clear()` empties the plate. Resolves the last try's result with
 * `tries`: [{failure}] of every try.
 */
export async function paintWithRetries(once, { tries = FINAL_TRIES, clear = () => {}, say = () => {}, sleep = ms => new Promise(r => setTimeout(r, ms)), pauseMs = SAY_EVERY_MS }) {
  const all = [];
  for (let n = 1; ; n++) {
    const got = await once(n);
    all.push({ failure: got.failure ?? null, workerFailure: Boolean(got.workerFailure) });
    if (!got.failure || !got.workerFailure || n >= tries) return { ...got, tries: all };
    say(`the final's worker failed (try ${n} of ${tries}): ${got.failure}; trying again in ${Math.round(pauseMs / 1000)} s`);
    clear(); await sleep(pauseMs);
  }
}

/** The words added to a final that was not painted: the session is kept and handed in, and how to paint it later. */
export function keptNote({ subject, author, keptRun }) {
  return `the session is kept and handed in; paint its final later with: npm run paint -- ${subject} paint --author ${author} --from ${keptRun}`;
}
