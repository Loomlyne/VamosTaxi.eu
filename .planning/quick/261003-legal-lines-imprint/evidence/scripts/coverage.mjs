// Runs VamosLocale.coverage(document.body) on the five legal mocks in de, fr, ar,
// checks sideways scroll at 390 px, and (optionally) takes section screenshots.
// Usage: node coverage.mjs <port> <outFile.json> [shots-dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');
const { chromium } = require(path.join(repo, 'node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core'));
const exe = fs.readdirSync(path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1234'))
  .map((d) => path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1234', d,
    'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
  .find((p) => fs.existsSync(p));

const port = process.argv[2];
const out = process.argv[3];
const shots = process.argv[4];
const pages = ['terms', 'privacy', 'cookies', 'cancellation', 'imprint'];
const langs = ['de', 'fr', 'ar'];

// Section screenshots: [page, text that sits in the changed section]
const sections = [
  ['terms', 'Who you contract with'],
  ['terms', 'Fixed price'],
  ['terms', 'Payment'],
  ['privacy', 'Who processes it'],
  ['privacy', 'How long we keep it'],
  ['cookies', 'Strictly necessary'],
  ['cookies', 'Functional'],
  ['cancellation', 'If no driver arrives'],
  ['imprint', '#aufsicht..#haftung'],
];

const browser = await chromium.launch({ executablePath: exe, headless: true });
const result = {};

async function open(ctx, name, lang) {
  const page = await ctx.newPage();
  await page.addInitScript((l) => { try { localStorage.setItem('vamosLang', l); localStorage.setItem('vamosConsent', 'x'); } catch (e) {} }, lang);
  await page.goto(`http://127.0.0.1:${port}/app/pages/${name}.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.VamosLocale && document.querySelector('main'), null, { timeout: 30000 });
  await page.evaluate((l) => window.VamosLocale.setLang(l), lang);
  await page.addStyleTag({ content: '[data-sc-name="CookieBanner"],[data-ck-banner]{display:none!important}' });
  await page.waitForTimeout(1200);
  return page;
}

for (const name of pages) {
  result[name] = {};
  for (const lang of langs) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await open(ctx, name, lang);
    const cov = await page.evaluate((l) => window.VamosLocale.coverage(document.body, l), lang);
    const toks = await page.evaluate(() => [...document.querySelectorAll('[data-tok]')].map((n) => n.textContent.trim()));
    result[name][lang] = { count: cov.count, strings: cov.strings, attrs: cov.attrs, dataTok: toks };
    await ctx.close();
  }
  // sideways scroll at 390 in ar and de
  for (const lang of ['ar', 'de']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await open(ctx, name, lang);
    const sw = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    result[name][`overflow390_${lang}`] = sw;
    await ctx.close();
  }
}

if (shots) {
  fs.mkdirSync(shots, { recursive: true });
  for (const [name, text] of sections) {
    for (const [lang, w, h] of [['ar', 390, 844], ['de', 1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 2 : 1 });
      const page = await open(ctx, name, lang);
      // find the section by its English heading in the source: use data attribute-free match on the h2 index
      const box = await page.evaluate((t) => {
        if (t.startsWith('#')) {
          const [a, b] = t.split('..').map((s) => document.querySelector(s));
          a.scrollIntoView({ block: 'start' });
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return { x: 0, y: Math.max(0, ra.top + window.scrollY - 8), w: document.documentElement.clientWidth, h: rb.bottom - ra.top + 16 };
        }
        const tr = window.VamosLocale.t(t) || t;
        const heads = [...document.querySelectorAll('main h2, main h3, main dt, main th')];
        const h = heads.find((x) => x.textContent.trim() === tr || x.textContent.includes(tr));
        if (!h) return null;
        const sec = h.closest('section') || h.parentElement;
        sec.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -100);
        const r = sec.getBoundingClientRect();
        return { x: 0, y: Math.max(0, r.top + window.scrollY - 8), w: document.documentElement.clientWidth, h: Math.min(r.height + 16, 2400) };
      }, text);
      const file = path.join(shots, `${name}-${text.toLowerCase().replace(/[^a-z]+/g, '-')}-${lang}-${w}.png`);
      if (box) await page.screenshot({ path: file, fullPage: true, clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
      else result[`shot-miss:${file}`] = true;
      await ctx.close();
    }
  }
}

await browser.close();
fs.writeFileSync(out, JSON.stringify(result, null, 2));
for (const name of pages) {
  console.log(name, langs.map((l) => `${l}:${result[name][l].count}`).join(' '),
    'ovf390', ['ar', 'de'].map((l) => `${l}:${result[name][`overflow390_${l}`].scrollWidth}/${result[name][`overflow390_${l}`].clientWidth}`).join(' '));
}
