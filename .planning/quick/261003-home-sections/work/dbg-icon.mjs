// Debug: inspect the tab icon and header logo inside the full home.
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const bad = [];
p.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/') && !r.url().includes('/photos/')) bad.push(r.status() + ' ' + r.url()); });
p.on('requestfailed', (r) => bad.push('FAILED ' + r.url().slice(0, 160)));
await p.goto('http://127.0.0.1:4792/app/home/home.dc.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(5000);
const info = await p.evaluate(() => {
  const tab = document.querySelector('[data-ww-tab]');
  const first = tab && tab.firstElementChild;
  const cs = first ? getComputedStyle(first) : null;
  const deep = tab ? Array.from(tab.querySelectorAll('*')).map((e) => { const c = getComputedStyle(e); return e.tagName + ' ' + c.width + 'x' + c.height + ' mask=' + (c.maskImage || c.webkitMaskImage || '').slice(0, 120) + ' bg=' + c.backgroundColor; }) : [];
  const logo = document.querySelector('img[alt="Vamos Taxi"]');
  return { tabHTML: tab ? tab.outerHTML.slice(0, 600) : null, deep, logo: logo ? logo.src : null };
});
console.log(JSON.stringify(info, null, 1));
console.log(bad.slice(0, 15).join('\n'));
await b.close();
