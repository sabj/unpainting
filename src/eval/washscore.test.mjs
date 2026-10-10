// Wash scorer known answers: a copy of the source, recoloured, flattened, and with its edge lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const W = 256, H = 256, N = W * H, PAPER = [250, 248, 242], PAINT = [150, 178, 214];
const grain = (x, y) => 18 * Math.sin(x * 0.7) * Math.sin(y * 0.6);
const inDisc = (x, y) => (x - 128) ** 2 + (y - 128) ** 2 < 80 * 80;
// a dark line, so the darkest tenth the scorer sets aside is line and accent rather than the wash itself
const withLine = b => { for (let y = 20; y < H - 20; y++) for (let x = 4; x < 9; x++) { const i = (y * W + x) * 3; b[i] = 40; b[i + 1] = 34; b[i + 2] = 28; } return b; };

const picture = fn => {
  const b = Buffer.alloc(N * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = fn(x, y), i = (y * W + x) * 3; for (let q = 0; q < 3; q++) b[i + q] = Math.max(0, Math.min(255, c[q])); }
  return withLine(b);
};
const source = picture((x, y) => (inDisc(x, y) ? PAINT.map(v => v + grain(x, y)) : PAPER));
const swapped = (() => { const b = Buffer.from(source); for (let i = 0; i < N; i++) { const t = b[i * 3]; b[i * 3] = b[i * 3 + 2]; b[i * 3 + 2] = t; } return b; })();
const flat = picture((x, y) => (inDisc(x, y) ? PAINT : PAPER));
const lostEdge = picture((x, y) => {
  const t = Math.max(0, Math.min(1, (88 - Math.hypot(x - 128, y - 128)) / 16));   // 16 cells of falloff
  return PAINT.map((v, q) => PAPER[q] + (v + grain(x, y) - PAPER[q]) * t);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'washscore-'));
const write = async (name, buf) => sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(dir, name));
const run = async (tag, paint) => {
  await write(`stage-1-${tag}-key.png`, source);
  await write(`stage-1-${tag}-paint.png`, paint);
  const out = execFileSync('node', [path.join(root, 'tools/judge/wash-score.mjs'), '--dir', dir], { cwd: root, encoding: 'utf8' });
  fs.rmSync(path.join(dir, `stage-1-${tag}-key.png`)); fs.rmSync(path.join(dir, `stage-1-${tag}-paint.png`));
  const number = re => Number(re.exec(out)?.[1] ?? NaN);
  return {
    colour: number(/dE00 ([\d.]+)/),
    texture: number(/texture .*\(([\d.]+)x\)/),
    tone: number(/tone .*\(([\d.]+)x\)/),
    soft: number(/edge\s+(\d+)% soft/),
    softKey: number(/edge\s+\d+% soft vs (\d+)%/),
  };
};

test('a copy of the source scores as a copy', async () => {
  const r = await run('same', source);
  assert.ok(r.colour < 0.5, `colour dE ${r.colour}`);
  assert.ok(Math.abs(r.tone - 1) < 0.05, `tone ${r.tone}x`);
  assert.ok(Math.abs(r.texture - 1) < 0.05, `texture ${r.texture}x`);
  assert.equal(r.soft, r.softKey, 'the same edges');
});

test('a wash of the wrong colour fails on colour and nothing else', async () => {
  const r = await run('warm', swapped);
  assert.ok(r.colour > 15, `colour dE ${r.colour}`);
  assert.ok(Math.abs(r.texture - 1) < 0.2, `texture should be near 1, got ${r.texture}x`);
});

test('a flat wash is caught as having no texture', async () => {
  const r = await run('flat', flat);
  assert.ok(r.texture < 0.5, `texture ${r.texture}x`);
  assert.ok(r.colour < 3, `and its colour is still right: dE ${r.colour}`);
});

test('a wash whose edge runs into the paper is caught as soft', async () => {
  const r = await run('soft', lostEdge);
  assert.ok(r.soft > 30, `${r.soft}% soft against a hard-edged source at ${r.softKey}%`);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
