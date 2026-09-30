// Which server calls does each page make, how long do they take, and are they cacheable?
import { chromium } from "playwright-core";
const b = await chromium.launch({ args: ["--no-sandbox"] });
for (const page of ["/", "/faq", "/about", "/checkout"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const rows = [];
  p.on("requestfinished", async (req) => { try { const u = new URL(req.url()); if (u.origin !== "https://vamostaxi.site") { rows.push([req.method(), u.origin + u.pathname.slice(0, 40), "-", "-", "external"]); return; } if (!/^\/(api|_next\/data)/.test(u.pathname) && !req.resourceType().match(/fetch|xhr/)) return; const r = await req.response(); const t = req.timing(); rows.push([req.method(), u.pathname + (u.search ? "?…" : ""), r.status(), Math.round(t.responseEnd), (await r.allHeaders())["cache-control"] ?? "-"]); } catch {} });
  await p.goto("https://vamostaxi.site" + page, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForLoadState("load").catch(() => {}); await p.waitForTimeout(3500);
  console.log("\n##", page, rows.length, "calls");
  const agg = {}; for (const r of rows) { const k = r[0] + " " + r[1]; agg[k] = agg[k] || { n: 0, ms: [], st: r[2], cc: r[4] }; agg[k].n++; agg[k].ms.push(r[3]); }
  for (const [k, v] of Object.entries(agg)) console.log("  ", String(v.n).padStart(2) + "x", k.padEnd(62), "status", v.st, "ms", v.ms.join("/"), "|", v.cc);
  await ctx.close();
}
await b.close();
