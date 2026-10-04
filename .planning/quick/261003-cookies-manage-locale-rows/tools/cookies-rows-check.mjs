// The owner-approved vt_manage and NEXT_LOCALE rows on the /cookies DC mock: en/de/fr/ar at 390 and 1440,
// approved wording, VamosLocale.coverage of the table empty, Arabic RTL, no sideways scroll.
//   static server of apps/web/public on BASE; WEB_DIR=apps/web node cookies-rows-check.mjs <evidenceDir>
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium } = createRequire(process.env.WEB_DIR + "/package.json")("@playwright/test");
const BASE = process.env.BASE ?? "http://127.0.0.1:4817";
const dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true });
const WANT = {
  vt_manage: {
    en: ["Lets you open and change your booking from this browser without signing in", "30 days"],
    de: ["Damit Sie Ihre Buchung in diesem Browser ohne Anmeldung öffnen und ändern können", "30 Tage"],
    fr: ["Vous permet d'ouvrir et de modifier votre réservation depuis ce navigateur sans vous connecter", "30 jours"],
    ar: ["يتيح لك فتح حجزك وتعديله من هذا المتصفح دون تسجيل الدخول", "30 يومًا"],
  },
  NEXT_LOCALE: {
    en: ["Keeps the site in the language you chose", "1 year"],
    de: ["Zeigt die Website in der Sprache, die Sie gewählt haben", "1 Jahr"],
    fr: ["Affiche le site dans la langue que vous avez choisie", "1 an"],
    ar: ["يُبقي الموقع باللغة التي اخترتها", "سنة واحدة"],
  },
};
const b = await chromium.launch();
const results = [];
let fail = 0;
for (const vp of (process.env.VPS ?? "390,1440").split(",").map(Number)) {
  for (const lang of (process.env.LANGS ?? "en,de,fr,ar").split(",")) {
    const ctx = await b.newContext({ viewport: { width: vp, height: vp === 390 ? 844 : 900 } });
    await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
    const p = await ctx.newPage();
    for (let attempt = 1; ; attempt++) {
      try {
        await p.goto(BASE + "/app/pages/cookies.html", { waitUntil: "load", timeout: 45000 });
        await p.locator("#necessary tr", { hasText: "vt_manage" }).waitFor({ state: "attached", timeout: 30000 });
        await p.waitForFunction(() => window.VamosLocale && typeof window.VamosLocale.coverage === "function", null, { timeout: 30000 });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
      }
    }
    await p.waitForTimeout(2700);
    await p.locator("button", { hasText: /necessary only|nur notwendige|nécessaires uniquement|uniquement les nécessaires|الضرورية فقط/i }).first().click({ timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(800);
    const cov = await p.evaluate(() => window.VamosLocale.coverage(document.querySelector("#necessary")));
    const dirAttr = await p.evaluate(() => document.documentElement.dir);
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    for (const name of ["vt_manage", "NEXT_LOCALE"]) {
      const row = p.locator("#necessary tr", { hasText: name });
      const visible = await row.isVisible();
      const text = (await row.innerText()).replace(/\s+/g, " ");
      if (visible) {
        await row.scrollIntoViewIfNeeded();
        await row.screenshot({ path: `${dir}/row-${name}-${lang}-${vp}.png` });
      }
      const ok = visible && WANT[name][lang].every((w) => text.includes(w)) && text.includes("Vamos Taxi") && cov.count === 0 && !sideways && (lang !== "ar" || dirAttr === "rtl");
      if (!ok) fail++;
      const line = `${ok ? "PASS" : "FAIL"} | ${name} ${lang} ${vp} | row "${text.slice(0, 150)}" | coverage ${cov.count} ${JSON.stringify(cov.strings).slice(0, 80)} | dir ${dirAttr} | sideways ${sideways} | visible ${visible}`;
      results.push(line); console.log(line);
    }
    await p.screenshot({ path: `${dir}/page-${lang}-${vp}.png` });
    await ctx.close();
  }
}
fs.writeFileSync(`${dir}/results-${(process.env.VPS ?? "all").replace(",", "-")}-${process.env.LANGS ?? "all"}.txt`, results.join("\n") + "\n");
await b.close();
process.exit(fail ? 1 : 0);
