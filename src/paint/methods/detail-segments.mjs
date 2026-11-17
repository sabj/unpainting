// --detailseg 1: the segment map that confines --detailscale to the focal forms (detail-scale.mjs segmentDetailMask).
// It is the run's own map, the stem segment-prep.mjs prepared and the SAM middle forms read, never a file looked up by
// the target's name, so the forms and the detail scale cannot come from two maps. When --segments off was explicitly
// requested, every segment-aware step cuts by colour and value alone (segment-prep.mjs) and logs that choice; any
// other missing stem or missing --detailscale fails loudly.
export async function detailSegments({ detailseg, detailscale, record, segmentsMode = 'sam', w, h, load, log = null }) {
  if (!(detailseg > 0)) return null;
  if (!(detailscale > 0)) throw Error('--detailseg 1 confines --detailscale to the focal forms: give --detailscale k > 0 with it');
  if (segmentsMode === 'off') {
    if (log) log('detail scale: --segments off; detail scale stays unsegmented');
    return null;
  }
  if (!record?.stem) throw Error("--detailseg 1 needs the run's segment map, and there is none");
  return load(record.stem, w, h);
}
