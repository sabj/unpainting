// Builds the single-file HTML page for the release comparison. No network, no external files.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const clientSource = () => fs.readFileSync(fileURLToPath(new URL('./compare-release-client.mjs', import.meta.url)), 'utf8')
  .replace(/^export /gm, '');

const CSS = `
:root{--bg:#fbfaf7;--fg:#1d1b18;--muted:#6b665e;--line:#d9d4ca;--card:#fff;--accent:#2f5d8a;--ok:#2d6a3e;--warn:#9a5b00;--bad:#a12b2b;--badbg:#fbeaea;--warnbg:#fff3dc}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171613;--fg:#ece8df;--muted:#a09a8d;--line:#3a372f;--card:#1f1d19;--accent:#8fb8e6;--ok:#7ccb92;--warn:#e6b25a;--bad:#f09a9a;--badbg:#3a2020;--warnbg:#3a2f16}}
:root[data-theme="dark"]{--bg:#171613;--fg:#ece8df;--muted:#a09a8d;--line:#3a372f;--card:#1f1d19;--accent:#8fb8e6;--ok:#7ccb92;--warn:#e6b25a;--bad:#f09a9a;--badbg:#3a2020;--warnbg:#3a2f16}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:1500px;margin:0 auto;padding:16px}
h1{font-size:1.6rem;margin:.2em 0}h2{font-size:1.15rem;margin:1.4em 0 .4em}h3{font-size:1.05rem;margin:0 0 .6em}
.muted{color:var(--muted)}.small{font-size:.85rem}code{font-size:.82em;background:color-mix(in srgb,var(--line) 50%,transparent);padding:0 .25em;border-radius:3px;word-break:break-all}
details{border:1px solid var(--line);border-radius:8px;padding:.5em .9em;background:var(--card);margin:.8em 0}summary{cursor:pointer;font-weight:600}
table{border-collapse:collapse;width:100%;font-size:.85rem}th,td{border-bottom:1px solid var(--line);padding:.3em .5em;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}
.tablewrap{overflow-x:auto}
.toolbar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:.5em 0;display:flex;flex-wrap:wrap;gap:.5em;align-items:center}
.toolbar button,.toolbar select,.votebar button,.scrub button{font:inherit;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:.3em .7em;cursor:pointer;min-height:36px}
[aria-selected="true"],[aria-pressed="true"]{background:var(--accent)!important;color:var(--bg)!important;border-color:var(--accent)!important}
.row{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px;margin:14px 0}
.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.panel{margin:0;min-width:0}.panel figcaption{font-weight:600;font-size:.9rem;margin-bottom:.3em}
.img{position:relative;background:var(--line);border-radius:6px;overflow:hidden}.img img{display:block;width:100%;height:auto}
.strip{width:100%;height:auto;margin-top:6px;border-radius:4px}
.none,.refused{border:1px dashed var(--line);border-radius:6px;padding:.8em;color:var(--muted);font-size:.9rem}
.refused{border:2px solid var(--bad);background:var(--badbg);color:var(--bad)}.refused ul{margin:.4em 0 0 1.1em;padding:0;color:var(--fg)}
.badge{display:inline-block;font-size:.72rem;border-radius:999px;padding:0 .55em;margin:.3em .3em 0 0;border:1px solid}
.badge.mark{color:var(--warn);background:var(--warnbg);border-color:var(--warn)}.badge.refuse{color:var(--bad);background:var(--badbg);border-color:var(--bad)}.badge.ok{color:var(--ok);border-color:var(--ok)}
.marklist{margin:.3em 0 0 1.1em;padding:0;font-size:.8rem;color:var(--warn)}
.scores{margin:.4em 0;font-size:.9rem}
.prov{display:grid;grid-template-columns:auto 1fr;gap:0 .7em;margin:.4em 0 0;font-size:.78rem}.prov dt{color:var(--muted)}.prov dd{margin:0;word-break:break-word}
.scrub{display:flex;flex-wrap:wrap;gap:.6em;align-items:center;margin-top:.8em}.scrub input{flex:1 1 220px;min-width:160px}
.votes{margin-top:.6em;display:grid;gap:.4em}.votebar{display:flex;flex-wrap:wrap;gap:.4em;align-items:center}.votelabel{font-size:.85rem;font-weight:600;margin-right:.4em}
.improve{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px;margin:14px 0}
.verdict-ok{color:var(--ok)}.verdict-bad{color:var(--bad)}
.warn-line{font-size:.8rem;color:var(--warn)}
@media (max-width:600px){.wrap{padding:16px}}
`;

function plateTable(list) {
  if (!list.length) return '<p class="muted">No 0.3.0 or 0.3.1 plate folders were found.</p>';
  const rows = list.map(p => `<tr><td>${esc(p.subject)} · ${esc(p.model)} · try ${esc(p.try)}</td><td>${esc(p.release)}</td><td><code>${esc((p.commit ?? 'none').slice(0, 12))}</code></td><td>${esc(p.gpu)}</td><td>${esc(p.paintWidth ?? '')}</td><td>${esc(p.sourceWidth ?? '')}</td><td>${esc(p.seconds ?? '')}</td><td class="${p.admitted ? 'verdict-ok' : 'verdict-bad'}">${p.admitted ? 'admitted' : 'refused'}${p.reasons.length ? `: ${esc(p.reasons.join('; '))}` : ''}</td></tr>`).join('');
  return `<div class="tablewrap"><table><thead><tr><th>Plate</th><th>Release</th><th>Run card commit</th><th>GPU</th><th>Paint px</th><th>Source px</th><th>Seconds</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const jsonForScript = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function renderPage({ rows, improved, meta }) {
  const m = { plateTable: [], counts: {}, labelledCommits: {}, priorReleases: [], ...meta };
  const labelled = Object.entries(m.labelledCommits).map(([k, v]) => `${esc(k)} = <code>${esc(String(v).slice(0, 12))}</code>`).join(', ') || 'none given';
  const c = m.counts;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.title ?? 'Release comparison')}</title><style>${CSS}</style></head>
<body><div class="wrap">
<h1>${esc(m.title ?? 'Release comparison')}</h1>
<p class="muted">Generated ${esc(m.generatedAt)} from run records on disk. Nothing on this page is typed by hand except the improvement notes in <code>compare-release-improved.mjs</code>.</p>
<details open><summary>What this page shows and what it refuses</summary>
<ul>
<li>Each row is one subject and model: target, best prior painting from the published runs (by J1 composite, any round, any try), the 0.3.0 repaint, and the 0.3.1 plate.</li>
<li>Labelled commits: ${labelled}. A plate whose run card commit differs, or records no commit, is refused: no image, no vote.</li>
<li>A CPU run, a GPU fallback or a render narrower than 540 px is refused.</li>
<li>A source target narrower than 600 px is marked <code>low-res-source</code> on every plate, because it is enlarged to paint size. Pass <code>--strict</code> to refuse these.</li>
<li>Prior paintings come from published records. Their releases here: ${esc(m.priorReleases.join(', ') || 'none')}. ${esc(m.priorNote ?? '')}</li>
<li>The scrubber plays every frame in the plate's <code>frames.json</code>. Published runs keep five stages only, so the prior shows its stage strip.</li>
<li>J1 and progression show "not scored" when no record holds them. Seconds are single runs on different machines, and noisy when a machine is shared.</li>
<li>Votes are stored in this browser only. Export them before clearing site data.</li>
</ul></details>
<p><b>${esc(c.rows ?? 0)}</b> rows · <b>${esc(c.admitted ?? 0)}</b> plates admitted · <b>${esc(c.refused ?? 0)}</b> refused · <b>${esc(c.marked ?? 0)}</b> admitted with marks.</p>
<details><summary>Plates read from disk (${m.plateTable.length})</summary>${plateTable(m.plateTable)}</details>
<div class="toolbar" role="toolbar">
<button type="button" data-tab="compare" aria-selected="true">Compare</button>
<button type="button" data-tab="improved" aria-selected="false">What improved</button>
<label class="small">Subject <select id="subject-filter"><option value="all">All</option></select></label>
<span id="vote-summary" class="small muted"></span>
<button type="button" id="export-json">Export votes (JSON)</button>
<button type="button" id="export-csv">Export votes (CSV)</button>
<button type="button" id="clear-votes">Clear votes</button>
<span id="store-note" class="small verdict-bad" role="status"></span>
</div>
<noscript><p class="verdict-bad">This page needs JavaScript to show the paintings.</p></noscript>
<main><div id="view-compare"></div><div id="view-improved" hidden></div></main>
</div>
<script type="application/json" id="cmp-data">${jsonForScript({ rows, improved, meta: m })}</script>
<script>
${clientSource()}
initPage(JSON.parse(document.getElementById('cmp-data').textContent));
</script></body></html>
`;
}
