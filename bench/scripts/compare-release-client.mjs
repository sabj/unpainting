// Browser code for the release comparison page. The page embeds this file with the "export" words removed,
// so keep it free of imports. The pure helpers are tested in compare-release.test.mjs.

export const VOTE_CHOICES = ['new', 'old', 'tie', 'neither'];
export const VOTES_STORE = 'unpainting-compare-votes-v1';

export const voteKey = (subject, model, tryN, kind) => [subject, model, tryN ?? '', kind].join('|');

export function tally(votes) {
  const t = { new: 0, old: 0, tie: 0, neither: 0, total: 0 };
  for (const v of Object.values(votes)) if (v.choice in t) { t[v.choice]++; t.total++; }
  return t;
}

/** Pressing the chosen button again removes the vote. Returns a new object. */
export function nextVote(votes, key, choice, at, extra = {}) {
  const { [key]: current, ...rest } = votes;
  if (current?.choice === choice) return rest;
  return { ...rest, [key]: { ...extra, choice, at } };
}

const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function votesToCsv(votes) {
  const lines = ['pair,subject,model,try,kind,choice,at,note'];
  for (const [key, v] of Object.entries(votes)) {
    const [subject, model, tryN, kind] = key.split('|');
    lines.push([key, subject, model, tryN, kind, v.choice, v.at, v.note].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Frame index for a slider position from 0 to 1 over a list of frames; -1 for an empty list. */
export function frameAt(fraction, count) {
  if (!(count > 0)) return -1;
  return Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1))));
}

// ---------------------------------------------------------------- page

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : v.toFixed(d));
const SCORE_NONE = '<span class="muted">not scored</span>';

function storeGet() { try { return JSON.parse(localStorage.getItem(VOTES_STORE) || '{}'); } catch { return {}; } }
function storeSet(v) { try { localStorage.setItem(VOTES_STORE, JSON.stringify(v)); return true; } catch { return false; } }

const KINDS = { 'prior-vs-plate': ['Best prior', '0.3.1 plate', 'prior', 'plate'], 'repaint-vs-plate': ['0.3.0 repaint', '0.3.1 plate', 'repaint', 'plate'] };

function scoreHtml(s) {
  if (!s) return `<div class="scores">J1 indexed ${SCORE_NONE} · progression ${SCORE_NONE}</div>`;
  const idx = fmt(s.indexed, 1), comp = fmt(s.composite), prog = fmt(s.progression);
  return `<div class="scores">J1 indexed ${idx ? `<b>${idx}</b>` : SCORE_NONE}${comp ? ` <span class="muted">(composite ${comp})</span>` : ''} · progression ${prog ? `<b>${prog}</b>` : SCORE_NONE}</div>`;
}
function dl(pairs) { return `<dl class="prov">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v == null || v === '' ? '<span class="muted">not recorded</span>' : esc(v)}</dd>`).join('')}</dl>`; }
function badges(items, cls) { return items.map(m => `<span class="badge ${cls}" title="${esc(m.text)}">${esc(m.code)}</span>`).join(''); }

function panel(label, body, scoreBlock, prov, notes) {
  return `<figure class="panel"><figcaption>${esc(label)}</figcaption>${body}${notes || ''}${scoreBlock}${prov}</figure>`;
}

function targetPanel(r) {
  return panel('Target', `<div class="img"><img alt="target ${esc(r.subject)}" src="${r.target?.src ?? ''}"></div>`, '', dl([['source width', r.target?.w ? `${r.target.w} px` : null]]));
}
function priorPanel(r) {
  const p = r.prior;
  if (!p) return panel('Best prior', '<div class="none">No published scored painting for this model and subject.</div>', '', '');
  const notes = (p.imageWidth && p.imageWidth < 600 ? `<div class="warn-line">${badges([{ code: 'low-res-source', text: 'published painting is a small WebP' }], 'mark')} published image is ${p.imageWidth} px wide</div>` : '');
  const body = `<div class="img"><img alt="best prior" src="${p.final}"></div>${p.stages ? `<img class="strip" alt="published stage strip, five stages" src="${p.stages}"><div class="muted small">Published runs keep five stages only.</div>` : ''}`;
  return panel(`Best prior, ${p.round} try ${p.try}, release ${p.release}`, body, scoreHtml({ indexed: p.indexed, composite: p.composite, progression: p.progression }), dl([
    ['painter version', [p.painterVersion, p.simVersion && `sim ${p.simVersion}`].filter(Boolean).join(' · ')], ['commit', p.commit], ['machine', p.machine],
    ['paint width', p.paintWidth && `${p.paintWidth} px`], ['session time', p.minutes != null ? `${p.minutes} min (model minutes)` : null], ['SAM', null],
  ]), notes);
}
function platePanel(r, key, label) {
  const p = r[key];
  if (!p) return panel(label, `<div class="none">No ${esc(label)} on disk for this model and subject.</div>`, '', '');
  const head = `${label}, try ${p.try}, release ${p.release}`;
  const prov = dl([['commit', p.commit], ['labelled commit', p.labelledCommit], ['GPU', p.gpu], ['SAM', p.sam], ['paint width', p.paintWidth && `${p.paintWidth} px`],
    ['source width', p.sourceWidth && `${p.sourceWidth} px`], ['seconds', p.seconds], ['record', p.dir]]);
  const marks = badges(p.marks, 'mark');
  if (p.refused.length) {
    const why = p.refused.map(m => `<li><code>${esc(m.code)}</code> ${esc(m.text)}</li>`).join('');
    return panel(head, `<div class="refused"><b>Refused.</b> This plate is not shown or compared.<ul>${why}</ul></div>`, scoreHtml(p.score), prov, `<div>${marks}</div>`);
  }
  const lines = p.marks.map(m => `<li><code>${esc(m.code)}</code> ${esc(m.text)}</li>`).join('');
  return panel(head, `<div class="img"><img data-final alt="${esc(label)}" src="${p.final}"><img data-frame class="frame" alt="${esc(label)} playback frame" hidden></div><div class="stage-label muted small" data-stage-label="${key}"></div>`,
    scoreHtml(p.score), prov, `<div>${marks}</div>${lines ? `<ul class="marklist">${lines}</ul>` : ''}`);
}

function voteBar(r, votes) {
  const out = [];
  for (const [kind, [aLabel, bLabel, ak, bk]] of Object.entries(KINDS)) {
    const a = r[ak], b = r[bk];
    const aOk = a && !(a.refused && a.refused.length), bOk = b && !(b.refused && b.refused.length);
    if (!aOk || !bOk) continue;
    const key = voteKey(r.subject, r.model, r.try, kind), cur = votes[key]?.choice;
    const btn = (c, t) => `<button type="button" data-vote="${esc(key)}" data-choice="${c}" aria-pressed="${cur === c}">${esc(t)}</button>`;
    out.push(`<div class="votebar"><span class="votelabel">${esc(aLabel)} vs ${esc(bLabel)}</span>${btn('old', `${aLabel} is better`)}${btn('new', `${bLabel} is better`)}${btn('tie', 'Equal')}${btn('neither', 'Neither is good')}</div>`);
  }
  return out.length ? out.join('') : '<div class="muted small">No pair to vote on: a side is missing or refused.</div>';
}

function rowHtml(r, votes) {
  const lens = ['repaint', 'plate'].map(k => (r[k]?.frames?.length ?? 0));
  const max = Math.max(0, ...lens);
  const scrub = max > 1 ? `<div class="scrub"><button type="button" data-play>Play</button><input type="range" min="0" max="${max - 1}" value="${max - 1}" step="1" aria-label="Playback position for ${esc(r.subject)} ${esc(r.model)}"><span class="muted small" data-pos></span><span class="muted small">All frames: 0.3.0 has ${lens[0]}, 0.3.1 has ${lens[1]}. One slider moves both by position.</span></div>` : '<div class="muted small">No playback frames for this row.</div>';
  return `<section class="row" id="row-${esc(r.id.replace(/\|/g, '-'))}" data-row="${esc(r.id)}" data-subject="${esc(r.subject)}">
<h3>${esc(r.subjectName)} · ${esc(r.modelName)}${r.try ? ` · try ${r.try}` : ''}</h3>
<div class="panels">${targetPanel(r)}${priorPanel(r)}${platePanel(r, 'repaint', '0.3.0 repaint')}${platePanel(r, 'plate', '0.3.1 plate')}</div>
${scrub}<div class="votes">${voteBar(r, votes)}</div></section>`;
}

function improvedHtml(data, votes) {
  const byId = new Map(data.rows.map(r => [`${r.subject}|${r.model}`, []]));
  data.rows.forEach(r => byId.get(`${r.subject}|${r.model}`).push(r));
  return data.improved.map(e => {
    const rows = e.look.map(l => {
      const rs = (byId.get(`${l.subject}|${l.model}`) ?? []).filter(r => r.plate && !r.plate.refused.length);
      if (!rs.length) return `<tr><td>${esc(l.subject)}</td><td>${esc(l.model)}</td><td colspan="5" class="muted">no admitted 0.3.1 plate yet</td></tr>`;
      return rs.map(r => {
        const pr = r.prior?.indexed, nw = r.plate.score?.indexed;
        const s30 = r.repaint && !r.repaint.refused.length ? r.repaint.seconds : null;
        const v = ['prior-vs-plate', 'repaint-vs-plate'].map(k => votes[voteKey(r.subject, r.model, r.try, k)]?.choice).filter(Boolean);
        return `<tr><td>${esc(r.subject)}</td><td>${esc(r.model)} try ${r.try}</td><td>${fmt(pr, 1) ?? SCORE_NONE}</td><td>${fmt(nw, 1) ?? SCORE_NONE}</td><td>${s30 ?? '<span class="muted">n/a</span>'}</td><td>${r.plate.seconds ?? '<span class="muted">n/a</span>'}</td><td>${v.length ? esc(v.join(', ')) : '<span class="muted">no vote</span>'}</td></tr>`;
      }).join('');
    }).join('');
    const table = e.look.length ? `<table><thead><tr><th>Subject</th><th>Model</th><th>Prior J1 indexed</th><th>0.3.1 J1 indexed</th><th>0.3.0 seconds</th><th>0.3.1 seconds</th><th>Your vote</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted small">No paintings to compare. This is a check, not a look.</p>';
    return `<article class="improve"><h3>${esc(e.subsystem)}</h3><p>${esc(e.summary)}</p><p class="small"><span class="muted">Source</span> ${esc(e.source ?? '')} · <span class="muted">Commits</span> ${e.commits.map(c => `<code>${esc(c)}</code>`).join(' ')}</p><p class="small"><span class="muted">Files</span> ${e.files.map(f => `<code>${esc(f)}</code>`).join(' ')}</p>${table}</article>`;
  }).join('');
}

export function initPage(data, root = document) {
  let votes = storeGet();
  const $ = (s, el = root) => el.querySelector(s);
  const state = { subject: 'all', view: 'compare' };
  const timers = new Map();

  function stats() {
    const t = tally(votes);
    $('#vote-summary').textContent = `Votes: ${t.total} · 0.3.1 better ${t.new} · older better ${t.old} · equal ${t.tie} · neither ${t.neither}`;
  }
  function render() {
    const rows = data.rows.filter(r => state.subject === 'all' || r.subject === state.subject);
    $('#view-compare').innerHTML = rows.map(r => rowHtml(r, votes)).join('') || '<p>No rows.</p>';
    $('#view-improved').innerHTML = improvedHtml(data, votes);
    $('#view-compare').hidden = state.view !== 'compare';
    $('#view-improved').hidden = state.view !== 'improved';
    stats();
    rows.forEach(r => setFrame(r, Number.MAX_SAFE_INTEGER));
  }
  function setFrame(r, idx) {
    const el = $(`[data-row="${CSS.escape(r.id)}"]`);
    if (!el) return;
    const max = Math.max(0, ...['repaint', 'plate'].map(k => (r[k]?.frames?.length ?? 0)));
    const frac = max > 1 ? Math.min(idx, max - 1) / (max - 1) : 1;
    ['repaint', 'plate'].forEach((k, n) => {
      const frames = r[k]?.frames;
      const panels = el.querySelectorAll('.panels .panel');
      const panelEl = panels[2 + n];
      if (!frames?.length || !panelEl) return;
      const f = frames[frameAt(frac, frames.length)];
      const fi = panelEl.querySelector('img[data-frame]'), fin = panelEl.querySelector('img[data-final]');
      const atEnd = idx >= max - 1;
      fi.hidden = atEnd; fin.hidden = !atEnd;
      if (!atEnd) fi.src = f.src;
      const lab = panelEl.querySelector('[data-stage-label]');
      if (lab) lab.textContent = `frame ${frameAt(frac, frames.length) + 1} of ${frames.length}${f.stage ? ` · ${f.stage}` : ''}${atEnd ? ' · final plate' : ''}`;
    });
    const pos = el.querySelector('[data-pos]');
    if (pos) pos.textContent = `step ${Math.min(idx, max - 1) + 1} of ${max}`;
    const slider = el.querySelector('input[type=range]');
    if (slider) slider.value = String(Math.min(idx, max - 1));
  }
  const rowOf = el => data.rows.find(r => r.id === el.closest('[data-row]')?.dataset.row);

  root.addEventListener('input', e => {
    if (e.target.matches('.scrub input[type=range]')) { const r = rowOf(e.target); if (r) setFrame(r, Number(e.target.value)); }
  });
  root.addEventListener('change', e => { if (e.target.id === 'subject-filter') { state.subject = e.target.value; render(); } });
  root.addEventListener('click', e => {
    const t = e.target.closest('button, [data-tab]');
    if (!t) return;
    if (t.dataset.tab) { state.view = t.dataset.tab; document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b === t))); render(); return; }
    if (t.dataset.vote) {
      const [subject, model, tryN, kind] = t.dataset.vote.split('|');
      const r = data.rows.find(x => x.subject === subject && x.model === model && String(x.try ?? '') === tryN);
      const extra = { plateCommit: r?.plate?.commit ?? null, priorRun: r?.prior ? `${r.prior.round} try ${r.prior.try} ${r.prior.release}` : null, repaintCommit: r?.repaint?.commit ?? null };
      votes = nextVote(votes, t.dataset.vote, t.dataset.choice, new Date().toISOString(), extra);
      const ok = storeSet(votes);
      const y = window.scrollY; render(); window.scrollTo(0, y);
      $('#store-note').textContent = ok ? '' : 'This browser blocked storage. Votes last until you close the page. Export them first.';
      return;
    }
    if (t.hasAttribute('data-play')) {
      const r = rowOf(t); if (!r) return;
      const slider = t.closest('.scrub').querySelector('input[type=range]');
      if (timers.has(r.id)) { clearInterval(timers.get(r.id)); timers.delete(r.id); t.textContent = 'Play'; return; }
      let i = Number(slider.value) >= Number(slider.max) ? 0 : Number(slider.value);
      t.textContent = 'Pause';
      timers.set(r.id, setInterval(() => {
        setFrame(r, i);
        if (i >= Number(slider.max)) { clearInterval(timers.get(r.id)); timers.delete(r.id); t.textContent = 'Play'; } else i++;
      }, 400));
      return;
    }
    if (t.id === 'export-json' || t.id === 'export-csv') {
      const json = t.id === 'export-json';
      const body = json ? JSON.stringify({ exportedAt: new Date().toISOString(), labelledCommits: data.meta.labelledCommits, votes }, null, 1) : votesToCsv(votes);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: json ? 'application/json' : 'text/csv' }));
      a.download = json ? 'unpainting-votes.json' : 'unpainting-votes.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (t.id === 'clear-votes' && confirm('Delete all votes stored in this browser?')) { votes = {}; storeSet(votes); render(); }
  });
  const sel = $('#subject-filter');
  [...new Set(data.rows.map(r => r.subject))].forEach(s => sel.insertAdjacentHTML('beforeend', `<option value="${esc(s)}">${esc(data.rows.find(r => r.subject === s).subjectName)}</option>`));
  render();
}
