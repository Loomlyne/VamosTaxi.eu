// Merges i18n/J*.js fragments into app/vamos-i18n-dict.js as one block. Prints collisions; --write applies.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url).pathname;
const dictPath = root + 'app/vamos-i18n-dict.js';
const fragDir = new URL('../i18n/', import.meta.url).pathname;
const src = readFileSync(dictPath, 'utf8');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const live = ctx.window.VamosI18n;
const existing = live.strings;
const existingRe = new Set(live.patterns.map((p) => String(p.re)));

const strings = {};
const patterns = [];
const seenRe = new Set();
for (const f of readdirSync(fragDir).filter((n) => /^J\d\.js$/.test(n)).sort()) {
  const c = { window: {} };
  vm.createContext(c);
  vm.runInContext(readFileSync(fragDir + f, 'utf8'), c);
  for (const frag of c.window.__homeI18n || []) {
    for (const [k, v] of Object.entries(frag.strings || {})) {
      for (const l of ['de', 'fr', 'ar']) if (!v[l]) console.log('MISSING', f, l, JSON.stringify(k));
      if (existing[k]) {
        const same = ['de', 'fr', 'ar'].every((l) => existing[k][l] === v[l]);
        if (!same) console.log('DIFFERS (kept existing)', f, JSON.stringify(k));
        continue;
      }
      if (strings[k] && ['de', 'fr', 'ar'].some((l) => strings[k][l] !== v[l])) console.log('JOB CLASH (first wins)', f, JSON.stringify(k));
      if (!strings[k]) strings[k] = { de: v.de, fr: v.fr, ar: v.ar };
    }
    for (const p of frag.patterns || []) {
      const key = String(p.re);
      if (existingRe.has(key) || seenRe.has(key)) { console.log('PATTERN EXISTS', f, key); continue; }
      seenRe.add(key);
      patterns.push(p);
    }
  }
}
const q = (s) => JSON.stringify(s);
const lines = [];
lines.push('  /* Home sections 261003 (classes, routes, airport, services, reviews, trust, business, FAQ, closing band). */');
lines.push('  (function () {');
lines.push('    var S = DICT.strings, P = DICT.patterns;');
for (const [k, v] of Object.entries(strings)) lines.push(`    S[${q(k)}] = { de: ${q(v.de)}, fr: ${q(v.fr)}, ar: ${q(v.ar)} };`);
for (const p of patterns) lines.push(`    P.push({ re: ${String(p.re)}, de: ${q(p.de)}, fr: ${q(p.fr)}, ar: ${q(p.ar)} });`);
lines.push('  })();', '');
console.log(`new strings ${Object.keys(strings).length}, new patterns ${patterns.length}`);
const anchor = '  /* A runtime loaded before this file (the design-system bundle ships one)';
if (!src.includes(anchor)) throw new Error('anchor missing');
if (process.argv.includes('--write')) {
  writeFileSync(dictPath, src.replace(anchor, lines.join('\n') + '\n' + anchor));
  console.log('written');
}
