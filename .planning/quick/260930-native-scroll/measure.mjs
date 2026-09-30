// Site speed and scroll measurement. Same script for live and for a local Worker build.
// usage: BASE=https://vamostaxi.site OUT=live.json CH=<chrome path> node measure.mjs
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "https://vamostaxi.site";
const OUT = process.env.OUT ?? "result.json";
const REPEAT = Number(process.env.REPEAT ?? 2);
const PAGES = (process.env.PAGES ?? "/,/faq,/about,/checkout").split(",");
const SIZES = {
  laptop: { viewport: { width: 1440, height: 900 }, cpu: 1, mobile: false },
  phone: { viewport: { width: 390, height: 844 }, cpu: 4, mobile: true },
};
const VARIANTS = (process.env.VARIANTS ?? "base,nolenis").split(",");

const INIT = `
(() => {
  window.__m = { lcp: 0, cls: 0, longtasks: [], loaf: [], scrollHandlers: 0, frames: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration || 0), scripts: (e.scripts || []).map(s => [s.sourceURL.split('/').slice(-2).join('/') || s.invokerType, s.invoker.slice(0, 40), Math.round(s.duration)]) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (t, fn, o) {
    if (t === 'scroll' || t === 'wheel' || t === 'touchmove') {
      const w = function (...a) { window.__m.scrollHandlers++; return fn.apply(this, a); };
      return orig.call(this, t, typeof fn === 'function' ? w : fn, o);
    }
    return orig.call(this, t, fn, o);
  };
})();`;

const FRAMES = `
new Promise(res => {
  window.__m.frames = []; let last = performance.now(); const t0 = last; 
  (function tick(now) { window.__m.frames.push(now - last); last = now; if (now - t0 < 4500) requestAnimationFrame(tick); else res(); })(last);
})`;

function pct(a, p) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; }
const median = (a) => pct(a, 0.5);

async function once(browser, page, sizeName, variant) {
  const size = SIZES[sizeName];
  const ctx = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: size.mobile ? 3 : 1, isMobile: size.mobile, hasTouch: size.mobile });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  if (size.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: size.cpu });
  await p.addInitScript(INIT);
  const bytes = {}; const counts = {}; let total = 0; const bigs = [];
  p.on("response", async (r) => {
    try {
      const url = r.url(); const t = r.request().resourceType();
      const len = Number((await r.allHeaders())["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
      bytes[t] = (bytes[t] ?? 0) + len; counts[t] = (counts[t] ?? 0) + 1; total += len;
      if (len > 150000) bigs.push([url.replace(BASE, ""), len]);
    } catch {}
  });
  if (variant === "nolenis") await p.route(/lenis(-boot)?\.(js|css)/, (r) => r.abort());
  const t0 = Date.now();
  await p.goto(BASE + page, { waitUntil: "load", timeout: 60000 });
  const loadMs = Date.now() - t0;
  await p.waitForTimeout(3500);
  const nav = await p.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null };
  });
  const loadPhase = await p.evaluate(() => ({ lcp: Math.round(window.__m.lcp), cls: +window.__m.cls.toFixed(4), longtasks: window.__m.longtasks.length, tbt: window.__m.longtasks.reduce((s, [, d]) => s + Math.max(0, d - 50), 0), loaf: window.__m.loaf.slice().sort((a, b) => b.d - a.d).slice(0, 4), docH: document.documentElement.scrollHeight, lenis: !!window.__lenis || !!document.querySelector("html.lenis") }));
  // scroll trace
  await p.evaluate(() => { window.__m.scrollHandlers = 0; window.__m.longtasks = []; window.__m.loaf = []; window.__m.cls = 0; });
  const tracing = p.evaluate(FRAMES);
  await p.waitForTimeout(150);
  const { x, y } = { x: size.viewport.width / 2, y: size.viewport.height / 2 };
  if (size.mobile) {
    await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -1800, speed: 1500, gestureSourceType: "touch" });
    await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: 900, speed: 1500, gestureSourceType: "touch" });
  } else {
    await p.mouse.move(x, y);
    for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(16); }
    for (let i = 0; i < 20; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(16); }
  }
  await tracing;
  const sc = await p.evaluate(() => {
    const f = window.__m.frames.slice(1);
    return { frames: f, handlers: window.__m.scrollHandlers, longtasks: window.__m.longtasks.length, tbt: window.__m.longtasks.reduce((s, [, d]) => s + Math.max(0, d - 50), 0), loaf: window.__m.loaf.slice().sort((a, b) => b.d - a.d).slice(0, 3), cls: +window.__m.cls.toFixed(4), scrollY: Math.round(scrollY) };
  });
  const f = sc.frames;
  await ctx.close();
  return {
    page, size: sizeName, variant, loadMs, ...nav, ...loadPhase,
    transferKB: Math.round(total / 1024), bytesKB: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), counts, big: bigs.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([u, l]) => [u, Math.round(l / 1024)]),
    scroll: { frames: f.length, p50: +pct(f, 0.5).toFixed(1), p95: +pct(f, 0.95).toFixed(1), max: Math.round(Math.max(...f)), over25: f.filter((d) => d > 25).length, over50: f.filter((d) => d > 50).length, handlers: sc.handlers, longtasks: sc.longtasks, tbt: sc.tbt, cls: sc.cls, loaf: sc.loaf, endY: sc.scrollY },
  };
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const rows = [];
for (const page of PAGES) for (const s of Object.keys(SIZES)) for (const v of VARIANTS) {
  const reps = [];
  for (let i = 0; i < REPEAT; i++) { try { reps.push(await once(browser, page, s, v)); } catch (e) { reps.push({ page, size: s, variant: v, error: String(e).slice(0, 200) }); } }
  const ok = reps.filter((r) => !r.error);
  rows.push({ page, size: s, variant: v, runs: reps.length, ok: ok.length, median: ok.length ? { fcp: median(ok.map((r) => r.fcp ?? 0)), lcp: median(ok.map((r) => r.lcp)), load: median(ok.map((r) => r.load)), tbt: median(ok.map((r) => r.tbt)), cls: median(ok.map((r) => r.cls)), transferKB: median(ok.map((r) => r.transferKB)), scrollP95: median(ok.map((r) => r.scroll.p95)), scrollOver25: median(ok.map((r) => r.scroll.over25)), scrollMax: median(ok.map((r) => r.scroll.max)), scrollHandlers: median(ok.map((r) => r.scroll.handlers)), scrollTbt: median(ok.map((r) => r.scroll.tbt)) } : null, detail: ok[0] ?? reps[0] });
  console.log(page, s, v, JSON.stringify(rows.at(-1).median));
}
writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), rows }, null, 1));
await browser.close();
