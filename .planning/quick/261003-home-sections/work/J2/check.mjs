import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const R = '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections/.planning/quick/261003-home-sections';
const browser = await chromium.launch();
const quote = { ok: true, classes: [{ slug: 'mercedes-benz-v-class', name: 'Business', effective_max_pax: 7, max_bags: 6 }], fixed_routes: [
  { key: 'a', from: 'Zurich Airport, The Circle 16, 8302 Kloten, Switzerland', to: 'Davos, the Grisons, Switzerland', from_mapbox_id: 'f1', to_mapbox_id: 't1' },
  { key: 'b', from: 'Zurich Airport, The Circle 16, 8302 Kloten, Switzerland', to: 'St. Moritz, the Grisons, Switzerland', from_mapbox_id: 'f1', to_mapbox_id: 't2' }] };
const out = [];
for (const file of ['WhereWeDrive', 'HowItWorks']) {
  for (const w of [1440, 1024, 768, 390]) {
    for (const lang of ['en', 'de', 'fr', 'ar']) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.route('**/api/quote*', (r) => r.fulfill({ json: quote }));
      await page.goto(`http://127.0.0.1:4792/app/home/${file}.dc.html`);
      await page.waitForTimeout(3000);
      await page.addScriptTag({ path: `${R}/i18n/J2.js` });
      await page.evaluate((lang) => { (window.__homeI18n || []).forEach((f) => { Object.assign(window.VamosI18n.strings, f.strings); (f.patterns || []).forEach((p) => window.VamosI18n.patterns.unshift(p)); }); window.VamosLocale.setLang(lang); }, lang);
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, cov: (window.VamosLocale.coverage ? window.VamosLocale.coverage(document.body) : []) }));
      out.push(`${file} ${lang} ${w} sw=${r.sw}/${r.iw} cov=${JSON.stringify(r.cov)}`);
      if ((lang === 'en' && (w === 1440 || w === 390)) || (lang === 'de' && w === 768) || (lang === 'ar' && w === 390)) {
        await page.screenshot({ path: `${R}/screens/built-J2-${file === 'HowItWorks' ? 'hiw-' : ''}${lang}-${w}.png`, fullPage: true });
      }
      if (file === 'WhereWeDrive' && lang === 'en' && w === 1440) {
        // keyboard + pick
        await page.evaluate(() => { window.__d = []; window.addEventListener('vamos:dest-pick', (e) => { window.__d.push(e.detail); }); });
        await page.focus('#ww-tab-zrh');
        await page.keyboard.press('ArrowRight');
        const sel = await page.evaluate(() => document.activeElement.id + ' ' + document.activeElement.getAttribute('aria-selected'));
        await page.keyboard.press('End');
        const sel2 = await page.evaluate(() => document.activeElement.id);
        await page.click('#ww-tab-zrh');
        const rows = await page.$$eval('[data-ww-row]', (e) => e.map((x) => x.innerText.replace(/\s+/g, ' ')));
        await page.click('[data-ww-row] >> nth=0');
        await page.click('[data-ww-row] >> nth=3');
        out.push('keys: ' + sel + ' | ' + sel2 + ' | rows ' + JSON.stringify(rows) + ' | events ' + JSON.stringify(await page.evaluate(() => window.__d)));
      }
      await page.close();
    }
  }
}
// board failure
const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p2.route('**/api/quote*', (r) => r.abort());
await p2.goto('http://127.0.0.1:4792/app/home/WhereWeDrive.dc.html');
await p2.waitForTimeout(1500);
out.push('fail rows: ' + (await p2.$$eval('[data-ww-row]', (e) => e.length)));
// HIW meet card rect check at rest
const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p3.route('**/api/quote*', (r) => r.fulfill({ json: quote }));
await p3.goto('http://127.0.0.1:4792/app/home/HowItWorks.dc.html');
await p3.waitForTimeout(5000);
out.push('overlap: ' + JSON.stringify(await p3.evaluate(() => { const a = document.querySelector('[data-hiw-arrivals]').getBoundingClientRect(); const s = document.querySelector('[data-hiw-sign]').getBoundingClientRect(); const rows = [...document.querySelectorAll('[data-hiw-arrivals-row]')].map((r) => Math.round(r.getBoundingClientRect().bottom)); return { arrBottom: a.bottom, signTop: s.top, signBottom: s.bottom, rows }; })));
await p3.screenshot({ path: `${R}/screens/built-J2-hiw-card-1440.png` });
console.log(out.join('\n'));
await browser.close();
