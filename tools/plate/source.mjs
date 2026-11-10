// The painter's source text, for tests that check what the painter does by reading its code: the entry file, then
// each stage in the order the stages run. Reads files only; the painter does not import this.
import fs from 'node:fs';

const STAGES = ['setup', 'plan', 'sheet', 'pen', 'drawing', 'paint', 'finish'];

export const painterSource = () => [new URL('../paint-plate.mjs', import.meta.url), ...STAGES.map(s => new URL(`./${s}.mjs`, import.meta.url))]
  .map(u => fs.readFileSync(u, 'utf8')).join('\n');
