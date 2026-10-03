// Read-only "before" crops of the live home sections. GET /api only; cookie banners hidden by CSS.
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const out = new URL('./screens/', import.meta.url).pathname;
const b = await chromium.launch();
for (const [w, h, tag] of [[1440, 900, '1440'], [390, 844, '390']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
  await p.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
  await p.goto('https://vamostaxi.site/', { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: '[data-sc-name="CookieBanner"],[data-ck-banner]{display:none!important}' });
  await p.waitForTimeout(2500);
  const labels = await p.$$eval('section', (s) => s.map((x) => x.getAttribute('data-screen-label') || x.getAttribute('aria-labelledby') || '?'));
  console.log(tag, labels.join(' | '));
  const sections = await p.$$('section');
  for (let i = 0; i < sections.length; i++) {
    await sections[i].scrollIntoViewIfNeeded();
    await p.waitForTimeout(500);
    const name = (labels[i] || 'sec').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    await sections[i].screenshot({ path: `${out}before-${String(i).padStart(2, '0')}-${name}-${tag}.png` });
  }
  await p.close();
}
await b.close();
