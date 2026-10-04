#!/usr/bin/env node
// png-diff: count the pixels that differ between two PNGs (decoded in Chromium, no extra library).
// Usage: node png-diff.mjs a.png b.png [a2.png b2.png ...]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const files = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
for (let i = 0; i + 1 < files.length; i += 2) {
  const [a, b] = [files[i], files[i + 1]].map((f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`);
  const r = await page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
    const [x, y] = await Promise.all([load(a), load(b)]);
    if (x.width !== y.width || x.height !== y.height) return { size: `${x.width}x${x.height} vs ${y.width}x${y.height}` };
    const px = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    const p = px(x), q = px(y);
    let diff = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let k = 0; k < p.length; k += 4) {
      if (p[k] !== q[k] || p[k + 1] !== q[k + 1] || p[k + 2] !== q[k + 2] || p[k + 3] !== q[k + 3]) {
        diff++;
        const n = k / 4, X = n % x.width, Y = Math.floor(n / x.width);
        minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
      }
    }
    return { size: `${x.width}x${x.height}`, diff, box: diff ? `${minX},${minY}-${maxX},${maxY}` : "" };
  }, [a, b]);
  console.log(`${files[i].split("/").pop()} vs ${files[i + 1].split("/").pop()}: ${JSON.stringify(r)}`);
}
await browser.close();
