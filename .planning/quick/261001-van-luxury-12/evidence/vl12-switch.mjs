// Van luxury 12, review fix 1: a page read in German or French, then switched to Arabic with the header's
// language menu. The travellers label must keep Arabic's 3-10 form for 7 and the 11-99 form for 12.
// OLD=1 serves origin/main's vamos-locale.js instead (to show the fault the fix removes).
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:4490";
const SHOTS = process.env.SHOTS ?? "/tmp";
const OLD = process.env.OLD_LOCALE; // path to the old runtime, optional
const rec = (n, ok, ev) => console.log(`${ok ? "PASS" : "FAIL"} | ${n} | ${ev}`);

const browser = await chromium.launch();
for (const from of ["de", "fr"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, from);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
  let oldServed = 0;
  if (OLD) await page.route(/\/app\/vamos-locale\.js(\?.*)?$/, (r) => { oldServed++; return r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(OLD, "utf8") }); });
  await page.goto(`${BASE}/${from}/`, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: /nur notwendige|nécessaires uniquement/i }).first().click({ timeout: 3000 }).catch(() => {});
  const btn = page.locator("[data-trav-btn]");
  await btn.click();
  const plus = page.locator("[data-trav-panel] button[data-step]").nth(1);
  for (let i = 0; i < 6; i++) await plus.click();
  await btn.click(); // close
  await page.waitForTimeout(300);
  const before = await btn.getAttribute("aria-label");
  // The header's language menu, as a reader uses it.
  let how = "header menu";
  try {
    await page.locator("[data-hd-wide] button").first().click({ timeout: 3000 });
    await page.locator("text=العربية").first().click({ timeout: 3000 });
  } catch (e) {
    how = "VamosLocale.setLang";
    await page.evaluate(() => window.VamosLocale.setLang("ar"));
  }
  await page.waitForTimeout(800);
  const dir = await page.evaluate(() => document.documentElement.dir);
  const after7 = await btn.getAttribute("aria-label");
  const title7 = await btn.getAttribute("title");
  rec(`S1 ${from}→ar: 7 travellers keep the 3-10 form`, after7 === "7 ركاب · 0 حقائب" && title7 === "7 ركاب · 0 حقائب" && dir === "rtl", `before "${before}" → after "${after7}" (title "${title7}"), dir=${dir}, via ${how}`);
  await btn.click();
  for (let i = 0; i < 6 && (await plus.isEnabled()); i++) await plus.click();
  await page.waitForTimeout(300);
  const after12 = await btn.getAttribute("aria-label");
  rec(`S2 ${from}→ar: 12 travellers take the 11-99 form`, after12 === "12 راكبًا · 0 حقائب", `"${after12}"`);
  // And back to English: nothing stays Arabic.
  await page.evaluate(() => window.VamosLocale.setLang("en"));
  await page.waitForTimeout(600);
  const backEn = await btn.getAttribute("aria-label");
  rec(`S3 ${from}→ar→en: back to English`, backEn === "12 passengers · 0 bags", `"${backEn}"`);
  await page.screenshot({ path: `${SHOTS}/switch-${from}-ar${OLD ? "-old" : ""}.png` });
  console.log(`errors ${from}`, JSON.stringify(errors), OLD ? `old runtime served ${oldServed}x` : "");
  await ctx.close();
}
await browser.close();
