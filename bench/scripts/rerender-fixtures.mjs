// Test helper: a fake painter that writes what tools/paint-plate.mjs writes for a finished painting.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { STAGES } from './images.mjs';

const outOf = args => args[args.indexOf('--out') + 1];
// the target PNG's own width, as the painter records it
const sourceWidthOf = args => fs.readFileSync(args[args.indexOf('--image') + 1]).readUInt32BE(16);

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
    fs.writeFileSync(path.join(out, 'target-guard.json'), JSON.stringify({ violations: 0,looks:{count:0},mode:'gentle' }));
    const continuedChecks = { strict: true, total: 0, checks: {} };
    fs.writeFileSync(path.join(out, 'continued-checks.json'), JSON.stringify(continuedChecks));
    fs.writeFileSync(path.join(out,'run-card.json'),JSON.stringify({continuedChecks,args,expandedArgs:[...args,'--washjoin','1','--huechroma','30','--lightfamilies','1'],drawing:{medium:'graphite'},gpuBackend:{backend:'gpu',fallback:false},dimensions:{paintWidth:Number(args[args.indexOf('--width')+1]),sheetWidth:Number(args[args.indexOf('--width')+1]),sourceWidth:sourceWidthOf(args)},segments:{backend:'sam'}}));
    fs.writeFileSync(path.join(out,'pipeline-plan.json'),JSON.stringify({plan:{washes:{colour:'family'}}}));
    fs.writeFileSync(path.join(out,'designed-execution.json'),JSON.stringify({laneStrokes:1,brushChoiceStrokes:1}));
    fs.writeFileSync(path.join(out,'backend.json'),JSON.stringify({backend:'gpu',fallback:false}));
    fs.writeFileSync(path.join(out, 'marks.json'), '{}');
    return { status: 0, stdout: 'subject medium pencil: graphite preparation\nsmall marks: 0 small lights reserved, 4 small darks laid once, last\nmarks: 123 strokes\n', stderr: '' };
  };
  return { run, calls };
}
