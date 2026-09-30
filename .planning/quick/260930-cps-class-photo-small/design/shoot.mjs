// Takes the option pictures. Run from the repo root: node .planning/quick/260930-cps-class-photo-small/design/shoot.mjs
import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const PORT = 4791, Q = ".planning/quick/260930-cps-class-photo-small";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2" };
const srv = http.createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    const data = await readFile(join(process.cwd(), path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => srv.listen(PORT, "127.0.0.1", r));
const br = await chromium.launch();
const only = process.argv[2];
try {
  for (const opt of ["A", "B", "C"]) {
    if (only && only !== opt) continue;
    const shots = [
      ["home", 1440, "en"], ["home", 1100, "en"], ["home", 1440, "de"], ["home", 1440, "ar"],
      ["checkout", 1440, "en"], ["checkout", 1024, "en"], ["checkout", 768, "en"], ["checkout", 390, "en"],
      ["checkout", 390, "de"], ["checkout", 390, "ar"], ["checkout", 768, "ar"],
    ];
    for (const [part, w, lang] of shots) {
      const page = await br.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${PORT}/${Q}/design/options.html?opt=${opt}&lang=${lang}&part=${part}`);
      await page.waitForFunction(() => document.fonts.status === "loaded" && [...document.images].every((i) => i.complete));
      await page.waitForTimeout(300);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) console.log(`SIDEWAYS ${opt} ${part} ${w} ${lang}: ${over}px`);
      await page.screenshot({ path: `${Q}/screens/opt-${opt}-${part}-${w}-${lang}.png`, fullPage: true });
      await page.close();
    }
  }
} finally { await br.close(); srv.close(); }
