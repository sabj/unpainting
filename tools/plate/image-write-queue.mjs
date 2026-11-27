// Bounded-concurrency async queue for independent image encodes and writes.
// Keeps sharp/libvips busy across multiple output files without oversubscribing memory.

export function createImageWriteQueue({ concurrency = 4 } = {}) {
  const limit = Math.max(1, Math.floor(concurrency));
  let active = 0;
  const pending = [], all = [];
  const pump = () => {
    while (active < limit && pending.length) {
      const job = pending.shift();
      active++;
      Promise.resolve().then(job.fn).then(
        val => { active--; job.resolve(val); pump(); },
        err => { active--; job.reject(err); pump(); }
      );
    }
  };
  return {
    enqueue(fn) {
      const p = new Promise((resolve, reject) => { pending.push({ fn, resolve, reject }); pump(); });
      // Attach a noop rejection handler so callers that only await flush() never trigger unhandledRejection.
      p.catch(() => {});
      all.push(p);
      return p;
    },
    async flush() {
      await Promise.all(all);
    },
    get size() { return all.length; },
  };
}
