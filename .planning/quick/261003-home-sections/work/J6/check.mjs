import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const root = '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections/.planning/quick/261003-home-sections';
const b = await chromium.launch();
const shots = new Set(['en-1440', 'de-768', 'ar-390', 'en-390']);
for (const file of ['TrustFacts', 'BusinessTravel']) {
  for (const lang of ['en', 'de', 'fr', 'ar']) {
    for (const w of [1440, 1024, 768, 390]) {
      const p = await b.newPage({ viewport: { width: w, height: 800 } });
      await p.goto(`http://127.0.0.1:4792/app/home/${file}.dc.html`);
      await p.waitForSelector('section', { timeout: 15000 });
      for (let t = 0; t < 4; t++) { try { await p.waitForFunction(() => window.VamosI18n && window.VamosI18n.strings && window.VamosLocale, null, { timeout: 8000 }); break; } catch (e) { if (t === 3) throw e; await p.reload(); } }
      await p.addScriptTag({ path: root + '/i18n/J6.js' });
      await p.evaluate((l) => {
        (window.__homeI18n || []).forEach((f) => { Object.assign(window.VamosI18n.strings, f.strings); (f.patterns || []).forEach((q) => window.VamosI18n.patterns.unshift(q)); });
        window.VamosLocale.setLang(l);
      }, lang);
      await p.waitForTimeout(500);
      const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, cov: window.VamosLocale.coverage(document.body, document.documentElement.lang === 'en' ? 'de' : document.documentElement.lang) }));
      console.log(file, lang, w, r.sw <= r.iw ? 'ok' : 'OVERFLOW ' + r.sw, JSON.stringify(r.cov));
      if (shots.has(`${lang}-${w}`)) await p.screenshot({ path: `${root}/screens/built-J6-${file}-${lang}-${w}.png`, fullPage: true });
      await p.close();
    }
  }
}
await b.close();
