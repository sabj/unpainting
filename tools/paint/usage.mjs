// What a session cost, measured and never capped: one usage.json a run, so a table can set a score beside its cost.
// The benchmark's resource budget (looks, wall minutes, returns to an earlier choice) is recorded with what was used
// of it, and whether it was reached. Pure: nothing is read or written here.

const minutes = s => (s == null ? null : +(s / 60).toFixed(1));

/**
 * `session`: the session's record (cli.mjs), `author`: the run's author record, `final`: {seconds, backend, failure}
 * of the full-size painting (outside the session's clock), `plan`: the handed-over plan's summary, `prepared`: what
 * was taken prepared, `level`, `tryNumber`, `budget`.
 */
export function usageOf({ subject, author, level, tryNumber, budget, session, final = null, plan = null, prepared = null, commit = null }) {
  const looks = session.looks ?? [], plans = session.plans ?? [];
  const lookSeconds = looks.reduce((a, l) => a + (l.painted?.seconds ?? 0), 0), planSeconds = plans.reduce((a, p) => a + (p.seconds ?? 0), 0);
  return {
    schema: 'unpaint-paint/usage@1', subject, author: { key: author.key, name: author.name, id: author.id ?? null, cli: author.cli ?? null, effort: author.effort ?? null }, level, try: tryNumber, commit,
    budget: { ...budget, reached: session.budgetReached ?? null, note: session.budgetReached ? `reached the benchmark's resource budget (${session.budgetReached.what}); the session was asked to hand in what it had. Recorded, not a failure` : null },
    session: {
      ended: session.ended, wallMinutes: session.wallMinutes ?? null, ownMinutes: session.ownMinutes ?? null, waitMinutes: session.waitMinutes ?? null,
      looks: looks.length, plans: plans.length, plansRefused: plans.filter(p => !p.ok).length, toolCalls: session.toolCallsTotal ?? null, toolCallsByKind: session.toolCalls ?? null,
      selfReviews: (session.selfReviews ?? []).filter(r => r.written).length, reverts: session.reverts ?? null, warningsGiven: session.warningsGiven ?? null,
      picturesHanded: session.pictures?.handed ?? [], picturesDescribed: session.pictures ? Object.keys(session.pictures.said ?? {}).length : 0,
    },
    model: { tokensIn: author.tokensIn ?? null, tokensOut: author.tokensOut ?? null, tokens: author.tokens ?? null, costUSD: author.costUSD ?? null, costFrom: author.costUSD != null ? 'reported by the command' : 'not reported by this command' },
    machine: {
      lookGpuMinutes: minutes(lookSeconds), lookPaintings: looks.filter(l => l.painted?.seconds != null).length, planCpuMinutes: minutes(planSeconds),
      finalGpuMinutes: final?.seconds != null ? minutes(final.seconds) : null, finalBackend: final?.backend ?? null, finalFailure: final?.failure ?? null,
      note: 'the full-size final is painted after the session and is outside its clock',
    },
    work: plan ? { washes: plan.washes ?? null, strokes: plan.strokes ?? null, dryings: plan.dryings ?? null, passages: plan.passages ?? null } : null,
    prepared: prepared ?? null,
  };
}

/** One line of a usage record, for the log. */
export function usageLine(u) {
  const s = u.session, m = u.model, g = u.machine;
  return `${s.looks} looks (${g.lookGpuMinutes ?? '?'} GPU min), ${s.plans} plans, ${s.wallMinutes ?? '?'} wall min (${s.ownMinutes ?? '?'} its own), ${s.toolCalls ?? '?'} tool calls, ${m.tokens ?? '?'} tokens${m.costUSD != null ? `, $${Number(m.costUSD).toFixed(2)}` : ''}, ${s.reverts?.count ?? 0} returns to an earlier choice; final ${g.finalGpuMinutes ?? '?'} GPU min${u.budget.reached ? `; REACHED THE BENCHMARK'S RESOURCE BUDGET (${u.budget.reached.what})` : ''}`;
}
