// Renders every frame of the three directions from sketches/gallery.html.
// Needs the static server on 127.0.0.1:4819 serving the worktree root.
const { chromium } = require("/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright");
const path = require("path");
const fs = require("fs");
const OUT = path.resolve(__dirname, "../screens/frames");
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:4819/.planning/quick/261003-contact-overlay/sketches/gallery.html";

const frames = [
  { n: "closed-1440-en", w: 1440, h: 900, bg: "bg-page-1440-en", lang: "en" },
  { n: "open-1440-en", w: 1440, h: 900, bg: "bg-page-1440-en", lang: "en", open: 1 },
  { n: "closed-1440-de", w: 1440, h: 900, bg: "bg-page-1440-de", lang: "de" },
  { n: "open-1440-de", w: 1440, h: 900, bg: "bg-page-1440-de", lang: "de", open: 1 },
  { n: "closed-390-en", w: 390, h: 844, bg: "bg-page-390-en", lang: "en" },
  { n: "open-390-en", w: 390, h: 844, bg: "bg-page-390-en", lang: "en", open: 1 },
  { n: "checkout-390-en", w: 390, h: 844, bg: "bg-checkout-390-en", lang: "en", bary: 737 },
  { n: "checkout-390-cookie", w: 390, h: 844, bg: "bg-checkout-390-cookie", lang: "en", bary: 271, cookie: 1 },
  { n: "checkout-390-ar", w: 390, h: 844, bg: "bg-checkout-390-ar", lang: "ar", bary: 737 },
  { n: "open-390-ar", w: 390, h: 844, bg: "bg-page-390-ar", lang: "ar", open: 1 },
  { n: "checkout-768-en", w: 768, h: 1024, bg: "bg-checkout-768-en", lang: "en", bary: 901 },
];
const PRELOAD = async (page) => {
  await page.evaluate(async () => {
    const names = ["message-circle","phone","mail","file-text","external-link","chevron-right","x","lock"];
    await Promise.all(names.map((n) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = "/assets/icons/" + n + ".svg"; })));
    await document.fonts.ready;
  });
  await page.waitForTimeout(5000);
};
const only = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  for (const dir of only ? [only] : ["A", "B", "C"]) {
    for (const f of (process.env.STATES_ONLY ? [] : frames)) {
      const ctx = await browser.newContext({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 2, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      const p = new URLSearchParams({ dir, bg: f.bg, lang: f.lang, open: f.open ? "1" : "0" });
      if (f.bary) p.set("bary", String(f.bary));
      if (f.cookie) p.set("cookie", "1");
      await page.goto(BASE + "?" + p.toString(), { waitUntil: "load" });
      await PRELOAD(page);
      await page.screenshot({ path: path.join(OUT, `${dir}-${f.n}.png`) });
      if (errs.length) console.log(dir, f.n, "ERR", errs[0]);
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 600 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(BASE + "?states=1&dir=" + dir + "&lang=en", { waitUntil: "load" });
    await PRELOAD(page);
    await page.screenshot({ path: path.join(OUT, `${dir}-states.png`), fullPage: true });
    await ctx.close();
    console.log("done", dir);
  }
  await browser.close();
})();
