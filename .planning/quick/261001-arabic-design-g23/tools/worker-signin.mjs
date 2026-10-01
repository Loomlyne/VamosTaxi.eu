// Sign-in code step on the local Worker build: the disabled SIGN IN button is grey (not pale
// yellow) and the field hint reaches 4.5:1, at 1440/1024/768/390 in four languages.
// usage: node worker-signin.mjs <base url> <out dir>
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const lum = (rgb) => {
  const c = rgb.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let fails = 0;
const browser = await chromium.launch();
for (const lang of ["en", "de", "fr", "ar"]) {
  for (const w of [1440, 1024, 768, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
    await ctx.route("**/api/**", (r) => {
      if (r.request().method() === "POST" && /\/api\/auth$/.test(r.request().url())) {
        return r.fulfill({ contentType: "application/json", body: "null" });
      }
      return r.fulfill({ json: { ok: true, signedIn: false } });
    });
    const page = await ctx.newPage();
    await page.goto(base + (lang === "en" ? "" : "/" + lang) + "/sign-in", { waitUntil: "load" });
    await page.waitForTimeout(1800);
    // "Email me a link instead" is the second data-af-link control (the first is Forgot password).
    await page.locator("button[data-af-link]:visible").last().click();
    await page.waitForTimeout(400);
    await page.locator('input[type="email"]').first().fill("amira@example.com");
    await page.locator("main button.vt-btn--primary").first().click();
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const btn = document.querySelector("[data-af-code] .vt-btn--primary[disabled]");
      const hint = document.querySelector("[data-af-code] .vt-field__hint");
      const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      if (!btn || !hint) return null;
      const bs = getComputedStyle(btn), hs = getComputedStyle(hint);
      // Resolve the hint colour to sRGB through a canvas (the token is an oklab color-mix).
      const cv = document.createElement("canvas").getContext("2d");
      cv.fillStyle = hs.color; cv.fillRect(0, 0, 1, 1);
      const px = Array.from(cv.getImageData(0, 0, 1, 1).data).slice(0, 3);
      return { bg: rgb(bs.backgroundColor), op: bs.opacity, hint: px };
    });
    if (!r) { console.log("FAIL", lang, w, "code step not reached"); fails++; await ctx.close(); continue; }
    const yellow = r.bg[0] > 240 && r.bg[1] > 180 && r.bg[2] < 120;
    const cr = ratio(r.hint, [255, 255, 255]);
    const ok = !yellow && r.op === "1" && cr >= 4.5;
    if (!ok) fails++;
    console.log(ok ? "PASS" : "FAIL", lang, w, `button rgb(${r.bg}) opacity ${r.op}; hint rgb(${r.hint}) ${cr.toFixed(2)}:1 on white`);
    if (w === 1440 || w === 390) await page.locator("[data-af-code]").first().screenshot({ path: `${out}/signin-code-${lang}-${w}.png` });
    await ctx.close();
  }
}
await browser.close();
console.log(fails ? `${fails} FAIL` : "ALL PASS");
process.exit(fails ? 1 : 0);
