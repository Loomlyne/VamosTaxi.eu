#!/usr/bin/env node
// header-coverage: the page header of the bookings board (title and the line under it) from the real shell,
// offline, on the local sync (apps/web/public after scripts/sync-dc-mock-to-public.mjs).
// 1. English page: VamosLocale.coverage of the header for de, fr and ar (what the shared dictionary cannot turn).
// 2. Each language's page: the header reads the owner's words, and the subtitle names no order.
// Nothing reaches a server: /api/** is answered from rows.mjs. Usage: node header-coverage.mjs
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { serve } from "./serve.mjs";
import { answer, stubRows } from "./rows.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const root = resolve(new URL("../../../../apps/web/public", import.meta.url).pathname);

const WANT = {
  en: ["Bookings", "Paid trips"],
  de: ["Buchungen", "Bezahlte Fahrten"],
  fr: ["Réservations", "Courses payées"],
  ar: ["الحجوزات", "الرحلات المدفوعة"],
};
const rows = await stubRows();
const { server, base } = await serve(root, { ops: true });
const browser = await chromium.launch({ headless: true });
const out = [];
let bad = 0;
const check = (name, ok, detail = "") => { out.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); if (!ok) bad += 1; };

async function open(lang) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push(String(e).split("\n")[0].slice(0, 160)));
  await page.addInitScript((l) => { localStorage.setItem("vamosLang", l); localStorage.setItem("vamosOpsAuth", "1"); }, lang);
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const a = answer(req.method(), new URL(req.url()).pathname, rows);
    return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) });
  });
  await page.goto(`${base}/bookings`, { waitUntil: "load" });
  await page.waitForSelector("[data-vt-board] tbody tr", { timeout: 15000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}

for (const lang of ["en", "de", "fr", "ar"]) {
  const { ctx, page, errors } = await open(lang);
  const header = page.locator("main > header").first();
  const h1 = (await header.locator("h1").textContent()).trim();
  const sub = (await header.locator("h1 + p").textContent()).trim();
  check(`${lang}: title and subtitle read ${WANT[lang].join(" / ")}`, h1 === WANT[lang][0] && sub === WANT[lang][1], `${h1} / ${sub}`);
  check(`${lang}: the subtitle names no order`, !/pickup|Abhol|prise en charge|الاستلام/i.test(sub), sub);
  if (lang === "en") {
    // The subtitle's words come from the page's own T tables, not from the shared dictionary, so the runtime
    // lists it. The line it replaced ("Paid trips by pickup time") was listed the same way (re-checked below on
    // the live DOM); the title is in the dictionary and is not listed.
    for (const to of ["de", "fr", "ar"]) {
      const res = await page.evaluate((t) => window.VamosLocale.coverage(document.querySelector("main > header"), t), to);
      const listed = [...res.strings, ...res.attrs];
      check(`en page: VamosLocale.coverage of the header (${to}) lists only the subtitle, as before`, listed.length === 1 && listed[0] === WANT.en[1], `${res.count} listed: ${listed.join(" / ")}`);
      const old = await page.evaluate((t) => {
        const p = document.querySelector("main > header h1 + p");
        const keep = p.textContent;
        p.textContent = "Paid trips by pickup time";
        const r = window.VamosLocale.coverage(document.querySelector("main > header"), t);
        p.textContent = keep;
        return r.count;
      }, to);
      check(`en page: the old line was listed too (${to})`, old === 1, String(old));
    }
  } else {
    // A T-table page lists its own words as "missing" (the dictionary is keyed on English), so here the
    // header is only compared with the page's own text and left to the translator unchanged.
    const again = await page.evaluate(() => { const h = document.querySelector("main > header"); return h.querySelector("h1").textContent + "|" + h.querySelector("h1 + p").textContent; });
    check(`${lang}: the translator leaves the header as the page set it`, again === `${WANT[lang][0]}|${WANT[lang][1]}`, again);
  }
  check(`${lang}: no page error or console error`, errors.length === 0, errors.join(" / "));
  await ctx.close();
}
await browser.close();
server.close();
console.log(out.join("\n"));
console.log(bad ? `${bad} FAILED` : "all checks passed");
process.exit(bad ? 1 : 0);
