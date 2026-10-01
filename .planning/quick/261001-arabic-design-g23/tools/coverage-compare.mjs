// VamosLocale.coverage on main vs this branch, same pages, English page checked for de/fr/ar.
// usage: node coverage-compare.mjs <before public root> <after public root>
import { createRequire } from "node:module";
import { serve } from "./serve.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [beforeRoot, afterRoot] = process.argv.slice(2);
const PAGES = ["/imprint", "/cancellation", "/terms", "/faq", "/sign-in", "/account"];

async function run(root) {
  const { server, base } = await serve(root);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("vamosLang", "en"));
  await ctx.route("**/api/**", (r) => {
    const signedIn = (r.request().headers()["referer"] || "").includes("/account");
    return r.fulfill({ json: { ok: true, signedIn, displayName: "Amira Keller", email: "amira@example.com", emailConfirmed: true } });
  });
  const page = await ctx.newPage();
  const out = {};
  for (const p of PAGES) {
    await page.goto(base + p, { waitUntil: "load" });
    await page.waitForTimeout(1800);
    out[p] = await page.evaluate(() =>
      ["de", "fr", "ar"].map((l) => {
        const c = window.VamosLocale.coverage(document.body, l);
        return [l, [...(c.strings || []), ...(c.attrs || [])].map(String).sort()];
      }),
    );
  }
  await browser.close();
  server.close();
  return out;
}

const before = await run(beforeRoot);
const after = await run(afterRoot);
let newGaps = 0;
for (const p of PAGES) {
  for (const [i, [l, a]] of after[p].entries()) {
    const b = new Set(before[p][i][1]);
    const added = a.filter((s) => !b.has(s));
    const removed = before[p][i][1].filter((s) => !a.includes(s));
    newGaps += added.length;
    console.log(`${p} ${l}: main ${b.size}, branch ${a.length}, new ${JSON.stringify(added)}, gone ${JSON.stringify(removed)}`);
  }
}
console.log(newGaps === 0 ? "NO NEW COVERAGE GAPS" : `NEW GAPS: ${newGaps}`);
process.exit(newGaps ? 1 : 0);
