// Saved painter state for paintings that stop and continue (tools/aware/pause.mjs): a JSON manifest plus one
// compressed file per typed array.
// writeState(dir, value) / readState(dir) round-trip plain JSON values, typed arrays (any view type), nested arrays and
// objects, Sets and Maps with JSON keys, and undefined/NaN/Infinity. A typed array met twice (the sheet's dried layers are
// also held by its lower-layer sum cache) is saved once and comes back as one object in both places. All-zero arrays
// (most dried layers hold one or two of the pigments) are not written. Arrays on shared memory come back shared.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const TYPES = { Float32Array, Float64Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Int8Array, Uint8Array, Uint8ClampedArray };
const isZero = v => { const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); const w = b.byteOffset % 4 === 0 && b.length % 4 === 0 ? new Uint32Array(b.buffer, b.byteOffset, b.length >> 2) : b; for (let i = 0; i < w.length; i++) if (w[i]) return false; return true; };

export function writeState(dir, value) {
  fs.mkdirSync(dir, { recursive: true });
  let k = 0, bytes = 0, zeros = 0;
  const seen = new Map();
  const trail = [];
  const enc = v => {
    if (v === undefined) return { $u: 1 };
    if (typeof v === 'number' && !Number.isFinite(v)) return { $n: String(v) };
    if (v === null || typeof v !== 'object') return v;
    if (ArrayBuffer.isView(v)) {
      if (seen.has(v)) return { $ref: seen.get(v) };
      const type = v.constructor.name;
      if (!TYPES[type]) throw new Error(`state: cannot save ${type} at ${trail.join('.')}`);
      const id = k++, shared = typeof SharedArrayBuffer !== 'undefined' && v.buffer instanceof SharedArrayBuffer ? { shared: 1 } : {};
      seen.set(v, id);
      if (isZero(v)) { zeros++; return { $ta: type, id, n: v.length, zero: 1, ...shared }; }
      const file = `a${String(id).padStart(5, '0')}.z`, z = zlib.deflateSync(Buffer.from(v.buffer, v.byteOffset, v.byteLength), { level: 1 });
      fs.writeFileSync(path.join(dir, file), z); bytes += z.length;
      return { $ta: type, id, f: file, n: v.length, ...shared };
    }
    if (Array.isArray(v)) return v.map((x, i) => { trail.push(i); const r = enc(x); trail.pop(); return r; });
    if (v instanceof Set) return { $set: [...v].map(enc) };
    if (v instanceof Map) return { $map: [...v].map(([a, b]) => [enc(a), enc(b)]) };
    const o = {};
    for (const [a, b] of Object.entries(v)) { if (typeof b === 'function') continue; trail.push(a); o[a] = enc(b); trail.pop(); }
    return { $o: o };
  };
  const manifest = enc(value);
  const json = JSON.stringify(manifest);
  fs.writeFileSync(path.join(dir, 'state.json'), json);
  return { arrays: k, zeros, bytes: bytes + json.length };
}

export function readState(dir) {
  const byId = new Map();
  const dec = v => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(dec);
    if (v.$u) return undefined;
    if (v.$n !== undefined) return Number(v.$n);
    if (v.$ref !== undefined) { if (!byId.has(v.$ref)) throw new Error('state: reference before its array'); return byId.get(v.$ref); }
    if (v.$ta) {
      const T = TYPES[v.$ta];
      const out = v.shared ? new T(new SharedArrayBuffer(v.n * T.BYTES_PER_ELEMENT)) : new T(v.n);
      if (!v.zero) {
        const buf = zlib.inflateSync(fs.readFileSync(path.join(dir, v.f)));
        if (buf.length !== out.byteLength) throw new Error(`state: ${v.f} has ${buf.length} bytes, expected ${out.byteLength}`);
        new Uint8Array(out.buffer, out.byteOffset, out.byteLength).set(buf);
      }
      byId.set(v.id, out);
      return out;
    }
    if (v.$set) return new Set(v.$set.map(dec));
    if (v.$map) return new Map(v.$map.map(([a, b]) => [dec(a), dec(b)]));
    if (v.$o) return Object.fromEntries(Object.entries(v.$o).map(([a, b]) => [a, dec(b)]));
    throw new Error('state: unknown entry ' + JSON.stringify(v).slice(0, 80));
  };
  return dec(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')));
}
