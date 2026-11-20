// A painting script that names the shapes of a block-in study (tools for the author: a numbered list of the study's
// flat shapes, each with its outline in sheet mm) resolved into plain geometry the painter reads: a passage's `shapes`
// become its regions, its `reserve` shapes the paper it keeps (`reserveRegions`, for that passage only), a light's
// `shapes` its region, and a stroke `along` a shape runs down that shape's long axis. The author decides; the shapes
// only carry the geometry an eye cannot place in millimetres.
//
//   node tools/painter/script-resolve.mjs SCRIPT.json SHAPES.json OUT.json
import fs from 'node:fs';

/** The script with every shape reference replaced by its outline (or axis). Unknown shape numbers fail loudly. */
export function resolveScript(script, shapeList) {
  const byId = new Map(shapeList.shapes.map(s => [s.id, s]));
  const get = (id, where) => { const s = byId.get(Number(id)); if (!s) throw Error(`painting script: ${where} names shape ${id}, which the study does not have`); return s; };
  const outlines = (ids, where) => (ids ?? []).map(id => get(id, where).outline);
  const lights = (script.lights ?? []).map((l, i) => (l.shapes ? outlines(l.shapes, `light ${i + 1}`).map(region => ({ what: l.what, region })) : [l])).flat();
  const passages = script.passages.map(p => {
    const q = { ...p };
    if (p.shapes?.length) q.regions = [...(p.regions ?? (p.region ? [p.region] : [])), ...outlines(p.shapes, p.id)];
    if (p.shapes?.length) delete q.region;
    if (p.reserve?.length) q.reserveRegions = outlines(p.reserve, `${p.id} reserve`);
    if (Array.isArray(p.strokes)) q.strokes = p.strokes.map(st => {
      if (st.along == null) return st;
      const s = get(st.along, `${p.id} stroke`), a = s.axisDeg * Math.PI / 180, h = s.lengthMm / 2, down = Math.sin(a) >= 0 ? 1 : -1;
      const dir = st.reverse ? -down : down, from = [s.centre[0] - dir * Math.cos(a) * h, s.centre[1] - dir * Math.sin(a) * h];
      return { ...st, from: from.map(v => +v.toFixed(1)), direction: +((s.axisDeg + (dir < 0 ? 180 : 0)) % 360).toFixed(1), lengthMm: st.lengthMm ?? s.lengthMm };
    });
    return q;
  });
  return { ...script, lights, passages, shapeSource: shapeList.study };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inp, shapes, out] = process.argv.slice(2);
  fs.writeFileSync(out, JSON.stringify(resolveScript(JSON.parse(fs.readFileSync(inp, 'utf8')), JSON.parse(fs.readFileSync(shapes, 'utf8'))), null, 1));
  console.log(out);
}
