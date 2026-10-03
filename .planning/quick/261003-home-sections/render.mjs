// Renders the signing sketches: node render.mjs <sketch-basename> <variants comma> <langs comma>
import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';
const [name = 'sketch-classes', vs = 'a,b', ls = 'en,de,ar'] = process.argv.slice(2);
const dir = new URL('./', import.meta.url); const web = 'http://127.0.0.1:4791/.planning/quick/261003-home-sections/';
const b = await chromium.launch();
for (const v of vs.split(',')) for (const lang of ls.split(',')) for (const w of [1440, 768, 390]) {
  if (lang !== 'en' && w === 768) continue;
  const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: w < 500 ? 2 : 1 });
  await p.goto(web + `${name}.html?v=${v}&lang=${lang}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (sideways) console.log('SIDEWAYS', v, lang, w);
  await p.locator('section').first().screenshot({ path: new URL(`screens/${name.replace('sketch-', '')}-${v}-${lang}-${w}.png`, dir).pathname });
  await p.close();
}
await b.close();
console.log('done');
