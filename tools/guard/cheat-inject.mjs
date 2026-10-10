// Deliberate cheat, loaded into a real painter run by tools/guard/cheat-test.mjs (node --import). Once the painter's
// target guard has sealed the target for the paint step, it tries to open and decode the target file four ways. Each
// attempt must be blocked. The results are printed as 'cheat: blocked ...' or 'cheat: NOT BLOCKED ...' lines.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { activeGuard } from './no-target.mjs';

const target = process.env.CHEAT_TARGET;
const scratch = process.env.CHEAT_SCRATCH;
if (!target || !scratch) throw new Error('cheat-inject: CHEAT_TARGET and CHEAT_SCRATCH must be set (run tools/guard/cheat-test.mjs)');

const tries = {
  'fs.readFileSync': () => fs.readFileSync(target),
  'fs.promises.readFile': () => fs.promises.readFile(target),
  'sharp(file).raw().toBuffer()': () => sharp(target).raw().toBuffer(),
  'fs.copyFileSync to a scratch file': () => fs.copyFileSync(target, path.join(scratch, 'copied.png')),
};

async function cheat() {
  for (const [name, f] of Object.entries(tries)) {
    try { await f(); console.log(`cheat: NOT BLOCKED ${name}`); }
    catch (e) { console.log(`cheat: blocked ${name} -> ${e.name}: ${e.message.slice(0, 90)}`); }
  }
}

// wait for the paint step, then cheat once; the timer does not keep the process alive
const timer = setInterval(() => {
  const g = activeGuard();
  if (!g || g.phase !== 'paint') return;
  clearInterval(timer);
  console.log(`cheat: the painter's guard is ${g.mode} and painting; trying to read ${target}`);
  cheat().catch(e => console.log(`cheat: NOT BLOCKED (unexpected error ${e.message})`));
}, 5);
timer.unref();
