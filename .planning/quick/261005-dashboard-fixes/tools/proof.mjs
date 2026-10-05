#!/usr/bin/env node
// U9 / U10 proof in a real browser, from the real shell, offline.
//
//   node proof.mjs <public tree> <tree root for mapBoardBooking> <label> <out dir> <scratch dir>
//
// Serves the synced public tree (serve.mjs), answers every /api/** from fixtures.mjs (booking rows through the
// real mapBoardBooking of the tree shown), and in English, German, French and Arabic checks:
//   board     vehicle column (First and Studio stay themselves), class filter list and its order, sort by vehicle in
//             price-book order, the pickup day line and its tooltip in the page's language
//   dashboard Money in lines (class names and order as the server sends them)
//   detail    the distance chip reads "240 km" left to right in Arabic; the toast close button's label; an error
//             toast is still there after 5 s, a success toast has gone after 5 s
// plus VamosLocale.coverage on each screen and the console/page errors. Prints PASS/FAIL, exits 1 on any FAIL.
// Pictures (bare crops, no frame): en and ar at 1440 and 390, named <label>-<what>-<lang>-<w>.png.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { serve } from "./serve.mjs";
import { answer, stubRows, MONEY_AFTER, MONEY_BEFORE } from "./fixtures.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [, , tree, src, label, outArg, scratchArg] = process.argv;
if (!tree || !src || !label) throw new Error("usage: proof.mjs <public tree> <tree root> <label> <out dir> <scratch dir>");
const out = resolve(outArg ?? "screens");
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(resolve(scratchArg ?? "/tmp"), "proof-"));
const AFTER = label.startsWith("after");
const rows = await stubRows(resolve(src), tmp);
const { server, base } = await serve(resolve(tree));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM || undefined });
let bad = 0;
const results = [];
const covs = {};
const check = (name, ok, detail = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  ${label}: ${name}${detail ? `  (${detail})` : ""}`;
  results.push(line);
  console.log(line);
  if (!ok) bad += 1;
};

const LANGS = (process.env.PROOF_LANGS || "en,de,fr,ar").split(",");
// Pickup days of the five fixture rows, by customer, in each language (Intl, Zurich calendar date, Latin digits).
const DAYS = {
  en: { "Nadia Frei": "Fri 9", "Jonas Weber": "Thu 8", "Amira Keller": "Wed 7", "Luca Meier": "Tue 6", "Elena Brunner": "Tue 6" },
  de: { "Nadia Frei": "Fr. 9", "Jonas Weber": "Do. 8", "Amira Keller": "Mi. 7", "Luca Meier": "Di. 6", "Elena Brunner": "Di. 6" },
  fr: { "Nadia Frei": "ven. 9", "Jonas Weber": "jeu. 8", "Amira Keller": "mer. 7", "Luca Meier": "mar. 6", "Elena Brunner": "mar. 6" },
  ar: { "Nadia Frei": "الجمعة 9", "Jonas Weber": "الخميس 8", "Amira Keller": "الأربعاء 7", "Luca Meier": "الثلاثاء 6", "Elena Brunner": "الثلاثاء 6" },
};
const DISMISS = { en: "Dismiss", de: "Schliessen", fr: "Fermer", ar: "إغلاق" };
const VEHICLE_AFTER = { "Nadia Frei": "First", "Jonas Weber": "Van luxury", "Amira Keller": "Business", "Luca Meier": "Economy", "Elena Brunner": "Studio" };
const VEHICLE_BEFORE = { ...VEHICLE_AFTER, "Nadia Frei": "Economy", "Elena Brunner": "Economy" };

async function open(lang, width, route, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).split("\n")[0].slice(0, 160)}`));
  await page.addInitScript((l) => { localStorage.setItem("vamosLang", l); localStorage.setItem("vamosOpsAuth", "1"); }, lang);
  const ctxData = { rows, money: AFTER ? MONEY_AFTER : MONEY_BEFORE, ...extra };
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const a = answer(req.method(), new URL(req.url()).pathname, ctxData);
    return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) });
  });
  await page.goto(`${base}${route}`, { waitUntil: "load" });
  return { ctx, page, errors };
}
const still = (page) => page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
const coverage = (page, sel) => page.evaluate((s) => (window.VamosLocale && window.VamosLocale.coverage ? window.VamosLocale.coverage(document.querySelector(s) || document.body) : ["(no coverage function)"]), sel);


const RESEND = /resend voucher|gutschein erneut|renvoyer le bon|إعادة إرسال القسيمة/i;
// At 1440 the booking page has its own Resend voucher button; at 390 it sits in the Actions menu.
async function resendVoucher(page) {
  const direct = page.locator("button:visible", { hasText: RESEND }).first();
  if (await direct.count()) { await direct.click({ timeout: 4000 }); return; }
  await page.locator("button:visible", { hasText: /^(actions?|aktionen?|الإجراءات|إجراء)$/i }).first().click({ timeout: 4000 });
  await page.waitForTimeout(300);
  await page.getByText(RESEND).locator("visible=true").first().click({ timeout: 4000 });
}

// ── board ──────────────────────────────────────────────────────────────────────────────────────────────
async function board(lang, width) {
  const tag = `board ${lang} ${width}`;
  const { ctx, page, errors } = await open(lang, width, "/bookings");
  await page.waitForSelector("[data-vt-board] tbody tr", { timeout: 15000 });
  await page.waitForTimeout(2200); // the class list lands after the first paint
  await still(page);
  const table = page.locator("[data-vt-board]");
  const rowsInfo = await page.evaluate(() => [...document.querySelectorAll("[data-vt-board] tbody tr")].map((tr) => {
    const td = [...tr.querySelectorAll("td")];
    return {
      customer: (td[2].querySelector("[data-vt-clip]") || td[2]).textContent.trim(),
      vehicle: (td[4].querySelector("[data-vt-clip]") || td[4]).textContent.trim(),
      day: (td[1].querySelector("[data-vt-sub]") || td[1]).textContent.trim(),
      dayTitle: (td[1].querySelector("[data-vt-when]") || td[1]).getAttribute("title"),
    };
  }));
  const byCustomer = Object.fromEntries(rowsInfo.map((r) => [r.customer, r]));
  const wantVeh = AFTER ? VEHICLE_AFTER : VEHICLE_BEFORE;
  for (const [name, veh] of Object.entries(wantVeh)) check(`${tag}: ${name} reads ${veh}`, byCustomer[name]?.vehicle === veh, byCustomer[name]?.vehicle);
  if (AFTER) {
    for (const [name, day] of Object.entries(DAYS[lang])) check(`${tag}: ${name} pickup day line is "${day}"`, byCustomer[name]?.day === day, byCustomer[name]?.day);
    if (lang !== "en") check(`${tag}: the pickup day line is not English`, byCustomer["Nadia Frei"]?.day !== "Fri 9", byCustomer["Nadia Frei"]?.day);
    check(`${tag}: the tooltip names the month in the language`, !!byCustomer["Nadia Frei"]?.dayTitle && (lang === "en" ? /Oct/.test(byCustomer["Nadia Frei"].dayTitle) : !/Fri/.test(byCustomer["Nadia Frei"].dayTitle)), byCustomer["Nadia Frei"]?.dayTitle);
  } else if (lang !== "en") {
    check(`${tag}: BEFORE the pickup day line is English`, byCustomer["Nadia Frei"]?.day === "Fri 9", byCustomer["Nadia Frei"]?.day);
  }
  // Class filter: open Filter (the funnel button), then the Class select (the car icon), and read its options.
  await page.locator('button:has([style*="funnel.svg"])').first().click();
  await page.waitForTimeout(400);
  await page.locator('button[data-vs-btn]:has([style*="car.svg"])').first().click();
  await page.waitForTimeout(300);
  const opts = await page.locator('button[role="option"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || e.textContent));
  const names = opts.map((s) => s.trim()).filter(Boolean);
  const wantList = AFTER ? ["Economy", "Business", "First", "Van luxury", "Studio"] : ["Economy", "Business", "Van luxury"];
  const got = names.slice(1);
  check(`${tag}: the class filter lists ${wantList.join(", ")}`, JSON.stringify(got) === JSON.stringify(wantList), names.join(" | "));
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  // Sort by vehicle (first click: price-book order).
  await page.locator("[data-vt-board] thead th").nth(4).locator("button").click();
  await page.waitForTimeout(300);
  const sorted = await page.evaluate(() => [...document.querySelectorAll("[data-vt-board] tbody tr")].map((tr) => (tr.querySelectorAll("td")[4].querySelector("[data-vt-clip]") || tr.querySelectorAll("td")[4]).textContent.trim()));
  const wantSorted = AFTER ? ["Economy", "Business", "First", "Van luxury", "Studio"] : null;
  if (wantSorted) check(`${tag}: sorted by vehicle the rows follow the price-book order`, JSON.stringify(sorted) === JSON.stringify(wantSorted), sorted.join(" | "));
  const cov = await coverage(page, "[data-vt-board]");
  covs[`board-${lang}-${width}`] = cov;
  console.log(`      coverage ${tag}: ${cov.count} gaps`);
  check(`${tag}: no console or page error`, errors.length === 0, errors.join(" ; "));
  if (["en", "ar"].includes(lang) && [1440, 390].includes(width)) {
    await table.screenshot({ path: resolve(out, `${label}-board-${lang}-${width}.png`) });
  }
  await ctx.close();
  return cov;
}

// ── dashboard (Money in) ───────────────────────────────────────────────────────────────────────────────
async function dashboard(lang, width) {
  const tag = `dashboard ${lang} ${width}`;
  const { ctx, page, errors } = await open(lang, width, "/dashboard");
  await page.waitForSelector("text=/Money in|Einnahmen|Entrées|الوارد/", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2200);
  await still(page);
  const lines = await page.evaluate(() => {
    const ps = [...document.querySelectorAll("p")];
    const head = ps.find((p) => /^(money in|einnahmen|entrées|الوارد)/i.test(p.textContent.trim()));
    if (!head) return null;
    const out = [];
    for (let n = head.nextElementSibling; n && n.tagName === "DIV"; n = n.nextElementSibling) out.push([...n.querySelectorAll("span")].map((s) => s.textContent.trim()).filter(Boolean));
    return out;
  });
  const names = (lines ?? []).map((l) => l[0]);
  const want = AFTER ? ["Economy", "Business", "First", "Van luxury", "Studio"] : ["Economy", "Business", "Van luxury"];
  check(`${tag}: Money in lists ${want.join(", ")}`, JSON.stringify(names) === JSON.stringify(want), JSON.stringify(lines));
  const cov = await coverage(page, "body");
  covs[`dashboard-${lang}-${width}`] = cov;
  console.log(`      coverage ${tag}: ${cov.count} gaps`);
  check(`${tag}: no console or page error`, errors.length === 0, errors.join(" ; "));
  if (["en", "ar"].includes(lang) && [1440, 390].includes(width)) {
    const card = page.locator("section", { has: page.locator("sc-for, p") }).filter({ hasText: /./ }).nth(0);
    void card;
    const sec = await page.evaluateHandle(() => [...document.querySelectorAll("section")].find((s) => /^(where the money goes|wohin das geld|où va l|أين يذهب)/i.test(s.querySelector("h2")?.textContent.trim() ?? "")) || null);
    const el = sec.asElement();
    if (el) await el.screenshot({ path: resolve(out, `${label}-dashboard-${lang}-${width}.png`) });
  }
  await ctx.close();
  return cov;
}

// ── detail: chip and toast ─────────────────────────────────────────────────────────────────────────────
async function detail(lang, width) {
  const tag = `detail ${lang} ${width}`;
  const ref = "VT-26-0829";
  // Error toast: the voucher resend is refused.
  {
    const { ctx, page, errors } = await open(lang, width, `/bookings/${ref}`, { voucher: { status: 500, json: { ok: false } } });
    await page.waitForSelector("[data-ops-route-chip]", { timeout: 15000 });
    await page.waitForTimeout(1200);
    await still(page);
    const chip = await page.evaluate(() => {
      const chips = [...document.querySelectorAll("[data-ops-route-chip]")];
      const c = chips.find((e) => /km/.test(e.textContent));
      if (!c) return null;
      const node = [...c.querySelectorAll("*")].reverse().find((e) => e.children.length === 0 && /km/.test(e.textContent)) || c;
      const text = node.firstChild;
      const range = document.createRange();
      const s = text.nodeValue;
      const iNum = s.indexOf("240");
      const iKm = s.indexOf("km");
      range.setStart(text, iNum); range.setEnd(text, iNum + 3);
      const num = range.getBoundingClientRect();
      range.setStart(text, iKm); range.setEnd(text, iKm + 2);
      const km = range.getBoundingClientRect();
      return { text: s.trim(), numLeftOfKm: num.left < km.left, cls: node.className, dir: getComputedStyle(node).direction };
    });
    check(`${tag}: the distance chip reads "240 km" left to right`, !!chip && chip.text === "240 km" && chip.numLeftOfKm, JSON.stringify(chip));
    // Open the actions and resend the voucher: refused.
    await resendVoucher(page);
    await page.waitForTimeout(700);
    const toast = page.locator(".vt-toast").first();
    const shown = await toast.isVisible().catch(() => false);
    check(`${tag}: a refused resend shows an error toast`, shown);
    if (shown) {
      const aria = await page.locator(".vt-toast__close").first().getAttribute("aria-label");
      check(`${tag}: the toast's close button reads "${DISMISS[lang]}"`, AFTER ? aria === DISMISS[lang] : aria === "Dismiss", aria ?? "");
      if (["en", "ar"].includes(lang) && [1440, 390].includes(width)) {
        await page.locator(".vt-toast").first().evaluate((e) => e.parentElement.scrollIntoView());
        const box = await page.locator(".vt-toast").first().boundingBox();
        if (box) await page.screenshot({ path: resolve(out, `${label}-toast-error-${lang}-${width}.png`), clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: Math.min(width, box.width + 24), height: box.height + 24 } });
        const chipBox = await page.locator("[data-ops-route-chip]").filter({ hasText: "km" }).first().boundingBox();
        if (chipBox) await page.screenshot({ path: resolve(out, `${label}-chip-${lang}-${width}.png`), clip: { x: Math.max(0, chipBox.x - 12), y: Math.max(0, chipBox.y - 8), width: Math.min(width, chipBox.width + 24), height: chipBox.height + 16 } });
      }
      await page.waitForTimeout(5000);
      const still5 = await toast.isVisible().catch(() => false);
      check(`${tag}: the error toast is still there after 5 s`, AFTER ? still5 : !still5, `visible=${still5}`);
      if (AFTER && still5) {
        await page.locator(".vt-toast__close").first().click();
        await page.waitForTimeout(300);
        check(`${tag}: the close button closes it`, !(await toast.isVisible().catch(() => false)));
      }
    }
    check(`${tag}: no console or page error`, errors.length === 0, errors.join(" ; "));
    const cov = await coverage(page, "body");
    covs[`detail-${lang}-${width}`] = cov;
    console.log(`      coverage ${tag}: ${cov.count} gaps`);
    await ctx.close();
  }
  // Success toast: fades after 3.6 s.
  if (width === 1440) {
    const { ctx, page } = await open(lang, width, `/bookings/${ref}`);
    await page.waitForSelector("[data-ops-route-chip]", { timeout: 15000 });
    await page.waitForTimeout(1000);
    await resendVoucher(page);
    await page.waitForTimeout(600);
    const shown = await page.locator(".vt-toast").first().isVisible().catch(() => false);
    await page.waitForTimeout(4200);
    const gone = !(await page.locator(".vt-toast").first().isVisible().catch(() => false));
    check(`${tag}: a success toast shows and has gone after 4.8 s`, shown && gone, `shown=${shown} gone=${gone}`);
    await ctx.close();
  }
}

for (const lang of LANGS) {
  for (const width of lang === "en" || lang === "ar" ? [1440, 390] : [1440]) {
    await board(lang, width);
    await dashboard(lang, width);
    await detail(lang, width);
  }
}
await browser.close();
server.close();
writeFileSync(resolve(out, `${label}-coverage.json`), JSON.stringify(covs, null, 1));
console.log(bad ? `${bad} FAILED` : "all passed");
process.exit(bad ? 1 : 0);
