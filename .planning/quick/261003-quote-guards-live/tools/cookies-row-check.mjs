// The owner-approved vamos_qs row on the /cookies DC mock: shown in en/de/fr/ar at 390 and 1440, with the
// approved wording, translated by the runtime (VamosLocale.coverage of the table is empty), Arabic RTL, no sideways scroll.
//   static server of apps/web/public on BASE; WEB_DIR=apps/web node cookies-row-check.mjs <evidenceDir>
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium } = createRequire(process.env.WEB_DIR + "/package.json")("@playwright/test");
const BASE = process.env.BASE ?? "http://127.0.0.1:4793";
const dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true });
const WANT = {
  en: ["Keeps price requests fair between visitors and blocks automated abuse", "24 hours"],
  de: ["Verteilt Preisanfragen fair auf die Besucher und blockiert automatisierten Missbrauch", "24 Stunden"],
  fr: ["Répartit équitablement les demandes de prix entre les visiteurs et bloque les abus automatisés", "24 heures"],
  ar: ["يوزّع طلبات الأسعار بإنصاف بين الزوار ويمنع الاستخدام الآلي المسيء", "24 ساعة"],
};
const b = await chromium.launch();
const results = [];
let fail = 0;
for (const vp of [390, 1440]) {
  for (const lang of ["en", "de", "fr", "ar"]) {
    const ctx = await b.newContext({ viewport: { width: vp, height: vp === 390 ? 844 : 900 } });
    await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
    const p = await ctx.newPage();
    const row = p.locator("#necessary tr", { hasText: "vamos_qs" });
    // The mock loads React and Babel from unpkg; on a loaded Mac a first load can stall. Up to 3 tries.
    for (let attempt = 1; ; attempt++) {
      try {
        await p.goto(BASE + "/app/pages/cookies.html", { waitUntil: "load", timeout: 45000 });
        await row.waitFor({ state: "attached", timeout: 30000 });
        await p.waitForFunction(() => window.VamosLocale && typeof window.VamosLocale.coverage === "function", null, { timeout: 30000 });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
      }
    }
    await p.waitForTimeout(1200);
    await p.waitForTimeout(1500);
    // The cookie banner sits over the table on a phone: answer it with "necessary only" (any language).
    await p.locator("button", { hasText: /necessary only|nur notwendige|nécessaires uniquement|uniquement les nécessaires|الضرورية فقط/i }).first().click({ timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(800);
    const visible = await row.isVisible();
    const text = (await row.innerText()).replace(/\s+/g, " ");
    const cov = await p.evaluate(() => window.VamosLocale.coverage(document.querySelector("#necessary")));
    const dirAttr = await p.evaluate(() => document.documentElement.dir);
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (visible) {
      await row.scrollIntoViewIfNeeded();
      await row.screenshot({ path: `${dir}/row-${lang}-${vp}.png` });
    }
    await p.screenshot({ path: `${dir}/page-${lang}-${vp}.png` });
    const ok = visible && WANT[lang].every((w) => text.includes(w)) && text.includes("Vamos Taxi") && cov.count === 0 && !sideways && (lang !== "ar" || dirAttr === "rtl");
    if (!ok) fail++;
    const line = `${ok ? "PASS" : "FAIL"} | ${lang} ${vp} | row "${text.slice(0, 140)}" | coverage ${cov.count} ${JSON.stringify(cov.strings).slice(0, 80)} | dir ${dirAttr} | sideways ${sideways} | visible ${visible}`;
    results.push(line); console.log(line);
    await ctx.close();
  }
}
fs.writeFileSync(`${dir}/results.txt`, results.join("\n") + "\n");
await b.close();
process.exit(fail ? 1 : 0);
