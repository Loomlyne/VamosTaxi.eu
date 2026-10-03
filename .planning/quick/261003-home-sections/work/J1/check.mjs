import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const ROOT = '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections/.planning/quick/261003-home-sections';
const URL = 'http://127.0.0.1:4792/app/home/VehicleClasses.dc.html';
const full = { ok: true, classes: [
  { slug: 'saden', name: 'Economy', effective_max_pax: 3, max_bags: 3, photo_url: '/assets/photography/class-economy.jpg' },
  { slug: 'mercedes-benz-v-class', name: 'Business', effective_max_pax: 7, max_bags: 6, photo_url: '/assets/photography/class-business.jpg' },
  { slug: 'van-luxury', name: 'Van luxury', effective_max_pax: 12, max_bags: 9, photo_url: '/assets/photography/class-van.jpg' },
] };
const browser = await chromium.launch();
const out = [];
async function open(w, payload, { delay = 0, fail = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/api/quote*', async (r) => {
    if (delay) await new Promise((s) => setTimeout(s, delay));
    if (fail) return r.fulfill({ status: 500, body: 'x' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.goto(URL);
  return page;
}
async function setLang(page, lang) {
  await page.addScriptTag({ path: ROOT + '/i18n/J1.js' });
  await page.evaluate((l) => {
    (window.__homeI18n || []).forEach((f) => { Object.assign(window.VamosI18n.strings, f.strings); (f.patterns || []).forEach((p) => window.VamosI18n.patterns.unshift(p)); });
    window.VamosLocale.setLang(l);
  }, lang);
  await page.waitForTimeout(400);
}
for (const w of [1440, 1024, 768, 390]) {
  for (const lang of ['en', 'de', 'fr', 'ar']) {
    const page = await open(w, full);
    await page.waitForSelector('[data-vc-card]:not([data-vc-sk])');
    if (lang !== 'en') await setLang(page, lang);
    const r = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: innerWidth,
      cov: window.VamosLocale.coverage(document.body),
      dir: document.documentElement.dir,
      cards: document.querySelectorAll('[data-vc-card]:not([data-vc-sk])').length,
    }));
    out.push(`${w} ${lang}: sw=${r.sw} iw=${r.iw} ok=${r.sw <= r.iw} cards=${r.cards} dir=${r.dir} cov=${JSON.stringify(r.cov)}`);
    const shot = (lang === 'en' && (w === 1440 || w === 390)) || (lang === 'de' && w === 768) || (lang === 'ar' && w === 390) || (lang === 'de' && w === 1440);
    if (shot) await (await page.$('[data-vc]')).screenshot({ path: `${ROOT}/screens/built-J1-${lang}-${w}.png` });
    await page.context().close();
  }
}
// states
{
  const page = await open(1440, full, { delay: 1500 });
  await page.waitForSelector('[data-vc-sk]');
  out.push('loading skeletons=' + await page.locator('[data-vc-sk]').count());
  await (await page.$('[data-vc]')).screenshot({ path: `${ROOT}/screens/built-J1-en-1440-loading.png` });
  await page.context().close();
}
{
  const page = await open(1440, null, { fail: true });
  await page.waitForTimeout(800);
  out.push('error section count=' + await page.locator('[data-vc]').count());
  await page.context().close();
}
{
  const page = await open(1440, { ok: true, classes: [] });
  await page.waitForTimeout(800);
  out.push('zero section count=' + await page.locator('[data-vc]').count());
  await page.context().close();
}
{
  const page = await open(1440, { ok: true, classes: [full.classes[0], { slug: 'other', name: 'Other', effective_max_pax: 1, max_bags: 1, photo_url: '' }] });
  await page.waitForSelector('[data-vc-card]:not([data-vc-sk])');
  out.push('two cards=' + await page.locator('[data-vc-card]').count() + ' who lines=' + await page.locator('[data-vc-who]').count() + ' text=' + (await page.locator('[data-vc-specs]').nth(1).innerText()).replace(/\n/g, ' | '));
  await page.context().close();
}
// click: event + scroll
{
  const page = await open(1440, full);
  await page.waitForSelector('[data-vc-card]:not([data-vc-sk])');
  await page.evaluate(() => {
    window.__picked = null; window.addEventListener('vamos:class-pick', (e) => { window.__picked = e.detail.slug; });
    const d = document.createElement('div'); d.id = 'book'; d.style.cssText = 'height:3000px;margin-top:2000px'; document.body.appendChild(d);
  });
  await page.locator('[data-vc-cta]').nth(1).click();
  await page.waitForTimeout(1200);
  out.push('click picked=' + await page.evaluate(() => window.__picked) + ' scrollY=' + await page.evaluate(() => Math.round(scrollY)) + ' bookTop=' + await page.evaluate(() => Math.round(document.getElementById('book').getBoundingClientRect().top)));
  await page.locator('[data-vc-cta]').first().focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await (await page.$('[data-vc]')).screenshot({ path: `${ROOT}/screens/built-J1-en-1440-focus.png` });
  await page.context().close();
}
console.log(out.join('\n'));
await browser.close();
