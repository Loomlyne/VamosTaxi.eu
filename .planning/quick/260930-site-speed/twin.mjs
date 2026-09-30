// Two smooth scrollers on one page? Wheel 10 ticks, sample scrollY every frame.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "https://vamostaxi.site";
const b = await chromium.launch({ args: ["--no-sandbox"] });
async function run(variant, page) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  if (variant === "no-lenis" || variant === "neither") await p.route(/lenis(-boot)?\.(js|css)/, (r) => r.abort());
  await p.goto(BASE + page, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2500);
  if (variant === "no-vamosscroll" || variant === "neither") await p.evaluate(() => window.VamosScroll && window.VamosScroll.stop());
  const info = await p.evaluate(() => ({ vs: !!window.VamosScroll && window.VamosScroll.enabled, lenis: !!window.__vtLenis }));
  await p.evaluate(() => { window.scrollTo(0, 0); });
  await p.waitForTimeout(800);
  const rec = p.evaluate(() => new Promise((res) => { const ys = []; const t0 = performance.now(); (function tick(n) { ys.push(Math.round(scrollY * 10) / 10); if (n - t0 < 2200) requestAnimationFrame(tick); else res(ys); })(t0); }));
  await p.mouse.move(720, 450);
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 100); await p.waitForTimeout(40); }
  const ys = await rec;
  const d = ys.slice(1).map((v, i) => +(v - ys[i]).toFixed(1));
  const back = d.filter((x) => x < -0.5).length;
  // jitter: frames where movement stalls (0) in the middle of the glide, and sign flips of acceleration
  const moving = d.map((x, i) => [x, i]).filter(([x]) => Math.abs(x) > 0.5);
  const first = moving[0]?.[1] ?? 0, last = moving.at(-1)?.[1] ?? 0;
  const stalls = d.slice(first, last).filter((x) => Math.abs(x) <= 0.5).length;
  let flips = 0; for (let i = first + 2; i < last; i++) if ((d[i] - d[i - 1]) * (d[i - 1] - d[i - 2]) < 0 && Math.abs(d[i] - d[i - 1]) > 4) flips++;
  console.log(variant.padEnd(15), page.padEnd(6), JSON.stringify(info), "end", Math.round(ys.at(-1)), "of 1000 | backward frames", back, "| stalls mid-glide", stalls, "| speed flips", flips, "| glide frames", last - first, "| max step", Math.max(...d.map(Math.abs)));
  console.log("   steps:", d.slice(first, first + 50).map((x) => Math.round(x)).join(","));
  await ctx.close();
}
for (const page of ["/", "/faq"]) for (const v of ["base", "no-lenis", "no-vamosscroll", "neither"]) { try { await run(v, page); } catch (e) { console.log(v, page, "failed", String(e).slice(0, 80)); } }
await b.close();
