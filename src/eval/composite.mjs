// Scoring families kept apart, each with its own measures and flags, never averaged into one number:
//   composability  wash + ink should reconstruct the source
//   end result     the painted sheet against the source
//   keyframe       painted stages against a sequence's claimed stages (weakest: keyframes are guesses)
//   plan           the plan against the source
//   execution      the sheet against the plan it was given
//   tooling        whether the process is plausible (mark counts, dabs, passes)

const mean = F => { let s = 0; for (let i = 0; i < F.length; i++) s += F[i]; return s / Math.max(1, F.length); };
const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * Do the parts add up?
 *
 * @param source     the picture's density, per pixel
 * @param washDelivered  what the blocked-in washes account for
 * @param inkDelivered   what the derived drawing accounts for
 */
export function composability(source, washDelivered, inkDelivered, { tolerance = 0.06 } = {}) {
  const n = source.length;
  let over = 0, under = 0, total = 0, washOnly = 0, unexplained = 0;
  for (let i = 0; i < n; i++) {
    const made = (washDelivered ? washDelivered[i] : 0) + (inkDelivered ? inkDelivered[i] : 0);
    const gap = source[i] - made;
    total += source[i];
    if (gap > tolerance) under += gap - tolerance;
    else if (gap < -tolerance) over += -gap - tolerance;
    if (source[i] > 0.05 && made < 0.02) unexplained++;
    washOnly += washDelivered ? Math.min(washDelivered[i], source[i]) : 0;
  }
  const flags = [];
  if (under / Math.max(1e-6, total) > 0.25) flags.push(`the parts fall ${(100 * under / total).toFixed(0)}% short of the picture: something is not being accounted for`);
  if (over / Math.max(1e-6, total) > 0.15) flags.push(`the parts overshoot by ${(100 * over / total).toFixed(0)}%: the wash and the drawing are both claiming the same tone`);
  if (unexplained / n > 0.08) flags.push(`${(100 * unexplained / n).toFixed(0)}% of what the picture touches is claimed by neither`);
  return {
    shortfall: under / Math.max(1e-6, total),
    overshoot: over / Math.max(1e-6, total),
    washShare: washOnly / Math.max(1e-6, total),
    unexplainedArea: unexplained / n,
    flags,
  };
}

/**
 * Is the process plausible? Bands come from a corpus of real sheets.
 * @param counts  { marks, medianLength, longShare, glazes, brushSweeps, fineShare }
 * @param sheet   { width, height }
 * @param corpus  { marks: {p25,p75}, longShare: {p25,p75}, fineShare: {p25,p75} }
 */
export function tooling(counts, sheet, corpus = {}) {
  const flags = [], notes = {};
  const band = (name, value, lo, hi, what) => {
    if (value === undefined || value === null) return;
    notes[name] = value;
    if (lo !== undefined && value < lo) flags.push(`${what}: ${fmt(value)} is below the ${fmt(lo)} to ${fmt(hi)} real sheets run at`);
    else if (hi !== undefined && value > hi) flags.push(`${what}: ${fmt(value)} is above the ${fmt(lo)} to ${fmt(hi)} real sheets run at`);
  };
  const fmt = v => (v < 1 && v > 0 ? v.toFixed(2) : Math.round(v).toString());

  // corpus band is per million pixels, since mark count scales with area
  const mp = (sheet.width * sheet.height) / 1e6;
  if (counts.marks !== undefined) {
    const per = counts.marks / Math.max(0.05, mp);
    band('marksPerMegapixel', per, corpus.marks?.p25, corpus.marks?.p75, 'marks laid');
    if (counts.marks > 4000) flags.push(`${counts.marks} marks is not a drawing anyone made by hand`);
  }
  band('longShare', counts.longShare, corpus.longShare?.p25, corpus.longShare?.p75, 'share of mark length in long marks');
  band('fineShare', counts.fineShare, corpus.fineShare?.p25, corpus.fineShare?.p75, 'share of the sheet made by a fine tool');
  if (counts.glazes !== undefined) {
    notes.glazes = counts.glazes;
    if (counts.glazes < 2) flags.push('fewer than two glazes: nothing is being built up');
  }
  // Checks the trajectory, not the pass count: most debt paid off by the end, backward passes a minority.
  if (counts.glazeProgress !== undefined) {
    notes.glazeProgress = counts.glazeProgress;
    if (counts.glazeProgress < 0.6) flags.push(`the passes end ${(100 * (1 - counts.glazeProgress)).toFixed(0)}% short of the picture: the trajectory does not arrive`);
  }
  if (counts.backwardShare !== undefined) {
    notes.backwardShare = counts.backwardShare;
    if (counts.backwardShare > 0.45) flags.push(`${(100 * counts.backwardShare).toFixed(0)}% of the passes lose ground: that is thrashing, not blending`);
  }
  // sweeps are counted against sheet size so a wash-only sheet can still fail
  if (counts.brushSweeps !== undefined) {
    const per = counts.brushSweeps / Math.max(0.05, mp);
    notes.sweepsPerMegapixel = per;
    if (per > 12000) flags.push(`${Math.round(per)} brush sweeps per megapixel: the washes are being dabbed, not laid`);
    if (counts.marks !== undefined && counts.brushSweeps > 25 * Math.max(1, counts.marks) && counts.marks > 20) {
      flags.push(`${counts.brushSweeps} brush sweeps against ${counts.marks} drawn marks`);
    }
  }
  if (counts.medianLength !== undefined) {
    notes.medianLength = counts.medianLength;
    const short = Math.min(sheet.width, sheet.height);
    if (counts.medianLength > short * 0.9) flags.push(`a median mark of ${Math.round(counts.medianLength)} px on a ${short} px side is a scribble, not a gesture`);
  }
  return { ...notes, flags };
}

/** Compare painting and source over the painted source area. */
export function endResult(sourceD, paintedD, { floor = 0.03 } = {}) {
  const n = sourceD.length;
  let err = 0, bias = 0, count = 0, missed = 0, invented = 0;
  for (let i = 0; i < n; i++) {
    const d = paintedD[i] - sourceD[i];
    err += Math.abs(d); bias += d; count++;
    if (sourceD[i] > floor && paintedD[i] < floor) missed++;
    if (paintedD[i] > floor && sourceD[i] < floor) invented++;
  }
  const flags = [];
  const toneError = err / count, toneBias = bias / count;
  if (toneError > 0.12) flags.push(`tone is ${toneError.toFixed(3)} OD out on average`);
  if (Math.abs(toneBias) > 0.05) flags.push(toneBias < 0 ? `the sheet is ${(-toneBias).toFixed(3)} OD too light overall` : `the sheet is ${toneBias.toFixed(3)} OD too dark overall`);
  if (missed / n > 0.12) flags.push(`${(100 * missed / n).toFixed(0)}% of what the picture touches was never painted`);
  if (invented / n > 0.08) flags.push(`${(100 * invented / n).toFixed(0)}% of the sheet was painted where the picture is bare`);
  return { toneError, toneBias, missed: missed / n, invented: invented / n, flags };
}

/** Everything together, with the families kept apart. */
export function report(parts) {
  const out = { families: {}, flags: [] };
  for (const [name, value] of Object.entries(parts)) {
    if (!value) continue;
    out.families[name] = value;
    for (const f of value.flags ?? []) out.flags.push(`${name}: ${f}`);
  }
  out.clean = out.flags.length === 0;
  return out;
}

export function print(rep) {
  for (const [name, fam] of Object.entries(rep.families)) {
    const shown = Object.entries(fam).filter(([k]) => k !== 'flags')
      .map(([k, v]) => `${k} ${typeof v === 'number' ? (v < 1 && v > -1 ? v.toFixed(3) : v.toFixed(1)) : v}`).join(', ');
    console.log(`${name.padEnd(14)} ${shown}`);
  }
  if (rep.clean) console.log('\nno flags');
  else { console.log(''); for (const f of rep.flags) console.log(`  ! ${f}`); }
}


/**
 * Did the sheet carry out the plan? The plan is rendered through optics alone, the painting through the full
 * simulation, so the difference is what water, paper and brush did. Lost plan structure is the fault.
 *
 * @param planD     the plan's density, per pixel
 * @param paintedD  the painted sheet's density, over the same pixels
 * @param blur      a separable blur, so this module stays free of any particular implementation
 */
export function execution(planD, paintedD, w, h, blur0, { fine = 1.5, broad = 6 } = {}) {
  const n = planD.length;
  // shared by the fine and broad bands below
  const memo = new Map(), blur = (F, ww, hh, sigma) => { const hit = memo.get(F); if (hit && hit.sigma === sigma) return hit.B; const B = blur0(F, ww, hh, sigma); memo.set(F, { sigma, B }); return B; };
  const detail = (F, sigma) => { const B = blur(F, w, h, sigma), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = F[i] - B[i]; return out; };
  const sd = F => { let m = 0; for (let i = 0; i < n; i++) m += F[i]; m /= n; let v = 0; for (let i = 0; i < n; i++) v += (F[i] - m) ** 2; return Math.sqrt(v / n); };

  const pFine = detail(planD, fine), qFine = detail(paintedD, fine);
  const pBroad = detail(blur(planD, w, h, fine), broad), qBroad = detail(blur(paintedD, w, h, fine), broad);
  // form scale, where a figure's modelling lives
  const pForm = detail(blur(planD, w, h, broad), 20), qForm = detail(blur(paintedD, w, h, broad), 20);

  // how much of the plan's own structure survives, not just how much structure the sheet has
  const agree = (a, b) => {
    let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; cov += x * y; va += x * x; vb += y * y; }
    return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
  };

  const fineKept = sd(pFine) > 0 ? sd(qFine) / sd(pFine) : 0;
  const broadKept = sd(pBroad) > 0 ? sd(qBroad) / sd(pBroad) : 0;
  const structure = agree(pFine, qFine), formStructure = agree(pForm, qForm);
  const formKept = sd(pForm) > 0 ? sd(qForm) / sd(pForm) : 0;
  // formScore falls away on both sides of 1 so added noise at form scale cannot pass. formKept is the raw ratio.
  const formScore = formKept <= 1 ? formKept : Math.max(0, 2 - formKept);
  let bias = 0; for (let i = 0; i < n; i++) bias += paintedD[i] - planD[i]; bias /= n;

  const flags = [];
  // Amplitude and agreement are separate faults: more variation with none of the plan's is texture, not flooding.
  if (fineKept < 0.5) flags.push(`the sheet keeps only ${(100 * fineKept).toFixed(0)}% of the plan's variation at one cell: flattened at that scale`);
  if (fineKept > 1.6) flags.push(`the sheet has ${fineKept.toFixed(1)}x the plan's variation at one cell: it is adding texture of its own`);
  if (broadKept < 0.5) flags.push(`only ${(100 * broadKept).toFixed(0)}% of the plan's variation at six cells survives, which is where a figure's modelling lives`);
  if (structure < 0.3) flags.push(`what variation the sheet has at one cell barely agrees with the plan's (${structure.toFixed(2)}): it is the paper's own, standing where the plan had edges`);
  if (bias < -0.06) flags.push(`the sheet lands ${(-bias).toFixed(3)} OD lighter than the plan asked for`);
  if (formKept > 1.3) flags.push(`the sheet has ${formKept.toFixed(2)}x the plan's variation at form scale: that is the sheet's own noise, not the plan's forms`);
  if (bias > 0.06) flags.push(`the sheet lands ${bias.toFixed(3)} OD heavier than the plan asked for`);
  if (formKept < 0.6) flags.push(`only ${(100 * formKept).toFixed(0)}% of the plan's modelling survives at the scale of a face or a coat`);
  if (formStructure < 0.6) flags.push(`the sheet's forms do not agree with the plan's (${formStructure.toFixed(2)})`);
  return { fineKept, broadKept, formKept, formScore, structure, formStructure, bias, flags };
}


/**
 * Execution measured pass by pass: once pass k is down the sheet should hold what the first k glazes deliver,
 * so a pass that floods shows up as itself.
 *
 * @param pairs  [{ pass, planD, paintedD }], in the order they were laid
 */
export function intermediates(pairs, w, h, blur, options = {}) {
  // callers may pass precomputed marks instead of the two fields per pass
  const steps = pairs.map(p => (p.planD ? { pass: p.pass, ...execution(p.planD, p.paintedD, w, h, blur, options) } : p));
  const flags = [];
  if (!steps.length) return { steps, flags };

  // first failing pass and whether it recovers, read at form scale: at one cell paper tooth has no plan counterpart
  const bad = steps.filter(s => (s.formScore ?? s.formKept) < 0.6 || s.formStructure < 0.6);
  if (bad.length) {
    const first = bad[0];
    flags.push(`the sheet first loses the plan's forms at pass ${first.pass}: ${(100 * first.formKept).toFixed(0)}% of them, agreement ${first.formStructure.toFixed(2)}`);
    if (bad.length > steps.length * 0.6) flags.push(`and it is not one bad pass: ${bad.length} of ${steps.length} lose it`);
  }
  // a pass that undoes the one before it
  let undone = 0;
  for (let i = 1; i < steps.length; i++) if (steps[i].formStructure < steps[i - 1].formStructure - 0.15) undone++;
  if (undone > steps.length * 0.3) flags.push(`${undone} passes leave the sheet further from the plan than the pass before: the later glazes are dissolving the earlier ones`);
  const last = steps[steps.length - 1];
  return { steps, worst: bad[0] ?? null, endFineKept: last.fineKept, endStructure: last.structure, endFormKept: last.formKept, endFormStructure: last.formStructure, flags };
}


/** Is the plan worth carrying out? The execution measures, run on source against plan. */
export function planQuality(sourceD, planD, w, h, blur, options = {}) {
  const r = execution(sourceD, planD, w, h, blur, options);
  const flags = r.flags.map(f => f
    .replace('the sheet keeps', 'the plan keeps')
    .replace('the washes are flooding and levelling', 'the block-in has smoothed the picture away')
    .replace("the plan's detail", "the picture's detail")
    .replace("the plan's variation", "the picture's variation")
    .replace('the passages are pooling into one another', 'the regions are too coarse for what the picture does')
    .replace("does not agree with the plan's", "does not agree with the picture's")
    .replace('it is the simulation\'s own texture, not the picture\'s', 'the plan has invented structure the picture does not have')
    .replace('the sheet lands', 'the plan asks for')
    .replace('lighter than the plan asked for', 'less tone than the picture has')
    .replace('heavier than the plan asked for', 'more tone than the picture has'));
  return { ...r, flags };
}
