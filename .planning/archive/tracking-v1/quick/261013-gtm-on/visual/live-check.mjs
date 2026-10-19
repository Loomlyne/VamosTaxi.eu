// Live, read-only: which ad/analytics hosts does vamostaxi.site call before and after Accept all?
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/ga4-gtm/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/Users/koss/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const hits = [];
p.on('request', (r) => { const u = r.url(); if (/googletagmanager|google-analytics|googleadservices|doubleclick|facebook\.(com|net)|connect\.facebook/.test(u)) hits.push({ t: phase, u: u.slice(0, 110) }); });
let phase = 'before';
await p.goto('https://vamostaxi.site/about', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(4000);
console.log('before Accept:', hits.length, 'requests to Google/Meta hosts');
const btn = p.getByRole('button', { name: /accept all/i }).first();
console.log('accept button found:', await btn.count());
phase = 'after';
if (await btn.count()) { await btn.click(); }
await p.waitForTimeout(15000);
await p.goto('https://vamostaxi.site/faq', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await p.waitForTimeout(6000);
const st = await p.evaluate(() => fetch('/api/consent/state', { credentials: 'same-origin' }).then((r) => r.json()));
console.log('consent state after click:', JSON.stringify(st));
const after = hits.filter((h) => h.t === 'after');
const tag = (re) => after.filter((h) => re.test(h.u)).length;
console.log('after: gtag G-K5MZME44P6 script:', tag(/gtag\/js\?id=G-K5MZME44P6/), '| gtm.js GTM-KPKGT4VH:', tag(/gtm\.js\?id=GTM-KPKGT4VH/), '| gtag AW-368142830:', tag(/id=AW-368142830/), '| fbevents:', tag(/fbevents/), '| GA4 collect:', tag(/google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/), '| FB tr:', tag(/facebook\.com\/tr/));
for (const h of hits) console.log(h.t, h.u);
const cookies = (await ctx.cookies()).map((c) => c.name).filter((n) => /^_ga|^_gcl|^_fb/.test(n));
console.log('ad cookies:', cookies.join(','));
await b.close();
