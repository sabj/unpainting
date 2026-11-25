// THE SHEET RULE (owner, 23 Nov): every picture is painted on the same AREA of paper, a quarter sheet
// (27.9 x 38.1 cm, about 1,063 cm2), in the picture's own proportions, whatever the file's pixel size or
// orientation. A cell is 0.26 mm, so every full-size sheet holds about 1.57 million cells. It replaces "cells across
// = the source's pixels across, at most 1,462 on the long side", under which a small file got a small sheet.
// A record of SUBJECTS.json registered under this rule says so (sheet.rule = SHEET_RULE) and its numbers are checked
// against this file; a record registered earlier keeps its own sheet, so its earlier results keep their inputs.
// Pure: nothing is read or written here unless run as a command (the table of every registered subject).
import { pathToFileURL } from 'node:url';

/** The name a registry record carries (sheet.rule) when its sheet is sized by this rule. */
export const SHEET_RULE = 'quarter-sheet-area';
/** A quarter sheet (a quarter of an imperial 22 x 30 in sheet), mm. */
export const QUARTER_SHEET_MM = Object.freeze([279, 381]);
export const SHEET_AREA_MM2 = QUARTER_SHEET_MM[0] * QUARTER_SHEET_MM[1];
/** One cell at full size, mm. */
export const CELL_MM = 0.26;

/**
 * The sheet of a picture of pw x ph pixels: {widthMm, heightMm, cells, rows, cellMm}. Only the proportions pw:ph are
 * read: the same picture at any pixel size, or turned on its side, gets the same area.
 */
export function standardSheet([pw, ph]) {
  if (!(pw > 0 && ph > 0)) throw new Error(`sheet rule: a picture's size in pixels, not ${pw} x ${ph}`);
  const cells = Math.round(Math.sqrt(SHEET_AREA_MM2 * pw / ph) / CELL_MM), rows = Math.round(cells * ph / pw);
  return { widthMm: +(cells * CELL_MM).toFixed(2), heightMm: +(cells * CELL_MM * ph / pw).toFixed(2), cells, rows, cellMm: CELL_MM };
}

/** Before and after for every record: [{id, inputId, px, rule, before: {cells, rows}, after: {cells, rows}, ...}]. */
export function sheetTable(subjects) {
  return subjects.map(s => {
    const [pw, ph] = s.source.px, c = s.sheet.cellsAcross.full, before = { cells: c, rows: Math.round(c * ph / pw), widthMm: s.sheet.widthMm }, after = standardSheet([pw, ph]);
    const n = x => x.cells * x.rows;
    return { id: s.id, inputId: s.inputId ?? s.id, px: [pw, ph], underRule: s.sheet.rule === SHEET_RULE, before, after, cellsBefore: n(before), cellsAfter: n(after), times: +(n(after) / n(before)).toFixed(2) };
  });
}

// node tools/paint/sheet-rule.mjs            the table of every registered subject, as registered and under the rule
// node tools/paint/sheet-rule.mjs W H        the sheet of a W x H px picture, as JSON (for whatever writes the registry)
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.length === 4) {
  const s = standardSheet(process.argv.slice(2).map(Number));
  console.log(JSON.stringify({ rule: SHEET_RULE, widthMm: s.widthMm, heightMm: s.heightMm, cellsAcross: { full: s.cells, half: Math.round(s.cells / 2), line: s.cells * 2 }, rows: s.rows, cellMm: s.cellMm }));
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // (subjects.mjs reads this file: it is loaded here without waiting at the top level)
  import('./subjects.mjs').then(({ loadRegistry }) => {
    const f = x => x.toLocaleString('en-US'), rows = sheetTable(loadRegistry().subjects);
    console.log(`Sheet size in cells for every registered subject: as registered, and under the one-area rule (a quarter sheet, ${QUARTER_SHEET_MM.map(v => v / 10).join(' x ')} cm, in the picture's proportions; ${CELL_MM} mm a cell).\n`);
    console.log('| Subject | Source, px | Registered: cells | mm across | total | One area: cells | mm | total | Times the cells | Registered under the rule |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.id} | ${r.px.join(' x ')} | ${f(r.before.cells)} x ${f(r.before.rows)} | ${r.before.widthMm} | ${f(r.cellsBefore)} | ${f(r.after.cells)} x ${f(r.after.rows)} | ${r.after.widthMm} x ${r.after.heightMm} | ${f(r.cellsAfter)} | ${r.times} | ${r.underRule ? 'yes' : 'no'} |`);
  });
}
