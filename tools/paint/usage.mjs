// What a session cost, measured and never capped: one usage.json a run, so a table can set a score beside its cost.
// The benchmark's resource budget (rendering units, steps, returns to an earlier choice; the wall clock a safety stop only) is recorded with what was used
// of it, and whether it was reached. Looks are charged a fixed price by size and share (look-cost.mjs); how a model
// paints is recorded beside the charge (sweeps, dryings, water steps, cell-steps, seconds, tokens, steps), never
// charged. Pure: nothing is read or written here.
import { LOOK_PRICE, LEAST_LOOK_COST } from './look-cost.mjs';

const minutes = s => (s == null ? null : +(s / 60).toFixed(1));

/**
 * `session`: the session's record (cli.mjs), `author`: the run's author record, `final`: {seconds, backend, failure}
 * of the full-size painting (outside the session's clock), `plan`: the handed-over plan's summary, `prepared`: what
 * was taken prepared, `level`, `tryNumber`, `budget`.
 */
export function usageOf({ subject, author, level, tryNumber, budget, session, final = null, plan = null, prepared = null, commit = null, waterGuard = null }) {
  const looks = session.looks ?? [], plans = session.plans ?? [];
  const lookSeconds = looks.reduce((a, l) => a + (l.painted?.seconds ?? 0), 0), planSeconds = plans.reduce((a, p) => a + (p.seconds ?? 0), 0);
  return {
    schema: 'unpaint-paint/usage@2',
    // what is charged and what is not, as the try ran
    pricing: { charged: 'looks only: a fixed price by size and by the share of the sheet or script painted, whatever is in the look', halfSizeWholeLook: LOOK_PRICE.half, fullSizeWholeLook: LOOK_PRICE.full, leastLook: LEAST_LOOK_COST, finalCharged: false, recordedNeverCharged: ['brush sweeps', 'dryings', 'water steps', 'cell-steps', 'seconds', 'tokens', 'steps'] },
    // the one guard, resource management only: a painting past this many water steps is stopped, recorded as a stop, never scored
    waterGuard: waterGuard ? { ...waterGuard, stoppedFinal: Boolean(final?.guardStop) } : null, subject, author: { key: author.key, name: author.name, id: author.id ?? null, cli: author.cli ?? null, effort: author.effort ?? null }, level, try: tryNumber, commit,
    budget: { ...budget, reached: session.budgetReached ?? null, note: session.budgetReached ? `reached the benchmark's resource budget (${session.budgetReached.what}); the session was asked to hand in what it had. Recorded, not a failure` : null },
    session: {
      ended: session.ended, ladder: session.ladder ?? null, previousLevel: session.previousLevel ?? null, wallMinutes: session.wallMinutes ?? null, ownMinutes: session.ownMinutes ?? null, waitMinutes: session.waitMinutes ?? null,
      steps: session.steps ?? null, cutOffBySafetyStop: Boolean(session.budgetReached?.safetyStop),
      looks: looks.length, lookUnits: session.lookUnits ?? null, looksEach: looks.map(l => ({ look: l.look, cost: l.cost ?? 1, chargedFrom: l.chargedFrom ?? null, size: l.size ?? null, until: l.ask?.until ?? null, region: l.ask?.region?.box ?? null, work: l.work ?? null, machineSeconds: l.painted?.seconds ?? null, render: l.painted?.render ?? null })), plans: plans.length, plansRefused: plans.filter(p => !p.ok).length, toolCalls: session.toolCallsTotal ?? null, toolCallsByKind: session.toolCalls ?? null,
      selfReviews: (session.selfReviews ?? []).filter(r => r.written).length, assessmentWritten: session.assessment ? session.assessment.written : null, reverts: session.reverts ?? null, warningsGiven: session.warningsGiven ?? null,
      picturesHanded: session.pictures?.handed ?? [], picturesDescribed: session.pictures ? Object.keys(session.pictures.said ?? {}).length : 0,
    },
    // what it did with its tools, from its transcript and its folder (tool-use.mjs); null for a session kept before this was recorded
    toolUse: session.toolUse ?? null,
    // what of the network it asked for, from the session's gate (session-net.mjs): the hosts passed, and every refusal with its host
    network: session.network ?? null,
    model: { tokensIn: author.tokensIn ?? null, tokensOut: author.tokensOut ?? null, tokens: author.tokens ?? null, costUSD: author.costUSD ?? null, costFrom: author.costUSD != null ? 'reported by the command' : 'not reported by this command',
      // fresh input, cached input and output, as the command reported them, so the run can be priced
      tokenSplit: author.tokenSplit ?? { reported: false, note: 'this command\'s transcript does not report its tokens split into fresh input, cached input and output' } },
    machine: {
      lookGpuMinutes: minutes(lookSeconds), lookPaintings: looks.filter(l => l.painted?.seconds != null).length, planCpuMinutes: minutes(planSeconds),
      finalGpuMinutes: final?.seconds != null ? minutes(final.seconds) : null, finalBackend: final?.backend ?? null, finalFailure: final?.failure ?? null, finalWork: final?.work ?? null, finalGuardStop: final?.guardStop ?? null,
      note: 'the full-size final is painted after the session and is outside its clock; machine seconds are recorded beside each look and never charged: looks are charged in units of rendering',
      // where each painting was painted (render.mjs: this Mac, or the render pool's worker) and what that took; the operator's, never charged
      render: renderTotals(looks.map(l => l.painted?.render).filter(Boolean), final?.render ?? null),
    },
    work: plan ? { washes: plan.washes ?? null, strokes: plan.strokes ?? null, dryings: plan.dryings ?? null, passages: plan.passages ?? null, ...(plan.erases ? { erases: { passages: plan.erases.passages, strokes: plan.erases.strokes } } : {}) } : null,
    prepared: prepared ?? null,
    // the terms the try ran under (cli.mjs): budgets, the subject's unit, seed, commit, prepared inputs by hash; a rerun with the same terms is the same try
    terms: author.terms ?? null,
  };
}

/** The render record of a session's paintings together: the workers, the seconds waited, painted and copied, the pods' cost. */
export function renderTotals(looks, final) {
  const all = [...looks, ...(final ? [final] : [])];
  if (!all.length) return null;
  const sum = k => +all.reduce((a, r) => a + (r[k] ?? 0), 0).toFixed(4);
  return { mode: all[0].mode, workers: [...new Set(all.map(r => r.worker))], waitSeconds: sum('waitSeconds'), paintSeconds: sum('paintSeconds'), copySeconds: sum('copySeconds'), costUSD: sum('costUSD'), retried: all.filter(r => (r.tries?.length ?? 1) > 1).length, final };
}

/** One line of a usage record, for the log. */
export function usageLine(u) {
  const s = u.session, m = u.model, g = u.machine;
  return `${s.looks} looks for ${s.lookUnits?.spent ?? '?'} of ${s.lookUnits?.budget ?? '?'} rendering units, ${s.steps?.taken ?? '?'} of ${s.steps?.budget ?? '?'} steps (${g.lookGpuMinutes ?? '?'} GPU min), ${s.plans} plans, ${s.wallMinutes ?? '?'} wall min (${s.ownMinutes ?? '?'} its own), ${s.toolCalls ?? '?'} tool calls, ${m.tokens ?? '?'} tokens${m.costUSD != null ? `, $${Number(m.costUSD).toFixed(2)}` : ''}, ${s.reverts?.count ?? 0} returns to an earlier choice; final ${g.finalGpuMinutes ?? '?'} GPU min${u.budget.reached ? `; REACHED THE BENCHMARK'S RESOURCE BUDGET (${u.budget.reached.what})` : ''}`;
}
