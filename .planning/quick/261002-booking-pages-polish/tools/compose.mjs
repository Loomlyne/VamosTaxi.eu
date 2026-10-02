// Builds the signing sheets from the raw shots.
// usage: node compose.mjs <raw dir> <screens dir> <scratch dir>
// Bare cropped screenshots on a plain white ground, spacing only: no border, frame, outline, shadow or panel around
// any picture (owner, 2026-10-02). One short caption line under each crop: page, language, width, before or after.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [raw, screens, scratch] = process.argv.slice(2);
mkdirSync(scratch, { recursive: true });

const LANG = { en: "English", de: "German", ar: "Arabic" };
const PAGE = { mb: "manage-booking (link from the e-mail)", bd: "booking-detail (signed in, from the account)", home: "home" };

function dims(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function cell(name, caption, max, dpr = 1) {
  const file = `${raw}/${name}.png`;
  if (!existsSync(file)) return `<figure class="c"><div class="na">no picture: ${name}</div><figcaption>${caption}</figcaption></figure>`;
  const { w } = dims(file);
  const shown = Math.min(Math.round(w / dpr), max);
  return `<figure class="c" style="width:${shown}px"><img src="${pathToFileURL(file).href}" width="${shown}"><figcaption>${caption}</figcaption></figure>`;
}
const row = (cells) => `<div class="row">${cells.join("")}</div>`;
const title = (t) => `<h2>${t}</h2>`;
const cap = (shot, lang, w, side) => `${PAGE[shot.split("-")[0]]} · ${LANG[lang]} · ${w} · ${side}`;
/** before | after for one language and width. */
const pair = (shot, lang, w, max, dpr = 1) => [
  cell(`${shot}-before-${lang}-${w}`, cap(shot, lang, w, "before"), max, dpr),
  cell(`${shot}-after-${lang}-${w}`, cap(shot, lang, w, "after"), max, dpr),
];

const CSS = `body{margin:0;padding:36px 40px 48px;background:#fff;color:#1E1F1F;font-family:Poppins,'Helvetica Neue',Arial,sans-serif}
h1{margin:0 0 8px;font-size:26px;font-weight:600}
p.lead{margin:0 0 30px;max-width:1500px;font-size:15px;line-height:1.55;color:#454847}
h2{margin:40px 0 16px;font-size:17px;font-weight:600}
.row{display:flex;flex-wrap:wrap;gap:30px 44px;align-items:flex-start;margin:0 0 22px}
.c{margin:0}
.c img{display:block}
figcaption{margin-top:7px;font-size:12px;line-height:1.35;color:#5c5f5e}
.na{font-size:13px;color:#9a2a1a}`;

const SHEETS = {
  "sheet-1-signed-in-paid": () => `<h1>1 · Signed-in booking page: a paid booking reads paid and can be cancelled</h1>
<p class="lead">The booking page you open from your account (vamostaxi.site/booking-detail). Example: Amira Keller paid for VT-26-0807, Zurich Airport to Zermatt on Tuesday 6 October. Before: the badge says “Awaiting payment” and there is no Cancel tile, although the same booking opened from the e-mail link shows both. After: the real state (“Confirmed”) and the same Cancel tile as the e-mail page; the cancel screen behind it is the one the e-mail page already uses, with the refund the server would give for this pickup time.</p>
${title("Booking card and actions — English")}${row([...pair("bd-paid", "en", 1440, 560), ...pair("bd-paid", "en", 390, 300)])}
${title("Booking card and actions — Arabic, phone")}${row([...pair("bd-paid", "ar", 390, 300), ...pair("bd-paid", "ar", 1440, 560)])}
${title("After: the Cancel tile opens the cancel screen (unchanged design, now reachable)")}${row([cell("bd-cancel-sheet-after-en-390", cap("bd", "en", 390, "after"), 300), cell("bd-cancel-sheet-after-ar-390", cap("bd", "ar", 390, "after"), 300), cell("bd-cancel-sheet-after-en-1440", cap("bd", "en", 1440, "after"), 640)])}`,

  "sheet-2-dates": () => `<h1>2 · Dates in the reader’s language</h1>
<p class="lead">Before: the day stays English (“Tue 6 Oct”) in German, French and Arabic. After: Di. 6. Okt. / mar. 6 oct. / الثلاثاء، 6 أكتوبر, with Latin digits as the home date picker already shows them; the time (08:15) stays left to right in Arabic. A language switch relabels the dates in place. English is unchanged.</p>
${title("Booking card — German")}${row([...pair("mb-dates", "de", 1440, 560), ...pair("mb-dates", "de", 390, 300)])}
${title("Booking card — Arabic")}${row([...pair("mb-dates", "ar", 390, 300), ...pair("mb-dates", "ar", 1440, 560)])}
${title("Booking card — English (unchanged)")}${row([...pair("mb-dates", "en", 390, 300)])}
${title("Change view: booked for → new pickup (a new time picked) — German and Arabic, phone")}${row([...pair("bd-change", "de", 390, 300), ...pair("bd-change", "ar", 390, 300)])}
${title("Change view — German, desktop")}${row([...pair("bd-change", "de", 1440, 640)])}`,

  "sheet-3-bags-refund": () => `<h1>3 · Arabic bag counts · 4 · Refund line country</h1>
<p class="lead">Bags (voucher, Arabic): 2 bags read حقيبتان (not “2 حقيبة”), 3–10 read “N حقائب”, 11–99 read “N حقيبةً”, the same 1 / 2 / 3–10 / 11–99 forms as travellers; the home travellers summary gets the same forms. The voucher’s Date row also shows the localised day. Refund line (a refunded booking): the country is written in the reader’s language — Schweiz, Suisse, سويسرا — instead of “Switzerland”, and the payout day is localised too.</p>
${title("Voucher, 2 bags — Arabic")}${row([...pair("mb-voucher-2bags", "ar", 390, 300), ...pair("mb-voucher-2bags", "ar", 1440, 560)])}
${title("Voucher, 12 travellers and 12 bags — Arabic, phone")}${row([...pair("mb-voucher-12bags", "ar", 390, 300)])}
${title("Voucher — English (unchanged)")}${row([...pair("mb-voucher-2bags", "en", 390, 300)])}
${title("Refund line — German and Arabic, phone")}${row([...pair("mb-refund", "de", 390, 300), ...pair("mb-refund", "ar", 390, 300)])}
${title("Refund line — German, desktop; English unchanged")}${row([...pair("mb-refund", "de", 1440, 560), ...pair("mb-refund", "en", 390, 300)])}`,

  "sheet-4-time-spinner": () => `<h1>5 · Time picker in Arabic keeps hour : minute left to right</h1>
<p class="lead">Home booking box, time picker set to 18:30. Before: Arabic shows “30 : 18” (minutes first). After: “18 : 30”, as in every other language. The same picker on the change view of the two booking pages gets the same fix.</p>
${title("Home — Arabic")}${row([...pair("home-spinner", "ar", 390, 330, 2), ...pair("home-spinner", "ar", 1440, 330, 2)])}
${title("Home — English (unchanged)")}${row([...pair("home-spinner", "en", 390, 330, 2)])}
${title("Change view of the booking pages — the same picker, Arabic and German, phone (the picker now opens on the booked month and labels the day in the reader’s language)")}${row([cell("bd-change-before-ar-390-picker", cap("bd", "ar", 390, "before"), 300), cell("bd-change-after-ar-390-picker", cap("bd", "ar", 390, "after"), 300), cell("bd-change-before-de-390-picker", cap("bd", "de", 390, "before"), 300), cell("bd-change-after-de-390-picker", cap("bd", "de", 390, "after"), 300)])}`,
};

const browser = await chromium.launch();
for (const [name, build] of Object.entries(SHEETS)) {
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${build()}`;
  const htmlFile = `${scratch}/${name}.html`;
  writeFileSync(htmlFile, html);
  const page = await browser.newPage({ viewport: { width: 1640, height: 1000 } });
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${screens}/${name}.jpg`, fullPage: true, type: "jpeg", quality: 78 });
  await page.close();
  console.log("sheet", name);
}
await browser.close();
