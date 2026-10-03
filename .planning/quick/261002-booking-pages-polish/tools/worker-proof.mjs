// Click-through of quick task 261002-booking-pages-polish on the LOCAL Worker build (wrangler dev --local, no
// database behind it: every /api/* is answered in the browser by stubs.mjs, "after" shapes; pages, middleware,
// routing, locale prefixes and headers are the Worker's own).
// usage: node worker-proof.mjs <base url> <out dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { apiHandler, HIDE, TOKEN, REF } from "./stubs.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [base, out] = process.argv.slice(2);
const SECTIONS = new Set((process.env.SECTIONS || "1,2,3,4").split(","));
mkdirSync(out, { recursive: true });

const results = [];
const log = (ok, what, detail = "") => {
  results.push({ ok, what, detail });
  console.log(ok ? "PASS" : "FAIL", what, typeof detail === "string" ? detail : JSON.stringify(detail));
};
const GUEST = `/manage-booking?token=${TOKEN}`;
const DETAIL = `/booking-detail?ref=${REF}`;
const DAY = { en: "Tue 6 Oct", de: "Di. 6. Okt.", fr: "mar. 6 oct.", ar: "الثلاثاء، 6 أكتوبر" };
const COUNTRY = { en: "Switzerland", de: "Schweiz", fr: "Suisse", ar: "سويسرا" };
const browser = await chromium.launch();

async function page(lang, w, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
  const calls = [];
  const bodies = [];
  await ctx.route("**/api/**", (route) => {
    const req = route.request();
    if (req.method() === "POST") bodies.push({ path: new URL(req.url()).pathname, body: req.postData() });
    return apiHandler({ side: "after", log: calls, ...opts })(route);
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(10000);
  p.__calls = calls;
  p.__bodies = bodies;
  p.__ctx = ctx;
  return p;
}
async function open(p, path, lang) {
  const prefix = lang && lang !== "en" ? "/" + lang : "";
  const res = await p.goto(base + prefix + path, { waitUntil: "load" });
  await p.waitForTimeout(2200);
  await p.addStyleTag({ content: HIDE });
  await p.waitForTimeout(300);
  return res;
}
const text = (p, sel) => p.locator(sel).first().innerText().catch(() => "");
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const coverage = (p, lang) => p.evaluate((l) => {
  const r = window.VamosLocale.coverage(document.querySelector("main") || document.body, l);
  const vals = (x) => (Array.isArray(x) ? x : Object.keys(x || {}));
  return { count: r.count, strings: vals(r.strings), attrs: vals(r.attrs) };
}, lang);

if (SECTIONS.has("1")) {
// 1. Signed-in booking page: real status, Cancel tile, cancel works, refund country localised. en and ar.
for (const lang of ["en", "ar"]) {
  const p = await page(lang, 390, { signedIn: true });
  const res = await open(p, DETAIL, lang);
  log(res && res.status() === 200, `bd ${lang}: Worker serves /booking-detail`, String(res && res.status()));
  const badge = await text(p, "article[data-card] .vt-badge");
  log(lang === "en" ? /confirmed/i.test(badge) : !/الدفع/.test(badge) && badge.length > 0, `bd ${lang}: badge is the real status, not "Awaiting payment"`, badge);
  const forks = await p.locator("button[data-fork]").count();
  log(forks === 2, `bd ${lang}: Change and Cancel tiles both show`, String(forks));
  await p.locator("button[data-fork]").nth(1).click();
  await p.waitForTimeout(700);
  const confirm = p.locator("main button.vt-btn").filter({ hasText: lang === "en" ? /confirm cancellation/i : /تأكيد|الإلغاء/ }).first();
  log(await confirm.isVisible().catch(() => false), `bd ${lang}: cancel screen offers the confirm button (window auto_full)`);
  await confirm.click().catch(() => {});
  await p.waitForTimeout(900);
  const posted = p.__bodies.find((b) => b.path === "/api/account/bookings/paid-cancel");
  log(!!posted && /VT-26-0807/.test(posted.body || ""), `bd ${lang}: cancel POSTs the account route with this booking`, posted ? posted.body : "none");
  const refund = await p.locator("article[data-card]").first().innerText().catch(() => "");
  log(refund.includes(COUNTRY[lang]), `bd ${lang}: refunded line names the country in ${lang}`, refund.split("\n").filter((l) => l.includes(COUNTRY[lang]) || /Switzerland/.test(l)).join(" | "));
  await p.screenshot({ path: `${out}/bd-cancelled-${lang}-390.png`, fullPage: false });
  await p.__ctx.close();
}

}
if (SECTIONS.has("2")) {
// 2. Dates in four languages, live language switch, both pages, four widths, no sideways scroll.
for (const w of [1440, 1024, 768, 390]) {
  for (const lang of ["en", "de", "fr", "ar"]) {
    for (const [name, path, signedIn] of [["mb", GUEST, false], ["bd", DETAIL, true]]) {
      const p = await page(lang, w, { signedIn });
      await open(p, path, lang);
      const pill = await text(p, "article[data-card] [data-pill]");
      log(pill.includes(DAY[lang]) && pill.includes("08:15"), `${name} ${lang} ${w}: date pill`, pill);
      const sw = await sideways(p);
      log(sw <= 0, `${name} ${lang} ${w}: no sideways scroll (booking view)`, String(sw));
      if (w === 390 && lang === "de") {
        await p.evaluate(() => window.VamosLocale.setLang("fr"));
        await p.waitForTimeout(700);
        const pill2 = await text(p, "article[data-card] [data-pill]");
        log(pill2.includes(DAY.fr), `${name} de→fr live switch relabels the date`, pill2);
        await p.evaluate(() => window.VamosLocale.setLang("de"));
        await p.waitForTimeout(700);
      }
      // Change view: pick a new time with the picker, request it, check the labels, the POST and the toast.
      if (w === 390 || w === 1440) {
        await p.locator("button[data-fork]").first().click();
        await p.waitForTimeout(700);
        await p.locator('main button[aria-haspopup="dialog"]').first().click();
        await p.waitForTimeout(500);
        // Spinner order: hour left of minute in every language.
        const order = await p.evaluate(() => {
          const col = document.querySelector("[data-wp-time]");
          const big = col ? [...col.querySelectorAll("span")].filter((s) => s.children.length === 0 && /^\d{2}$/.test(s.textContent.trim()) && parseFloat(getComputedStyle(s).fontSize) >= 30) : [];
          return big.length >= 2 ? { h: big[0].textContent, m: big[1].textContent, hx: big[0].getBoundingClientRect().x, mx: big[1].getBoundingClientRect().x } : null;
        });
        log(!!order && order.hx < order.mx, `${name} ${lang} ${w}: change-view picker reads hour : minute left to right`, order);
        await p.locator("[data-wp-time] button[aria-label]").first().click();
        await p.waitForTimeout(250);
        await p.locator("[data-wp-row]").locator("xpath=..").locator("button").last().click().catch(() => {});
        await p.waitForTimeout(500);
        const sw2 = await sideways(p);
        log(sw2 <= 0, `${name} ${lang} ${w}: no sideways scroll (change view)`, String(sw2));
        const card = await p.locator('div[data-card][data-noprint]').filter({ has: p.locator('[aria-haspopup="dialog"]') }).first().innerText().catch(() => "");
        log(card.includes(DAY[lang]) && card.includes("09:15"), `${name} ${lang} ${w}: booked-for / new pickup labelled in ${lang}`, card.split("\n").filter((l) => /09:15|08:15/.test(l)).join(" | "));
        if (lang === "en") {
          const cov = { de: await coverage(p, "de"), fr: await coverage(p, "fr"), ar: await coverage(p, "ar") };
          log(cov.de.count === 0 && cov.fr.count === 0 && cov.ar.count === 0, `${name} ${w}: coverage empty on the change view (de/fr/ar)`, cov);
        }
        await p.locator("main button.vt-btn--primary:not([disabled])").last().click();
        await p.waitForTimeout(700);
        const tc = p.__bodies.find((b) => /time-change$/.test(b.path));
        log(!!tc && /2026-10-06T09:15/.test(tc.body || "") && (signedIn ? /account/.test(tc.path) : /manage/.test(tc.path)), `${name} ${lang} ${w}: time change POSTs day and new time on the right route`, tc ? tc.path + " " + tc.body : "none");
        const toast = await p.locator('[aria-live="polite"]').first().innerText().catch(() => "");
        log(toast.includes(DAY[lang]), `${name} ${lang} ${w}: toast names the booked day in ${lang}`, toast.replace(/\s+/g, " ").slice(0, 160));
        const row = await p.locator("article[data-card]").first().innerText().catch(() => "");
        log(row.includes("09:15") && row.includes(DAY[lang]), `${name} ${lang} ${w}: "change requested" row labelled`, row.split("\n").filter((l) => /09:15/.test(l)).join(" | "));
        if (w === 390 && (lang === "ar" || lang === "de")) await p.screenshot({ path: `${out}/${name}-requested-${lang}-390.png` });
      }
      if (lang === "en" && w === 1440) {
        await open(p, path, lang);
        const cov = { de: await coverage(p, "de"), fr: await coverage(p, "fr"), ar: await coverage(p, "ar") };
        log(cov.de.count === 0 && cov.fr.count === 0 && cov.ar.count === 0, `${name}: coverage empty on the booking view (de/fr/ar)`, cov);
      }
      await p.__ctx.close();
    }
  }
}

}
if (SECTIONS.has("3")) {
// 3. Arabic bag counts on the voucher, and the refund line in four languages.
for (const bags of [0, 1, 2, 5, 10, 11, 12, 16]) {
  const p = await page("ar", 390, { bags, pax: bags > 10 ? 12 : 3 });
  await open(p, GUEST, "ar");
  await p.getByRole("button", { name: /قسيمة|voucher/i }).first().click();
  await p.waitForTimeout(600);
  const v = await p.locator("[data-confirmation-voucher]").first().innerText().catch(() => "");
  const want = { 0: "0 حقيبة", 1: "حقيبة واحدة", 2: "حقيبتان", 5: "5 حقائب", 10: "10 حقائب", 11: "11 حقيبةً", 12: "12 حقيبةً", 16: "16 حقيبةً" }[bags];
  log(v.includes(want), `voucher ar: ${bags} bags reads ${want}`, v.split("\n").filter((l) => /حقيب/.test(l)).join(" | "));
  await p.__ctx.close();
}
for (const lang of ["en", "de", "fr", "ar"]) {
  const p = await page(lang, 390, { refunded: true });
  await open(p, GUEST, lang);
  const c = await p.locator("article[data-card]").first().innerText().catch(() => "");
  const ok = c.includes(COUNTRY[lang]) && (lang === "en" || !c.includes("Switzerland")) && c.includes(DAY[lang] === DAY.en ? "Fri 9 Oct" : { de: "Fr. 9. Okt.", fr: "ven. 9 oct.", ar: "الجمعة، 9 أكتوبر" }[lang]);
  log(ok, `refund line ${lang}: country and payout day in ${lang}`, c.split("\n").filter((l) => /Stripe|سترايب|Switzerland|Schweiz|Suisse|سويسرا/.test(l)).join(" | "));
  await p.__ctx.close();
}

}
if (SECTIONS.has("4")) {
// 4. Home time picker: hour left of minute in Arabic (and English), desktop and phone.
for (const lang of ["ar", "en"]) {
  for (const w of [1440, 390]) {
    const p = await page(lang, w);
    await open(p, "/", lang);
    try {
      if (w < 700) {
        await p.locator("#book button[data-bb]").first().click();
        await p.waitForTimeout(900);
        const pickers = p.locator('button[aria-haspopup="dialog"]:visible');
        await pickers.nth(Math.max(0, (await pickers.count()) - 1)).click();
      } else {
        const when = p.locator("#book [data-bx=when]");
        await when.scrollIntoViewIfNeeded();
        await when.locator('button[aria-haspopup="dialog"]').first().click();
      }
      await p.waitForTimeout(900);
      const order = await p.evaluate(() => {
        const col = document.querySelector("[data-wp-time]");
        const big = col ? [...col.querySelectorAll("span")].filter((s) => s.children.length === 0 && /^\d{2}$/.test(s.textContent.trim()) && parseFloat(getComputedStyle(s).fontSize) >= 30) : [];
        return big.length >= 2 ? { h: big[0].textContent, m: big[1].textContent, hx: big[0].getBoundingClientRect().x, mx: big[1].getBoundingClientRect().x } : null;
      });
      log(!!order && order.hx < order.mx, `home ${lang} ${w}: time picker reads hour : minute left to right`, order);
    } catch (e) {
      log(false, `home ${lang} ${w}: time picker`, String(e).split("\n")[0]);
    }
    await p.__ctx.close();
  }
}

}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
writeFileSync(`${out}/worker-proof.json`, JSON.stringify({ base, when: new Date().toISOString(), passed: results.length - failed, failed, results }, null, 2));
console.log(`\n${results.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
