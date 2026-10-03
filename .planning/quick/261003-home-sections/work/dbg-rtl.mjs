// Debug: RTL arrow transforms in the full home, Arabic.
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.route('**/api/quote', (r) => r.fulfill({ json: { ok: true, classes: [{ slug: 'saden', name: 'Economy', effective_max_pax: 3, max_bags: 3, photo_url: '/assets/photography/class-economy.jpg' }], fixed_routes: [] } }));
await p.addInitScript(() => { try { localStorage.setItem('vamosLang', 'ar'); } catch (e) {} });
await p.goto('http://127.0.0.1:4792/app/home/home.dc.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(5000);
console.log(await p.evaluate(() => {
  const pick = (sel) => { const e = document.querySelector(sel); if (!e) return sel + ' none'; const c = getComputedStyle(e); const closest = e.closest('[dir]'); return sel + ' transform=' + c.transform + ' display=' + c.display + ' nearestDir=' + (closest ? closest.tagName + ':' + closest.getAttribute('dir') : 'none'); };
  return [document.documentElement.getAttribute('dir'), pick('[data-ww-arrow]'), pick('[data-ww-chev]'), pick('[data-vc-arrow]'), pick('[data-svc-go-arrow]')].join('\n');
}));
await b.close();
