import { chromium } from "playwright-core";
const b = await chromium.launch({ args: ["--no-sandbox"] });
const INIT = `
window.__h = new Map();
const orig = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (t, fn, o) {
  if ((t === 'scroll' || t === 'wheel' || t === 'touchmove' || t === 'resize') && typeof fn === 'function') {
    const where = (new Error().stack || '').split('\\n').slice(2, 4).map(s => s.trim().replace(/^at /, '').replace(location.origin, '')).join(' < ');
    const key = t + ' on ' + (this === window ? 'window' : this === document ? 'document' : (this.tagName || 'other')) + ' @ ' + where;
    const rec = window.__h.get(key) || { n: 0, ms: 0, max: 0 }; window.__h.set(key, rec);
    const w = function (...a) { const s = performance.now(); try { return fn.apply(this, a); } finally { const d = performance.now() - s; rec.n++; rec.ms += d; if (d > rec.max) rec.max = d; } };
    return orig.call(this, t, w, o);
  }
  return orig.call(this, t, fn, o);
};`;
for (const [label, w, h, mobile, cpu] of [["laptop", 1440, 900, false, 1], ["phone 4xCPU", 390, 844, true, 4]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await p.addInitScript(INIT);
  await p.goto("https://vamostaxi.site/", { waitUntil: "load" }); await p.waitForTimeout(3000);
  await p.evaluate(() => { for (const r of window.__h.values()) { r.n = 0; r.ms = 0; r.max = 0; } });
  const x = w / 2, y = h / 2;
  if (mobile) { await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -1800, speed: 1500, gestureSourceType: "touch" }); await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: 900, speed: 1500, gestureSourceType: "touch" }); }
  else { await p.mouse.move(x, y); for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(16); } for (let i = 0; i < 20; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(16); } }
  await p.waitForTimeout(500);
  const rows = await p.evaluate(() => [...window.__h.entries()].map(([k, v]) => [k, v.n, Math.round(v.ms), Math.round(v.max)]).filter(r => r[1] > 0).sort((a, c) => c[2] - a[2]).slice(0, 8));
  console.log("\n##", label, "home scroll, handler time per registration (calls, total ms, worst ms)"); for (const r of rows) console.log(" ", r[1], "calls", r[2], "ms total", r[3], "ms max |", r[0].slice(0, 200));
  await ctx.close();
}
await b.close();
