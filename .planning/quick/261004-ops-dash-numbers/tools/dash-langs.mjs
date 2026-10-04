// 261004 ops-dash-numbers: the dashboard in en and ar at 1440 and 390 — coverage() on <main>, sideways
// scroll, and the Expenses foot in all four languages (7 days, where there is a refund). Lab only.
// Usage: eval "$(scripts/test-lab/lab.sh env <name>)" && node .planning/quick/261004-ops-dash-numbers/tools/dash-langs.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { start, open, dashboardSignIn, DASH } from "../../../../scripts/test-lab/lab-browser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
await start({ evidenceDir: path.join(here, "..", "evidence", "langs") });

for (const viewport of [1440, 390]) {
  const s = await open({ viewport, lang: "en", name: `langs-${viewport}` });
  await dashboardSignIn(s);
  await s.page.goto(DASH + "/dashboard", { waitUntil: "networkidle" });
  await s.page.waitForTimeout(1500);
  for (const lang of ["en", "de", "fr", "ar"]) {
    await s.page.evaluate((l) => window.VamosLocale.setLang(l), lang);
    await s.page.waitForTimeout(800);
    const r = await s.page.evaluate((l) => {
      const main = document.querySelector("main");
      const cov = window.VamosLocale.coverage(main, l === "en" ? "de" : l);
      return {
        cov: { count: cov.count, strings: cov.strings, attrs: cov.attrs },
        scrollX: document.documentElement.scrollWidth - window.innerWidth,
        dir: document.documentElement.getAttribute("dir"),
        subtitle: main.querySelector("header p")?.textContent,
      };
    }, lang);
    console.log(`${viewport} ${lang} today | coverage ${r.cov.count} ${JSON.stringify(r.cov.strings)} | scrollX ${r.scrollX} | dir ${r.dir} | date "${r.subtitle}"`);
  }
  if (viewport === 1440) {
    await s.page.evaluate(() => window.VamosLocale.setLang("en"));
    await s.page.locator("[data-period-pills] >> text=7 days").first().click();
    await s.page.waitForTimeout(2500);
    for (const lang of ["en", "de", "fr", "ar"]) {
      await s.page.evaluate((l) => window.VamosLocale.setLang(l), lang);
      await s.page.waitForTimeout(800);
      const r = await s.page.evaluate((l) => {
        const main = document.querySelector("main");
        const cov = window.VamosLocale.coverage(main, l === "en" ? "de" : l);
        const tiles = [...main.querySelectorAll("section")][0]?.innerText.replace(/\n+/g, " | ");
        return { count: cov.count, strings: cov.strings, tiles, subtitle: main.querySelector("header p")?.textContent };
      }, lang);
      console.log(`1440 ${lang} 7 days | coverage ${r.count} ${JSON.stringify(r.strings)} | "${r.subtitle}" | ${r.tiles}`);
    }
  }
  await s.ctx.close();
}
process.exit(0);
