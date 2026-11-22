// The named forms as an author may change them in a working session: merge forms, split one by a polygon it draws,
// rename one, change its kind. The reviewed id map is never altered and never stood in for: an edit writes a NEW id
// map, label list and receipt into the run's folder, and that receipt says who made it (`edited`: by the author, from
// which reviewed receipt and mask, with every edit in order, `reviewed: false`). The wash planner reads it as it reads
// any receipt (tools/painter/thing-masks.mjs), and the run's record carries what was changed.
//
//   my-forms.json   {"format": "forms-edit 1", "edits": [
//     {"merge": ["left ear", "right ear"], "name": "ears", "kind": "fur"},
//     {"split": "cat face", "polygon": [[x, y], ...], "name": "muzzle", "kind": "fur"},
//     {"rename": "cat", "to": "cat body"},
//     {"form": "whiskers", "kind": "fur"} ]}
// Positions are sheet millimetres. "split" names the form the polygon cuts a piece from; "no named form" takes the
// polygon's paper that is in no form; "any" takes everything inside the polygon, whatever form it was in.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { FORM_KINDS } from '../../src/paint/methods/named-forms.mjs';

export const FORMS_EDIT_FORMAT = 'forms-edit 1';
/** The most forms an id map holds (ids are one byte, 0 is no form). */
const MOST_FORMS = 255;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 '-]{0,39}$/;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/** True when (x, y) lies in the polygon (even-odd). */
function inPolygon(P, x, y) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
  return inside;
}

/**
 * The edits of a file checked against the forms as they stand: [{op, ...}] in order. `forms`: [{name, kind}].
 * Throws with the reason, said so that the author can correct the file. Names are followed through the edits, so a
 * later edit may name a form an earlier one made.
 */
export function checkFormsEdit(edit, forms, sheet) {
  const at = 'forms edit';
  if (!edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error(`${at}: one JSON object, {"format": "${FORMS_EDIT_FORMAT}", "edits": [...]}`);
  if (edit.format !== FORMS_EDIT_FORMAT) throw new Error(`${at}: "format" is "${FORMS_EDIT_FORMAT}"`);
  if (!Array.isArray(edit.edits) || !edit.edits.length) throw new Error(`${at}: "edits" lists what to change, in order; with none, leave "forms" out of choice.json`);
  if (edit.edits.length > 60) throw new Error(`${at}: at most 60 edits`);
  const names = new Set(forms.map(f => f.name)), out = [];
  const has = (n, who) => { if (typeof n !== 'string' || !names.has(n)) throw new Error(`${who}: there is no form "${n}" (the forms now: ${[...names].join(', ') || 'none'})`); return n; };
  const fresh = (n, who, but = []) => { if (typeof n !== 'string' || !NAME.test(n)) throw new Error(`${who}: a form's name is plain words, up to 40 letters`); if (names.has(n) && !but.includes(n)) throw new Error(`${who}: there is already a form "${n}"`); return n; };
  const kind = (k, who) => { if (!FORM_KINDS.includes(k)) throw new Error(`${who}: "kind" is one of ${FORM_KINDS.join(', ')}`); return k; };
  edit.edits.forEach((e, i) => {
    const who = `${at}, edit ${i + 1}`;
    if (!e || typeof e !== 'object') throw new Error(`${who}: an object`);
    const ops = ['merge', 'split', 'rename', 'form'].filter(k => e[k] !== undefined);
    if (ops.length !== 1) throw new Error(`${who}: one of "merge" (forms as one), "split" (a piece cut from a form by a polygon), "rename", or "form" with a "kind"`);
    if (e.merge !== undefined) {
      if (!Array.isArray(e.merge) || e.merge.length < 2 || new Set(e.merge).size !== e.merge.length) throw new Error(`${who}: "merge" lists two or more different forms by name`);
      const members = e.merge.map(n => has(n, who)), name = e.name != null ? fresh(e.name, who, members) : members[0];
      for (const n of members) names.delete(n); names.add(name);
      out.push({ op: 'merge', members, name, kind: e.kind != null ? kind(e.kind, who) : null });
    } else if (e.split !== undefined) {
      const from = e.split === 'any' || e.split === 'no named form' ? e.split : has(e.split, who), P = e.polygon;
      if (!Array.isArray(P) || P.length < 3 || P.some(p => !Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(v => Number.isFinite(Number(v))))) throw new Error(`${who}: "polygon" is three or more points [x, y] in sheet millimetres`);
      if (sheet && P.every(p => p[0] < 0 || p[0] > sheet.widthMm || p[1] < 0 || p[1] > sheet.heightMm)) throw new Error(`${who}: the polygon lies off the sheet (${sheet.widthMm} by ${sheet.heightMm} mm)`);
      const name = fresh(e.name, who); if (names.size >= MOST_FORMS) throw new Error(`${who}: an id map holds at most ${MOST_FORMS} forms`);
      names.add(name);
      out.push({ op: 'split', from, polygon: P.map(p => [Number(p[0]), Number(p[1])]), name, kind: kind(e.kind ?? 'other', who) });
    } else if (e.rename !== undefined) {
      const was = has(e.rename, who), name = fresh(e.to, who); names.delete(was); names.add(name);
      out.push({ op: 'rename', was, name });
    } else {
      out.push({ op: 'kind', name: has(e.form, who), kind: kind(e.kind, who) });
    }
  });
  return out;
}

/**
 * The forms with an edit applied. `mask`: {ids (Uint8Array, one id a pixel, 0 none), width, height}; `things`: the
 * label list (thing i + 1 is id i + 1: {name | thing, kind, parentId}); `sheet` {widthMm, heightMm} places the
 * polygons. Returns {ids, things, forms: [{id, name, kind, pixels}], record}. Nothing given is altered. Forms left
 * with no pixel are taken out and the ids closed up; a merged form's children become the merged form's.
 */
export function applyFormsEdit(mask, things, edit, sheet) {
  const nameOf = t => t?.name || t?.thing, start = things.map(t => ({ name: nameOf(t), kind: t?.kind ?? 'other' }));
  const ops = checkFormsEdit(edit, start, sheet), ids = Uint8Array.from(mask.ids), w = mask.width, h = mask.height;
  // every form carries its first id through the edits; new forms take new ones
  let list = things.map((t, i) => ({ ...t, name: nameOf(t), thing: nameOf(t), kind: t?.kind ?? 'other', at: i + 1, parent: t?.parentId ?? null }));
  let next = list.length + 1; const said = [], moved = { merged: 0, split: 0 };
  const find = n => list.find(f => f.name === n);
  for (const o of ops) {
    if (o.op === 'merge') {
      const members = o.members.map(find), keep = members[0], gone = new Set(members.slice(1).map(f => f.at));
      let px = 0; for (let i = 0; i < ids.length; i++) if (gone.has(ids[i])) { ids[i] = keep.at; px++; }
      moved.merged += px;
      for (const f of list) if (gone.has(f.parent)) f.parent = keep.at;
      list = list.filter(f => !gone.has(f.at)); keep.name = keep.thing = o.name; if (o.kind) keep.kind = o.kind; if (keep.parent === keep.at) keep.parent = null;
      keep.edited = true; said.push(`${o.members.join(' and ')} merged into ${o.name}${o.kind ? ` (${o.kind})` : ''}`);
    } else if (o.op === 'split') {
      const from = o.from === 'any' ? null : o.from === 'no named form' ? 0 : find(o.from).at, kx = sheet.widthMm / w, ky = sheet.heightMm / h, at = next++;
      let y0 = h, y1 = -1, x0 = w, x1 = -1; for (const [x, y] of o.polygon) { x0 = Math.min(x0, Math.floor(x / kx)); x1 = Math.max(x1, Math.ceil(x / kx)); y0 = Math.min(y0, Math.floor(y / ky)); y1 = Math.max(y1, Math.ceil(y / ky)); }
      let px = 0;
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
        const i = y * w + x; if (from !== null && ids[i] !== from) continue;
        if (inPolygon(o.polygon, (x + 0.5) * kx, (y + 0.5) * ky)) { ids[i] = at; px++; }
      }
      if (!px) throw new Error(`forms edit: the polygon of "${o.name}" holds no pixel of ${o.from === 'any' ? 'the sheet' : o.from === 'no named form' ? 'paper in no named form' : `"${o.from}"`}; check its millimetres against inputs/forms.png`);
      moved.split += px;
      list.push({ name: o.name, thing: o.name, kind: o.kind, at, parent: from || null, edited: true });
      said.push(`${o.name} (${o.kind}) cut from ${o.from === 'any' ? 'whatever lay inside its polygon' : o.from}, ${px} pixels`);
    } else if (o.op === 'rename') { const f = find(o.was); f.name = f.thing = o.name; f.edited = true; said.push(`${o.was} renamed ${o.name}`); }
    else { const f = find(o.name); said.push(`${o.name} is now ${o.kind} (was ${f.kind})`); f.kind = o.kind; f.edited = true; }
  }
  // forms left with no pixel go; the ids close up, in the order the forms had
  const count = new Int32Array(256); for (const v of ids) count[v]++;
  const emptied = list.filter(f => !count[f.at]).map(f => f.name); list = list.filter(f => count[f.at]);
  const to = new Uint8Array(256); list.forEach((f, i) => { to[f.at] = i + 1; });
  for (let i = 0; i < ids.length; i++) ids[i] = to[ids[i]];
  const outThings = list.map(({ at, parent, edited, ...t }) => ({ ...t, parentId: parent != null && to[parent] && to[parent] !== to[at] ? to[parent] : null, ...(edited ? { editedByAuthor: true } : {}) }));
  const forms = list.map((f, i) => ({ id: i + 1, name: f.name, kind: f.kind, pixels: count[f.at] }));
  const n = k => ops.filter(o => o.op === k).length;
  const record = { formsBefore: things.length, forms: forms.length, merged: n('merge'), split: n('split'), renamed: n('rename'), kinds: n('kind'), pixelsMoved: moved.merged + moved.split, emptied, edits: said };
  return { ids, things: outThings, forms, record };
}

/** One line for a record. */
export function formsLine(r) {
  return `${r.forms} named forms (${r.formsBefore} given): ${[r.merged && `${r.merged} merged`, r.split && `${r.split} cut out`, r.renamed && `${r.renamed} renamed`, r.kinds && `${r.kinds} given another kind`].filter(Boolean).join(', ')}${r.emptied.length ? `; ${r.emptied.join(', ')} left with nothing and taken out` : ''}`;
}

/**
 * An edit of a reviewed receipt's forms written as a receipt of its own into `dir`: named-sam.png (the id map),
 * labels.json, receipt.json. The new receipt names the author as its maker and the reviewed receipt and mask it came
 * from, and says it is not reviewed. `source`: {abs, sha256} of the run's source. Returns {receipt, mask, forms, record}.
 */
export async function writeFormsEdit({ dir, receipt, edit, sheet, source, by = 'the author, in its working session' }) {
  const given = JSON.parse(fs.readFileSync(receipt, 'utf8')), at = path.dirname(receipt);
  if (given.edited) throw new Error('forms edit: the forms to edit must be a reviewed receipt, not an edit of one');
  const maskFile = path.resolve(at, given.mask.path), labels = JSON.parse(fs.readFileSync(path.resolve(at, given.labels.path), 'utf8'));
  const { data, info } = await sharp(maskFile).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
  const got = applyFormsEdit({ ids: new Uint8Array(data.buffer, data.byteOffset, info.width * info.height), width: info.width, height: info.height }, labels.things, edit, sheet);
  fs.mkdirSync(dir, { recursive: true });
  const png = await sharp(Buffer.from(got.ids), { raw: { width: info.width, height: info.height, channels: 1 } }).toColourspace('b-w').png({ palette: false }).toBuffer();
  const labelText = JSON.stringify({ ...labels, raw_reply: undefined, things: got.things, editedBy: by }, null, 1) + '\n';
  fs.writeFileSync(path.join(dir, 'named-sam.png'), png); fs.writeFileSync(path.join(dir, 'labels.json'), labelText);
  const out = { ...given, width: info.width, height: info.height, source: { path: source.abs, sha256: source.sha256 }, labels: { path: 'labels.json', sha256: sha256(labelText) }, mask: { path: 'named-sam.png', sha256: sha256(png) },
    forms: got.forms.map(f => ({ id: f.id, name: f.name, kind: f.kind, visiblePixels: f.pixels })),
    edited: { by, reviewed: false, of: { receiptSha256: sha256(fs.readFileSync(receipt)), maskSha256: given.mask.sha256 }, edit, record: got.record, note: 'An edit of reviewed named forms made by the author of a painting. It was not reviewed and is not the reviewed receipt.' } };
  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(out, null, 1) + '\n');
  return { receipt: path.join(dir, 'receipt.json'), mask: path.join(dir, 'named-sam.png'), forms: got.forms, record: got.record };
}
