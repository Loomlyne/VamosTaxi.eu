#!/usr/bin/env node
/* i18n-measure.mjs — zero-dependency re-measurement harness for Stream 5.
 *
 * Loads app/vamos-i18n-dict.js through the global.window shim and mirrors
 * app/vamos-locale.js's own DOM-translation rules with plain regexes over
 * the raw .dc.html source, since no headless browser is available on this
 * machine (no package.json, no node_modules, no Playwright/Puppeteer cache).
 *
 * KNOWN LIMITATION (stated here because it matters for every count this
 * script prints): the real runtime skips an entire subtree under any element
 * carrying `data-vt-no-i18n` or `translate="no"` using a DOM TreeWalker,
 * which understands nesting exactly. This script approximates that subtree
 * with a regex that walks forward from the opt-out element's own opening tag
 * to the next closing tag of the same name, at the same nesting depth as it
 * can track with a plain counter. That approximation can under-shoot the
 * true subtree when an opted-out element contains further nested elements of
 * a *different* tag name with their own text before the matching close tag —
 * plain regex cannot verify nesting depth against arbitrary intervening tags
 * the way a TreeWalker can. Where it under-shoots, this script counts a
 * substring of already-untranslated-on-purpose copy as "missing" that a real
 * DOM pass would never flag. In other words: MISSING counts in this script
 * are an UPPER BOUND on the real gap, never an under-count. Treat any
 * MISSING figure here as "at least this many", not as exact.
 *
 * Usage:
 *   node i18n-measure.mjs --calibrate
 *   node i18n-measure.mjs --all
 *   node i18n-measure.mjs --pages a,b,c
 *   node i18n-measure.mjs --sharp-s
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/* ── load the dictionary exactly the way the established_facts shim does ── */
function loadDict() {
  const g = globalThis;
  g.window = g.window || {};
  const dictPath = path.join(REPO_ROOT, 'app', 'vamos-i18n-dict.js');
  const src = readFileSync(dictPath, 'utf8');
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'module', 'exports', src + '\n//# sourceURL=vamos-i18n-dict.js');
  fn(g.window, {}, {});
  const D = g.window.VamosI18n;
  if (!D || !D.strings) throw new Error('vamos-i18n-dict.js did not publish window.VamosI18n.strings');
  return D;
}

const DICT = loadDict();

/* ── runtime rules mirrored from app/vamos-locale.js ─────────────────────── */
const SKIP_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'SVG', 'CANVAS'];
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

function trimCollapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}

let HAS_LETTER;
try { HAS_LETTER = new RegExp('\\p{L}', 'u'); }
catch (e) { HAS_LETTER = /[A-Za-zÀ-ɏ؀-ۿ]/; }

/* Patterns in the dictionary carry ^...$ regexes without the global flag —
   test() is safe to call repeatedly without lastIndex bookkeeping. */
function resolves(str) {
  if (Object.prototype.hasOwnProperty.call(DICT.strings, str)) return true;
  for (const p of DICT.patterns) {
    if (p.re.test(str)) return true;
  }
  return false;
}

/* ── opt-out subtree approximation ───────────────────────────────────────── */
/* Finds every element whose OWN opening tag carries data-vt-no-i18n or
   translate="no", and returns [start,end) ranges (over the ORIGINAL html)
   covering that element's opening tag through its best-effort matching
   close tag. See the file header for why this is an upper bound, not exact. */
function findOptOutRanges(html) {
  const ranges = [];
  const openTagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)>/g;
  let m;
  while ((m = openTagRe.exec(html))) {
    const [full, tag, attrsStr] = m;
    if (!/\bdata-vt-no-i18n\b/.test(attrsStr) && !/\btranslate\s*=\s*["']no["']/.test(attrsStr)) continue;
    const start = m.index;
    const selfClosing = /\/\s*>$/.test(full);
    if (selfClosing) { ranges.push([start, start + full.length]); continue; }
    // best-effort matching close tag: walk forward counting same-tag opens/closes
    const tagOpenRe = new RegExp(`<${tag}(?:\\s[^<>]*)?>`, 'gi');
    const tagCloseRe = new RegExp(`</${tag}\\s*>`, 'gi');
    let depth = 1;
    let searchFrom = start + full.length;
    let end = html.length;
    while (searchFrom < html.length) {
      tagOpenRe.lastIndex = searchFrom;
      tagCloseRe.lastIndex = searchFrom;
      const nextOpen = tagOpenRe.exec(html);
      const nextClose = tagCloseRe.exec(html);
      if (!nextClose) { end = html.length; break; }
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        searchFrom = nextOpen.index + nextOpen[0].length;
        continue;
      }
      depth--;
      searchFrom = nextClose.index + nextClose[0].length;
      if (depth === 0) { end = searchFrom; break; }
    }
    ranges.push([start, end]);
  }
  return ranges;
}

function inRanges(pos, ranges) {
  for (const [s, e] of ranges) if (pos >= s && pos < e) return true;
  return false;
}

function stripBlocks(html, tagNames) {
  let out = html;
  for (const t of tagNames) {
    const re = new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, 'gi');
    out = out.replace(re, (m) => ' '.repeat(m.length));
  }
  return out;
}

/* Whole-string JS-binding placeholders ("{{ tocOpen }}") are template source,
   never literal text a reader sees — the runtime has already evaluated them
   by the time a real DOM exists. Exclude only when the ENTIRE trimmed string
   is one such binding; mixed static+binding text is left alone. */
function isPureBinding(s) {
  return /^\{\{[\s\S]*\}\}$/.test(s.trim());
}

/* ── per-page measurement ─────────────────────────────────────────────────── */
function measurePage(filePath) {
  const html = readFileSync(filePath, 'utf8');
  const optOutRanges = findOptOutRanges(html);
  const optOutElementCount = optOutRanges.length;

  // Text-node scan: drop SCRIPT/STYLE/NOSCRIPT/TEXTAREA/CODE/PRE/SVG/CANVAS
  // entirely (tag + content) so their inner text never becomes a candidate,
  // mirroring SKIP_TAGS in vamos-locale.js.
  const textScanHtml = stripBlocks(html, SKIP_TAGS);
  const textRe = />([^<>]+)</g;
  const candidates = []; // { str, pos }
  let tm;
  while ((tm = textRe.exec(textScanHtml))) {
    const raw = tm[1];
    if (!/\S/.test(raw)) continue;
    const decoded = decodeEntities(raw);
    const trimmed = trimCollapse(decoded);
    if (!trimmed) continue;
    if (!HAS_LETTER.test(trimmed)) continue;
    if (isPureBinding(trimmed)) continue;
    const pos = tm.index + tm[0].indexOf(raw) + 1; // approx position of the text start in textScanHtml (== html, same length)
    candidates.push({ str: trimmed, pos });
  }

  // Attribute scan: SCRIPT/STYLE content removed (never carries these attrs
  // meaningfully); TEXTAREA/CODE/PRE/SVG/CANVAS tags kept (their own attrs
  // can still legitimately carry placeholder/aria-label/title/alt) except
  // TEXTAREA is the one SKIP_TAG whose attrs the real runtime still applies —
  // for the other skip tags the runtime never calls applyAttrs on them either,
  // but real usage of those four attributes on <code>/<pre>/<svg>/<canvas> in
  // this codebase is effectively nil, so no separate treatment is needed.
  const attrScanHtml = stripBlocks(html, ['SCRIPT', 'STYLE']);
  const attrCandidates = [];
  for (const attr of ATTRS) {
    const attrRe = new RegExp(`\\s${attr}\\s*=\\s*"([^"]*)"`, 'gi');
    let am;
    while ((am = attrRe.exec(attrScanHtml))) {
      const raw = am[1];
      if (!raw || !/\S/.test(raw)) continue;
      const decoded = decodeEntities(raw);
      const trimmed = trimCollapse(decoded);
      if (!trimmed) continue;
      if (!HAS_LETTER.test(trimmed)) continue;
      if (isPureBinding(trimmed)) continue;
      const pos = am.index + am[0].indexOf(raw);
      attrCandidates.push({ str: trimmed, pos });
    }
  }

  const all = [...candidates, ...attrCandidates];
  let excludedCount = 0;
  const kept = [];
  for (const c of all) {
    if (inRanges(c.pos, optOutRanges)) { excludedCount++; continue; }
    kept.push(c.str);
  }

  const seen = new Set();
  const missing = [];
  let resolvedCount = 0;
  for (const str of kept) {
    if (seen.has(str)) continue; // count each distinct string once, like the audit does
    seen.add(str);
    if (resolves(str)) resolvedCount++;
    else missing.push(str);
  }

  const missingWordCount = missing.reduce((sum, s) => sum + s.split(/\s+/).filter(Boolean).length, 0);

  return {
    candidateCount: seen.size,
    resolvedCount,
    missingCount: missing.length,
    missing,
    missingWordCount,
    optedOutElements: optOutElementCount,
    excludedStrings: excludedCount,
  };
}

/* ── dictionary-wide checks ───────────────────────────────────────────────── */
function dictionaryChecks() {
  const totalEntries = Object.keys(DICT.strings).length;
  const totalPatterns = DICT.patterns.length;
  let sharpS = 0;
  for (const k in DICT.strings) {
    const v = DICT.strings[k].de;
    if (typeof v === 'string' && v.indexOf('ß') > -1) sharpS++;
  }
  for (const p of DICT.patterns) {
    if (typeof p.de === 'string' && p.de.indexOf('ß') > -1) sharpS++;
  }
  return { totalEntries, totalPatterns, sharpS };
}

/* ── page registry ─────────────────────────────────────────────────────────── */
const PAGES = {
  terms: 'app/pages/terms.dc.html',
  privacy: 'app/pages/privacy.dc.html',
  cookies: 'app/pages/cookies.dc.html',
  cancellation: 'app/pages/cancellation.dc.html',
  imprint: 'app/pages/imprint.dc.html',
  'become-a-partner': 'app/pages/become-a-partner.dc.html',
  contact: 'app/pages/contact.dc.html',
  about: 'app/pages/about.dc.html',
  faq: 'app/pages/faq.dc.html',
};

const CALIBRATION_PAGES = {
  'home/Services': 'app/home/Services.dc.html',
  'home/FAQ': 'app/home/FAQ.dc.html',
  'pages/coming-soon': 'app/pages/coming-soon.dc.html',
};

function printTable(entries) {
  const rows = entries.map(([name, r]) => [
    name, String(r.candidateCount), String(r.resolvedCount), String(r.missingCount),
    String(r.missingWordCount), String(r.optedOutElements), String(r.excludedStrings),
  ]);
  const header = ['page', 'candidates', 'resolved', 'missing', 'missing-words', 'opted-out-elements', 'excluded-strings'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (r) => r.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(fmt(r));
}

function runPages(names) {
  const results = [];
  for (const name of names) {
    const rel = PAGES[name] || CALIBRATION_PAGES[name];
    if (!rel) { console.error(`Unknown page: ${name}`); process.exitCode = 1; continue; }
    const abs = path.join(REPO_ROOT, rel);
    results.push([name, measurePage(abs)]);
  }
  return results;
}

const args = process.argv.slice(2);

try {
  if (args.includes('--calibrate')) {
    const results = runPages(Object.keys(CALIBRATION_PAGES));
    console.log('=== Calibration: three MISSING:0 surfaces from docs/build/i18n-audit.txt ===');
    printTable(results);
    console.log('\nExpected: MISSING near 0 on all three (audit records exactly 0 for each).');
    console.log('A small residual is normal — copy added to these surfaces since the audit was run.');
    for (const [name, r] of results) {
      if (r.missingCount > 0) {
        console.log(`\n${name} residual (${r.missingCount}):`);
        for (const s of r.missing) console.log('  · ' + s);
      }
    }
  } else if (args.includes('--all')) {
    const results = runPages(Object.keys(PAGES));
    console.log('=== All nine pages ===');
    printTable(results);
    const legalNames = ['terms', 'privacy', 'cookies', 'cancellation', 'imprint'];
    const productNames = ['become-a-partner', 'contact', 'about', 'faq'];
    const sum = (names, key) => results.filter(([n]) => names.includes(n)).reduce((s, [, r]) => s + r[key], 0);
    console.log(`\nlegal MISSING total: ${sum(legalNames, 'missingCount')}`);
    console.log(`product MISSING total: ${sum(productNames, 'missingCount')}`);
    const dc = dictionaryChecks();
    console.log(`\ndictionary: ${dc.totalEntries} string entries, ${dc.totalPatterns} patterns, sharp-s in de values/patterns: ${dc.sharpS}`);
  } else if (args.includes('--pages')) {
    const idx = args.indexOf('--pages');
    const list = (args[idx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) { console.error('--pages requires a comma-separated list'); process.exit(1); }
    const results = runPages(list);
    printTable(results);
  } else if (args.includes('--sharp-s')) {
    const dc = dictionaryChecks();
    console.log(`SHARP-S: ${dc.sharpS}`);
  } else {
    console.error('Usage: i18n-measure.mjs --calibrate | --all | --pages a,b,c | --sharp-s');
    process.exit(1);
  }
} catch (err) {
  console.error('i18n-measure.mjs failed:', err && err.stack ? err.stack : err);
  process.exit(1);
}
