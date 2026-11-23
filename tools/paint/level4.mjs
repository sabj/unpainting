// What a level 4 session is handed beside its own level 3 try (owner, 23 Nov): the studies' traced shapes as regions
// it MAY use, change, redraw or ignore (offered, never required, and possibly wrong). Nothing of Auto: not the code's
// plan, the planner, its settings, Auto's painting, its film or its stroke map, nor the plan's washes as shapes. Its
// own level 3 painting, film and stroke map come as any retry's previous try (cli.mjs handedTo). It hands in its own
// script, as at every level.
import fs from 'node:fs';
import path from 'node:path';
import { SHEET_FILES } from './work-sheets.mjs';
import { SHAPES_FILE } from './prepared.mjs';

/** The folder level 4 adds to a session's folder, and the folder Auto's painting was once handed in (withheld). */
export const SHAPES_FOLDER = 'resources', AUTO_FOLDER = 'auto-painting';

/** The block-in study's traced shapes as regions: offered, never required, and possibly wrong. */
export function shapesHanded(file) {
  return { folder: SHAPES_FOLDER, title: 'The studies\' traced shapes, offered as regions',
    words: 'The block-in study\'s flat shapes, traced into outlines, as data you MAY use: `shapes.json` gives each shape\'s number, its outline in sheet millimetres, its colour, its area, whether it was read as paper, the shape it lies inside, and the named forms it lies in. They are offered, not required, and they may be wrong: a traced edge can cut across a form or miss one. Use them, change them, redraw them, or ignore them. In your own script a passage may name a shape by number (`"shapes": [12, 13]` for its region, `"reserve": [40]` for paper it is laid round, and in a stroke `"along": 12`); the numbers are turned into millimetres for you.',
    files: [{ from: file, name: SHAPES_FILE, what: 'the block-in study\'s traced shapes: n, colour, areaMm2, paper, inside, boxMm, forms, polygons' }] };
}

/** What no level hands a session, as paths in its folder: the code's plan, the plan's washes, anything of Auto's painting. */
export const WITHHELD = Object.freeze(['auto', `${SHAPES_FOLDER}/washes.json`, AUTO_FOLDER, ...Object.values(SHEET_FILES).map(f => `${AUTO_FOLDER}/${f}`)]);

/**
 * Throws, naming them, when a session's folder holds anything withheld: the code's plan (auto/), the plan's washes,
 * Auto's painting or its sheets. A session is not started with them.
 */
export function checkWithheld(dir) {
  const all = WITHHELD.filter(f => fs.existsSync(path.join(dir, f)));
  if (all.length) throw new Error(`session: the folder holds ${all.join(', ')}, which no level hands over (the code's plan, its washes, anything of Auto's painting); the session is not started`);
}
