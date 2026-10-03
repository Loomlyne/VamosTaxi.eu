// Layout check of a composed sheet html (no wrapped rows, nothing wider than the sheet, every picture loaded).
// usage: node sheet-check.mjs <sheet html>
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [file] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 800 } });
await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
await page.waitForTimeout(400);
const r = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  height: document.documentElement.scrollHeight,
  wrappedRows: [...document.querySelectorAll(".row")].filter((row) => new Set([...row.children].map((c) => Math.round(c.getBoundingClientRect().top))).size > 1).length,
  rows: document.querySelectorAll(".row").length,
  pictures: document.images.length,
  notLoaded: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
  missing: document.querySelectorAll(".na").length,
  bordered: [...document.images].filter((i) => getComputedStyle(i).borderTopWidth !== "0px" || getComputedStyle(i).outlineStyle !== "none" || getComputedStyle(i).boxShadow !== "none").length,
}));
console.log(JSON.stringify(r));
await browser.close();
