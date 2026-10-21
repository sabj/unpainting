// A sheet's whole state as one compressed file: its water, the pigment suspended, carried into the pores, deposited and in
// the top dried layer, the paper's colour with older washes folded in, and the graphite. A painting in progress is painted
// once, offline, with its real strokes and drying, and saved this way; the lab loads it in a moment instead of painting
// it again. DOM free; runs in the worker and in Node.
//
// Each float field is stored as 12-bit steps between its own least and greatest value, as the difference from the cell to
// its left, with the differences' low and high bytes in two runs: the long flat stretches of a sheet and the high bytes of
// its small differences compress to almost nothing. A field that is zero everywhere is not stored. Twelve bits keep a
// pigment mass to within 1/4095 of its range, a twentieth of a colour level once rendered. The paper's colour is stored as
// its ratio to the bare paper, which is 1 wherever no wash has been folded into it.
const VERSION = 2, LEVELS = 4095;

function encodeFloat(a, w) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo) && lo === 0) return { kind: 'zero' };
  const span = hi > lo ? hi - lo : 1, n = a.length, bytes = new Uint8Array(2 * n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.round(((a[i] - lo) / span) * LEVELS), d = i % w ? v - prev : v, z = d >= 0 ? 2 * d : -2 * d - 1;
    bytes[i] = z & 0xff; bytes[n + i] = z >> 8; prev = v;
  }
  return { kind: 'q12', lo, hi, bytes };
}
function decodeFloat(field, bytes, n, w) {
  const out = new Float32Array(n);
  if (field.kind === 'zero') return out;
  const span = field.hi > field.lo ? field.hi - field.lo : 1;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const z = bytes[i] | (bytes[n + i] << 8), d = z & 1 ? -((z + 1) >> 1) : z >> 1;
    v = i % w ? v + d : d; out[i] = field.lo + (v / LEVELS) * span;
  }
  return out;
}

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/**
 * The state of `sheet` (sheet.js) with its folded paper colour `baseR`, the bare paper's colour `bare` (both three floats a
 * cell) and `graphite`, as gzip bytes. `meta` is what makes the same sheet again: { paperIn, dpi, surface, seed, names (the
 * sheet's pigments in order), strokes, wet }.
 */
export async function packSheet(sheet, baseR, bare, graphite, meta) {
  const { w, h, n } = sheet, fields = [], blobs = [];
  const add = (name, encoded) => { const { bytes, ...rest } = encoded; fields.push({ name, ...rest, length: bytes ? bytes.length : 0 }); if (bytes) blobs.push(bytes); };
  add('W', encodeFloat(sheet.W, w)); add('s', encodeFloat(sheet.s, w));
  add('M', { kind: 'u8', bytes: Uint8Array.from(sheet.M) }); add('ever', { kind: 'u8', bytes: Uint8Array.from(sheet.ever) });
  meta.names.forEach((key, k) => { add(`G:${key}`, encodeFloat(sheet.G[k], w)); add(`P:${key}`, encodeFloat(sheet.P[k], w)); add(`D:${key}`, encodeFloat(sheet.D[k], w)); });
  const top = sheet.layers.length ? sheet.layers[sheet.layers.length - 1] : null;
  if (top) meta.names.forEach((key, k) => add(`T:${key}`, encodeFloat(top[k], w)));
  for (let c = 0; c < 3; c++) { const plane = new Float32Array(n); for (let i = 0; i < n; i++) plane[i] = baseR[i * 3 + c] / bare[i * 3 + c] - 1; add(`R${c}`, encodeFloat(plane, w)); }
  add('graphite', encodeFloat(graphite, w));
  const header = new TextEncoder().encode(JSON.stringify({ version: VERSION, w, h, n, top: Boolean(top), ...meta, fields }));
  const size = 4 + header.length + blobs.reduce((s, b) => s + b.length, 0), out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, header.length, true); out.set(header, 4);
  let at = 4 + header.length; for (const b of blobs) { out.set(b, at); at += b.length; }
  return pipe(out, new CompressionStream('gzip'));
}

/** The header and fields of a packed sheet: { header, field(name) -> Float32Array or Uint8Array }. The paper's colour
 *  fields R0..R2 come back as ratios to the bare paper, less one. */
export async function unpackSheet(gzipped) {
  const bytes = await pipe(gzipped, new DecompressionStream('gzip'));
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLength)));
  if (header.version !== VERSION) throw new Error(`sheet state version ${header.version}, expected ${VERSION}`);
  const at = new Map(); let offset = 4 + headerLength;
  for (const f of header.fields) { at.set(f.name, { f, bytes: f.length ? bytes.slice(offset, offset + f.length) : null }); offset += f.length; }
  const field = name => {
    const entry = at.get(name); if (!entry) return null;
    if (entry.f.kind === 'u8') return entry.bytes;
    return decodeFloat(entry.f, entry.bytes, header.n, header.w);
  };
  return { header, field };
}
