// Next banner (CookieBanner.tsx, messages JSON) on the local Worker build, no database.
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/ga4-gtm/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const OUT = new URL('.', import.meta.url).pathname;
const BASE = process.argv[2] || 'http://127.0.0.1:4787';
const paths = ['/checkout', '/no-such-page'];
const res = [];
const browser = await chromium.launch();
for (const lang of ['en', 'de', 'fr', 'ar']) for (const p of paths) for (const w of [1440, 1024, 768, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.route('**/api/consent/state**', (r) => r.fulfill({ json: { ok: true, chosen: false, policyVersion: '2026-10-13' } }));
  await ctx.route('**/api/**', (r) => r.fulfill({ json: { ok: true } }));
  await ctx.route(/googletagmanager|facebook|google|doubleclick|cloudflareinsights|challenges\.cloudflare|mapbox/, (r) => r.abort());
  const pg = await ctx.newPage();
  const errors = [];
  const url = BASE + (lang === 'en' ? '' : '/' + lang) + p;
  const resp = await pg.goto(url, { waitUntil: 'load', timeout: 60000 }).catch((e) => { errors.push(e.message.slice(0, 100)); return null; });
  await pg.waitForFunction(() => document.body && document.body.innerText.includes('Tag Manager'), null, { timeout: 15000 }).catch(() => errors.push('no Tag Manager text'));
  const r = await pg.evaluate(() => {
    const de = document.documentElement;
    const n = [...document.querySelectorAll('body *')].filter((e) => e.children.length < 3 && (e.textContent || '').includes('Tag Manager') && e.getClientRects().length).pop();
    const b = n ? n.getBoundingClientRect() : null;
    return { dir: de.dir || 'ltr', overflow: de.scrollWidth - de.clientWidth, inside: b ? b.left >= -1 && b.right <= de.clientWidth + 1 : null, text: n ? n.textContent.trim().slice(0, 140) : '' };
  });
  const file = `next-${lang}${p.replace(/\//g, '-')}-${w}.png`;
  await pg.screenshot({ path: OUT + file });
  res.push({ lang, path: p, width: w, status: resp ? resp.status() : 0, ...r, errors, file });
  console.log(lang, p, w, 'status=' + (resp ? resp.status() : 0), 'dir=' + r.dir, 'overflow=' + r.overflow, 'inside=' + r.inside, errors.join('|'));
  await ctx.close();
}
await browser.close();
writeFileSync(OUT + 'next-results.json', JSON.stringify(res, null, 2));
