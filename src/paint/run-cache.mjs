// A disk cache for a run's slow, pure steps, keyed by the code, the step's named inputs and the options it read.
// Its log lines are replayed, and results come back bit for bit (typed arrays, -0, NaN and infinities tagged).
// A result holding anything else (a function, a Map) is not cached.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import util from 'node:util';
import {passage} from '../crop/blockin.mjs';

/** sha256 over every source file under `root`/src and the extra files given (the calling tool). */
export function codeHash(root, extra = []) {
  // Recompute so edits during a long-lived process also invalidate plans.
  const h = crypto.createHash('sha256');
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js|cjs|wgsl|json)$/.test(e.name)) { h.update(path.relative(root, p)); h.update(fs.readFileSync(p)); }
    }
  };
  walk(path.join(root, 'src'));
  if(fs.existsSync(path.join(root,'tools')))walk(path.join(root,'tools'));
  for (const f of extra) { h.update(path.relative(root, f)); h.update(fs.readFileSync(f)); }
  return h.digest('hex');
}

const TYPED = { Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray };
class Uncacheable extends Error {}
function enc(v, arrays = new Map(), blobs = null) {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { __n: 'NaN' };
    if (v === Infinity) return { __n: 'Inf' };
    if (v === -Infinity) return { __n: '-Inf' };
    if (Object.is(v, -0)) return { __n: '-0' };
    return v;
  }
  if (v === undefined) return { __u: 1 };
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (Buffer.isBuffer(v)) { if (blobs) { blobs.push(v); return { __b: 'Buffer', bi: blobs.length - 1 }; } return { __b: 'Buffer', d: v.toString('base64') }; }
  if (ArrayBuffer.isView(v)) {
    const name = v.constructor.name; if (!TYPED[name]) throw new Uncacheable(name);
    if(arrays.has(v))return {__ref:arrays.get(v)};
    const id=arrays.size;arrays.set(v,id);
    const bytes = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    if (blobs) { blobs.push(bytes); return { __b: name, __id: id, bi: blobs.length - 1 }; }
    return { __b: name, __id:id, d: bytes.toString('base64') };
  }
  if (Array.isArray(v)) return v.map(x=>enc(x,arrays,blobs));
  if (typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
    // Preserve lazy passage masks without evaluating or duplicating full fields.
    // Only passages (ids + box) can rebuild their mask; any other lazy mask (a layer union) is stored evaluated.
    const lazy=!!Object.getOwnPropertyDescriptor(v,'mask')?.get&&v.box!=null;
    const o = {}; for (const k of Object.keys(v)) {if(lazy&&k==='mask')continue;o[k]=enc(v[k],arrays,blobs);}
    return lazy?{__passage:o}:o;
  }
  throw new Uncacheable(typeof v === 'object' ? v.constructor?.name ?? 'object' : typeof v);
}
function dec(v, arrays = new Map(), blobs = null) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x=>dec(x,arrays,blobs));
  if('__ref' in v)return arrays.get(v.__ref);
  if('__passage' in v){const o=dec(v.__passage,arrays,blobs);return Object.assign(passage(o.ids,o.id,o.box,o.amount,o.area,o.w),o);}
  if ('__n' in v) return { NaN: NaN, Inf: Infinity, '-Inf': -Infinity, '-0': -0 }[v.__n];
  if ('__u' in v) return undefined;
  if ('__b' in v) {
    const b = v.bi !== undefined ? blobs[v.bi] : Buffer.from(v.d, 'base64');
    if (v.__b === 'Buffer') return b;
    const T = TYPED[v.__b], copy = new Uint8Array(b.length); copy.set(b);
    const result=new T(copy.buffer, 0, b.length / T.BYTES_PER_ELEMENT);
    if(v.__id!==undefined)arrays.set(v.__id,result);return result;
  }
  const o = {}; for (const [k, x] of Object.entries(v)) o[k] = dec(x,arrays,blobs); return o;
}
/** A stable digest of a step's named inputs: typed arrays and buffers by their bytes, the rest as JSON. */
function inputHash(inputs) {
  const h = crypto.createHash('sha256');
  for (const [k, v] of Object.entries(inputs)) {
    h.update(k);
    if (ArrayBuffer.isView(v)) { h.update(v.constructor.name); h.update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); } else h.update(JSON.stringify(v) ?? 'undefined');
  }
  return h.digest('hex');
}

// One entry on disk: "RCB1", u32 skeleton bytes, the skeleton (JSON: reads, logs, the value with each typed array as a
// blob index), u32 blob count, then each blob as an f64 byte length and its bytes. Arrays stay out of the JSON, since
// a large plan as one string passes V8's string limit. Each entry is its own .bin file; NAME-HASH.json indexes them by
// the options they read.
const MAGIC = Buffer.from('RCB1');
function writeEntry(file, entry) {
  const blobs = [], skeleton = Buffer.from(JSON.stringify({ reads: entry.reads, logs: entry.logs, value: enc(entry.value, new Map(), blobs) }));
  const fd = fs.openSync(file, 'w');
  try {
    const head = Buffer.alloc(8); MAGIC.copy(head); head.writeUInt32LE(skeleton.length, 4); fs.writeSync(fd, head); fs.writeSync(fd, skeleton);
    const count = Buffer.alloc(4); count.writeUInt32LE(blobs.length); fs.writeSync(fd, count);
    for (const b of blobs) { const len = Buffer.alloc(8); len.writeDoubleLE(b.length); fs.writeSync(fd, len); for (let o = 0; o < b.length; o += 1 << 30) fs.writeSync(fd, b, o, Math.min(1 << 30, b.length - o)); }
  } finally { fs.closeSync(fd); }
}
function readEntry(file) {
  const fd = fs.openSync(file, 'r');
  try {
    let at = 0;
    const rd = len => { const b = Buffer.allocUnsafe(len); let o = 0; while (o < len) { const r = fs.readSync(fd, b, o, len - o, at + o); if (!r) throw new Error('short cache entry'); o += r; } at += len; return b; };
    const head = rd(8); if (!head.subarray(0, 4).equals(MAGIC)) throw new Error('not a cache entry');
    const sk = JSON.parse(rd(head.readUInt32LE(4)).toString()), count = rd(4).readUInt32LE(0), blobs = [];
    for (let i = 0; i < count; i++) blobs.push(rd(rd(8).readDoubleLE(0)));
    return { reads: sk.reads, logs: sk.logs, value: dec(sk.value, new Map(), blobs) };
  } finally { fs.closeSync(fd); }
}

/**
 * Run `fn` (async, returning the step's result), or read it back. `track` is { start(), stop() -> [[name, raw], ...],
 * current(name) -> raw, replay(names) } over the tool's option reader. Returns { value, cached }.
 */
export async function cachedStep({ dir, name, code, inputs, track, enabled = true, log = console.log }, fn) {
  if (!enabled) return { value: await fn(), cached: false };
  const key = `${name}-${crypto.createHash('sha256').update(code + inputHash(inputs)).digest('hex').slice(0, 32)}`, file = path.join(dir, `${key}.json`);
  let entries = [];
  try { entries = JSON.parse(fs.readFileSync(file, 'utf8')).filter(e => typeof e.file === 'string'); } catch { entries = []; }
  for (const e of entries) {
    if (!e.reads.every(([k, raw]) => track.current(k) === raw)) continue;
    let value; try { value = readEntry(path.join(dir, e.file)).value; } catch (err) { log(`cache: ${name} entry unreadable (${err.message})`); continue; }
    log(`cache: ${name} hit (${path.basename(file)})`);
    track.replay(e.reads.map(([k]) => k));
    for (const line of e.logs) log(line);
    return { value, cached: true };
  }
  log(`cache: ${name} miss (${path.basename(file)})`);
  const logs = [], orig = console.log;
  console.log = (...a) => { logs.push(util.format(...a)); orig(...a); };
  track.start();
  let value, reads;
  try { value = await fn(); } finally { console.log = orig; reads = track.stop(); }
  // one value per option, as first read (a step reads an option the same way every time it asks)
  const seen = new Map(); for (const [k, raw] of reads) if (!seen.has(k)) seen.set(k, raw);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const readsList = [...seen.entries()], entryFile = `${key}-${crypto.createHash('sha256').update(JSON.stringify(readsList)).digest('hex').slice(0, 16)}.bin`;
    const tmp = path.join(dir, `${entryFile}.${process.pid}.tmp`);
    writeEntry(tmp, { reads: readsList, logs, value }); fs.renameSync(tmp, path.join(dir, entryFile));
    const kept = [{ reads: readsList, logs, file: entryFile }, ...entries.filter(e => e.file !== entryFile)].slice(0, 8);
    for (const e of entries) if (!kept.some(k => k.file === e.file)) fs.rmSync(path.join(dir, e.file), { force: true });
    const itmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(itmp, JSON.stringify(kept)); fs.renameSync(itmp, file);
  } catch (e) { if (!(e instanceof Uncacheable)) orig(`cache: ${name} not stored (${e.message})`); }
  return { value, cached: false };
}
