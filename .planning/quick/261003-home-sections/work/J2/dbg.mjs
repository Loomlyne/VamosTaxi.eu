import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', e => console.log('E', e.message));
await p.goto('http://127.0.0.1:4792/app/home/HowItWorks.dc.html'); await p.waitForTimeout(4000);
console.log(await p.evaluate(() => [document.querySelectorAll('[data-hiw-arrivals]').length, document.querySelectorAll('[data-hiw-sign]').length, document.body.innerText.slice(0,100)]));
await b.close();
