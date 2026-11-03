import fs from 'node:fs';

// Callers stringify at append time: records often contain live brush/path objects.
// Bound the pending UTF-8 bytes across all files, and keep one append fd per file.
export function createJSONLWriter({ maxBytes = 1024 * 1024 } = {}) {
  const files = new Map();
  let bytes = 0;
  const flush = () => {
    for (const [file, state] of files) {
      if (!state.parts.length) continue;
      state.fd ??= fs.openSync(file, 'a');
      const data = Buffer.from(state.parts.join(''));
      while (state.offset < data.length) {
        const count = fs.writeSync(state.fd, data, state.offset, data.length - state.offset);
        if (!count) throw Error(`No progress writing ${file}`);
        state.offset += count;
      }
      bytes -= data.length; state.parts.length = 0; state.offset = 0;
    }
  };
  return {
    append(file, line) {
      if (typeof line !== 'string' || !line.endsWith('\n')) throw TypeError('JSONL append needs an immediately serialized line');
      let state = files.get(file);
      if (!state) files.set(file, state = { parts: [], fd: null, offset: 0 });
      state.parts.push(line); bytes += Buffer.byteLength(line);
      if (bytes >= maxBytes) flush();
    },
    flush,
    close() {
      flush();
      for (const state of files.values()) if (state.fd !== null) { fs.closeSync(state.fd); state.fd = null; }
    },
  };
}
