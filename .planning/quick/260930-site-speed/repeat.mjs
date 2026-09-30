import { chromium } from "playwright-core";
const b = await chromium.launch({ args: ["--no-sandbox"] });
for (const page of ["/", "/faq", "/about"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  let n = 0, n304 = 0, net = 0; p.on("response", (r) => { n++; if (r.status() === 304) n304++; });
  const t = async () => { const s = Date.now(); await p.goto("https://vamostaxi.site" + page, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForLoadState("load").catch(()=>{}); await p.waitForTimeout(2500); return Date.now() - s; };
  await t(); const first = n; n = 0; n304 = 0;
  const cdp = await ctx.newCDPSession(p);
  await t();
  const nav = await p.evaluate(() => { const r = performance.getEntriesByType("resource"); return { total: r.length, fromNetwork: r.filter((x) => x.transferSize > 0).length, revalidated: r.filter((x) => x.transferSize > 0 && x.transferSize < 1000).length, bytesKB: Math.round(r.reduce((s, x) => s + x.transferSize, 0) / 1024) }; });
  const fcp = await p.evaluate(() => Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0));
  console.log(page.padEnd(7), "first visit", first, "responses | second visit:", JSON.stringify(nav), "304s", n304, "fcp", fcp);
  await ctx.close();
}
await b.close();
