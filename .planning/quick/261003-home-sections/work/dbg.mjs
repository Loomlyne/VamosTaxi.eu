// Debug: load the synced home with no stubs and print sections, errors and failed requests.
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
const logs = [];
p.on('pageerror', (e) => logs.push('ERR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') logs.push('CON ' + m.text().slice(0, 200)); });
p.on('response', (r) => { if (r.status() >= 400) logs.push(r.status() + ' ' + r.url().replace('http://127.0.0.1:4792', '')); });
await p.goto('http://127.0.0.1:4792/app/home/home.dc.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(6000);
console.log(await p.evaluate(() => [Array.from(document.querySelectorAll('section')).map((s) => s.getAttribute('data-screen-label') || s.id || s.getAttribute('aria-labelledby')).join(' | '), !!document.getElementById('faq'), document.body.innerText.length]));
console.log(logs.slice(0, 25).join('\n'));
await b.close();
