import { chromium } from "playwright-core";
const b = await chromium.launch({ args: ["--no-sandbox"] });
const INIT = `window.__cls=[];new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput&&e.value>0.002) window.__cls.push({v:+e.value.toFixed(3),t:Math.round(e.startTime),n:(e.sources||[]).slice(0,3).map(s=>{const n=s.node;return n?((n.tagName||'')+(n.id?'#'+n.id:'')+' '+Math.round(s.previousRect.y)+'/'+Math.round(s.previousRect.height)+'->'+Math.round(s.currentRect.y)+'/'+Math.round(s.currentRect.height)):'?'})})}).observe({type:'layout-shift',buffered:true});`;
for (const [page, size] of [["/faq","laptop"],["/faq","phone"],["/about","phone"],["/","phone"]]) {
  const phone = size === "phone";
  const ctx = await b.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone });
  const p = await ctx.newPage(); await p.addInitScript(INIT);
  await p.goto("https://vamostaxi.site" + page, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForLoadState("load").catch(()=>{}); await p.waitForTimeout(3500);
  const c = await p.evaluate(() => window.__cls);
  console.log(page, size, "total", c.reduce((s, x) => s + x.v, 0).toFixed(3)); for (const x of c) console.log("   ", x.v, "@", x.t + "ms", x.n.join(" | "));
  await ctx.close();
}
// Arabic font stylesheet
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addCookies([{ name: "NEXT_LOCALE", value: "ar", url: "https://vamostaxi.site" }]);
const p = await ctx.newPage(); const msgs = []; p.on("console", (m) => { if (/font|style-src|Refused/i.test(m.text())) msgs.push(m.text().slice(0, 160)); }); const failed = []; p.on("requestfailed", (r) => { if (/googleapis|gstatic/.test(r.url())) failed.push(r.url().slice(0, 100) + " " + r.failure()?.errorText); });
await p.goto("https://vamostaxi.site/ar", { waitUntil: "load", timeout: 60000 }).catch(()=>{}); await p.waitForTimeout(3000);
console.log("ar page console:", JSON.stringify(msgs), "failed requests:", JSON.stringify(failed));
await b.close();
