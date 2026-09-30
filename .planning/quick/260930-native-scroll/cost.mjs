// Main-thread cost of scrolling, from Chrome's own counters (CDP Performance.getMetrics).
// Variants: base | nolenis | nosignal (skip the --vt-scroll write the design-system scroller makes on every scroll event)
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "https://vamostaxi.site";
const b = await chromium.launch({ args: ["--no-sandbox"] });
const NOSIGNAL = `(() => { const s = CSSStyleDeclaration.prototype.setProperty; CSSStyleDeclaration.prototype.setProperty = function (n, v, p) { if (n === '--vt-scroll') return; return s.call(this, n, v, p); }; })();`;
async function metrics(cdp) { const { metrics } = await cdp.send("Performance.getMetrics"); return Object.fromEntries(metrics.map((m) => [m.name, m.value])); }
async function run(variant, page, size) {
  const phone = size === "phone";
  const ctx = await b.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  if (variant === "floor") await p.route(/lenis(-boot)?\.(js|css)/, (r) => r.abort());
  if (variant === "floor" || variant === "noblur") await p.addInitScript(NOSIGNAL);
  if (variant === "noblur") await p.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';document.head.appendChild(st)})`);
  if (variant === "nolenis") await p.route(/lenis(-boot)?\.(js|css)/, (r) => r.abort());
  if (variant === "nosignal") await p.addInitScript(NOSIGNAL);
  await p.goto(BASE + page, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(3500);
  const a = await metrics(cdp);
  const x = phone ? 195 : 720, y = phone ? 420 : 450;
  if (phone) { for (let i = 0; i < 3; i++) { await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -1800, speed: 1500, gestureSourceType: "touch" }); await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: 1800, speed: 1500, gestureSourceType: "touch" }); } }
  else { await p.mouse.move(x, y); for (let i = 0; i < 120; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(16); } for (let i = 0; i < 120; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(16); } }
  await p.waitForTimeout(600);
  const z = await metrics(cdp);
  const d = (k) => Math.round((z[k] - a[k]) * 1000);
  console.log(`${page.padEnd(7)}${size.padEnd(7)}${variant.padEnd(10)} script ${String(d("ScriptDuration")).padStart(5)}ms  layout ${String(d("LayoutDuration")).padStart(5)}ms (${Math.round(z.LayoutCount - a.LayoutCount)}x)  styleRecalc ${String(d("RecalcStyleDuration")).padStart(5)}ms (${Math.round(z.RecalcStyleCount - a.RecalcStyleCount)}x)  task ${String(d("TaskDuration")).padStart(5)}ms`);
  await ctx.close();
}
for (const page of (process.env.PAGES ?? "/,/faq").split(",")) for (const size of ["laptop", "phone"]) for (const v of (process.env.VARIANTS ?? "base,nosignal,base,nosignal").split(",")) { try { await run(v, page, size); } catch (e) { console.log(v, page, size, "failed", String(e).slice(0, 80)); } }
await b.close();
