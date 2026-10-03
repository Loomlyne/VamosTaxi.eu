// usage: node shot-bar.mjs <base> <w> <lang> <out.png>   (real quote, economy chosen; reports the Total box)
import { createRequire } from "node:module";
const require = createRequire("/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-acd57fa904c0db29b/apps/web/package.json");
const { chromium } = require("@playwright/test");
const [base, wS, lang, out] = process.argv.slice(2); const w = Number(wS);
const b = await chromium.launch({ chromiumSandbox: false });
const ctx = await b.newContext({ viewport: { width: w, height: w <= 680 ? 844 : 900 }, isMobile: w <= 680, hasTouch: w <= 680, extraHTTPHeaders: { "cf-connecting-ip": `10.78.${w % 250}.${Math.floor(Math.random() * 250)}` } });
await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch {} }, lang);
await ctx.route("**/api/consent/state", (r) => r.fulfill({ json: { ok: true, chosen: true, choice: { functional: false, analytics: false, marketing: false }, policyVersion: "t" } }));
await ctx.route("**/api/fx", (r) => r.fulfill({ json: { ok: true, rates: { CHF: 1, EUR: 1, USD: 1, AED: 1 } } }));
const p = await ctx.newPage();
const q = new URLSearchParams({ from: "Zurich HB", fid: "fake.zrh-hb", to: "Zug Bahnhof", tid: "fake.zug", gs: "6f1c2f2a-5f0b-4f0e-9d3b-1b2c3d4e5f60", when: "2027-01-15T10:30", pax: "2", bags: "1" });
await p.goto(base + (lang === "en" ? "" : "/" + lang) + "/checkout?" + q, { waitUntil: "load" });
await p.waitForSelector('[data-co-class="economy"]', { timeout: 30000 });
await p.evaluate(() => { const c = document.querySelector('[data-co-class="economy"]'); (c.querySelector('button,[role=radio],[role=button],input') || c.firstElementChild).click(); });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => { const a = document.querySelector('[data-co-pay-bar="bar"] [data-co-total]'); const rg = document.createRange(); rg.selectNodeContents(a); const lines = new Set([...rg.getClientRects()].filter(r => r.width>0).map(r => Math.round(r.top))); const r = a.getBoundingClientRect(); return { text: a.textContent, lines: lines.size, w: Math.round(r.width), h: Math.round(r.height), fs: getComputedStyle(a).fontSize, pay: document.querySelector('[data-co-pay]').innerText.replace(/\s+/g, " ") }; });
console.log(JSON.stringify(info));
if (!process.env.LONG) await p.screenshot({ path: out });
if (process.env.LONG) { const r = await p.evaluate((s) => { const bar = document.querySelector('[data-co-pay-bar="bar"]'); const a = bar.querySelector('[data-co-total]'); a.textContent = s; const sp = bar.querySelector('[data-co-pay] span.vt-dir-keep'); if (sp) sp.textContent = s; const rg = document.createRange(); rg.selectNodeContents(a); const lines = new Set([...rg.getClientRects()].filter(r => r.width>0).map(r => Math.round(r.top))); const tot = bar.querySelector('.vt-copay__total').getBoundingClientRect(); const pay = bar.querySelector('[data-co-pay]').getBoundingClientRect(); return { lines: lines.size, totalBoxW: Math.round(tot.width), payW: Math.round(pay.width) }; }, process.env.LONG); console.log('LONG', process.env.LONG, JSON.stringify(r)); }
await b.close();
