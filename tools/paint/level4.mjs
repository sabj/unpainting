// What a level 4 session is handed beside its own level 3 try (owner, 23 Nov 01:15): a model sees WHAT Auto made,
// never HOW. Given: the studies' traced shapes as regions it MAY use, change, redraw or ignore (offered, never
// required, and possibly wrong); Auto's finished painting, as a picture of the result beside the subject. Not given:
// the code's plan, the planner, Auto's stroke map, Auto's film or replay sheet, the plan's washes as shapes. Its own
// level 3 painting, film and stroke map come as any retry's previous try (cli.mjs handedTo). It hands in its own
// script, as at every level.
import fs from 'node:fs';
import path from 'node:path';
import { SHEET_FILES } from './work-sheets.mjs';
import { SHAPES_FILE } from './prepared.mjs';

/** The folders level 4 adds to a session's folder. */
export const AUTO_FOLDER = 'auto-painting', SHAPES_FOLDER = 'resources';

/** Auto's finished painting beside the subject: the one sheet of Auto's that is handed. Throws when it is not among the prepared sheets. */
export function autoPaintingHanded(sheets) {
  const one = sheets.find(f => f.name === SHEET_FILES.beside);
  if (!one) throw new Error(`level 4: the prepared sheets hold no ${SHEET_FILES.beside} (Auto's finished painting beside the subject); prepare the subject again with --level L4`);
  return { folder: AUTO_FOLDER, title: 'What Auto made of this subject',
    words: 'This is the finished painting the automatic painter (Auto) made of this subject on its own, dried, at full size, beside the subject. It is a result to beat, not a model to copy: how it was painted is not given. You owe it nothing, and it is not the goal: the subject is.',
    files: [{ ...one, picture: true, what: 'Auto\'s finished painting as it dried, at full size, on the left; the subject on the right' }] };
}

/** The block-in study's traced shapes as regions: offered, never required, and possibly wrong. */
export function shapesHanded(file) {
  return { folder: SHAPES_FOLDER, title: 'The studies\' traced shapes, offered as regions',
    words: 'The block-in study\'s flat shapes, traced into outlines, as data you MAY use: `shapes.json` gives each shape\'s number, its outline in sheet millimetres, its colour, its area, whether it was read as paper, the shape it lies inside, and the named forms it lies in. They are offered, not required, and they may be wrong: a traced edge can cut across a form or miss one. Use them, change them, redraw them, or ignore them. In your own script a passage may name a shape by number (`"shapes": [12, 13]` for its region, `"reserve": [40]` for paper it is laid round, and in a stroke `"along": 12`); the numbers are turned into millimetres for you.',
    files: [{ from: file, name: SHAPES_FILE, what: 'the block-in study\'s traced shapes: n, colour, areaMm2, paper, inside, boxMm, forms, polygons' }] };
}

/** What level 4 never hands a session, as paths in its folder (the code's plan, the plan's washes, Auto's film and stroke map). */
export const WITHHELD = Object.freeze(['auto', `${SHAPES_FOLDER}/washes.json`, `${AUTO_FOLDER}/${SHEET_FILES.replay}`, `${AUTO_FOLDER}/${SHEET_FILES.arrows}`]);

/**
 * Throws, naming them, when a session's folder holds anything level 4 withholds: the code's plan (auto/), the plan's
 * washes, or any of Auto's sheets but its finished painting. A session is not started with them.
 */
export function checkWithheld(dir) {
  const there = WITHHELD.filter(f => fs.existsSync(path.join(dir, f)));
  const extra = fs.existsSync(path.join(dir, AUTO_FOLDER)) ? fs.readdirSync(path.join(dir, AUTO_FOLDER)).filter(f => f !== SHEET_FILES.beside).map(f => `${AUTO_FOLDER}/${f}`) : [];
  const all = [...new Set([...there, ...extra])];
  if (all.length) throw new Error(`session: the folder holds ${all.join(', ')}, which no level hands over (the code's plan, its washes, Auto's film and stroke map); the session is not started`);
}
