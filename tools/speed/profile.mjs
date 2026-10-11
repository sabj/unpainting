import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Awaited encode/write durations include libvips queue time and may overlap.
// GPU operation durations include queued work; never sum them with GPU samples.
export function startSpeedProfile(enabled) {
  if (!enabled) return null;
  Object.assign(process.env, { GPU_PROF: '1', GPU_TIMESTAMPS: '1', GPU_TIMESTAMP_KERNELS: '1' });
  const stages = {};
  const images = { calls: 0, ms: 0, frameCalls: 0, frameMs: 0 };
  const original = sharp.prototype.toFile;
  sharp.prototype.toFile = function(file, ...args) {
    const start = performance.now(), result = original.call(this, file, ...args);
    if (!result?.then) return result;
    return result.finally(() => {
      const ms = performance.now() - start; images.calls++; images.ms += ms;
      if (/^f\d+\.jpg$/.test(path.basename(file))) { images.frameCalls++; images.frameMs += ms; }
    });
  };
  return { add(name, ms) { stages[name] = (stages[name] ?? 0) + ms; }, write(out, details, name = 'speed-profile.json') {
    fs.writeFileSync(path.join(out, name), JSON.stringify({
      wallSeconds: process.uptime(), ...details, images, stages,
      scope: 'Main-thread image encode/write awaits can overlap. Worker GPU breakdown is in backend.json. Phase times are disjoint; operation and kernel times are nested.'
    }, null, 2));
  } };
}
