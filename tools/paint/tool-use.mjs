// What a session did with its tools, counted from its own transcript and its folder: shell commands, the scripts it
// wrote (name, lines, language) and how often each ran, short programs it ran inline, pictures it opened, ./unpaint
// calls by kind, files it created, and what it tried that failed or was refused. Measured, never a gate.
// Pure but for `listFiles`; usage.json carries the result (usage.mjs).
import fs from 'node:fs';
import path from 'node:path';

const LANG = { '.py': 'python', '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.ts': 'typescript', '.sh': 'shell', '.zsh': 'shell', '.bash': 'shell', '.rb': 'ruby', '.pl': 'perl', '.r': 'r', '.jl': 'julia', '.swift': 'swift', '.c': 'c', '.go': 'go' };
const PICTURE = /\.(png|jpe?g|gif|webp|bmp|tiff?|svg)$/i;
const UNPAINT = /(?:^|[\s;&|/])unpaint\s+(status|plan|look|cost|wait)\b/g;
const INLINE = [[/\bpython[\d.]*\s+-c\b|\bpython[\d.]*\s+-\s*<</, 'python'], [/\bnode\s+(-e|--eval|-p)\b|\bnode\s+-\s*<</, 'javascript'], [/\b(ruby|perl)\s+-e\b/, 'other']];
// an answer of the harness or the shell that says a thing was not done
const REFUSED = /^(REFUSED|NOT PAINTED)|Operation not permitted|Permission denied|command not found|Could(?: not|n't) (?:resolve|connect)|No such file or directory/m;
const INSTALL = /\b(pip3?|python[\d.]*\s+-m\s+pip|npm|npx|pnpm|yarn|brew|conda|uv|cargo|gem|apt(-get)?)\s+(install|add|i)\b/;
const NETWORK = /\b(curl|wget|nc|ssh|scp|ftp|telnet)\b|https?:\/\//;

/** Files under `dir`, as paths relative to it, sorted. */
export function listFiles(dir) {
  const out = [], walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out.push(path.relative(dir, f)); } };
  try { walk(dir); } catch { return []; }
  return out.sort();
}

/**
 * `steps`: the transcript's tool steps in order (session.mjs readTranscript): {kind: 'shell'|'read'|'write'|<tool>,
 * text: the command or the place, exit: number|null, failed: bool, output: its start}. `startFiles`, `endFiles`: the
 * folder's files before the model started and when it ended (listFiles). `read(rel)`: a file of its folder as text.
 * `own`: its folder's path, cut from places so they read as its own.
 */
export function toolUseOf({ steps = [], startFiles = null, endFiles = [], read = () => null, own = [] }) {
  const mine = t => own.filter(Boolean).sort((a, b) => b.length - a.length).reduce((s, o) => s.replaceAll(`${o}/`, '').replaceAll(o, '.'), String(t));
  const shell = steps.filter(s => s.kind === 'shell'), unpaint = {};
  for (const s of shell) for (const m of s.text.matchAll(UNPAINT)) unpaint[m[1]] = (unpaint[m[1]] ?? 0) + 1;
  const created = startFiles ? endFiles.filter(f => !startFiles.includes(f)) : null;
  // scripts: a file of a programming language it created (or wrote with a file tool), and how many commands ran it
  const writtenByTool = steps.filter(s => s.kind === 'write').map(s => mine(s.text));
  const candidates = [...new Set([...(created ?? []), ...writtenByTool.filter(f => endFiles.includes(f))])].filter(f => LANG[path.extname(f).toLowerCase()]);
  const scripts = candidates.map(f => { const text = read(f); const base = path.basename(f); return { name: f, language: LANG[path.extname(f).toLowerCase()], lines: text == null ? null : text.split('\n').length - (text.endsWith('\n') ? 1 : 0), runs: shell.filter(s => new RegExp(`(^|[\\s/'"])${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s.text) && !/^\s*(cat|head|tail|less|wc|ls|sed -n)\b/.test(s.text)).length }; });
  const inline = {}; for (const s of shell) for (const [re, lang] of INLINE) if (re.test(s.text)) { inline[lang] = (inline[lang] ?? 0) + 1; break; }
  const pictures = [...new Set(steps.filter(s => s.kind === 'read' && PICTURE.test(s.text)).map(s => mine(s.text)))];
  const failed = steps.filter(s => s.failed || (s.output && REFUSED.test(s.output))).map(s => ({ kind: s.kind, text: mine(s.text).slice(0, 300), exit: s.exit ?? null, said: ((s.output ?? '').split('\n').find(l => REFUSED.test(l)) ?? (s.output ?? '').split('\n').filter(l => l.trim()).at(-1) ?? '').trim().slice(0, 200) || null }));
  const tried = re => shell.filter(s => re.test(s.text)).map(s => ({ text: mine(s.text).slice(0, 300), exit: s.exit ?? null }));
  return {
    schema: 'unpaint-paint/tool-use@1', toolSteps: steps.length, shellCommands: shell.length, fileReads: steps.filter(s => s.kind === 'read').length, fileWrites: steps.filter(s => s.kind === 'write').length,
    unpaint, scripts, inlinePrograms: inline, picturesOpened: pictures, filesCreated: created, filesCreatedNote: created ? null : 'the folder was not listed before the model started',
    failedOrRefused: failed, installsTried: tried(INSTALL), networkTried: tried(NETWORK),
  };
}
