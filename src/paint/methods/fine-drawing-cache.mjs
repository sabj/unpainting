// Cache a CPU fine-sheet pen call, including its material state and evidence.
// Main-sheet carry, wet transfer, settling and composition still execute normally.
import { cachedStepSync, inputHash } from '../run-cache.mjs';
import { TAPE, tapeState, restoreTapeState } from '../../media/brush.mjs';
import { invalidatePaperCertificate } from '../../media/paper-certificate.mjs';

const paperHashes = new WeakMap(); // paper is immutable during a painting
const excluded = new Set(['paper', 'pigments', '_gpu', '_gpuInfo', '_tape', '_renderCaches']);
const fields = sheet => Object.fromEntries(Object.entries(sheet).filter(([k, v]) => !excluded.has(k) && typeof v !== 'function'));

export function cachedFineDrawing(cache, sheet, inputs, options, execute) {
  // Callbacks can mutate caller state that this adapter cannot replay.
  if (!cache?.enabled || sheet._gpu || Object.values(options).some(v => typeof v === 'function')) return execute();
  let paper = paperHashes.get(sheet.paper);
  if (!paper) { paper = inputHash(sheet.paper); paperHashes.set(sheet.paper, paper); }
  const beforeTape = tapeState(), auditStart = options.audit?.length ?? 0;
  const { audit, state, ...settings } = options;
  const result = cachedStepSync({ ...cache, name: 'fine-drawing', inputs: {
    ...inputs, paper, pigments: sheet.pigments, sheet: fields(sheet),
    settings, state, auditStart, tape: beforeTape, recording: !!sheet._tape,
  } }, () => {
    const value = execute();
    return { value, sheet: fields(sheet), state: state ? { ...state } : null,
      audit: audit?.slice(auditStart), tape: tapeState(), marks: TAPE?.slice(beforeTape.tape) };
  });
  if (result.cached) {
    const saved = result.value;
    for (const k of Object.keys(fields(sheet))) delete sheet[k];
    Object.assign(sheet, saved.sheet);
    delete sheet._renderCaches;
    invalidatePaperCertificate(sheet);
    if (state) Object.assign(state, saved.state);
    if (audit) for (const record of saved.audit) audit.push(record);
    if (saved.tape) {
      restoreTapeState(saved.tape);
      for (const mark of saved.marks) TAPE.push(mark);
    }
  }
  return result.value.value;
}
