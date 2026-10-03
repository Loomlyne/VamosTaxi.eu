// Full home check on the static public folder (port 4792): every section, 4 languages x 4 widths,
// sideways scroll, coverage, page errors; click proofs; signing pictures. All /api stubbed (no live calls).
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const BASE = 'http://127.0.0.1:4792/app/home/home.dc.html';
const out = new URL('../screens/', import.meta.url).pathname;
const only = process.argv[2] || 'all';
const BOARD = { ok: true, classes: [
  { slug: 'saden', name: 'Economy', effective_max_pax: 3, max_bags: 3, photo_url: '/assets/photography/class-economy.jpg', eligible: true, lines: [], total_rappen: null },
  { slug: 'mercedes-benz-v-class', name: 'Business', effective_max_pax: 7, max_bags: 6, photo_url: '/assets/photography/class-business.jpg', eligible: true, lines: [], total_rappen: null },
  { slug: 'van-luxury', name: 'Van luxury', effective_max_pax: 12, max_bags: 9, photo_url: '/assets/photography/class-van.jpg', eligible: true, lines: [], total_rappen: null }],
  fixed_routes: [
    { key: 'a', from: 'Zurich Airport, The Circle 16-Flughafen CH, 8302 Kloten, Switzerland', to: 'Davos, the Grisons, Switzerland', from_mapbox_id: 'ZRHID', to_mapbox_id: 'DAVOSID' },
    { key: 'b', from: 'Zurich Airport, The Circle 16-Flughafen CH, 8302 Kloten, Switzerland', to: 'St. Moritz, the Grisons, Switzerland', from_mapbox_id: 'ZRHID', to_mapbox_id: 'STMID' }] };
const src = ['google', 'trustpilot', 'tripadvisor'];
const REVIEWS = { ok: true, data: Array.from({ length: 6 }, (_, i) => ({ id: 'r' + i, source: src[i % 3], authorName: 'Traveller ' + (i + 1), authorRole: '', body: i % 2 ? 'Short review text for the layout check.' : 'A longer review text for the layout check, two sentences long. It shows how the wall grows.', rating: 5 - (i % 2), routeLabel: 'Zurich Airport → Zermatt', vehicleClassSlug: null, avatarPath: null, sourceUrl: null, verified: true, published: true, sortOrder: i })) };
const stub = async (page) => {
  await page.route('**/api/**', async (r) => {
    const u = r.request().url();
    if (u.includes('/api/quote') && !u.includes('?')) return r.fulfill({ json: BOARD });
    if (u.includes('/api/reviews')) return r.fulfill({ json: REVIEWS });
    if (u.includes('/api/fx')) return r.fulfill({ json: { ok: true, rates: {} } });
    if (u.includes('/api/auth/session')) return r.fulfill({ json: { ok: true, user: null } });
    if (u.includes('/api/consent/state')) return r.fulfill({ json: { ok: true, state: null } });
    if (u.includes('/api/geo/retrieve')) return r.fulfill({ json: { ok: true, place: { isAirport: true } } });
    return r.fulfill({ status: 503, json: { ok: false } });
  });
  await page.route('**/photos/site/**', (r) => { const f = r.request().url().split('/photos/site/')[1].split('?')[0]; return r.continue({ url: 'http://127.0.0.1:4792/assets/photography/' + f }); });
};
const LABELS = ['How it works', 'Vehicle', 'Where', 'Airport', 'Services', 'Reviews', 'Trust', 'Business', 'FAQ', 'Closing'];
const b = await chromium.launch();
let fails = 0;
const open = async (w, lang, tries = 3) => {
  for (let i = 1; ; i++) {
    try { return await open1(w, lang); } catch (e) { if (i >= tries) throw e; console.log('retry load', lang, w); }
  }
};
const open1 = async (w, lang) => {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: w < 500 ? 2 : 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message || e)));
  await stub(p);
  await p.addInitScript((l) => { try { localStorage.setItem('vamosLang', l); localStorage.setItem('vamosConsent', '1'); } catch (e) {} }, lang);
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: '[data-sc-name="CookieBanner"],[data-ck-banner]{display:none!important}' });
  await p.waitForFunction(() => window.VamosLocale && document.querySelector('#faq'), null, { timeout: 60000 }).catch(async () => { await p.close(); throw new Error('load'); });
  await p.evaluate((l) => window.VamosLocale.setLang(l), lang);
  // scroll through once so lazy/observed sections paint
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(800);
  return { p, errs };
};
if (only === 'all' || only === 'matrix') {
  for (const lang of ['en', 'de', 'fr', 'ar']) for (const w of [1440, 1024, 768, 390]) {
    const { p, errs } = await open(w, lang);
    const r = await p.evaluate(() => {
      const sideways = document.documentElement.scrollWidth > innerWidth + 1;
      const cov = window.VamosLocale.coverage ? window.VamosLocale.coverage(document.querySelector('main') || document.body) : [];
      const ids = ['faq'].filter((id) => !document.getElementById(id));
      const text = document.body.innerText;
      return { sideways, sw: document.documentElement.scrollWidth, cov: (Array.isArray(cov) ? cov : (cov && (cov.strings || []).concat(cov.attrs || [])) || []).slice(0, 12), raw: Array.isArray(cov) ? null : JSON.stringify(cov).slice(0, 200), missing: ids, len: text.length };
    });
    const bad = r.sideways || (lang !== 'en' && r.cov.length) || errs.length || r.missing.length;
    if (bad) fails++;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${lang} ${w} sideways=${r.sideways}(${r.sw}) cov=${JSON.stringify(r.cov)} errs=${JSON.stringify(errs.slice(0, 3))}`);
    if ((lang === 'en' && w === 1440) || (lang === 'de' && w === 768) || (lang === 'ar' && w === 390) || (lang === 'en' && w === 390)) {
      await p.screenshot({ path: `${out}built-home-${lang}-${w}.png`, fullPage: true });
    }
    await p.close();
  }
}
if (only === 'all' || only === 'clicks') {
  const { p, errs } = await open(1440, 'en');
  const row = p.locator('text=Davos').first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await p.waitForTimeout(800);
  const vals = await p.evaluate(() => Array.from(document.querySelectorAll('input')).map((i) => i.value).filter(Boolean).slice(0, 6));
  console.log('route Davos -> inputs', JSON.stringify(vals));
  const row2 = p.locator('[role="tab"]', { hasText: 'Geneva' }).first();
  await row2.scrollIntoViewIfNeeded(); await row2.click(); await p.waitForTimeout(300);
  await p.locator('text=Lausanne').first().click(); await p.waitForTimeout(800);
  console.log('route GVA Lausanne -> inputs', JSON.stringify(await p.evaluate(() => Array.from(document.querySelectorAll('input')).map((i) => i.value).filter(Boolean).slice(0, 6))));
  const topic = p.locator('[role="tab"]', { hasText: 'At the airport' }).first();
  await topic.scrollIntoViewIfNeeded(); await topic.click(); await p.waitForTimeout(300);
  console.log('faq open after topic switch:', await p.evaluate(() => Array.from(document.querySelectorAll('[aria-expanded="true"]')).map((e) => e.textContent.trim().slice(0, 40))));
  const cls = p.locator('text=Price this class').nth(1);
  await cls.scrollIntoViewIfNeeded(); await cls.click(); await p.waitForTimeout(1200);
  console.log('after Price this class, #book top =', await p.evaluate(() => { const e = document.getElementById('book'); return e ? Math.round(e.getBoundingClientRect().top) : null; }));
  console.log('click errors', JSON.stringify(errs));
  await p.close();
}
if (only === 'shots') {
  for (const [lang, w] of [['en', 1440], ['ar', 390]]) {
    const { p } = await open(w, lang);
    const secs = await p.$$('section');
    for (let i = 0; i < secs.length; i++) {
      const label = (await secs[i].getAttribute('data-screen-label')) || (await secs[i].getAttribute('aria-labelledby')) || 'sec';
      await secs[i].scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
      await secs[i].screenshot({ path: `${out}built-sec-${String(i).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${lang}-${w}.png` });
    }
    await p.close();
  }
}
await b.close();
console.log('FAILS', fails);
