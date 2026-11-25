import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { checkFormsEdit, applyFormsEdit, writeFormsEdit, formsLine, FORMS_EDIT_FORMAT } from './forms-edit.mjs';
import { loadThingMasks } from '../painter/thing-masks.mjs';

// a 40 x 20 pixel map on a 200 x 100 mm sheet (5 mm a pixel): the cat (1) fills the left half, its face (2) the middle
// of it, an ear (3) and another (4) above; the right half is in no form
const W = 40, H = 20, sheet = { widthMm: 200, heightMm: 100 };
function mask() {
  const ids = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = x < 20 ? 1 : 0;
    if (x >= 5 && x < 15 && y >= 6 && y < 16) v = 2;
    if (x >= 5 && x < 8 && y >= 2 && y < 5) v = 3;
    if (x >= 12 && x < 15 && y >= 2 && y < 5) v = 4;
    ids[y * W + x] = v;
  }
  return { ids, width: W, height: H };
}
const things = [{ thing: 'cat', kind: 'animal' }, { thing: 'cat face', kind: 'face', parentId: 1 }, { thing: 'left ear', kind: 'other', parentId: 1 }, { thing: 'right ear', kind: 'other', parentId: 3 }];
const edit = edits => ({ format: FORMS_EDIT_FORMAT, edits });
const px = (ids, v) => ids.reduce((a, x) => a + (x === v ? 1 : 0), 0);

test('merge: the forms become one, their pixels and their children with them, and the ids close up', () => {
  const m = mask(), got = applyFormsEdit(m, things, edit([{ merge: ['left ear', 'right ear'], name: 'ears', kind: 'fur' }]), sheet);
  assert.deepEqual(got.forms.map(f => [f.id, f.name, f.kind, f.pixels]), [[1, 'cat', 'animal', 400 - 100 - 18], [2, 'cat face', 'face', 100], [3, 'ears', 'fur', 18]]);
  assert.equal(px(got.ids, 4), 0); assert.equal(px(got.ids, 3), 18); assert.equal(px(m.ids, 4), 9, 'the given map is not altered');
  assert.deepEqual(got.things.map(t => [t.thing, t.name, t.parentId, t.editedByAuthor ?? false]), [['cat', 'cat', null, false], ['cat face', 'cat face', 1, false], ['ears', 'ears', 1, true]]);
  assert.equal(got.record.merged, 1); assert.equal(got.record.forms, 3); assert.equal(got.record.formsBefore, 4); assert.equal(got.record.pixelsMoved, 9);
  assert.match(formsLine(got.record), /^3 named forms \(4 given\): 1 merged$/);
});

test('split: a polygon in millimetres cuts a piece from a form, from paper in no form, or from whatever lies in it', () => {
  // the lower half of the face (y 55 to 80 mm, x 25 to 75 mm): 10 x 5 pixels
  const muzzle = { split: 'cat face', polygon: [[25, 55], [75, 55], [75, 80], [25, 80]], name: 'muzzle', kind: 'fur' };
  const a = applyFormsEdit(mask(), things, edit([muzzle]), sheet);
  assert.deepEqual(a.forms.at(-1), { id: 5, name: 'muzzle', kind: 'fur', pixels: 50 }); assert.equal(a.forms[1].pixels, 50); assert.equal(a.things.at(-1).parentId, 2);
  // a polygon wider than the face still takes only the face's pixels; "any" takes all, "no named form" the bare paper
  const wide = [[0, 55], [200, 55], [200, 80], [0, 80]];
  assert.equal(applyFormsEdit(mask(), things, edit([{ ...muzzle, polygon: wide }]), sheet).forms.at(-1).pixels, 50);
  assert.equal(applyFormsEdit(mask(), things, edit([{ ...muzzle, split: 'any', polygon: wide }]), sheet).forms.at(-1).pixels, 200);
  const sky = applyFormsEdit(mask(), things, edit([{ split: 'no named form', polygon: wide, name: 'sky', kind: 'sky' }]), sheet);
  assert.equal(sky.forms.at(-1).pixels, 100); assert.equal(sky.things.at(-1).parentId, null);
  assert.throws(() => applyFormsEdit(mask(), things, edit([{ ...muzzle, polygon: [[150, 10], [190, 10], [190, 40]] }]), sheet), /holds no pixel of "cat face"/);
  // a later edit may name a form an earlier one made; a form left with nothing is taken out and said
  const both = applyFormsEdit(mask(), things, edit([muzzle, { form: 'muzzle', kind: 'face' }, { split: 'any', polygon: [[20, 5], [45, 5], [45, 30], [20, 30]], name: 'ear tuft', kind: 'fur' }]), sheet);
  assert.equal(both.forms.find(f => f.name === 'muzzle').kind, 'face'); assert.deepEqual(both.record.emptied, ['left ear']); assert.ok(!both.forms.some(f => f.name === 'left ear'));
  assert.equal(both.things.find(t => t.name === 'right ear').parentId, null, 'its parent is gone');
});

test('rename and kind; every edit is checked and refused with the reason', () => {
  const got = applyFormsEdit(mask(), things, edit([{ rename: 'cat', to: 'cat body' }, { form: 'left ear', kind: 'fur' }]), sheet);
  assert.deepEqual(got.forms.slice(0, 3).map(f => [f.name, f.kind]), [['cat body', 'animal'], ['cat face', 'face'], ['left ear', 'fur']]);
  assert.deepEqual(got.record.edits, ['cat renamed cat body', 'left ear is now fur (was other)']); assert.equal(got.record.pixelsMoved, 0);
  const forms = things.map(t => ({ name: t.thing, kind: t.kind })), bad = (e, re) => assert.throws(() => checkFormsEdit(edit([e]), forms, sheet), re);
  bad({ merge: ['cat', 'dog'] }, /there is no form "dog" \(the forms now: cat, cat face, left ear, right ear\)/);
  bad({ merge: ['cat'] }, /two or more different forms/); bad({ rename: 'cat', to: 'cat face' }, /already a form "cat face"/);
  bad({ form: 'cat', kind: 'monster' }, /"kind" is one of face, eye, fur/); bad({ split: 'cat', polygon: [[1, 1], [2, 2]], name: 'x' }, /three or more points/);
  bad({ split: 'cat', polygon: [[500, 500], [600, 500], [600, 600]], name: 'x' }, /lies off the sheet/); bad({ rename: 'cat', to: '../x' }, /plain words/);
  bad({ merge: ['cat', 'cat face'], split: 'cat' }, /one of "merge"/);
  assert.throws(() => checkFormsEdit({ format: 'x', edits: [] }, forms, sheet), /"format" is "forms-edit 1"/); assert.throws(() => checkFormsEdit(edit([]), forms, sheet), /leave "forms" out/);
});

test('the edit is written as a receipt of its own that the painter reads, marked as the author\'s and not reviewed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forms-edit-test-')), sha = b => crypto.createHash('sha256').update(b).digest('hex');
  try {
    const src = path.join(dir, 'source.png'), rev = path.join(dir, 'reviewed'); fs.mkdirSync(rev);
    await sharp({ create: { width: W, height: H, channels: 3, background: '#ccbbaa' } }).png().toFile(src);
    const png = await sharp(Buffer.from(mask().ids), { raw: { width: W, height: H, channels: 1 } }).toColourspace('b-w').png().toBuffer(), labels = JSON.stringify({ things });
    fs.writeFileSync(path.join(rev, 'named-sam.png'), png); fs.writeFileSync(path.join(rev, 'labels.json'), labels);
    const receipt = { schema: 'named-sam-v1', backend: 'sam', model: 'vit_b', width: W, height: H, source: { path: '../source.png', sha256: sha(fs.readFileSync(src)) }, labels: { path: 'labels.json', sha256: sha(labels) }, mask: { path: 'named-sam.png', sha256: sha(png) }, forms: [] };
    fs.writeFileSync(path.join(rev, 'receipt.json'), JSON.stringify(receipt));
    const got = await writeFormsEdit({ dir: path.join(dir, 'mine'), receipt: path.join(rev, 'receipt.json'), edit: edit([{ merge: ['left ear', 'right ear'], name: 'ears', kind: 'fur' }]), sheet, source: { abs: src, sha256: receipt.source.sha256 } });
    const mine = JSON.parse(fs.readFileSync(got.receipt, 'utf8'));
    assert.equal(mine.edited.reviewed, false); assert.match(mine.edited.by, /author/); assert.equal(mine.edited.of.maskSha256, receipt.mask.sha256); assert.notEqual(mine.mask.sha256, receipt.mask.sha256);
    assert.equal(mine.edited.record.merged, 1); assert.deepEqual(mine.forms.map(f => f.name), ['cat', 'cat face', 'ears']);
    assert.equal(sha(fs.readFileSync(path.join(rev, 'named-sam.png'))), receipt.mask.sha256, 'the reviewed map is untouched');
    // the painter's own loader takes it: every hash holds, three named forms, the merged one a fur
    const read = await loadThingMasks(got.receipt, src, path.join(dir, 'mine', 'labels.json'));
    assert.deepEqual(read.names, ['cat', 'cat face', 'ears']); assert.deepEqual(read.kinds, ['animal', 'face', 'fur']); assert.equal(px(read.ids, 3), 18); assert.equal(read.provenance.mask, mine.mask.sha256);
    await assert.rejects(() => writeFormsEdit({ dir: path.join(dir, 'again'), receipt: got.receipt, edit: edit([{ rename: 'cat', to: 'x' }]), sheet, source: { abs: src, sha256: receipt.source.sha256 } }), /must be a reviewed receipt/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
