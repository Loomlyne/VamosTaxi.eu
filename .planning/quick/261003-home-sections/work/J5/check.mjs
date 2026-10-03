import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const ROOT = '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections/.planning/quick/261003-home-sections';
const URL = 'http://127.0.0.1:4792/app/home/Reviews.dc.html';
const ALL = [
  { id: 'a1', source: 'google', authorName: 'Anna K.', body: 'Driver was waiting at arrivals with a sign. Smooth ride to Zermatt, no surprises on the price.', rating: 5, routeLabel: 'Zurich Airport to Zermatt', sourceUrl: 'https://www.google.com/maps/reviews/abc', verified: true, published: true, sortOrder: 1 },
  { id: 'a2', source: 'google', authorName: 'Marc B.', body: 'Short and clear.', rating: 4, routeLabel: '', sourceUrl: 'https://evil.example.com/google', published: true, sortOrder: 2 },
  { id: 'a3', source: 'trustpilot', authorName: 'Layla H.', body: 'A longer review keeps its full text in this layout, so the wall grows unevenly like a real set of reviews. Nothing is cut, the card simply gets taller, and it keeps going for a few more lines to prove the point.', rating: 5, routeLabel: 'Zurich to Davos', sourceUrl: 'https://www.trustpilot.com/reviews/xyz', published: true, sortOrder: 3 },
  { id: 'a4', source: 'tripadvisor', authorName: 'Jean P.', body: 'Medium length text, about two lines, from the traveller.', rating: 3, routeLabel: 'Zurich to Basel', sourceUrl: '', published: true, sortOrder: 4 },
  { id: 'a5', source: 'tripadvisor', authorName: 'Sam T.', body: 'Very good.', rating: 4, routeLabel: '', sourceUrl: 'javascript:alert(1)', published: true, sortOrder: 5 },
  { id: 'a6', source: 'google', authorName: 'Omar R.', body: 'On time, clean car.', rating: 5, routeLabel: 'Geneva Airport to Verbier', sourceUrl: 'https://maps.google.ch/x', published: true, sortOrder: 6 },
  { id: 'a7', source: 'manual', authorName: 'Eva L.', body: 'Collected by us directly.', rating: 5, routeLabel: '', sourceUrl: '', published: true, sortOrder: 7 },
  { id: 'a8', source: 'trustpilot', authorName: 'Noor A.', body: 'Great service.', rating: 5, routeLabel: '', sourceUrl: '', published: true, sortOrder: 8 },
];
const MERGE = `(window.__homeI18n||[]).forEach(f => { Object.assign(window.VamosI18n.strings, f.strings); (f.patterns||[]).forEach(p => window.VamosI18n.patterns.unshift(p)); });`;
const browser = await chromium.launch();
const out = [];
for (const n of [0, 2, 3, 8]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/api/reviews', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: ALL.slice(0, n) }) }));
  await page.goto(URL);
  await page.waitForTimeout(2500);
  await page.addScriptTag({ path: ROOT + '/i18n/J5.js' });
  await page.evaluate(MERGE);
  const info = await page.evaluate(() => {
    const s = document.querySelector('#reviews');
    return {
      section: !!s,
      chips: [...document.querySelectorAll('[data-rv-chip]')].map((c) => c.textContent.trim().replace(/\s+/g, ' ')),
      cards: document.querySelectorAll('article[data-rv-card]').length,
      links: [...document.querySelectorAll('a[data-rv-mark]')].map((a) => a.href),
      filled: [...document.querySelectorAll('article[data-rv-card]')].map((a) => a.querySelectorAll('[data-rv-star]:not([data-off])').length).join(','),
      h: document.body.scrollHeight,
    };
  });
  out.push({ n, ...info });
  if (n === 8) {
    for (const lang of ['en', 'de', 'fr', 'ar']) {
      for (const w of [1440, 1024, 768, 390]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.evaluate((l) => window.VamosLocale.setLang(l), lang);
        await page.waitForTimeout(400);
        const r = await page.evaluate(() => {
          const cov = (window.VamosLocale.coverage(document.querySelector('#reviews')) || []);
          return { sw: document.documentElement.scrollWidth, iw: innerWidth, cov, chip: document.querySelector('[data-rv-chip-n]')?.textContent };
        });
        console.log(lang, w, JSON.stringify(r));
        if ((lang === 'en' && (w === 1440 || w === 390)) || (lang === 'de' && w === 768) || (lang === 'ar' && w === 390)) {
          await page.locator('#reviews').screenshot({ path: `${ROOT}/screens/built-J5-${lang}-${w}.png` });
        }
      }
    }
  }
  await ctx.close();
}
// loading state: delayed response
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/api/reviews', async (r) => { await new Promise((f) => setTimeout(f, 3000)); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: ALL.slice(0, 3) }) }); });
  await page.goto(URL);
  await page.waitForTimeout(1200);
  const sk = await page.evaluate(() => ({ skeleton: !!document.querySelector('[data-rv-skeleton]'), busy: document.querySelector('#reviews')?.getAttribute('aria-busy') }));
  await page.locator('#reviews').screenshot({ path: `${ROOT}/screens/built-J5-loading-en-1440.png` });
  await page.waitForTimeout(3000);
  out.push({ loading: sk, after: await page.evaluate(() => document.querySelectorAll('article[data-rv-card]').length) });
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
