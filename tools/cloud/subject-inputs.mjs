#!/usr/bin/env node
// subject-inputs.mjs <subject[:variant][,subject...]> [--set key=value ...]: what a pod needs beside the code to paint
// these registered subjects, with a named variant (tools/paint/variants.json of the tree it runs in) and --set values
// read as the painting command reads them, so a drawing named by --set drawing= is shipped too.
// Prints {registry, files: [absolute path...]}: the subject list itself, every pinned input of each subject (checked
// against its sha256 first, so a batch never ships a changed file) and each subject's named-forms folder.
// tools/cloud/render-batch.py --subjects ships them at the same absolute paths.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry, resolveSubject, checkInputs } from '../paint/subjects.mjs';

/** The registry file and every input file or folder of the named subjects, absolute, in order, each once. */
export function subjectInputs(ids, { registry = loadRegistry(), check = checkInputs, exists = fs.existsSync, sets = [], variants = {} } = {}) {
  const files = [registry.file];
  for (const word of ids) {
    const [id, variantName = null] = word.split(':');
    if (variantName && !variants[id]?.[variantName]) throw new Error(`subject ${id} has no variant "${variantName}"`);
    const spec = check(resolveSubject(registry, id, { sets, variant: variantName ? variants[id][variantName] : null, variantName }));
    files.push(spec.source.abs, ...spec.drawing.files.map(f => f.abs), ...spec.studies.map(s => s.abs));
    if (spec.labels) files.push(spec.labels.abs);
    if (spec.masks?.receipt && exists(path.dirname(spec.masks.receipt))) files.push(path.dirname(spec.masks.receipt));
  }
  return { registry: registry.file, files: [...new Set(files)] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = (process.argv[2] ?? '').split(',').map(s => s.trim()).filter(Boolean), rest = process.argv.slice(3), sets = [];
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] !== '--set' || !/^[^=]+=/.test(rest[i + 1] ?? '')) { console.error('usage: subject-inputs.mjs <subject[:variant][,subject...]> [--set key=value ...]'); process.exit(2); }
    sets.push([rest[i + 1].slice(0, rest[i + 1].indexOf('=')), rest[i + 1].slice(rest[i + 1].indexOf('=') + 1)]);
  }
  if (!ids.length) { console.error('usage: subject-inputs.mjs <subject[:variant][,subject...]> [--set key=value ...]'); process.exit(2); }
  const variantsFile = path.resolve('tools/paint/variants.json'), variants = fs.existsSync(variantsFile) ? JSON.parse(fs.readFileSync(variantsFile, 'utf8')) : {};
  try { console.log(JSON.stringify(subjectInputs(ids, { sets, variants }))); } catch (e) { console.error(e.message); process.exit(1); }
}
