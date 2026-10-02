// Coverage on main (before) vs this branch (after), English render, de/fr/ar targets, both booking pages,
// booking view and change view. usage: node coverage-compare.mjs <before public root> <after public root>
import { createRequire } from "node:module";
import { serve } from "./serve.mjs";
import { apiHandler, TOKEN, REF } from "./stubs.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [beforeRoot, afterRoot] = process.argv.slice(2);
const browser = await chromium.launch();
const out = {};
for (const [side, root] of [["before", beforeRoot], ["after", afterRoot]]) {
  const srv = await serve(root);
  for (const [name, path, signedIn] of [["mb", `/manage-booking?token=${TOKEN}`, false], ["bd", `/booking-detail?ref=${REF}`, true]]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => localStorage.setItem("vamosLang", "en"));
    await ctx.route("**/api/**", apiHandler({ side, signedIn }));
    const p = await ctx.newPage();
    await p.goto(srv.base + path, { waitUntil: "load" });
    await p.waitForTimeout(2200);
    const cov = () =>
      p.evaluate(() => {
        const v = (x) => (Array.isArray(x) ? x : Object.keys(x || {}));
        const m = document.querySelector("main");
        return [...new Set(["de", "fr", "ar"].flatMap((l) => v(window.VamosLocale.coverage(m, l).strings)))];
      });
    const views = { booking: await cov() };
    await p.locator("button[data-fork]").first().click();
    await p.waitForTimeout(700);
    views.change = await cov();
    out[`${side} ${name}`] = views;
    await ctx.close();
  }
  srv.server.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
