// Read-only: live hero (first screen) and footer, desktop and phone; also dumps the reviews the home fetched.
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const out = new URL('./screens/', import.meta.url).pathname;
const b = await chromium.launch();
for (const [w, h, tag] of [[1440, 900, '1440'], [390, 844, '390']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
  const seen = [];
  p.on('response', (r) => { if (r.url().includes('/api/')) seen.push(r.request().method() + ' ' + r.url().replace('https://vamostaxi.site', '') + ' ' + r.status()); });
  await p.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
  await p.goto('https://vamostaxi.site/', { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: '[data-sc-name="CookieBanner"],[data-ck-banner]{display:none!important}' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}before-hero-${tag}.png` });
  const foot = await p.$('footer');
  if (foot) { await foot.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await foot.screenshot({ path: `${out}before-footer-${tag}.png` }); }
  if (tag === '1440') console.log(seen.join('\n'));
  await p.close();
}
await b.close();
