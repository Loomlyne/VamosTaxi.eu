import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "https://vamostaxi.site";
const b = await chromium.launch({ args: ["--no-sandbox"] });
async function run(label, page, { w, h, mobile, cpu, block }) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const reqs = [];
  p.on("response", async (r) => { try { const l = Number((await r.allHeaders())["content-length"] ?? 0); reqs.push([r.url().replace(BASE, ""), l]); } catch {} });
  if (block) await p.route(block, (r) => r.abort());
  await p.addInitScript(`window.__cls=[];new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__cls.push({v:+e.value.toFixed(4),t:Math.round(e.startTime),n:(e.sources||[]).map(s=>{const n=s.node;return n?((n.tagName||'')+'.'+(n.className&&n.className.baseVal===undefined?String(n.className).slice(0,30):'')+'#'+(n.id||'')+' '+Math.round(s.previousRect.height)+'->'+Math.round(s.currentRect.height)):'?'})})}).observe({type:'layout-shift',buffered:true});window.__f=[];`);
  await p.goto(BASE + page, { waitUntil: "load" }); await p.waitForTimeout(3000);
  const cls = await p.evaluate(() => window.__cls);
  await p.evaluate(() => new Promise((res) => { let last = performance.now(); const t0 = last; (function tick(n) { window.__f.push(n - last); last = n; if (n - t0 < 4500) requestAnimationFrame(tick); else res(); })(last); }).then(()=>{}) , null).catch(()=>{});
  // scroll while frames are recorded
  const rec = p.evaluate(() => new Promise((res) => { window.__f = []; let last = performance.now(); const t0 = last; (function tick(n) { window.__f.push(n - last); last = n; if (n - t0 < 4500) requestAnimationFrame(tick); else res(); })(last); }));
  await p.waitForTimeout(150);
  const x = w / 2, y = h / 2;
  if (mobile) { await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -1800, speed: 1500, gestureSourceType: "touch" }); await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: 900, speed: 1500, gestureSourceType: "touch" }); }
  else { await p.mouse.move(x, y); for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(16); } for (let i = 0; i < 20; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(16); } }
  await rec;
  const f = (await p.evaluate(() => window.__f)).slice(1);
  const big = reqs.filter(([, l]) => l > 50000).sort((a, c) => c[1] - a[1]).slice(0, 8).map(([u, l]) => u.slice(0, 80) + " " + Math.round(l / 1024) + "KB");
  const babel = reqs.filter(([u]) => /babel/i.test(u)).map(([u, l]) => u + " " + Math.round(l/1024) + "KB");
  console.log(`\n## ${label} ${page}  maxFrame=${Math.round(Math.max(...f))}ms over25=${f.filter((d) => d > 25).length}/${f.length}  clsTotal=${cls.reduce((s, c) => s + c.v, 0).toFixed(3)}  babel=${JSON.stringify(babel)}`);
  if (label.startsWith("base")) { console.log(" cls:", JSON.stringify(cls).slice(0, 900)); console.log(" big:", big.join(" | ")); }
  await ctx.close();
}
const L = { w: 1440, h: 900, mobile: false, cpu: 1 }, P = { w: 390, h: 844, mobile: true, cpu: 4 };
for (const page of ["/", "/about"]) {
  await run("base laptop", page, L);
  await run("images-blocked laptop", page, { ...L, block: /\/photos\// });
}
await run("base phone", "/", P);
await run("images-blocked phone", "/", { ...P, block: /\/photos\// });
await b.close();
