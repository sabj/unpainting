// Reads a saved mark tape (marks.json or marks.json.gz) as a stream. A native painting's tape can be longer than the
// longest string V8 holds (about 512 MB), so it is never read into one string: the top-level object is kept as text
// with an empty marks array, and each entry of "marks" is parsed on its own. The writer is mark-tape-json.mjs; tapes
// saved whole by older painters read the same way.
import fs from 'node:fs';
import zlib from 'node:zlib';

const QUOTE = 34, BACKSLASH = 92, OPEN = new Set([123, 91]), CLOSE = new Set([125, 93]), COLON = 58, BRACKET = 91;

export async function readMarkTape(file) {
  const input = fs.createReadStream(file);
  const stream = file.endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input;
  stream.setEncoding('utf8');
  const marks = [];
  let head = '', item = '', depth = 0, inString = false, escaped = false, key = '', lastKey = '', inMarks = false, afterColon = false;
  for await (const chunk of stream) {
    let from = 0;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (inString) {
        if (escaped) escaped = false;
        else if (c === BACKSLASH) escaped = true;
        else if (c === QUOTE) { inString = false; if (depth === 1 && !inMarks) lastKey = key; }
        else if (depth === 1 && !inMarks) key += chunk[i];
        continue;
      }
      if (c === QUOTE) { inString = true; if (depth === 1 && !inMarks) key = ''; continue; }
      if (depth === 1 && c === COLON) { afterColon = true; continue; }
      if (OPEN.has(c)) {
        if (depth === 1 && afterColon && lastKey === 'marks' && c === BRACKET) {
          head += chunk.slice(from, i + 1); from = i + 1; inMarks = true; depth++; afterColon = false; continue;
        }
        if (inMarks && depth === 2) { from = i; item = ''; }
        depth++; afterColon = false; continue;
      }
      if (CLOSE.has(c)) {
        depth--;
        if (inMarks && depth === 2) { marks.push(JSON.parse(item + chunk.slice(from, i + 1))); item = ''; from = i + 1; }
        else if (inMarks && depth === 1) { inMarks = false; from = i; }
        continue;
      }
      if (depth === 1 && c > 32) afterColon = false;
    }
    if (inMarks) item += chunk.slice(from); else head += chunk.slice(from);
  }
  if (depth !== 0 || inString) throw new Error(`${file}: truncated mark tape`);
  const doc = JSON.parse(head);
  doc.marks = marks;
  return doc;
}
