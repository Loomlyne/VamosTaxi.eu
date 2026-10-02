// Probe: are the imprint "Client input" slots and the data-tok pills visible, per language?
// Usage: node probe-imprint.mjs <port>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');
const { chromium } = require(path.join(repo, 'node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core'));
const base = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1234');
const exe = fs.readdirSync(base).map((d) => path.join(base, d, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')).find((p) => fs.existsSync(p));
const port = process.argv[2];

const browser = await chromium.launch({ executablePath: exe, headless: true });
for (const lang of ['en', 'de', 'fr', 'ar']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript((l) => localStorage.setItem('vamosLang', l), lang);
  await page.goto(`http://127.0.0.1:${port}/app/pages/imprint.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.VamosLocale && document.querySelector('main'));
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({
    slots: [...document.querySelectorAll('[data-slot]')].map((n) => ({ display: getComputedStyle(n).display, visibleText: n.innerText.trim().slice(0, 80) })),
    toks: [...document.querySelectorAll('[data-tok]')].map((n) => ({ text: n.textContent.trim(), shown: n.innerText.trim(), display: getComputedStyle(n).display, after: getComputedStyle(n, '::after').content })),
    sections: ['aufsicht', 'dispute', 'haftung'].map((id) => ({ id, text: (document.getElementById(id) || {}).innerText })),
  }));
  console.log(lang, JSON.stringify(r));
  await ctx.close();
}
await browser.close();
