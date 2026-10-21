// The planner model's choice of drawing stages for one image (drawing-choice.mjs): a vision model sees the target with a
// fixed prompt, with no subject name or cue, and answers which of graphite prep, ink prep and ink finish to use. The
// transport follows the oldfair drawing request (z-ai/glm-5.3-flash over OpenRouter, JSON only, zero data retention).
// The answer is cached by the target's SHA-256, the model and the prompt's hash under work/drawing-planner, so a rerun
// is free and repeatable. Without OPENROUTER_API_KEY and no cached answer, or on a bad answer, it returns
// { unavailable } with the reason and the rule decides alone. Reads --drawingplanner (the model).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { validChoice } from './drawing-choice.mjs';

export const PLANNER_MODEL = 'z-ai/glm-5.3-flash';
export const PLANNER_PROMPT = `You plan the preparatory drawing for a transparent watercolour painting of the attached picture. Choose three stages.
graphitePrep: "none", "light" or "full". A pencil drawing laid first and partly erased in the lights before the washes. "light" places the main shapes and proportions; "full" also states the features, openings and edges a careful painter would place. A painter almost always makes at least a light pencil drawing; choose "none" only when the picture has no forms worth placing.
inkPrep: "none" or "ink". Pen lines drawn over the pencil before the washes, for built structure, crisp contours or a line-and-wash look. Choose "none" when ink lines would harden soft forms.
inkFinish: "none" or "ink". A few pen accents after the washes, on edges and darks that need crispness.
Judge only from what is visible: edges, structure, softness, value contrast and texture. Any combination is allowed.
Answer JSON only: {"graphitePrep":"...","inkPrep":"...","inkFinish":"...","reasons":{"graphitePrep":"...","inkPrep":"...","inkFinish":"..."}}`;

const sha = b => crypto.createHash('sha256').update(b).digest('hex');

/** The OpenRouter request body for a target (PNG bytes). */
function plannerRequest(png, model = PLANNER_MODEL) {
  return { model, temperature: 0, max_tokens: 2000, reasoning: { effort: 'minimal', exclude: true }, response_format: { type: 'json_object' },
    provider: { zdr: true, data_collection: 'deny' }, usage: { include: true },
    messages: [{ role: 'user', content: [{ type: 'text', text: PLANNER_PROMPT }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + png.toString('base64') } }] }] };
}

/** The stage choice in a model's reply text, with its reasons; throws on anything that is not one. */
export function parseReply(text) {
  const doc = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
  return { choice: validChoice(doc), reasons: doc.reasons && typeof doc.reasons === 'object' ? doc.reasons : {} };
}

/**
 * The model's choice for `image`: { model, choice, reasons, usd, cached } or { model, unavailable }.
 * @param fetcher  fetch, injectable for tests
 */
export async function plannerChoice({ image, root = '.', model = PLANNER_MODEL, key = process.env.OPENROUTER_API_KEY, fetcher = fetch, log = () => {} }) {
  const bytes = fs.readFileSync(image), dir = path.resolve(root, 'work/drawing-planner');
  const file = path.join(dir, `${sha(bytes)}-${model.replace(/[^a-z0-9.-]+/gi, '_')}-${sha(PLANNER_PROMPT).slice(0, 8)}.json`);
  if (fs.existsSync(file)) {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { model, choice: validChoice(c.choice), reasons: c.reasons ?? {}, usd: 0, cached: true, file };
  }
  if (!key) return { model, unavailable: 'no OPENROUTER_API_KEY and no cached answer' };
  const png = await sharp(bytes).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  try {
    const res = await fetcher('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'unpainting-drawing-planner' }, body: JSON.stringify(plannerRequest(png, model)) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reply = await res.json(), r = parseReply(reply.choices?.[0]?.message?.content ?? '');
    const usd = reply.usage?.cost ?? 0;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ model, targetSHA256: sha(bytes), promptSHA256: sha(PLANNER_PROMPT), choice: r.choice, reasons: r.reasons, usd, at: new Date().toISOString() }, null, 1) + '\n');
    return { model, ...r, usd, cached: false, file };
  } catch (e) {
    log(`WARNING drawing planner: ${model} gave no usable answer (${e.message}); the rule decides alone`);
    return { model, unavailable: e.message };
  }
}
