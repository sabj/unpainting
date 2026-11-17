// --detailseg 1: the segment map that confines --detailscale to the focal forms (detail-scale.mjs segmentDetailMask).
// It is the run's own map, the stem segment-prep.mjs prepared and the SAM middle forms read, never a file looked up by
// the target's name, so the forms and the detail scale cannot come from two maps. A request it cannot meet fails the
// run: without the map, --detailseg would quietly scale the minimum shape over the whole sheet, skies and coats too.
export async function detailSegments({ detailseg, detailscale, record, w, h, load }) {
  if (!(detailseg > 0)) return null;
  if (!(detailscale > 0)) throw Error('--detailseg 1 confines --detailscale to the focal forms: give --detailscale k > 0 with it');
  if (!record?.stem) throw Error("--detailseg 1 needs the run's segment map, and there is none (--segments off)");
  return load(record.stem, w, h);
}
