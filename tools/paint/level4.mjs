// What a level 4 open session is handed beside the subject's inputs (levels.mjs, 24 Nov): L3's inputs, that is the
// studies' traced shapes as regions it MAY use, change, redraw or ignore (offered, never required, and possibly
// wrong), and Auto's plan in numbers (to read) and Auto's finished painting, as it dried at full size, alone on the
// millimetre grid. Never the code's plan as a choice (auto/), its settings, the plan's washes as shapes, or Auto's
// sheets beside the subject, its film or its stroke map. It hands in its own script, as at every level.
import fs from 'node:fs';
import path from 'node:path';
import { SHEET_FILES } from './work-sheets.mjs';
import { SHAPES_FILE } from './prepared.mjs';
import { gridImage } from './author.mjs';
import { washesText } from './plan-data.mjs';

/** The folders level 4 adds to a session's folder (the traced shapes; Auto's plan and painting), and the folder Auto's sheets were once handed in (withheld). */
export const SHAPES_FOLDER = 'resources', AUTO_GIVEN_FOLDER = 'auto-result', AUTO_FOLDER = 'auto-painting';

/** The block-in study's traced shapes as regions: offered, never required, and possibly wrong. */
export function shapesHanded(file) {
  return { folder: SHAPES_FOLDER, title: 'The studies\' traced shapes, offered as regions',
    words: 'The block-in study\'s flat shapes, traced into outlines, as data you MAY use: `shapes.json` gives each shape\'s number, its outline in sheet millimetres, its colour, its area, whether it was read as paper, the shape it lies inside, and the named forms it lies in. They are offered, not required, and they may be wrong: a traced edge can cut across a form or miss one. Use them, change them, redraw them, or ignore them. In your own script a passage may name a shape by number (`"shapes": [12, 13]` for its region, `"reserve": [40]` for paper it is laid round, and in a stroke `"along": 12`); the numbers are turned into millimetres for you.',
    files: [{ from: file, name: SHAPES_FILE, what: 'the block-in study\'s traced shapes: n, colour, areaMm2, paper, inside, boxMm, forms, polygons' }] };
}

/**
 * Auto's plan in numbers and its finished painting, as a handed folder: `auto` (cli.mjs preparedPlan: its summary
 * and table), `prepared` (prepared.mjs readPrepared with the painting), `made` a folder outside the model's where the
 * files are written. The painting is a picture (for looking at, under the anti-cheat guard); the plan is text.
 */
export async function autoHanded({ auto, prepared, made, widthMm, washes = null }) {
  const painting = prepared?.painting && ['painting.png', 'painting.jpg'].map(f => path.join(prepared.painting.run, 'plate', f)).find(f => fs.existsSync(f));
  if (!painting) throw new Error('level 4 hands over Auto\'s finished painting, and it is not prepared for this code');
  const text = washes ?? washesText(auto);
  fs.mkdirSync(made, { recursive: true });
  const pic = path.join(made, 'auto-painting.png'), plan = path.join(made, 'auto-plan.txt');
  fs.writeFileSync(pic, await gridImage(painting, widthMm)); fs.writeFileSync(plan, text);
  return { folder: AUTO_GIVEN_FOLDER, title: 'Auto\'s plan and Auto\'s finished painting',
    words: 'Auto is this project\'s automatic painter. `auto-painting.png` is Auto\'s finished painting of this subject, as it dried at full size, on the millimetre grid; `auto-plan.txt` is Auto\'s plan: its washes in painting order, in numbers. Both are given to read, as a result to improve on. What you hand in is your own script, as at every level: Auto\'s plan is not a script and cannot be handed in.',
    files: [{ from: pic, name: 'auto-painting.png', picture: true, what: 'Auto\'s finished painting, as it dried at full size, on the millimetre grid' }, { from: plan, name: 'auto-plan.txt', what: 'Auto\'s plan: its washes in painting order, in numbers' }] };
}

/** What no level hands a session, as paths in its folder: the code's plan, the plan's washes, anything of Auto's painting. */
export const WITHHELD = Object.freeze(['auto', `${SHAPES_FOLDER}/washes.json`, AUTO_FOLDER, ...Object.values(SHEET_FILES).map(f => `${AUTO_FOLDER}/${f}`)]);

/**
 * Throws, naming them, when a session's folder holds anything withheld: the code's plan (auto/), the plan's washes,
 * or Auto's sheets in the old folder. A session is not started with them.
 */
export function checkWithheld(dir) {
  const all = WITHHELD.filter(f => fs.existsSync(path.join(dir, f)));
  if (all.length) throw new Error(`session: the folder holds ${all.join(', ')}, which no level hands over (the code's plan as a choice, its washes, Auto's sheets beside the subject, film or stroke map); the session is not started`);
}
