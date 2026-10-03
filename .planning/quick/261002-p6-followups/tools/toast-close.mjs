// Check for patch C: with the new toast box, the toast's own close button still works (pointer-events:auto on the toast,
// none on the wide wrapper). usage: node toast-close.mjs <synced public root>
import { createRequire } from "node:module";
import { serve } from "./serve.mjs";
import { apiHandler, HIDE, TOKEN, REF } from "./stubs.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [root] = process.argv.slice(2);
const after = await serve(root, { patches: new Set(["reach", "phones", "time", "toast"]) });
const browser = await chromium.launch();

const CASES = [
  ["manage-booking", `/manage-booking?token=${TOKEN}`, false, "en", 1440],
  ["manage-booking", `/manage-booking?token=${TOKEN}`, false, "ar", 390],
  ["booking-detail", `/booking-detail?ref=${REF}`, true, "en", 390],
  ["booking-detail", `/booking-detail?ref=${REF}`, true, "ar", 1440],
];
for (const [name, path, signedIn, lang, w] of CASES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
  await page.route("**/api/**", apiHandler({ signedIn, timeChange: { status: 409, body: { ok: false, code: "staff-change-waiting" } } }));
  try {
    await page.goto(after.base + path, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.addStyleTag({ content: HIDE });
    await page.locator("button[data-fork]").first().click();
    await page.waitForTimeout(600);
    await page.locator('main button[aria-haspopup="dialog"]').first().click();
    await page.waitForTimeout(500);
    await page.locator("[data-wp-time] button").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-wp-row]").locator("xpath=..").locator("button").last().click();
    await page.waitForTimeout(600);
    const req = page.locator("main button.vt-btn--primary:not([disabled])").last();
    await req.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await req.click();
    await page.waitForTimeout(400);
    const closeBtn = page.locator('[aria-live="polite"] button');
    const before = await closeBtn.count();
    await closeBtn.first().click();
    await page.waitForTimeout(400);
    const afterCount = await page.locator('[aria-live="polite"]').count();
    console.log(name, lang, w, "toast buttons before click:", before, "| toast boxes after clicking close:", afterCount, afterCount === 0 ? "-> closed" : "-> STILL THERE");
  } catch (e) {
    console.log(name, lang, w, "FAIL", String(e).split("\n")[0]);
  }
  await ctx.close();
}
await browser.close();
after.server.close();
