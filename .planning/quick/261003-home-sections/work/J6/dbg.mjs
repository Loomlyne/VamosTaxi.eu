import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('response', r => { if (r.url().includes('icons') || r.status() >= 400) console.log(r.status(), r.url()); });
await p.goto('http://127.0.0.1:4792/app/home/TrustFacts.dc.html');
await p.waitForTimeout(4000);
console.log(await p.evaluate(() => document.querySelector('[data-tile]').innerHTML));
await b.close();
