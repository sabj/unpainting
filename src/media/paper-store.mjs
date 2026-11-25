// Papers kept on disk (paper.mjs setPaperStore), one file a paper, named by the paper code's hash and the paper's size
// and options, so a run and a cold machine with the cache do not make the same paper again. Node only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readEntry, writeEntry } from '../paint/run-cache.mjs';

export function diskPaperStore(dir, code) {
  const file = key => path.join(dir, `paper-${crypto.createHash('sha256').update(code + '\n' + key).digest('hex').slice(0, 32)}.bin`);
  return {
    get(key) {
      const f = file(key);
      if (!fs.existsSync(f)) return null;
      const e = readEntry(f);
      if (e.reads?.[0]?.[1] !== key) throw new Error(`paper store: ${path.basename(f)} holds another paper`);
      return e.value;
    },
    put(key, paper) {
      fs.mkdirSync(dir, { recursive: true });
      const f = file(key), tmp = `${f}.${process.pid}.tmp`;
      writeEntry(tmp, { reads: [['paper', key]], logs: [], value: paper }); fs.renameSync(tmp, f);
    },
  };
}
