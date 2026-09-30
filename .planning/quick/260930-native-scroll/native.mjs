// Native scrolling proof: no scroller scripts, no --vt-scroll write, the page scrolls by wheel and
// by touch, a body lock really locks (wheel and touch do not move the page) and releases.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:4300";
const b = await chromium.launch({ args: ["--no-sandbox"] });
const ok = (name, pass, extra = "") => { console.log((pass ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!pass) process.exitCode = 1; };
for (const page of ["/", "/faq", "/about", "/contact", "/sign-in"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const reqs = []; p.on("request", (r) => reqs.push(r.url()));
  await p.goto(BASE + page, { waitUntil: "load" }); await p.waitForTimeout(2500);
  ok(`${page} loads no Lenis file`, !reqs.some((u) => /lenis/i.test(u)));
  ok(`${page} has no VamosScroll, no __vtLenis`, await p.evaluate(() => !window.VamosScroll && !window.__vtLenis && !window.Lenis));
  await p.mouse.move(720, 450); for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(30); } await p.waitForTimeout(400);
  const y = await p.evaluate(() => scrollY);
  const tall = await p.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1500);
  if (tall) ok(`${page} wheel moves the page`, y > 600, `scrollY=${Math.round(y)}`);
  ok(`${page} writes no --vt-scroll`, await p.evaluate(() => !document.documentElement.style.getPropertyValue("--vt-scroll")));
  await ctx.close();
}
// lock and release, desktop wheel
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  await p.goto(BASE + "/faq", { waitUntil: "load" }); await p.waitForTimeout(2000);
  await p.evaluate(() => { document.body.style.overflow = "hidden"; });
  await p.mouse.move(720, 450); for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(30); } await p.waitForTimeout(300);
  ok("/faq body lock: wheel does not move the page", (await p.evaluate(() => scrollY)) < 5, `scrollY=${await p.evaluate(() => scrollY)}`);
  await p.evaluate(() => { document.body.style.overflow = ""; });
  for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(30); } await p.waitForTimeout(300);
  ok("/faq released: wheel moves the page", (await p.evaluate(() => scrollY)) > 300);
  await ctx.close();
}
// phone menu, touch
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await p.goto(BASE + "/faq", { waitUntil: "load" }); await p.waitForTimeout(2000);
  const swipe = async () => { await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 500, yDistance: -600, speed: 1200, gestureSourceType: "touch" }); await p.waitForTimeout(400); };
  await swipe(); ok("phone /faq touch moves the page", (await p.evaluate(() => scrollY)) > 200);
  await p.evaluate(() => scrollTo(0, 0));
  await p.locator("[data-hd-menu-btn]").first().click(); await p.waitForTimeout(500);
  ok("phone menu locks the body", (await p.evaluate(() => document.body.style.overflow)) === "hidden");
  await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 700, yDistance: -500, speed: 1200, gestureSourceType: "touch" }); await p.waitForTimeout(400);
  ok("phone menu open: the page behind does not move", (await p.evaluate(() => scrollY)) < 5, `scrollY=${await p.evaluate(() => scrollY)}`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(900);
  ok("phone menu closed: lock released", (await p.evaluate(() => document.body.style.overflow)) === "");
  await swipe(); ok("phone menu closed: touch moves the page again", (await p.evaluate(() => scrollY)) > 200);
  await ctx.close();
}
await b.close();
