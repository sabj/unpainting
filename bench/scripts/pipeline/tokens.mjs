#!/usr/bin/env node
// bench/v4v5/TOKENS.md, the recipe-token list the V4 and V5 brief gives the model, generated from plan-args.mjs:
//   node bench/scripts/pipeline/tokens.mjs > bench/v4v5/TOKENS.md
// bench:test checks that the file matches.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argsBuilder, optionMap, BASE, REFUSED_TOKENS } from './plan-args.mjs';

const TOKENS = ['onedom', 'nest', 'lay2', 'lay4', 'lf', 'ls10', 'acc3', 'lt', 'cur', 'relonly', 'noslane', 'st40',
  'shw45', 'dkf', 'dp80', 'ms120', 'dg2', 'ts3', 'tv8', 'eye10', 'skyb', 'cpp', 'tsh8', 'tfl8',
  'novar', 'sk1', 'fs60', 'fl0', 'sep', 'sep2', 'sep4', 'sep8', 'ink2', 'ink3', 'ink4', 'ssp2', 'spl6', 'sml30',
  'wre15', 'lad', 'sky', 'sky3', 'hue', 'efade', 'stone', 'stub', 'stub2', 'soft', 'softs', 'ol36', 'uncap', 'opp25', 'och30', 'dwg200', 'dwm50',
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
    'Numbers in a token are free: `_lay3` sets --midlayers 3, `_st35` sets --shadowthresh .35 (the examples below show the scaling). There is no dark, cool or middle gain: the painter delivers the value the plan states. Tokens in one slot replace each other: '
    + 'lay2/lay4; hue/sky/sky3; cur/relonly; soft/softs; stub/stub2/stone. '
    + 'A setting only acts while its switch is on, so the painter reports the others as unused: '
    + 'eye and dg need _dp (refused, a gain), and the texture tokens (tv, tfl, stub, stub2) change no painting at all. Every subject gets the same base. Choose pigments with `--paints` in '
    + 'extra-args.json (pigment names: src/paint/methods/material-profiles.mjs). `<plan>` is bench/plan.', '',
    '| token | painter options it sets (on top of the template) |', '|---|---|',
    ...TOKENS.filter(t => !/^(sep\d*|ink[234]|uncap|ol\d+|opp\d+|dw[gm]\d+)$/.test(t)).map(t => `| \`_${t}\` | ${REFUSED_TOKENS[t.replace(/\d+$/, '')] ? `refused: ${REFUSED_TOKENS[t.replace(/\d+$/, '')]}` : tokenFlags(t)} |`), '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(tokensMarkdown());
