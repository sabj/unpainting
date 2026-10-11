// A native sheet can record more JSON than one JavaScript string can hold.
// Emit one recorded operation at a time, with the same JSON tape schema.
export function* markTapeJSON(tape) {
  const { marks, ...metadata } = tape;
  if (!Array.isArray(marks)) throw new TypeError('mark tape needs a marks array');
  const header = JSON.stringify(metadata);
  yield header.slice(0, -1) + (header.length > 2 ? ',' : '') + '"marks":[';
  for (let i = 0; i < marks.length; i++) {
    if (i) yield ',';
    yield JSON.stringify(marks[i]) ?? 'null';
  }
  yield ']}';
}
