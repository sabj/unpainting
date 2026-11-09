// Test helper: a fake painter that writes what tools/paint-plate.mjs writes for a finished painting.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { STAGES } from './images.mjs';

const outOf = args => args[args.indexOf('--out') + 1];

/** Build the fixture images once (async), then return a synchronous spawnSync stand-in. */
export async function fakePainter({ failFor = null, throwFor = null, risk = { risk: 0.2, level: 'low', parts: { progression: 0.1, copy: 0, small: 0, pixelFit: 0 } } } = {}) {
  const png = await sharp({ create: { width: 48, height: 36, channels: 3, background: '#a0b0c0' } }).png().toBuffer();
  const jpgs = await Promise.all(STAGES.map(p => sharp({ create: { width: 48, height: 36, channels: 3, background: { r: p, g: 90, b: 120 } } }).jpeg().toBuffer()));
  const calls = [];
  const run = (exe, args) => {
    const out = outOf(args);
    calls.push(out);
    if (throwFor && out.includes(throwFor)) throw new Error('simulated crash');
    fs.mkdirSync(path.join(out, 'stages'), { recursive: true });
    if (failFor && out.includes(failFor)) return { status: 1, stdout: 'boom', stderr: '' };
    fs.writeFileSync(path.join(out, 'painting.png'), png);
    STAGES.forEach((p, i) => fs.writeFileSync(path.join(out, 'stages', `stage-${String(p).padStart(3, '0')}.jpg`), jpgs[i]));
    fs.writeFileSync(path.join(out, 'cheat-risk.json'), JSON.stringify(risk));
    fs.writeFileSync(path.join(out, 'target-guard.json'), JSON.stringify({ violations: 0 }));
    fs.writeFileSync(path.join(out, 'marks.json'), '{}');
    return { status: 0, stdout: 'marks: 123 strokes\n', stderr: '' };
  };
  return { run, calls };
}
