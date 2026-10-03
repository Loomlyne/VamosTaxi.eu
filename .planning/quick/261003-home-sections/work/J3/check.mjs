import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const ROOT = '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections/.planning/quick/261003-home-sections';
const browser = await chromium.launch();
const out = [];
for (const file of ['AirportMeet', 'ClosingCta']) {
  for (const w of [1440, 1024, 768, 390]) {
    for (const lang of ['en', 'de', 'fr', 'ar']) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      await page.goto(`http://127.0.0.1:4792/app/home/${file}.dc.html`, { waitUntil: 'networkidle' });
      await page.waitForSelector(file === 'AirportMeet' ? '[data-meet]' : '[data-cta]', { state: 'attached' });
      for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.VamosI18n && window.VamosLocale && document.querySelector('[data-meet-title],[data-cta-title]')))); i++) await page.waitForTimeout(500);
      await page.waitForTimeout(500);
      await page.addScriptTag({ path: `${ROOT}/i18n/J3.js` });
      await page.evaluate((l) => {
        (window.__homeI18n || []).forEach((f) => { Object.assign(window.VamosI18n.strings, f.strings); (f.patterns || []).forEach((p) => window.VamosI18n.patterns.unshift(p)); });
        window.VamosLocale.setLang(l);
      }, lang);
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: innerWidth,
        cov: window.VamosLocale.coverage(document.body),
        dir: document.documentElement.dir,
      }));
      out.push(`${file} ${lang} ${w} overflow=${r.sw > r.iw} dir=${r.dir} cov=${JSON.stringify(r.cov)} errs=${errs.length}`);
      if ((w === 1440 && lang === 'en') || (w === 768 && lang === 'de') || (w === 390 && (lang === 'ar' || lang === 'en')) || (w === 1440 && lang === 'de')) {
        await page.screenshot({ path: `${ROOT}/screens/built-J3-${file}-${lang}-${w}.png`, fullPage: true });
      }
      await page.close();
    }
  }
}
// interactions
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4792/app/home/ClosingCta.dc.html', { waitUntil: 'networkidle' });
await page.evaluate(() => { const d = document.createElement('div'); d.id = 'book'; d.style.cssText = 'height:2000px;margin-top:1500px'; document.body.append(d); });
await page.click('[data-cta-btn="primary"]');
await page.waitForTimeout(2500);
out.push('scrollY after click ' + await page.evaluate(() => Math.round(scrollY)) + ' bookTop ' + await page.evaluate(() => Math.round(document.getElementById('book').getBoundingClientRect().top)));
out.push('hrefs ' + await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') + '|' + a.rel).join(' ; ')));
const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p2.goto('http://127.0.0.1:4792/app/home/AirportMeet.dc.html', { waitUntil: 'networkidle' });
out.push('meet hrefs ' + await p2.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') + '|' + a.rel + '|' + a.textContent).join(' ; ')));
await browser.close();
console.log(out.join('\n'));
