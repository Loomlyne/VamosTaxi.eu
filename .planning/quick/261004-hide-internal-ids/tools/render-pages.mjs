import { chromium } from "@playwright/test";
const base = "http://127.0.0.1:47391"; const root = process.argv[2] || "app";
const pages = (process.env.PAGES || "pages/contact.html,pages/faq.html").split(",");
const b = await chromium.launch();
let fail = 0;
for (const pg of pages) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });
  await p.goto(`${base}/${root}/${pg.replace(/\.html$/, process.argv[2] ? ".dc.html" : ".html").replace(".dc.dc.", ".dc.")}`, { waitUntil: "networkidle" }).catch((e) => errs.push(e.message));
  await p.waitForTimeout(2500);
  const text = (await p.locator("body").innerText().catch(() => "")).length;
  const real = errs.filter((e) => !/Failed to load resource|\/api\/|ERR_CONNECTION|404|net::/.test(e));
  if (real.length || text < 500) fail += 1;
  console.log(pg, p.url(), "text", text, JSON.stringify((await p.locator("body").innerText().catch(()=>"")).slice(0,120)), real.length ? real.slice(0, 3) : "ok");
  await ctx.close();
}
await b.close();
process.exit(fail ? 1 : 0);
