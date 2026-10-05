// "Before" crops of the sign-up and forgot-password forms: origin/main's AuthForm.dc.html served statically
// (no Worker, no Turnstile). Bare crops of the form column, no frame. Usage:
//   node before-crops.mjs <webDir> <baseUrl> <outDir>
import { createRequire } from "node:module";
import fs from "node:fs";

const [, , webDir, base, out] = process.argv;
const { chromium } = createRequire(webDir + "/package.json")("@playwright/test");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });

for (const [width, height] of [[390, 844], [1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto(base + "/sign-up", { waitUntil: "load" });
  await page.waitForSelector("[data-af] h1", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.locator("button", { hasText: /necessary only/i }).first().click({ timeout: 1500 }).catch(() => {});
  await page.addStyleTag({ content: "[data-ck-banner],[data-ck-veil],[data-contact-btn],[data-jump]{display:none!important}" });
  const el = page.locator("[data-af]").first();
  await el.screenshot({ path: `${out}/before-signup-${width}.png` });
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(`before sign-up ${width}: sideways scroll = ${sideways}`);
  await page.getByRole("button", { name: /forgot password|back to sign in/i }).first().click({ timeout: 1500 }).catch(() => {});
  await ctx.close();
}
await browser.close();
