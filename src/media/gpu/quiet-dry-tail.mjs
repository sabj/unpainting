// Match sheet.mjs quietDryTail. The ordinary wet counters are a cheap candidate
// gate; this whole-sheet probe also sees pores outside the sparse frontier.
export async function finishQuietDryTail(g) {
  const enc = g.device.createCommandEncoder();
  enc.clearBuffer(g.b.CTR, 48, 4); // CTR[12]: any cell that still needs transport
  const pass = g.timestamps.begin(enc, 'quiet-dry-check');
  pass.setPipeline(g.p.quiet_dry_check); pass.setBindGroup(0, g.bg.quiet_dry_check);
  pass.dispatchWorkgroups(Math.ceil(g.n / 256)); pass.end();
  const blocked = new Uint32Array(await g.readWords('CTR', 4, 48, enc))[0];
  if (blocked) return false;
  g.evaporateInPlace(true);
  return true;
}
