// Arabic travellers label at 12 on the real home (local Worker 4490).
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "ar"); } catch (e) {} });
const page = await ctx.newPage();
await page.goto("http://localhost:4490/ar/", { waitUntil: "networkidle" });
await page.click("[data-trav-btn]");
const plus = page.locator("[data-trav-panel] button[data-step]").nth(1);
for (let i = 0; i < 20 && (await plus.isEnabled()); i++) await plus.click();
await page.waitForTimeout(400);
const label = await page.locator("[data-trav-btn]").getAttribute("aria-label");
const ok = label === "12 راكبًا · 0 حقائب";
console.log(`${ok ? "PASS" : "FAIL"} | A1 Arabic travellers label at 12 | aria-label=${label}`);
await browser.close();
