import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const root = '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections/.planning/quick/261003-home-sections';
const b = await chromium.launch();
const out = [];
for (const lang of ['en', 'de', 'fr', 'ar']) for (const w of [1440, 1024, 768, 390]) {
  const pg = await b.newPage({ viewport: { width: w, height: 900 } });
  await pg.goto('http://127.0.0.1:4792/app/home/FAQ.dc.html');
  await pg.waitForSelector('[data-faq-card]');
  await pg.waitForFunction(() => window.VamosLocale && window.VamosI18n && window.VamosI18n.strings, null, { timeout: 30000 });
  await pg.waitForTimeout(800);
  await pg.addScriptTag({ path: root + '/i18n/J7.js' });
  await pg.evaluate((l) => { (window.__homeI18n || []).forEach(f => { Object.assign(window.VamosI18n.strings, f.strings); (f.patterns || []).forEach(p => window.VamosI18n.patterns.unshift(p)); }); window.VamosLocale.setLang(l); }, lang);
  await pg.waitForTimeout(500);
  const r = await pg.evaluate(() => ({
    sw: document.documentElement.scrollWidth, iw: innerWidth,
    cov: window.VamosLocale.coverage(document.body),
    openLine: (() => { const c = document.querySelector('[data-faq-set][data-on="1"] [data-faq-card][data-open="1"]'); const t = c.querySelector('[data-faq-toggle]'); return getComputedStyle(t).borderBottomWidth + '/' + getComputedStyle(c.querySelector('[data-faq-inner]')).borderTopWidth; })(),
  }));
  out.push([lang, w, r.sw <= r.iw, JSON.stringify(r.cov), r.openLine].join(' | '));
  if ((lang === 'en' && (w === 1440 || w === 390)) || (lang === 'de' && w === 768) || (lang === 'ar' && w === 390)) {
    await pg.screenshot({ path: `${root}/screens/built-J7-${lang}-${w}.png`, fullPage: true });
  }
  if (lang === 'en' && w === 1440) {
    await pg.click('#faq-t2'); await pg.waitForTimeout(400);
    const s = await pg.evaluate(() => [document.querySelector('#faq-t2').getAttribute('aria-selected'), document.querySelector('#faq-q5').getAttribute('aria-expanded'), document.querySelector('#faq-q6').getAttribute('aria-expanded'), document.querySelector('#faq-s1').dataset.on]);
    await pg.click('#faq-q6'); await pg.waitForTimeout(400);
    const s2 = await pg.evaluate(() => [document.querySelector('#faq-q5').getAttribute('aria-expanded'), document.querySelector('#faq-q6').getAttribute('aria-expanded')]);
    await pg.focus('#faq-t2'); await pg.keyboard.press('ArrowDown'); await pg.waitForTimeout(200);
    const s3 = await pg.evaluate(() => document.querySelector('#faq-t3').getAttribute('aria-selected'));
    out.push('interaction ' + JSON.stringify([s, s2, s3]));
    await pg.screenshot({ path: `${root}/screens/built-J7-en-1440-airport.png`, fullPage: true });
  }
  await pg.close();
}
console.log(out.join('\n'));
await b.close();
