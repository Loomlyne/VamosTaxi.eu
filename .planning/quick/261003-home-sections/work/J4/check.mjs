import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const root = '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections';
const out = root + '/.planning/quick/261003-home-sections/screens/';
const b = await chromium.launch();
const page = await (await b.newContext()).newPage();
await page.route('**/photos/site/*', r => r.fulfill({ path: root + '/assets/photography/' + r.request().url().split('/').pop() }));
for (const lang of ['en', 'de', 'fr', 'ar']) {
  for (const w of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('http://127.0.0.1:4792/app/home/Services.dc.html');
    await page.waitForSelector('[data-svc-card]');
    await page.addScriptTag({ path: root + '/.planning/quick/261003-home-sections/i18n/J4.js' });
    await page.evaluate((l) => { (window.__homeI18n || []).forEach(f => { Object.assign(window.VamosI18n.strings, f.strings); (f.patterns || []).forEach(p => window.VamosI18n.patterns.unshift(p)); }); window.VamosLocale.setLang('en'); window.VamosLocale.setLang(l); }, lang);
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, cov: window.VamosLocale.coverage(document.body), cards: [...document.querySelectorAll('[data-svc-card]')].map(c => { const q = c.getBoundingClientRect(); return Math.round(q.left) + 'x' + Math.round(q.top) + ' h' + Math.round(q.height); }).join(' | ') }));
    console.log(lang, w, r.sw <= r.iw ? 'ok' : 'OVERFLOW', JSON.stringify(r.cov), r.cards);
    if ((lang === 'en' && (w === 1440 || w === 390)) || (lang === 'de' && w === 768) || (lang === 'ar' && w === 390)) await page.screenshot({ path: `${out}built-J4-${lang}-${w}.png`, fullPage: true });
  }
}
await b.close();
