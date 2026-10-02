// Builds the signing sheets from the raw shots.
// usage: node compose.mjs <raw dir> <screens dir> <scratch dir>     (ONLY=sheet-1-phones-pages limits the run)
// Bare cropped screenshots on a plain white ground, spacing only: no border, frame, outline, shadow or panel
// around any picture. One short caption line under each crop: page, language, width, before or after.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [raw, screens, scratch] = process.argv.slice(2);
mkdirSync(scratch, { recursive: true });

const LANG = { en: "English", ar: "Arabic" };
const PAGE = { mb: "manage-booking", bd: "booking-detail", home: "home" };

/** PNG pixel size from the IHDR chunk. */
function dims(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** One bare crop with its caption. `max` caps the displayed width (never enlarges); `dpr` is the shot's pixel ratio. */
function cell(name, caption, max, dpr = 1) {
  const file = `${raw}/${name}.png`;
  if (!existsSync(file)) return `<figure class="c"><div class="na">no picture: ${name}</div><figcaption>${caption}</figcaption></figure>`;
  const { w } = dims(file);
  const shown = Math.min(Math.round(w / dpr), max);
  return `<figure class="c" style="width:${shown}px"><img src="${pathToFileURL(file).href}" width="${shown}"><figcaption>${caption}</figcaption></figure>`;
}
const row = (cells) => `<div class="row">${cells.join("")}</div>`;
const title = (t) => `<h2>${t}</h2>`;
const cap = (shot, lang, w, side) => `${PAGE[shot.split("-")[0]] || "e-mail"} · ${LANG[lang]} · ${w} · ${side}`;

const CSS = `body{margin:0;padding:36px 40px 48px;background:#fff;color:#1E1F1F;font-family:Poppins,'Helvetica Neue',Arial,sans-serif}
h1{margin:0 0 8px;font-size:26px;font-weight:600}
p.lead{margin:0 0 34px;max-width:1500px;font-size:15px;line-height:1.55;color:#454847}
h2{margin:46px 0 16px;font-size:17px;font-weight:600}
.row{display:flex;flex-wrap:wrap;gap:34px 44px;align-items:flex-start;margin:0 0 26px}
.c{margin:0}
.c img{display:block}
figcaption{margin-top:7px;font-size:12px;line-height:1.35;color:#5c5f5e}
.na{font-size:13px;color:#9a2a1a}`;

// -------------------------------------------------------------------------------------------------- sheet 1
const SPOTS = [
  ["mb-phone-lookup", "manage-booking, no booking opened: the “Cannot get in?” box"],
  ["mb-phone-person", "manage-booking, a booking opened: the “A person, if you need one” box"],
  ["mb-phone-fork", "manage-booking, change view when the pickup is close: the “Call dispatch” card"],
  ["bd-phone-lookup", "booking-detail, no booking opened: the “Cannot get in?” box"],
  ["bd-phone-person", "booking-detail, a booking opened: the “A person, if you need one” box"],
  ["bd-phone-fork", "booking-detail, change view when the pickup is close: the “Call dispatch” card"],
];
function sheet1() {
  let html = `<h1>1 · Phone numbers on the two booking pages, Arabic</h1>
<p class="lead">Before: in Arabic the number reads backwards (82 70 626 79 41+). After: the number sits in its own left-to-right span, as the cancellation page already does, so it reads +41 79 626 70 82 and stays where the Arabic line puts it. Each row is one spot: Arabic at 1440 before and after, then Arabic at 390 before and after. Last row: English is unchanged.</p>`;
  for (const [shot, label] of SPOTS) {
    html += title(label);
    html += row([
      cell(`${shot}-before-ar-1440`, cap(shot, "ar", 1440, "before"), 450),
      cell(`${shot}-after-ar-1440`, cap(shot, "ar", 1440, "after"), 450),
      cell(`${shot}-before-ar-390`, cap(shot, "ar", 390, "before"), 320),
      cell(`${shot}-after-ar-390`, cap(shot, "ar", 390, "after"), 320),
    ]);
  }
  html += title("English stays as it is (manage-booking, a booking opened)");
  html += row([
    cell("mb-phone-person-before-en-1440", cap("mb-phone-person", "en", 1440, "before"), 450),
    cell("mb-phone-person-after-en-1440", cap("mb-phone-person", "en", 1440, "after"), 450),
    cell("mb-phone-fork-after-en-1440", cap("mb-phone-fork", "en", 1440, "after"), 450),
  ]);
  return html;
}

// -------------------------------------------------------------------------------------------------- sheet 2
const MAILS = [
  ["confirmation", "Confirmation e-mail, the dispatch line (message key dispatchPhone)"],
  ["refund", "Refund e-mail, footer"],
  ["contact-customer", "Contact: the acknowledgement the customer gets, footer"],
  ["contact-support", "Contact: the copy support gets, footer"],
  ["contact-staff", "Contact: the staff reply the customer gets, footer (same footer line)"],
  ["auth", "Sign-up e-mail, the default footer of layoutHtml (Vamos Taxi · phone)"],
];
function sheet2() {
  let html = `<h1>2 · Phone numbers in the Arabic e-mails</h1>
<p class="lead">Each e-mail at 600 px wide, cropped to the phone line with a few lines around it. After: the visible number is wrapped in a left-to-right isolate (only the text, no link). The sign-up e-mail footer (last row) already reads correctly before, because the Latin words “Vamos Taxi” come first on the line; with the wrap the two halves swap places on the line (“+41 79 626 70 82 · Vamos Taxi”), each half still reads correctly. Amounts: none shown; the confirmation has no total, so it keeps its own placeholder.</p>`;
  for (const [name, label] of MAILS) {
    html += title(label);
    html += row([
      cell(`email-${name}-before-ar`, `e-mail ${name} · Arabic · 600 · before`, 700, 2),
      cell(`email-${name}-after-ar`, `e-mail ${name} · Arabic · 600 · after`, 700, 2),
    ]);
  }
  return html;
}

// -------------------------------------------------------------------------------------------------- sheet 3
function sheet3() {
  const AFTER = "new sentence; the message box now stays centred and on screen in Arabic and on a phone";
  const capA = (shot, lang, w) => `${cap(shot, lang, w, "after")}: ${AFTER}`;
  let html = `<h1>3 · The change-your-booking request when a change is waiting for payment</h1>
<p class="lead">Both pages, change view: a new time is picked and “Request these changes” is pressed; the server answers 409 staff-change-waiting. Before: the page only says the request could not be made, in a message box that is placed with start 50% and a physical translate. In Arabic that box sits 220 px left of centre at 1440 and, at 390, is cut off at the left edge of the screen (195 px wide, x from −97 to 98); at 390 in English it is 195 px wide and 3 lines. After: the new sentence, in a box that is centred in every case (measured centre offset 0), 420 px wide at 1440 and 358 px at 390 (screen less 16 px each side), never cut off. The new sentence takes 3 lines in English and 2 in Arabic at 1440, and 3 lines in both at 390. The close button of the box still works (clicked once on each page, English and Arabic, 1440 and 390: the box disappears). The message shows for about four seconds.</p>`;
  for (const [shot, label] of [["mb-time-refused", "manage-booking"], ["bd-time-refused", "booking-detail"]]) {
    for (const lang of ["en", "ar"]) {
      html += title(`${label} · ${LANG[lang]} at 1440`);
      html += row([
        cell(`${shot}-before-${lang}-1440`, cap(shot, lang, 1440, "before"), 830),
        cell(`${shot}-after-${lang}-1440`, capA(shot, lang, 1440), 830),
      ]);
    }
    html += title(`${label} · phone width 390`);
    html += row(
      ["en", "ar"].flatMap((lang) => [
        cell(`${shot}-before-${lang}-390`, cap(shot, lang, 390, "before"), 390),
        cell(`${shot}-after-${lang}-390`, capA(shot, lang, 390), 390),
      ]),
    );
  }
  return html;
}

// -------------------------------------------------------------------------------------------------- sheet 4
function sheet4() {
  let html = `<h1>4 · Ten passengers, Van luxury, on both pages (current main, no change)</h1>
<p class="lead">Left to right: the trip card (route and “10 passengers”) and the voucher (Passengers, Bags, Vehicle), manage-booking first, then booking-detail. Nothing is capped at 8. The class name shows only in the voucher’s Vehicle row of manage-booking (from the driver’s vehicle field); booking-detail shows no class and “0 bags”.</p>`;
  for (const w of [1440, 390]) {
    for (const lang of ["en", "ar"]) {
      html += title(`${LANG[lang]} at ${w}`);
      const max = w === 1440 ? 385 : 350;
      html += row([
        cell(`mb-passengers-before-${lang}-${w}`, `manage-booking · trip card · ${LANG[lang]} · ${w}`, max),
        cell(`mb-passengers-voucher-before-${lang}-${w}`, `manage-booking · voucher · ${LANG[lang]} · ${w}`, max),
        cell(`bd-passengers-before-${lang}-${w}`, `booking-detail · trip card · ${LANG[lang]} · ${w}`, max),
        cell(`bd-passengers-voucher-before-${lang}-${w}`, `booking-detail · voucher · ${LANG[lang]} · ${w}`, max),
      ]);
    }
  }
  return html;
}

// -------------------------------------------------------------------------------------------------- sheet 5
function sheet5() {
  let html = `<h1>5 · Month arrows of the date picker, Arabic and English</h1>
<p class="lead">After = the design-system laws.css served without “.vt-dp__nav *,” in the arrow-mirror rule. What the pictures show: before and after are identical, in both pages, in both languages, at both widths (checked byte for byte). The picker used on these pages does not carry the class .vt-dp__nav (that class belongs to the design system’s own DatePicker, which no page uses), so the change has no effect here. In Arabic the arrows are already mirrored before: the “previous” chevron (grey, because this is the first month) sits on the right and points right, the “next” chevron sits on the left and points left.</p>`;
  for (const [shot, label] of [["dp-manage", "manage-booking, change view, the day field’s calendar"], ["dp-home", "home, booking widget’s date calendar (at 390 the date field inside the “Where to?” sheet)"]]) {
    for (const w of [1440, 390]) {
      html += title(`${label} · ${w}`);
      html += row(
        ["en", "ar"].flatMap((lang) => [
          cell(`${shot}-before-${lang}-${w}`, `${shot === "dp-home" ? "home" : "manage-booking"} · ${LANG[lang]} · ${w} · before`, 360, 2),
          cell(`${shot}-after-${lang}-${w}`, `${shot === "dp-home" ? "home" : "manage-booking"} · ${LANG[lang]} · ${w} · after`, 360, 2),
        ]),
      );
    }
  }
  return html;
}

const SHEETS = {
  "sheet-1-phones-pages": sheet1,
  "sheet-2-phones-emails": sheet2,
  "sheet-3-time-refused": sheet3,
  "sheet-4-passengers": sheet4,
  "sheet-5-date-picker-arabic": sheet5,
};

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 800 }, deviceScaleFactor: 1 });
for (const [file, build] of Object.entries(SHEETS)) {
  if (only && !only.has(file)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${build()}</body></html>`;
  const tmp = `${scratch}/${file}.html`;
  writeFileSync(tmp, html);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${screens}/${file}.jpg`, fullPage: true, type: "jpeg", quality: 85 });
  console.log("sheet", file);
}
await browser.close();
