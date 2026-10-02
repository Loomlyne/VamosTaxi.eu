// Composes signing sheets: bare crops on a plain ground, a plain-words label under each.
// No frames, no borders, no device chrome (owner, 2026-10-02).
const { chromium } = require("/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright");
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..");
const SK = path.join(ROOT, "sketches");
const BASE = "http://127.0.0.1:4819/.planning/quick/261003-contact-overlay/";

const NAMES = { A: "A · Mark disc", B: "B · Labelled button that docks into the pay bar", C: "C · Edge tab" };
function dirSheet(d) {
  const f = (n) => `../screens/frames/${d}-${n}.png`;
  return {
    file: `sheet-${d}.png`,
    title: `Direction ${NAMES[d]}`,
    groups: [
      { head: "Desktop, 1440 px", w: 620, items: [[f("closed-1440-en"), "Closed, English"], [f("open-1440-en"), "Open, English"], [f("closed-1440-de"), "Closed, German"], [f("open-1440-de"), "Open, German"]] },
      { head: "Phone, 390 px", w: 250, items: [[f("closed-390-en"), "Closed"], [f("open-390-en"), "Open (sheet from the bottom)"], [f("checkout-390-en"), "/checkout with the PAY bar"], [f("checkout-390-cookie"), "/checkout, cookie card open"], [f("checkout-390-ar"), "/ar/checkout, Arabic"], [f("open-390-ar"), "Open, Arabic"]] },
      { head: "Tablet, 768 px", w: 330, items: [[f("checkout-768-en"), "/checkout with the PAY bar"]] },
      { head: "States", w: 1240, items: [[f("states"), "Button and menu row: default, hover, press, focus, open"]] },
    ],
  };
}
const now = {
  file: "sheet-now.png",
  title: "Today on vamostaxi.site (read-only capture, 3 Oct 2026)",
  groups: [
    { head: "Phone, 390 px", w: 250, items: [["../screens/raw/now-checkout-390.png", "/checkout: the V sits on PAY"], ["../screens/raw/now-checkout-390-cookie.png", "Cookie card open: V and PAY float mid-screen"], ["../screens/raw/now-checkout-390-ar.png", "/ar/checkout: same overlap, V mark mirrored"], ["../screens/raw/now-home-390.png", "Home: no contact button at all"], ["../screens/raw/now-contact-390.png", "/contact: no contact button at all"]] },
    { head: "Desktop, 1440 px", w: 620, items: [["../screens/raw/now-checkout-1440.png", "/checkout closed"], ["../screens/raw/now-checkout-1440-open.png", "/checkout open: rows pick up a yellow underline, no Call row"], ["../screens/raw/now-home-1440.png", "Home: no contact button"]] },
  ],
};

function html(s) {
  const g = s.groups.map((gr) => `<section><h2>${gr.head}</h2><div class="row">${gr.items.map(([src, lab]) => `<figure style="width:${gr.w}px"><img src="${src}" style="width:${gr.w}px"><figcaption>${lab}</figcaption></figure>`).join("")}</div></section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/design-system/styles.css"><style>
  body{margin:0;background:#DEDEDE;font-family:var(--vt-font-body);color:var(--vt-charcoal-900);padding:40px 48px;width:1436px;box-sizing:border-box}
  h1{font-family:var(--vt-font-display);font-size:28px;margin:0 0 24px} h2{font-size:13px;letter-spacing:.09em;text-transform:uppercase;margin:28px 0 12px;color:var(--vt-charcoal-700)}
  .row{display:flex;flex-wrap:wrap;gap:28px 24px;align-items:flex-start} figure{margin:0} img{display:block}
  figcaption{font-size:14px;line-height:1.4;margin-top:10px;color:var(--vt-charcoal-900)}</style></head><body><h1>${s.title}</h1>${g}</body></html>`;
}

(async () => {
  const b = await chromium.launch();
  for (const s of [now, dirSheet("A"), dirSheet("B"), dirSheet("C")]) {
    const tmp = path.join(SK, "_" + s.file.replace(".png", ".html"));
    fs.writeFileSync(tmp, html(s));
    const p = await b.newPage({ viewport: { width: 1436, height: 900 }, deviceScaleFactor: 1.5 });
    await p.goto(BASE + "sketches/" + path.basename(tmp), { waitUntil: "load" });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(ROOT, "screens", s.file), fullPage: true });
    await p.close();
    console.log("sheet", s.file);
  }
  await b.close();
})();
