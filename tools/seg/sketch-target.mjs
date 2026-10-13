#!/usr/bin/env node
// An image model's pen sketch of a target, made once before painting and cached by the target's SHA-256, for the
// linework stage's sketch source (src/paint/methods/linework-stage.mjs). One fixed prompt for every subject: no
// subject cue, no per-subject style. The stage never calls the network; it reads the cache and checks the sketch's
// geometry against the target's own edges before a line of it is drawn (src/paint/methods/sketch-check.mjs).
//
//   node tools/seg/sketch-target.mjs --image <target> --cache <dir> [--prompt v1|v2] [--model openai/gpt-image-1-mini] [--quality medium]
//
// Needs OPENROUTER_API_KEY in the environment. Writes <dir>/<sha256>.png and <dir>/<sha256>.json (model, prompt,
// target and sketch hashes, aspect, usage and cost). An existing sketch is kept unless --force 1.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// The prompts, by version; every subject gets the same one. v1 asks for a redraw from a reference; v2 asks for the same
// image converted to line, so the drawing overlays the target.
export const SKETCH_PROMPTS = Object.freeze({
  v1: 'Use the attached image only as a subject and composition reference. Redraw the scene from scratch as a skilled '
    + "artist's standalone black pen-and-ink sketch on clean white paper. Draw the structure of the forms with confident contours of varied "
    + 'weight: outlines of the main shapes and the lines that build them. Keep the principal silhouettes, relative placement, the original full '
    + 'framing and viewpoint. Do not zoom, crop, rearrange, add or remove anything, and do not invent objects or details that are not in the '
    + 'reference. Draw edges of form, not the outlines of cast shadows or patches of light. Suggest repeated detail such as windows, bricks, '
    + 'leaves or waves with a few marks in a simplified rhythm instead of drawing every one. Use only thin black ink lines and a few short '
    + 'hatch strokes in the darkest shadows, on bright white paper. Every area remains mostly white. No filled silhouettes, no watercolor, no '
    + 'tone wash, no gray shading, no pencil, no solid black fills, no photographic texture, no decorative frame, no text or signature.',
  v2: "Convert this exact image into a skilled artist's black pen-and-ink line drawing on clean white paper. The drawing must line up with "
    + 'the image when laid over it: the same framing and viewpoint, every structure in the same place and at the same size, nothing moved, '
    + 'resized, cropped or added. Draw only what is in the image. Draw the structure of the forms with confident contours of varied weight; '
    + 'do not outline cast shadows or patches of light. Suggest repeated detail such as windows, bricks, leaves or waves with a few marks in a '
    + 'simplified rhythm instead of drawing every one. Use thin black ink lines and a few short hatch strokes only in the darkest shadows; '
    + 'every area stays mostly white. No filled shapes, no gray tone, no wash, no pencil, no photographic texture, no frame, no text or signature.',
});
export const SKETCH_PROMPT_VERSION = 'v1';

// The image endpoint's aspect ratios; the one nearest the target's is asked for, so the sketch can register by scale.
const ASPECTS = Object.freeze({ '1:1': 1, '3:2': 1.5, '2:3': 2 / 3 });
const PROVIDER = Object.freeze({ ignore: ['Hyperbolic'], data_collection: 'deny', zdr: true });

/** The supported aspect ratio nearest w / h, on a log scale. */
export function nearestAspect(w, h) {
  const r = Math.log(w / h);
  return Object.entries(ASPECTS).sort((a, b) => Math.abs(Math.log(a[1]) - r) - Math.abs(Math.log(b[1]) - r))[0][0];
}

/** Cache paths for a target's bytes. */
export function sketchPaths(cache, bytes) {
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  return { sha, png: path.join(cache, `${sha}.png`), json: path.join(cache, `${sha}.json`) };
}

async function main(argv) {
  const opt = (k, d) => { const i = argv.lastIndexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const image = opt('image', ''), cache = opt('cache', '');
  if (!image || !cache) throw new Error('usage: sketch-target.mjs --image <target> --cache <dir>');
  const bytes = fs.readFileSync(image), p = sketchPaths(cache, bytes);
  if (fs.existsSync(p.png) && opt('force', '0') !== '1') { console.log(JSON.stringify({ cached: p.png })); return; }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  const meta = await sharp(bytes).metadata(), aspect = nearestAspect(meta.width, meta.height);
  const mime = meta.format === 'png' ? 'image/png' : 'image/jpeg', model = opt('model', 'openai/gpt-image-1-mini');
  const version = opt('prompt', SKETCH_PROMPT_VERSION), prompt = SKETCH_PROMPTS[version];
  if (!prompt) throw new Error(`--prompt: ${Object.keys(SKETCH_PROMPTS).join(', ')}, not ${version}`);
  const body = { model, prompt, input_references: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } }],
    aspect_ratio: aspect, quality: opt('quality', 'medium'), n: 1, provider: PROVIDER };
  const r = await fetch('https://openrouter.ai/api/v1/images', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`image model ${r.status}: ${text.slice(0, 300)}`);
  const result = JSON.parse(text), png = Buffer.from(result.data[0].b64_json, 'base64');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(p.png, png);
  const record = { model, promptVersion: version, prompt, aspect, target: { file: path.basename(image), sha256: p.sha, w: meta.width, h: meta.height },
    sketchSHA256: crypto.createHash('sha256').update(png).digest('hex'), usage: result.usage ?? {}, cost: result.usage?.cost ?? null, provider: PROVIDER, utc: new Date().toISOString() };
  fs.writeFileSync(p.json, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ sketch: p.png, cost: record.cost, aspect }));
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
