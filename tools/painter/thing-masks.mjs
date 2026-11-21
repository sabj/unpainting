// Named forms of the source for the wash planner: a reviewed SAM id map bound to its source by a receipt
// (receipt.json: schema named-sam-v1, with the sha256 of the source image, the label file and the id map named-sam.png).
// Every file is checked against the receipt; a receipt made for another source, or a changed mask, fails the run loudly.
// Ported from codex/04-recovery (tools/painter/thing-masks.mjs). The ids reach the planner through
// src/paint/methods/named-forms.mjs.
import {createHash} from 'node:crypto';
import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadThingMasks(receiptPath, sourcePath, labelsPath) {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  if (receipt.schema !== 'named-sam-v1' || receipt.backend !== 'sam' || receipt.model !== 'vit_b') {
    throw Error('--thingmasks: expected a named-sam-v1 receipt for SAM ViT-B');
  }
  async function verifiedFile(role, actualPath) {
    const ref = receipt[role];
    if (typeof ref?.path !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256)) {
      throw Error(`--thingmasks: invalid ${role} reference`);
    }
    const receiptFile = path.resolve(path.dirname(receiptPath), ref.path);
    const bytes = await readFile(receiptFile);
    if (sha256(bytes) !== ref.sha256) throw Error(`--thingmasks: ${role} hash mismatch`);
    if (actualPath && path.resolve(actualPath) !== receiptFile && sha256(await readFile(actualPath)) !== ref.sha256) {
      throw Error(`--thingmasks: supplied ${role} differs from the receipt`);
    }
    return bytes;
  }
  const [source, labels, mask] = await Promise.all([
    verifiedFile('source', sourcePath), verifiedFile('labels', labelsPath), verifiedFile('mask')
  ]);
  const [image, map] = await Promise.all([sharp(source).metadata(), sharp(mask).metadata()]);
  const {width, height} = receipt;
  if (width !== image.width || height !== image.height || width !== map.width || height !== map.height) {
    throw Error('--thingmasks: source, receipt and mask dimensions must match');
  }
  if (map.format !== 'png' || map.channels !== 1 || map.depth !== 'uchar' || map.isPalette || map.space !== 'b-w') {
    throw Error('--thingmasks: expected an 8-bit grayscale label PNG');
  }
  const things = JSON.parse(labels).things;
  if (!Array.isArray(things) || things.length > 255) throw Error('--thingmasks: expected up to 255 ordered things');
  const names = things.map(t => t?.name || t?.thing);
  const parents = things.map(t => t?.parentId ?? null);
  for (let index = 0; index < parents.length; index++) {
    const seen = new Set([index + 1]);
    for (let id = parents[index]; id !== null; id = parents[id - 1]) {
      if (!Number.isInteger(id) || id < 1 || id > parents.length || seen.has(id)) throw Error('--thingmasks: invalid or cyclic parentId');
      seen.add(id);
    }
  }
  const ids = await sharp(mask).toColourspace('b-w').raw().toBuffer();
  for (const id of new Set(ids)) {
    if (id && (typeof names[id - 1] !== 'string' || !names[id - 1].trim())) {
      throw Error(`--thingmasks: pixel ID ${id} has no named thing in the supplied labels`);
    }
  }
  return {width, height, ids: new Uint8Array(ids), names, parents, kinds: things.map(t => t?.kind ?? null), provenance: {
    schema: receipt.schema, source: receipt.source.sha256, labels: receipt.labels.sha256, mask: receipt.mask.sha256
  }};
}

// A source carries a mask by explicitly naming its sidecar IMAGE.named-sam.json. Scripts
// have their own geometry, so only the block-in planner discovers this source annotation.
export async function studyThingMasks({root, source, maskOption, labelsOption, blockIn}) {
  const sourcePath = path.resolve(root, source);
  const labelsPath = labelsOption === 'auto' ? undefined : path.resolve(root, labelsOption);
  if (!blockIn) {
    if (maskOption !== 'auto' || labelsPath) throw Error('--thingmasks and --things require a block-in study wash plan');
    return null;
  }
  const explicit = maskOption !== 'auto';
  const receiptPath = explicit ? path.resolve(root, maskOption) : sourcePath + '.named-sam.json';
  if (!explicit) {
    try {
      await access(receiptPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (labelsPath) throw Error('--things requires --thingmasks or a source .named-sam.json receipt');
      return null;
    }
  }
  return loadThingMasks(receiptPath, sourcePath, labelsPath);
}
