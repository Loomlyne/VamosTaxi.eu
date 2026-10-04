import { chromium } from "@playwright/test";
const out = process.argv[2];
const base = "http://127.0.0.1:47391";
const b = await chromium.launch();
for (const [path, tag] of [["/app/pages/cookies.dc.html", "cookies"], ["/app/pages/privacy.dc.html", "privacy"]])
for (const lang of ["en", "de", "fr", "ar"]) for (const w of [390, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  const p = await ctx.newPage();
  await p.goto(base + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  await p.addStyleTag({ content: "[data-ck-banner],[data-ck-modal]{display:none!important}" }).catch(() => {});
  const info = await p.evaluate(() => ({
    dir: document.documentElement.dir,
    cov: window.VamosLocale && window.VamosLocale.coverage ? window.VamosLocale.coverage(document.querySelector("main") || document.body) : null,
    sideways: document.documentElement.scrollWidth > window.innerWidth,
  }));
  console.log(tag, lang, w, "dir", info.dir, "sideways", info.sideways, "untranslated", JSON.stringify(info.cov).slice(0, 300));
  if (lang === "en" || lang === "ar") {
    if (tag === "cookies") {
      for (const id of ["necessary", "analytics", "marketing"]) {
        const loc = p.locator("#" + id).first();
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.screenshot({ path: `${out}-${tag}-${lang}-${w}-${id}.png` }).catch((e) => console.log(e.message));
      }
      await p.screenshot({ path: `${out}-${tag}-${lang}-${w}-full.png`, fullPage: true });
    } else {
      const loc = p.locator("#processors").first();
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.screenshot({ path: `${out}-${tag}-${lang}-${w}-processors.png` }).catch((e) => console.log(e.message));
    }
  }
  await ctx.close();
}
await b.close();
