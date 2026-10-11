// Alternate shared edge-distance buffers instead of copying the entire tile
// after every relaxation. Integer distances and neighbor order are unchanged.
export function edgePingPong(source) {
  const begin = source.indexOf('  // edgeWidth + 1 passes of edgeNew');
  const end = source.indexOf('  let near =', begin);
  if (begin < 0 || end < 0) throw Error('edge kernel layout not recognized');
  const relax = (from, to) => `
    for (var q = li; q < R * R; q += 256u) {
      let rx = q % R; let ry = q / R;
      var e = ${from}[q];
      if (eWet[q] == 1u && rx > 0u && ry > 0u && rx < R - 1u && ry < R - 1u) {
        e = min(e, ${from}[q - 1u] + 1.0);
        e = min(e, ${from}[q - R] + 1.0);
        e = min(e, ${from}[q + 1u] + 1.0);
        e = min(e, ${from}[q + R] + 1.0);
      }
      ${to}[q] = e;
    }`;
  return source.slice(0, begin) + `
  for (var p = 0u; p < NP; p++) {
    if ((p & 1u) == 0u) { ${relax('eCur', 'eNxt')} }
    else { ${relax('eNxt', 'eCur')} }
    workgroupBarrier();
  }
  if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i;
  let at = (lid.y + NP) * R + lid.x + NP;
  let e = select(eCur[at], eNxt[at], (NP & 1u) == 1u);
` + source.slice(end);
}
