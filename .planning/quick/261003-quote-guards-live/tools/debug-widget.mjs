// Debug: why the class-list challenge widget renders no iframe. Prints console, failed requests, window.turnstile.
import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.WEB_DIR + "/package.json")("@playwright/test");
const BASE = process.env.LAB_BASE;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
p.on("console", (m) => console.log("console", m.type(), m.text().slice(0, 200)));
p.on("requestfailed", (r) => console.log("failed", r.url().slice(0, 120), r.failure()?.errorText));
p.on("response", (r) => { if (/challenges\.cloudflare|\/api\/quote/.test(r.url())) console.log("resp", r.status(), r.url().slice(0, 120)); });
await p.route(/\/api\/fx/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"base":"CHF","rates":{"CHF":1,"EUR":1,"USD":1,"AED":1},"rate":1}' }));
// force the challenge answer for the first quote so the widget mounts at once
p.on("response", async (r) => { if (/\/api\/quote$/.test(r.url())) console.log("quote body", (await r.text().catch(() => "")).slice(0, 200)); });
await p.goto(BASE + "/checkout?from=Zurich%20Airport&fid=mb-zrh&to=Zug%20station&tid=mb-zug&when=2026-12-01T10%3A30&pax=1", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(6000);
for (let i = 0; i < 2; i++) { await p.reload({ waitUntil: "load" }); await p.waitForTimeout(6000); }
await p.waitForTimeout(8000);
console.log("turnstile on window:", await p.evaluate(() => typeof window.turnstile));
console.log("scripts:", await p.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => s.includes("challenges"))));
console.log("hosts:", await p.evaluate(() => [...document.querySelectorAll(".vt-turnstile")].map((d) => d.getAttribute("data-action") + ":" + d.innerHTML.slice(0, 160))));
console.log("error code:", await p.locator("[data-co-classes-error]").getAttribute("data-co-error-code").catch(() => null));
await p.screenshot({ path: "/tmp/qg-debug.png" });
await b.close();
