// Lifts the owner-approved de/fr/ar cells verbatim from DRAFTS.md and prints the dictionary
// block for app/vamos-i18n-dict.js. Two rows are split where the page puts a value in
// <span class="vt-dir-keep" data-vt-no-i18n="1">: T1 (the register number) and P8 (the figure 10).
// The words are unchanged; only the value moves out of the translated text node.
// Also checks: no new key already exists, no new translation equals another entry's.
// Usage: node build-entries.mjs  (prints JS lines to stdout, report to stderr)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');
const md = fs.readFileSync(path.join(repo, '.planning/quick/261003-legal-translations/DRAFTS.md'), 'utf8');

const rows = {};
for (const line of md.split('\n')) {
  const m = /^\|\s*([TPCX]\d+)\s*\|/.exec(line);
  if (!m) continue;
  rows[m[1]] = line.split('|').slice(1, -1).map((c) => c.trim());
}
// Main tables: # | Section | English | German | French | Arabic | Note
// C6 table:    # | English now | Proposed English | German | French | Arabic
const cell = (id) => {
  const r = rows[id];
  if (!r) throw new Error(`row ${id} missing`);
  return { en: r[2], de: r[3], fr: r[4], ar: r[5] };
};

const REG = 'CH-020.4.077.792-7';
const stripLink = (s) => s.replace(/\s*\*\[[^\]]*\]\*\.?$/, '').trim();

const entries = [];
// T1 split around the register number; the trailing link word is its own (existing) entry.
{
  const c = cell('T1');
  const parts = {};
  for (const l of ['en', 'de', 'fr', 'ar']) {
    const s = stripLink(c[l]);
    const i = s.indexOf(REG);
    if (i < 0) throw new Error(`T1 ${l}: register number not found`);
    parts[l] = [s.slice(0, i).trim(), s.slice(i + REG.length).trim()];
  }
  entries.push({ id: 'T1a', en: parts.en[0], de: parts.de[0], fr: parts.fr[0], ar: parts.ar[0] });
  entries.push({ id: 'T1b', en: parts.en[1], de: parts.de[1], fr: parts.fr[1], ar: parts.ar[1] });
}
for (const id of ['T2', 'T3', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P9', 'P10', 'C1', 'C2', 'C3', 'C4']) {
  entries.push({ id, ...cell(id) });
}
// P8 split: the figure 10 sits in vt-dir-keep.
{
  const c = cell('P8');
  const e = { id: 'P8' };
  for (const l of ['en', 'de', 'fr', 'ar']) {
    if (!c[l].startsWith('10 ')) throw new Error(`P8 ${l} does not start with "10 "`);
    e[l] = c[l].slice(3);
  }
  entries.push(e);
}
// X1: owner approved correcting the English to "you receive a full refund."
{
  const c = cell('X1');
  const en = c.en.replace('you receive full refund back.', 'you receive a full refund.');
  if (en === c.en) throw new Error('X1 English not corrected');
  entries.push({ id: 'X1', en, de: c.de, fr: c.fr, ar: c.ar });
}
// C6 (optional table): English now is r[1], proposed English r[2], then de fr ar.
{
  const r = rows.C6;
  entries.push({ id: 'C6', en: r[2], de: r[3], fr: r[4], ar: r[5] });
}

// Collision checks against the current dictionary.
const src = fs.readFileSync(path.join(repo, 'app/vamos-i18n-dict.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const dictObj = sandbox.window.VamosI18nDict || sandbox.window.VAMOS_I18N || Object.values(sandbox.window).find((v) => v && v.strings);
const strings = dictObj.strings;
const report = [];
const translations = new Map();
for (const [k, v] of Object.entries(strings)) for (const l of ['de', 'fr', 'ar']) if (v[l]) translations.set(`${l}:${v[l]}`, k);
for (const e of entries) {
  if (strings[e.en]) report.push(`KEY EXISTS ${e.id}: ${e.en} -> ${JSON.stringify(strings[e.en])}`);
  for (const l of ['de', 'fr', 'ar']) {
    const other = translations.get(`${l}:${e[l]}`);
    if (other && other !== e.en) report.push(`REVERSE CLASH ${e.id} ${l}: "${e[l]}" already translates "${other}"`);
  }
}
const ownSeen = new Map();
for (const e of entries) for (const l of ['de', 'fr', 'ar']) {
  const k = `${l}:${e[l]}`;
  if (ownSeen.has(k)) report.push(`SELF CLASH ${e.id}/${ownSeen.get(k)} ${l}`);
  ownSeen.set(k, e.id);
}
process.stderr.write(`${entries.length} entries; ${report.length ? report.join('\n') : 'no collisions'}\n`);

const q = (s) => JSON.stringify(s);
for (const e of entries) {
  console.log(`      ${q(e.en)}: { de: ${q(e.de)}, fr: ${q(e.fr)}, ar: ${q(e.ar)} },`);
}
