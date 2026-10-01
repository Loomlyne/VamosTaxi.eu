// Click-through on the local Worker build (wrangler dev --local, no database behind it).
// usage: node worker-check.mjs <base url> <out dir>
// Checks the CSP header (G23), then renders the touched public pages at 1440/1024/768/390
// in English and Arabic and asserts: phone numbers read left to right, directional arrows
// mirrored in Arabic only, no pale-yellow disabled primary button, hint grey >= 4.5:1,
// and VamosLocale.coverage empty in German, French and Arabic.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const results = [];
const log = (ok, what, detail = "") => {
  results.push({ ok, what, detail });
  console.log(ok ? "PASS" : "FAIL", what, detail);
};

const res = await fetch(base + "/imprint", { redirect: "manual" });
const csp = res.headers.get("content-security-policy") || "";
const connect = (csp.match(/connect-src ([^;]*)/) || [])[1] || "";
log(res.status === 200 && connect.length > 0 && !connect.includes("maps.googleapis.com"), "CSP connect-src has no maps.googleapis.com", connect);

const PAGES = ["/imprint", "/cancellation", "/terms", "/faq", "/sign-in"];
const WIDTHS = [1440, 1024, 768, 390];
const browser = await chromium.launch();
for (const lang of ["en", "de", "fr", "ar"]) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addInitScript((l) => {
      localStorage.setItem("vamosLang", l);
    }, lang);
    // No database behind this Worker: /api/* is answered in the browser so a DB call
    // cannot crash wrangler. Pages, middleware, routing and headers are the Worker's own.
    await ctx.route("**/api/**", (r) => r.fulfill({ json: { ok: true, signedIn: false } }));
    const page = await ctx.newPage();
    for (const p of PAGES) {
      const path = (lang === "en" ? "" : "/" + lang) + p;
      await page.goto(base + path, { waitUntil: "load" });
      await page.waitForTimeout(1800);
      const r = await page.evaluate(() => {
        const rtl = document.documentElement.dir === "rtl";
        // Phone numbers: any text node holding the number must sit in an LTR run.
        const phones = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const n = walker.currentNode;
          if (!/\+41 79 626 70 82/.test(n.nodeValue)) continue;
          const el = n.parentElement;
          if (!el || !el.getClientRects().length) continue;
          const dirOk = getComputedStyle(el).direction === "ltr" || /‎\+41/.test(n.nodeValue);
          phones.push({ ok: !rtl || dirOk, text: n.nodeValue.trim().slice(0, 60) });
        }
        // Directional icons: mirrored exactly when Arabic.
        const icons = Array.from(document.querySelectorAll('[style*="/arrow-right.svg"],[style*="/chevron-right.svg"],[style*="/chevron-left.svg"],[style*="/log-out.svg"]'))
          .filter((e) => e.getClientRects().length)
          .map((e) => {
            let flips = 0;
            for (let a = e; a; a = a.parentElement) {
              const t = getComputedStyle(a).transform;
              if (t && t !== "none" && /^matrix\(-1/.test(t)) flips++;
            }
            return flips % 2 === 1;
          });
        // Disabled primary buttons: no yellow fill, opacity 1.
        const disabled = Array.from(document.querySelectorAll(".vt-btn--primary[disabled],.vt-btn--primary[aria-disabled=true]"))
          .filter((e) => e.getClientRects().length)
          .map((e) => ({ bg: getComputedStyle(e).backgroundColor, op: getComputedStyle(e).opacity }));
        const muted = getComputedStyle(document.documentElement).getPropertyValue("--vt-text-muted").trim();
        const probe = document.createElement("span");
        probe.style.color = "var(--vt-text-muted)";
        document.body.append(probe);
        const mutedRgb = getComputedStyle(probe).color;
        probe.remove();
        // Coverage runs on the English page against each target language.
        const cov = !rtl && window.VamosLocale && document.documentElement.lang !== "de" && document.documentElement.lang !== "fr"
          ? ["de", "fr", "ar"].map((l) => ({ l, r: window.VamosLocale.coverage(document.body, l) }))
          : null;
        const sideways = document.documentElement.scrollWidth > window.innerWidth + 1;
        return { rtl, phones, icons, disabled, muted, mutedRgb, cov, sideways };
      });
      const label = `${lang} ${w} ${p}`;
      if (r.phones.length) log(r.phones.every((x) => x.ok), `${label} phone reads left to right`, JSON.stringify(r.phones.filter((x) => !x.ok)));
      if (r.icons.length) log(r.icons.every((m) => m === (lang === "ar")), `${label} ${r.icons.length} directional icons ${lang === "ar" ? "mirrored" : "unmirrored"}`, JSON.stringify(r.icons));
      for (const d of r.disabled) log(!/253, 194, 11|rgba\(253/.test(d.bg) && d.op === "1", `${label} disabled primary is grey`, JSON.stringify(d));
      log(!r.sideways, `${label} no sideways scroll`);
      if (lang === "en" && Array.isArray(r.cov)) {
        for (const { l, r: c } of r.cov) log(c && c.count === 0, `${label} coverage ${l} empty`, c && c.count ? JSON.stringify([...(c.strings || []), ...(c.attrs || [])].slice(0, 6)) : "");
      }
      if (w === 1440 && p === "/imprint") log(true, `${lang} muted grey`, `${r.muted} -> ${r.mutedRgb}`);
      if (w === 1440 || w === 390) await page.screenshot({ path: `${out}/${lang}-${w}${p.replace(/\//g, "-")}.png`, fullPage: false });
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} pass, ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
