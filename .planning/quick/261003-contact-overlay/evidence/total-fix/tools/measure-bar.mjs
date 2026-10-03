// usage: node measure-bar.mjs <base> <w> <lang> [css-file] [shot-prefix]
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-acd57fa904c0db29b/apps/web/package.json");
const { chromium } = require("@playwright/test");
const [base, wS, lang, cssFile, shot] = process.argv.slice(2);
const w = Number(wS);
const LONG = ["CHF 9'999.00", "AED 9'999.00", "€ 9'999.00", "$9'999.00", "CHF 12'450.00"];
const b = await chromium.launch({ chromiumSandbox: false });
const ctx = await b.newContext({ viewport: { width: w, height: w <= 680 ? 844 : 900 }, isMobile: w <= 680, hasTouch: w <= 680, extraHTTPHeaders: { "cf-connecting-ip": `10.77.${w % 250}.${Math.floor(Math.random() * 250)}` } });
await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch {} }, lang);
await ctx.route("**/api/consent/state", (r) => r.fulfill({ json: { ok: true, chosen: true, choice: { functional: false, analytics: false, marketing: false }, policyVersion: "t" } }));
await ctx.route("**/api/fx", (r) => r.fulfill({ json: { ok: true, rates: { CHF: 1, EUR: 1, USD: 1, AED: 1 } } }));
const p = await ctx.newPage();
const q = new URLSearchParams({ from: "Zurich HB", fid: "fake.zrh-hb", to: "Zug Bahnhof", tid: "fake.zug", gs: "6f1c2f2a-5f0b-4f0e-9d3b-1b2c3d4e5f60", when: "2027-01-15T10:30", pax: "2", bags: "1" });
await p.goto(base + (lang === "en" ? "" : "/" + lang) + "/checkout?" + q, { waitUntil: "load" });
await p.waitForSelector('[data-co-class="economy"]', { timeout: 30000 });
if (cssFile) await p.addStyleTag({ content: fs.readFileSync(cssFile, "utf8") });
await p.evaluate(() => { const c = document.querySelector('[data-co-class="economy"]'); (c.querySelector('button,[role=radio],[role=button],input') || c.firstElementChild).click(); });
await p.waitForTimeout(1200);
const measure = () => p.evaluate(() => {
  const bar = document.querySelector('[data-co-pay-bar="bar"]');
  if (!bar) return { bar: false, iw: innerWidth };
  const box = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return { l: Math.round(r.left * 10) / 10, r: Math.round(r.right * 10) / 10, t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const amount = bar.querySelector("[data-co-total]") || bar.querySelector("[data-co-total-note]");
  const label = bar.querySelector(".vt-copay__label");
  const dock = bar.querySelector('[data-contact-btn][data-variant="docked"] [data-cb-trigger]');
  const pay = bar.querySelector("[data-co-pay]");
  const pr = pay.getBoundingClientRect();
  const top = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);
  const rg = document.createRange(); rg.selectNodeContents(amount);
  const lines = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
  const cs = getComputedStyle(amount);
  return { bar: true, dir: document.documentElement.dir, iw: innerWidth, sw: document.scrollingElement.scrollWidth, amountText: amount.textContent, payText: pay.innerText.replace(/\s+/g, " "), amount: box(amount), label: box(label), labelText: label && label.textContent, dock: box(dock), pay: box(pay), lines: lines.size, aSW: amount.scrollWidth, aCW: amount.clientWidth, fs: cs.fontSize, ws: cs.whiteSpace, payOnTop: !!top && !!top.closest("[data-co-pay]"), gap: getComputedStyle(bar.querySelector(".vt-copay__row")).columnGap, payPad: getComputedStyle(pay).paddingInlineStart };
});
const out = { w, lang, real: await measure(), long: {} }; if (process.env.DBG) { console.log(JSON.stringify(out.real)); await p.screenshot({path:"/tmp/dbg.png"}); process.exit(0); }
if (shot) await p.screenshot({ path: shot + ".png" });
for (const s of LONG) {
  await p.evaluate((s) => {
    const bar = document.querySelector('[data-co-pay-bar="bar"]');
    bar.querySelector("[data-co-total]").textContent = s;
    const sp = bar.querySelector("[data-co-pay] span.vt-dir-keep"); if (sp) sp.textContent = s;
  }, s);
  await p.waitForTimeout(150);
  out.long[s] = await measure();
}
console.log(JSON.stringify(out));
await b.close();
