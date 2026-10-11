import { Session } from 'node:inspector';
import fs from 'node:fs';

// Diagnostic only. Sample the painter's main thread while the GPU worker runs normally.
export async function startCpuProfile() {
  const session = new Session();
  session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) =>
    session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  await post('Profiler.enable');
  await post('Profiler.start');
  return {
    async stop(file) {
      try {
        const { profile } = await post('Profiler.stop');
        fs.writeFileSync(file, JSON.stringify(profile));
      } finally {
        session.disconnect();
      }
    },
  };
}
