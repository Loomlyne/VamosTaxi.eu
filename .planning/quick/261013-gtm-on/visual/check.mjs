// Visual check of the GTM wording on the DC mock pages: 3 languages x 3 pages x 4 widths.
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/ga4-gtm/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const OUT = new URL('.', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:4777';
const pages = { home: '/app/home/home.html', cookies: '/app/pages/cookies.html', privacy: '/app/pages/privacy.html' };
const widths = [1440, 1024, 768, 390];
const langs = ['en', 'de', 'ar'];
const results = [];
const browser = await chromium.launch();
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const lang of langs) for (const [name, path] of Object.entries(pages)) for (const w of widths) {
  if (ONLY && !ONLY.includes(`${lang}-${name}-${w}`)) continue;
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript((l) => { try { localStorage.setItem('vamosLang', l); } catch (e) {} }, lang);
  await ctx.route('**/api/consent/state**', (r) => r.fulfill({ json: { ok: true, chosen: false, policyVersion: '2026-10-13' } }));
  await ctx.route('**/api/**', (r) => r.fulfill({ json: { ok: true } }));
  await ctx.route(/googletagmanager|facebook|google|doubleclick|cloudflareinsights|challenges\.cloudflare/, (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => errors.push('goto ' + e.message.slice(0, 80)));
  await p.waitForFunction(() => document.body && document.body.innerText.includes('Tag Manager'), null, { timeout: 20000 }).catch(() => errors.push('no Tag Manager text after 20s'));
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const overflow = de.scrollWidth - de.clientWidth;
    const all = [...document.querySelectorAll('body *')].filter((n) => n.children.length === 0 || [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes('Tag Manager')));
    const hits = all.filter((n) => (n.textContent || '').includes('Tag Manager') && n.getClientRects().length);
    const boxes = hits.map((n) => { const b = n.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), text: n.textContent.trim().slice(0, 90) }; });
    const outside = boxes.filter((b) => b.l < -1 || b.r > de.clientWidth + 1);
    return { dir: de.getAttribute('dir') || 'ltr', lang: de.getAttribute('lang'), overflow, hits: boxes.length, outside, sample: boxes[0]?.text || '' };
  });
  const file = `${lang}-${name}-${w}.png`;
  const target = p.locator(':is(p,li,td,div,span):has-text("Tag Manager")').last();
  if (await target.count()) { await target.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(200); }
  await p.screenshot({ path: OUT + file });
  results.push({ lang, page: name, width: w, ...r, errors, file });
  await ctx.close();
}
await browser.close();
writeFileSync(OUT + (process.env.ONLY ? 'results-rerun.json' : 'results.json'), JSON.stringify(results, null, 2));
for (const x of results) console.log([x.lang, x.page, x.width, 'dir=' + x.dir, 'overflow=' + x.overflow, 'hits=' + x.hits, 'outside=' + x.outside.length, x.errors.length ? 'ERR ' + x.errors[0] : ''].join(' '));
