// Protocol v2 guard: no image file may be read at paint time except the frames the kit itself wrote.
// Installed by kit.mjs on import (and by NODE_OPTIONS=--import when the launcher sets it). Violations are logged
// to $BENCH_VIOLATIONS (outside the worktree) and thrown.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const IMG = /\.(png|jpe?g|webp|gif|tiff?|bmp|heic|avif)$/i;
const LOG = process.env.BENCH_VIOLATIONS || null;
const MANIFEST = new Set();
export const allowRead = p => MANIFEST.add(path.resolve(p));

function violation(kind, p) {
  const rec = { t: Date.now(), kind, path: String(p), pid: process.pid, argv: process.argv.slice(1).join(' ') };
  try { if (LOG) fs.appendFileSync(LOG, JSON.stringify(rec) + '\n'); } catch {}
  throw new Error(`protocol v2: reading image files is not allowed (${p}). Look at the targets with your own vision; use kit.coarse(task) for the coarse map and kit.look() for your own sheet.`);
}
function check(p, kind) {
  if (p == null) return;
  let s; try { s = p instanceof URL ? p.pathname : Buffer.isBuffer(p) ? p.toString() : typeof p === 'string' ? p : null; } catch { s = null; }
  if (s == null) return;
  let real = path.resolve(s); try { real = fs.realpathSync.native(s); } catch {}
  if (IMG.test(s) && !MANIFEST.has(path.resolve(s)) && !real.includes('/bench/out/')) violation(kind, s);
}

if (!globalThis.__benchGuard) {
  globalThis.__benchGuard = true;
  const wrap = (obj, name) => { const f = obj[name]; if (typeof f !== 'function') return; obj[name] = function (p, ...a) { check(p, name); return f.call(this, p, ...a); }; };
  for (const n of ['readFileSync', 'openSync', 'createReadStream', 'readFile', 'open', 'copyFileSync', 'copyFile', 'cpSync', 'cp']) wrap(fs, n);
  for (const n of ['readFile', 'open', 'copyFile', 'cp']) wrap(fs.promises, n);
  const patchSharp = sharp => {
    if (!sharp || !sharp.prototype || sharp.prototype.__guarded) return;
    for (const n of ['toBuffer', 'toFile', 'metadata', 'stats', 'raw', 'clone']) {
      const f = sharp.prototype[n]; if (typeof f !== 'function') continue;
      sharp.prototype[n] = function (...a) { const inp = this.options && this.options.input; if (inp && inp.file) check(inp.file, 'sharp.' + n); return f.apply(this, a); };
    }
    sharp.prototype.__guarded = true;
  };
  try { patchSharp(createRequire(path.join(process.cwd(), 'x.js'))('sharp')); } catch {}
  try { patchSharp((await import('sharp')).default); } catch {}
}
