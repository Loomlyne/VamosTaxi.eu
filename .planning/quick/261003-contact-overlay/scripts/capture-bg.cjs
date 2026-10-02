// Read-only backdrops from vamostaxi.site for the sketches. GET only. The current V
// button and (unless kept) the cookie card are removed from the DOM client-side so the
// new overlay can be drawn on a clean page. Nothing is clicked, nothing is submitted.
const { chromium } = require("/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright");
const path = require("path");
const OUT = path.resolve(__dirname, "../screens/raw");

const shots = [
  { name: "bg-page-1440-en", url: "/about", w: 1440, h: 900, y: 900 },
  { name: "bg-page-1440-de", url: "/de/about", w: 1440, h: 900, y: 900 },
  { name: "bg-page-390-en", url: "/about", w: 390, h: 844, y: 900 },
  { name: "bg-page-390-ar", url: "/ar/about", w: 390, h: 844, y: 900 },
  { name: "bg-home-390-en", url: "/", w: 390, h: 844, y: 0 },
  { name: "bg-checkout-390-en", url: "/checkout", w: 390, h: 844, y: 0 },
  { name: "bg-checkout-390-ar", url: "/ar/checkout", w: 390, h: 844, y: 0 },
  { name: "bg-checkout-390-cookie", url: "/checkout", w: 390, h: 844, y: 0, keepBanner: true },
  { name: "bg-checkout-768-en", url: "/checkout", w: 768, h: 1024, y: 0 },
];

(async () => {
  const browser = await chromium.launch();
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    try { await page.goto("https://vamostaxi.site" + s.url, { waitUntil: "load", timeout: 30000 }); }
    catch (e) { console.log("goto", s.name, e.message.split("\n")[0]); }
    await page.waitForTimeout(3500);
    await page.evaluate(({ keepBanner, y }) => {
      document.querySelectorAll(".vt-contact-fab").forEach((n) => n.remove());
      if (!keepBanner) {
        document.querySelectorAll('[data-ck-banner],.vt-ck,[class*="vt-ck-"],[data-vt-cookie],[class*="cookie-banner"]').forEach((n) => n.remove());
        document.documentElement.style.removeProperty("--vt-ck-reserve");
      }
      window.scrollTo({ top: y, behavior: "instant" });
    }, s);
    await page.waitForTimeout(900);
    const bar = await page.$(".vt-co__bar");
    const info = bar ? await bar.boundingBox() : null;
    await page.screenshot({ path: path.join(OUT, s.name + ".png") });
    console.log(s.name, JSON.stringify(info));
    await ctx.close();
  }
  await browser.close();
})();
