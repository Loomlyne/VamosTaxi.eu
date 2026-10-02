// Read-only capture of the CURRENT contact overlay on vamostaxi.site.
// GET navigation only. Never clicks a form control, never accepts the cookie banner
// (accepting writes a consent row on the live database). The banner is removed from
// the DOM client-side when a shot needs it gone. The only click is the V button itself,
// which opens a client-side menu and sends nothing.
const { chromium } = require("/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright");
const path = require("path");
const OUT = path.resolve(__dirname, "../screens/raw");
require("fs").mkdirSync(OUT, { recursive: true });

const shots = [
  { name: "now-checkout-390", url: "/checkout", w: 390, h: 844, banner: false },
  { name: "now-checkout-390-open", url: "/checkout", w: 390, h: 844, banner: false, open: true },
  { name: "now-checkout-390-cookie", url: "/checkout", w: 390, h: 844, banner: true },
  { name: "now-checkout-390-ar", url: "/ar/checkout", w: 390, h: 844, banner: false },
  { name: "now-checkout-1440", url: "/checkout", w: 1440, h: 900, banner: false },
  { name: "now-checkout-1440-open", url: "/checkout", w: 1440, h: 900, banner: false, open: true },
  { name: "now-home-390", url: "/", w: 390, h: 844, banner: false },
  { name: "now-home-1440", url: "/", w: 1440, h: 900, banner: false },
  { name: "now-contact-390", url: "/contact", w: 390, h: 844, banner: false },
];

(async () => {
  const browser = await chromium.launch();
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    try {
      await page.goto("https://vamostaxi.site" + s.url, { waitUntil: "load", timeout: 30000 });
    } catch (e) { console.log("goto", s.name, e.message.split("\n")[0]); }
    await page.waitForTimeout(3500);
    if (!s.banner) {
      await page.evaluate(() => {
        document.querySelectorAll('[data-ck-banner],.vt-ck,[class*="vt-ck-"],[data-vt-cookie],[class*="cookie-banner"]').forEach((n) => n.remove());
        document.documentElement.style.removeProperty("--vt-ck-reserve");
      });
    }
    const fab = await page.$(".vt-contact-fab__btn");
    const bar = await page.$(".vt-co__bar");
    const info = { fab: !!fab, bar: !!bar };
    if (fab) info.fabBox = await fab.boundingBox();
    if (bar) info.barBox = await bar.boundingBox();
    if (s.open && fab) { await fab.click(); await page.waitForTimeout(400); }
    await page.screenshot({ path: path.join(OUT, s.name + ".png") });
    console.log(s.name, JSON.stringify(info));
    await ctx.close();
  }
  await browser.close();
})();
