// Before = live vamostaxi.site (read-only). After = the local test lab (LAB_BASE). Header strip only; the cookie
// card is hidden by script, never clicked (a click on live writes a consent row).
import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.WEB_DIR + "/package.json")("@playwright/test");
const out = new URL(".", import.meta.url).pathname;
const b = await chromium.launch();
for (const [tag, base] of [["before", "https://vamostaxi.site"], ["after", process.env.LAB_BASE]])
  for (const path of ["/checkout", "/ar/checkout"]) for (const w of [390, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 400 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.route(/\/api\/fx/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"base":"CHF","rates":{"CHF":1,"EUR":1,"USD":1,"AED":1},"rate":1}' }));
    await p.goto(base + path, { waitUntil: "load", timeout: 45000 }); await p.waitForTimeout(2500);
    await p.evaluate(() => { for (const e of document.querySelectorAll("*")) { const cs = getComputedStyle(e); if (cs.position === "fixed" && !e.closest("header") && !e.querySelector("header")) e.style.display = "none"; } });
    const name = `${tag}-${path.includes("/ar/") ? "ar" : "en"}-${w}.png`;
    await p.screenshot({ path: out + name, clip: { x: 0, y: 0, width: w, height: 76 } });
    console.log(name);
    await ctx.close();
  }
await b.close();
