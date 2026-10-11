// Lossless binary checkpoints. Preserve float bits and shared typed-array identity.
export async function encodeState(value) {
  const blobs = [], arrays = new Map();
  const visit = v => {
    if (ArrayBuffer.isView(v)) {
      if(arrays.has(v))return {arrayRef:arrays.get(v)};
      const id=arrays.size;arrays.set(v,id);
      const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      // Empty pigment planes need a shape, not megabytes of zeroes through
      // gzip. Inspect bits so -0 and nonzero subnormals are never discarded.
      let zero = true, at = 0;
      if (v.byteOffset % 4 === 0) {
        const words = new Uint32Array(v.buffer, v.byteOffset, Math.floor(v.byteLength / 4));
        for (let i = 0; i < words.length; i++) { if (words[i] !== 0) { zero = false; break; } }
        at = words.byteLength;
      }
      if (zero) for (; at < bytes.length; at++) { if (bytes[at] !== 0) { zero = false; break; } }
      if (zero) return { id, array: v.constructor.name, bytes: v.byteLength, zero: true };
      const index = blobs.length; blobs.push(bytes); return { id, array: v.constructor.name, index, bytes: v.byteLength };
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visit(x)]));
    return v;
  };
  const header = new TextEncoder().encode(JSON.stringify(visit(value))), length = new Uint32Array([header.length]);
  return new Uint8Array(await new Response(new Blob([length, header, ...blobs]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
export async function decodeState(bytes) {
  const raw = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const length = new DataView(raw).getUint32(0, true); let at = 4 + length;
  const types = { Float32Array, Uint8Array, Uint32Array, Int32Array }, arrays=new Map();
  const visit = v => {
    if(v?.arrayRef!==undefined)return arrays.get(v.arrayRef);
    if (v?.array) {
      const a=v.zero?new types[v.array](v.bytes / types[v.array].BYTES_PER_ELEMENT):new types[v.array](raw.slice(at, at + v.bytes));
      if(!v.zero)at+=v.bytes;if(v.id!==undefined)arrays.set(v.id,a);return a;
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visit(x)]));
    return v;
  };
  return visit(JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 4, length))));
}
