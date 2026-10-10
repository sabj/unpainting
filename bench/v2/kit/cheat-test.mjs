// Deliberate cheat: open and decode a target crop, three ways. Each must be blocked and logged.
import * as kit from './kit.mjs';
import fs from 'node:fs';
import sharp from 'sharp';
const T = process.env.TGT;
const tries = {
  'fs.readFileSync': () => fs.readFileSync(T),
  'fs.promises.readFile': () => fs.promises.readFile(T),
  'sharp(file).raw().toBuffer()': () => sharp(T).raw().toBuffer(),
  'fs.copyFileSync into bench/out': () => fs.copyFileSync(T, 'bench/out/copied.png'),
};
for (const [name, f] of Object.entries(tries)) {
  try { await f(); console.log('NOT BLOCKED:', name); } catch (e) { console.log('blocked:', name, '->', e.message.slice(0, 70)); }
}
try { kit.dip(kit.createBrush({ radius: 8 }), { water: 0.5, conc: [0.3, 0.2, 0.1] }); console.log('NOT BLOCKED: raw RGB conc'); } catch (e) { console.log('blocked: raw conc ->', e.message.slice(0, 60)); }
