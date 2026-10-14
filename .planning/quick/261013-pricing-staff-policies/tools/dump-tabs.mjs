// Prints the visible text of each Pricing tab (English, 1440) from the synced DC tree, stubbed API.
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { serve } from "./serve.mjs";
import * as S from "./stubs.mjs";
const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const { chromium } = createRequire(join(repo, "apps/web/package.json"))("@playwright/test");
const { server, base } = await serve();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem("vamosLang", "en"));
const page = await ctx.newPage();
await S.installStubs(page, { status: { sedan: "live", van: "live", lux: "live" } });
await page.goto(base + "/pricing", { waitUntil: "load" });
await page.waitForTimeout(1500);
const n = await page.locator("[data-set-item]").count();
for (let i = 0; i < n; i++) {
  await page.locator("[data-set-item]").nth(i).click();
  await page.waitForTimeout(700);
  const t = await page.locator("main").first().innerText();
  console.log(`===== tab ${i}\n` + t.replace(/\n{2,}/g, "\n").slice(0, 1800));
}
await browser.close(); server.close();
