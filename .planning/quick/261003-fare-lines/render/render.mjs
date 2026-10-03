// Signing pictures for quick 261003-fare-lines (U04-3 "Own lines, show me first").
// Pictures only. Renders the price blocks from the real token chain
// (apps/web/public/brand/tokens, laws.css last) + PriceSummary.css, with the
// labels copied from apps/web/i18n/messages and packages/emails/src/messages.
// Every amount is CHF 000 (Law 04). No server, no port: page.route serves files.
//
//   node .planning/quick/261003-fare-lines/render/render.mjs
//
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const OUT = path.resolve(HERE, "../screens");
const PW =
  process.env.PW_CORE ??
  "/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs";
const CHROME =
  process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const { chromium } = await import(PW);

const BASE = "http://fare.local/";
const TYPES = { ".css": "text/css", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".png": "image/png" };

const STYLE = `
<link rel="stylesheet" href="apps/web/public/brand/tokens/fonts.css">
<link rel="stylesheet" href="apps/web/public/brand/tokens/colors.css">
<link rel="stylesheet" href="apps/web/public/brand/tokens/typography.css">
<link rel="stylesheet" href="apps/web/public/brand/tokens/arabic.css">
<link rel="stylesheet" href="apps/web/public/brand/tokens/spacing.css">
<link rel="stylesheet" href="apps/web/public/brand/tokens/elevation.css">
<link rel="stylesheet" href="apps/web/public/brand/tokens/motion.css">
<link rel="stylesheet" href="apps/web/public/brand/tokens/base.css">
<link rel="stylesheet" href="apps/web/public/brand/tokens/laws.css">
<link rel="stylesheet" href="apps/web/components/core/Card.css">
<link rel="stylesheet" href="apps/web/components/transfer/PriceSummary.css">
<style>
:root{--vt-shadow-accent:none}
.vt-input--focus{box-shadow:none}
html,body{margin:0;background:var(--vt-bg-page)}
*{box-sizing:border-box}
#shot{display:inline-block;padding:20px}
.co-card{background:var(--vt-bg-surface);border:var(--vt-border-w) solid var(--vt-border-subtle);border-radius:var(--vt-radius-lg);box-shadow:var(--vt-shadow-sm)}
.co-kicker{margin:0 0 12px;font-family:var(--vt-font-body);font-size:var(--vt-label-md);font-weight:var(--vt-label-weight);letter-spacing:var(--vt-label-tracking);text-transform:uppercase;color:var(--vt-text-muted)}
</style>`;

// ---- labels, verbatim from the message files (see DESIGN.md table) ----
const L = {
  en: {
    fare: "Fare", airport: "Airport pickup fee", route: (o, d) => `${o} – ${d} route`,
    extra: "Child seat", coupon: "Coupon WELCOME", vat: "VAT 8.1 %", total: "Total",
    cFare: "Fare · Business", cVoucher: "Voucher WELCOME", cTotal: "Total paid",
    eFare: "Fare · Business", eVoucher: "Voucher WELCOME", eVat: "VAT 8.1 %", eTotal: "Total paid",
    kicker: "Your price",
  },
  de: {
    fare: "Fahrtpreis", airport: "Flughafen-Abholgebühr", route: (o, d) => `Strecke ${{ Zurich: "Zürich", Geneva: "Genf" }[o] ?? o} – ${{ Zurich: "Zürich", Geneva: "Genf" }[d] ?? d}`,
    extra: "Kindersitz", coupon: "Gutschein WELCOME", vat: "MwSt. 8.1 %", total: "Total",
    cFare: "Fahrpreis · Business", cVoucher: "Gutschein WELCOME", cTotal: "Total bezahlt",
    eFare: "Fahrpreis · Business", eVoucher: "Gutschein WELCOME", eVat: "MwSt. 8.1 %", eTotal: "Total bezahlt",
    kicker: "Ihr Preis",
  },
  ar: {
    fare: "الأجرة", airport: "رسوم الاستقبال من المطار", route: (o, d) => `مسار ${o} – ${d}`,
    extra: "مقعد أطفال", coupon: "قسيمة WELCOME", vat: "ضريبة القيمة المضافة 8.1 %", total: "المجموع",
    cFare: "الأجرة · Business", cVoucher: "قسيمة WELCOME", cTotal: "إجمالي المدفوع",
    eFare: "الأجرة · Business", eVoucher: "قسيمة WELCOME", eVat: "ضريبة القيمة المضافة 8.1 %", eTotal: "الإجمالي المدفوع",
    kicker: "سعرك",
  },
};

// Cases. A: airport pickup + matching route extra. B: city pickup, no match.
// C: airport pickup, no route match, one extra, coupon WELCOME.
const CASES = {
  A: { airport: true, route: ["Zurich", "Geneva"], extra: false, coupon: false },
  B: { airport: false, route: null, extra: false, coupon: false },
  C: { airport: true, route: null, extra: true, coupon: true },
};
const CASE_WORDS = {
  A: "Airport pickup with a matching route extra (Zurich Airport to Geneva)",
  B: "City pickup, no matching route (Zurich Old Town to Winterthur): no extra line at all",
  C: "Airport pickup, no route match, one extra (Child seat), coupon WELCOME",
};

const CHF = "CHF 000";
const MINUS = "−CHF 000";

/** Rows for one surface. `after` splits the two fare parts out of Fare. */
function rows(surface, lang, c, after, { icons = true } = {}) {
  const t = L[lang];
  const out = [];
  const ic = (name) => (after && icons ? name : null);
  if (surface === "checkout") {
    out.push({ label: t.fare });
    if (after && c.airport) out.push({ label: t.airport, icon: ic("plane-landing") });
    if (after && c.route) out.push({ label: t.route(...c.route), icon: ic("map-pin") });
    if (c.extra) out.push({ label: `+ ${t.extra}` });
    if (c.coupon) out.push({ label: t.coupon, credit: true });
    out.push({ label: t.vat });
    return { lines: out, total: t.total };
  }
  if (surface === "confirmation") {
    out.push({ label: t.cFare });
    if (after && c.airport) out.push({ label: t.airport, icon: ic("plane-landing") });
    if (after && c.route) out.push({ label: t.route(...c.route), icon: ic("map-pin") });
    if (c.extra) out.push({ label: t.extra });
    if (c.coupon) out.push({ label: t.cVoucher, credit: true });
    out.push({ label: t.vat });
    return { lines: out, total: t.cTotal };
  }
  // e-mail: no icons (mail clients), voucher row is missing today (see DESIGN.md §4).
  out.push({ label: t.eFare });
  if (after && c.airport) out.push({ label: t.airport });
  if (after && c.route) out.push({ label: t.route(...c.route) });
  if (c.extra) out.push({ label: t.extra });
  if (c.coupon && after) out.push({ label: t.eVoucher, credit: true });
  out.push({ label: t.eVat });
  return { lines: out, total: t.eTotal };
}

function icon(name) {
  const url = `url('apps/web/public/brand/icons/${name}.svg')`;
  return `<span aria-hidden="true" style="display:inline-block;flex:none;width:15px;height:15px;background-color:currentColor;-webkit-mask-image:${url};mask-image:${url};-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:contain;mask-size:contain"></span>`;
}

function priceSummary({ lines, total }) {
  const body = lines
    .map(
      (l) => `<div class="vt-price__row${l.credit ? " vt-price__row--credit" : ""}">
  <span class="vt-price__label">${l.icon ? icon(l.icon) : ""}<span dir="auto">${l.label}</span></span>
  <span class="vt-price__val vt-dir-keep">${l.credit ? MINUS : CHF}</span></div>`,
    )
    .join("");
  return `<div class="vt-price">${body}<div class="vt-price__total"><span class="vt-price__totallabel">${total}</span><span class="vt-price__totalval"><span class="vt-dir-keep">${CHF}</span></span></div></div>`;
}

function emailBlock({ lines, total }, width) {
  const C = "#1E1F1F", G = "#DEDEDE";
  const label = `margin:0;font-size:14px;color:${C};font-family:Poppins,system-ui,sans-serif`;
  const fig = `margin:0;font-family:Qurova,Poppins,system-ui,sans-serif;font-size:14px;color:${C};text-align:end`;
  const r = lines
    .map(
      (l) => `<tr style="border-bottom:1px solid ${G}"><td style="padding:8px 0"><p style="${label}">${l.label}</p></td><td style="padding:8px 0;width:40%"><p style="${fig}"><span dir="ltr">${l.credit ? MINUS : CHF}</span></p></td></tr>`,
    )
    .join("");
  return `<div style="background:${G};padding:24px 0;width:${width}px">
<div style="background:#fff;max-width:560px;margin:0 auto;padding:20px 32px 24px">
<table role="presentation" style="width:100%;border-collapse:collapse">${r}
<tr style="border-top:2px solid ${C}"><td style="padding:10px 0 0"><p style="${label};font-weight:700">${total}</p></td><td style="padding:10px 0 0;width:40%"><p style="${fig};font-size:22px;font-weight:700"><span dir="ltr">${CHF}</span></p></td></tr>
</table></div></div>`;
}

/** One crop: the price block in its own card, at the width it has on that viewport. */
function cropHtml(surface, viewport, lang, c, after, opts) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const r = rows(surface, lang, c, after, opts);
  let inner;
  if (surface === "checkout") {
    // >=1081: 360px rail card, padding 24. <=680: Section 3 card, padding 20, gutter 20.
    const w = viewport === 1440 ? 360 : 350;
    const pad = viewport === 1440 ? 24 : 20;
    inner = `<div class="co-card" style="width:${w}px;padding:${pad}px">${priceSummary(r)}</div>`;
  } else if (surface === "confirmation") {
    // Card padding lg inside the 720px column (gutter clamp(20px,5vw,56px)); 24px under 680.
    const w = viewport === 1440 ? 608 : 350;
    const pad = viewport === 1440 ? 32 : 24;
    inner = `<div class="vt-card vt-card--pad-lg" style="width:${w}px;padding:${pad}px">${priceSummary(r)}</div>`;
  } else {
    inner = emailBlock(r, viewport === 1440 ? 640 : 390);
  }
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><base href="${BASE}"><meta charset="utf-8">${STYLE}</head><body><div id="shot">${inner}</div></body></html>`;
}

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
await page.route(`${BASE}**`, async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, "");
  if (rel === "__crop") return route.fulfill({ body: CURRENT, contentType: "text/html; charset=utf-8" });
  try {
    const body = await readFile(path.join(ROOT, rel));
    await route.fulfill({ body, contentType: TYPES[path.extname(rel)] ?? "application/octet-stream" });
  } catch {
    await route.fulfill({ status: 404, body: "" });
  }
});

// Crops load from the routed origin: mask-image (the Icon) is a CORS fetch and
// is refused from about:blank.
let CURRENT = "";
async function shoot(html) {
  CURRENT = html;
  await page.goto(`${BASE}__crop`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.locator("#shot").screenshot({ omitBackground: false });
  return buf.toString("base64");
}

const SURF_WORDS = {
  checkout: "/checkout price summary",
  confirmation: "Confirmation page price block (/confirmation/VT-…)",
  email: "Confirmation e-mail price block",
};
const VIEWS = [
  [1440, "de", "German, desktop 1440"],
  [390, "en", "English, phone 390"],
  [390, "ar", "Arabic, phone 390"],
];

function sheetHtml(title, sub, sections) {
  const sec = sections
    .map(
      (s) => `<section><h2>${s.title}</h2><div class="pair">
${s.items.map((it) => `<figure><img src="data:image/png;base64,${it.png}"><figcaption>${it.caption}</figcaption></figure>`).join("")}
</div>${s.note ? `<p class="note">${s.note}</p>` : ""}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
body{margin:0;background:#F6F6F6;font-family:Poppins,system-ui,sans-serif;color:#1E1F1F}
main{padding:40px 48px;display:inline-block}
h1{margin:0 0 4px;font-size:22px}
.sub{margin:0 0 28px;font-size:14px;color:#5b5c5c;max-width:1100px}
h2{margin:0 0 12px;font-size:16px;font-weight:600}
section{margin-bottom:36px}
.pair{display:flex;gap:48px;align-items:flex-start;flex-wrap:nowrap}
figure{margin:0}
figure img{display:block;width:auto;zoom:.5}
figcaption{margin-top:8px;font-size:13px;color:#5b5c5c;max-width:640px}
.note{margin:10px 0 0;font-size:13px;color:#5b5c5c;max-width:1100px}
</style></head><body><main><h1>${title}</h1><p class="sub">${sub}</p>${sec}</main></body></html>`;
}

async function sheet(name, html) {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.setContent(html, { waitUntil: "load" });
  await page.locator("main").screenshot({ path: path.join(OUT, name) });
  await page.setViewportSize({ width: 1440, height: 1200 });
  console.log("wrote", name);
}

const surfaces = ["checkout", "confirmation", "email"];
const n = { checkout: "1", confirmation: "2", email: "3" };
for (const surface of surfaces) {
  for (const [vp, lang, words] of VIEWS) {
    const sections = [];
    for (const key of ["A", "B", "C"]) {
      const c = CASES[key];
      const before = await shoot(cropHtml(surface, vp, lang, c, false));
      const after = await shoot(cropHtml(surface, vp, lang, c, true));
      let note = "";
      if (key === "B") note = "Before and after are the same: no airport fee and no route match, so neither line exists. Never a CHF 0 line.";
      if (key === "C" && surface === "email")
        note = "Before: today's mail has no voucher line for a coupon (read from code, not checked on a real mail); Fare already shows the reduced figure. After: the same list figures and voucher line as the confirmation page.";
      sections.push({
        title: `Case ${key}. ${CASE_WORDS[key]}`,
        items: [
          { png: before, caption: key === "B" ? "Before (live today)." : "Before (live today): the fare parts are inside Fare." },
          { png: after, caption: key === "B" ? "After: unchanged." : "After: each part is its own line. Total unchanged." },
        ],
        note,
      });
    }
    const file = `${n[surface]}-${surface}-${vp}-${lang}.png`;
    await sheet(
      file,
      sheetHtml(
        `${SURF_WORDS[surface]}: ${words}`,
        surface === "email" ? "Every amount reads CHF 000 until you switch prices live. The grey band and white sheet are the mail's own background." : "Every amount reads CHF 000 until you switch prices live. The rounded outline around each block is the page's own card.",
        sections,
      ),
    );
  }
}

// Option sheet for question 1: icons (signed in 26.1 UI-SPEC) vs plain text.
{
  const a = CASES.A;
  const withIcons = await shoot(cropHtml("checkout", 390, "en", a, true, { icons: true }));
  const plain = await shoot(cropHtml("checkout", 390, "en", a, true, { icons: false }));
  const withIconsAr = await shoot(cropHtml("checkout", 390, "ar", a, true, { icons: true }));
  const plainAr = await shoot(cropHtml("checkout", 390, "ar", a, true, { icons: false }));
  await sheet(
    "4-option-icons-or-plain-390.png",
    sheetHtml(
      "Question 1: the two new lines with a small icon, or plain text",
      "Case A on /checkout, phone 390. Left: plane icon on the airport fee, pin icon on the route (what the 26.1 design you signed showed). Right: plain text, like Fare and the extras.",
      [
        { title: "English", items: [{ png: withIcons, caption: "With icons (recommended)" }, { png: plain, caption: "Plain text" }] },
        { title: "Arabic", items: [{ png: withIconsAr, caption: "With icons (recommended)" }, { png: plainAr, caption: "Plain text" }] },
      ],
    ),
  );
}

await browser.close();
