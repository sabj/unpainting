#!/usr/bin/env node
// bench/v4v5/TOKENS.md, the recipe-token list the V4 and V5 brief gives the model, generated from plan-args.mjs:
//   node bench/scripts/pipeline/tokens.mjs > bench/v4v5/TOKENS.md
// bench:test checks that the file matches.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argsBuilder, optionMap, BASE } from './plan-args.mjs';

const TOKENS = ['onedom', 'nest', 'lay2', 'lay4', 'dk13', 'lf', 'sg12', 'ls10', 'acc3', 'lt', 'cur', 'relonly', 'cg13', 'noslane', 'slane', 'st40', 'mg12',
  'shw45', 'dkf', 'rg10', 'blk60', 'bka20', 'bmm40', 'dp80', 'ms120', 'birr', 'dg2', 'ts3', 'rx3', 'bvar', 'tv8', 'rac', 'eye10', 'skyb', 'cpp', 'tsh8', 'tfl8',
  'novar', 'sk1', 'bcl3', 'fs60', 'fl0', 'sep', 'sep2', 'sep4', 'sep8', 'ink2', 'ink3', 'ink4', 'rec2', 'rec2x', 'rcl', 'ssp2', 'tp2', 'spl6', 'sml30',
  'wre15', 'lit20', 'lad', 'lw', 'sky', 'sky3', 'hue', 'efade', 'stone', 'stub', 'stub2', 'soft', 'softs', 'ol36', 'uncap', 'opp25', 'och30', 'dwg200', 'dwm50',
  'ew5', 'smc4', 'sfa8', 'opk'];

/** The options a token sets or removes against the bare region_w13 template, as text. */
function tokenFlags(token) {
  const build = argsBuilder({ planDir: '<plan>', target: '<target>', width: 1000, sheetmm: 280, targetPixels: [1000, 800] });
  const a = optionMap(build('region_w13')), b = optionMap(build(`region_w13_${token}`));
  const out = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(k) === b.get(k)) continue;
    out.push(!b.has(k) ? `--${k} (removed)` : k === 'eyering' ? `--${k} <n>/<target width>` : `--${k} ${b.get(k)}`);
  }
  return out.join(', ');
}

export function tokensMarkdown() {
  return [
    '# Recipe tokens', '',
    `Base (always applied, under your tokens): \`${BASE}\`.`, '',
    'Numbers in a token are free: `_dk11` sets --darkgain 1.1, `_lay3` sets --midlayers 3 (the examples below show the scaling). Tokens in one slot replace each other: '
    + 'lay2/lay4; sep/sep2..sep9; ink2/ink3/ink4; rec2/rec2x; hue/sky/sky3; cur/relonly; slane/noslane; soft/softs; stub/stub2/stone; pwarm/pgold/pgreen/pbs/rv. '
    + 'Stone-block tokens of the base (blk, bmm, bka, birr) act on architecture only. Palette tokens act only on Trumbull; there `--paints` is: default '
    + 'ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia; _pgreen ochre,rawsienna,hansa,ultramarine,cerulean,sepia,sapgreen (+_pbs adds sienna); _pwarm '
    + 'ochre,rawsienna,hansa,ultramarine,cerulean,sepia; _pgold ochre,hansa,ultramarine,cerulean,sepia; _rv adds rose and --roseviolet 1. Elsewhere set `--paints` in '
    + 'extra-args.json (pigment names: src/paint/methods/material-profiles.mjs). `<plan>` is bench/plan.', '',
    '| token | painter options it sets (on top of the template) |', '|---|---|',
    ...TOKENS.map(t => `| \`_${t}\` | ${tokenFlags(t)} |`), '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(tokensMarkdown());
