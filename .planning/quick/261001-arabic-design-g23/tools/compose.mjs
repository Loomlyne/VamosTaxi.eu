// Builds the signing sheets from shoot.mjs output.
// usage: node compose.mjs <shots dir with before/ and after/> <screens dir>
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [shots, screens] = process.argv.slice(2);
const ar = JSON.parse(readFileSync(new URL("../../../../apps/web/i18n/messages/ar.json", import.meta.url), "utf8"));

const img = (side, name, lang, w) => {
  const f = `${shots}/${side}/${name}-${lang}-${w}.png`;
  return existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString("base64")}` : null;
};

const COLS = [
  ["en", 1440, "Laptop 1440 · English", 520],
  ["ar", 1440, "Laptop 1440 · Arabic", 520],
  ["en", 390, "Phone 390 · English", 300],
  ["ar", 390, "Phone 390 · Arabic", 300],
];

function spot(name, title) {
  const row = (side) => `<div class="row"><div class="side ${side}">${side === "before" ? "Before · live today (main)" : "After · proposed"}</div>${COLS.map(
    ([l, w, , px]) => {
      const src = img(side, name, l, w);
      return `<div class="cell" style="width:${px}px">${src ? `<img src="${src}" style="max-width:${px}px">` : "<i>n/a</i>"}</div>`;
    },
  ).join("")}</div>`;
  return `<section><h2>${title}</h2><div class="row head"><div class="side"></div>${COLS.map(([, , t, px]) => `<div class="cell" style="width:${px}px">${t}</div>`).join("")}</div>${row("before")}${row("after")}</section>`;
}

function single(name, title, lang, w) {
  return `<section><h2>${title}</h2><div class="row"><div class="side before">Before · live today (main)</div><div class="cell"><img src="${img("before", name, lang, w)}"></div></div><div class="row"><div class="side after">After · proposed</div><div class="cell"><img src="${img("after", name, lang, w)}"></div></div></section>`;
}

const LRM = "‎";
function textStrip(title, pairs) {
  return `<section><h2>${title}</h2>${pairs
    .map(
      ([k, before, after]) =>
        `<div class="strip"><div class="k">${k}</div><div class="row"><div class="side before">Before</div><div class="ar" dir="rtl" lang="ar">${before}</div></div><div class="row"><div class="side after">After</div><div class="ar" dir="rtl" lang="ar">${after}</div></div></div>`,
    )
    .join("")}</section>`;
}

const CSS = `body{margin:0;padding:32px;background:#F6F6F6;font-family:Poppins,system-ui,sans-serif;color:#1E1F1F}
h1{margin:0 0 6px;font-size:28px}p.lead{margin:0 0 24px;color:#545756;font-size:15px;max-width:1500px;line-height:1.5}
section{background:#fff;padding:20px 24px;margin-bottom:24px}
h2{margin:0 0 12px;font-size:18px}
.row{display:flex;gap:16px;align-items:flex-start;margin-bottom:12px}
.head .cell{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#545756}
.side{width:150px;flex:0 0 150px;font-size:13px;font-weight:600}
.side.before{color:#9a2a1a}.side.after{color:#1d6b3a}
.cell img{display:block}
.strip{margin-bottom:14px}.k{font-size:13px;color:#545756;margin-bottom:6px}
.ar{font-family:'Noto Sans Arabic',system-ui,sans-serif;font-size:24px;padding:6px 14px;background:#fff;min-width:600px}`;

const SHEETS = {
  "01-phone-numbers-arabic": `<h1>1 · Phone numbers in Arabic</h1><p class="lead">In Arabic a bare +41 79 626 70 82 reads backwards (82 70 626 79 41+). Fix: the number sits in a left-to-right span (vt-dir-keep), as /contact and the footer already do. English does not change.</p>
${spot("phone-imprint", "/imprint · contact rows")}
${spot("phone-imprint-button", "/imprint · call button")}
${spot("phone-cancellation", "/cancellation · “Cannot reach either? Call …”")}
${spot("phone-cancellation-button", "/cancellation · call button")}
${spot("phone-account", "/account · phone line (signed in)")}
${textStrip("/checkout (Arabic error lines) · the same left-to-right marks the other phone lines already carry", [
    ["checkout · class list empty (“Change the travellers or call us …”)", ar.checkout.emptyBody, ar.checkout.emptyBody.replace("+41 79 626 70 82", `${LRM}+41 79 626 70 82${LRM}`)],
    ["checkout · prices could not load (“We could not get prices … call us …”)", ar.checkout.quoteGeneric, ar.checkout.quoteGeneric.replace("+41 79 626 70 82", `${LRM}+41 79 626 70 82${LRM}`)],
  ])}`,
  "02-arrows-arabic": `<h1>2 · Arrows and chevrons in Arabic</h1><p class="lead">Arrows that mean next, back, open or sign out point right in Arabic today. Fix: one rule in the design-system laws flips them in Arabic everywhere (site, account, checkout, dashboard). Arrows inside left-to-right content stay. English does not change.</p>
${spot("arrow-header", "Header · Book a transfer (laptop) and the phone menu (Book a transfer, sign out)")}
${spot("arrow-terms-cta", "/terms · end-of-page button")}
${spot("arrow-faq", "/faq · arrow link")}
${spot("arrow-dashboard", "Dashboard · /calendar previous and next (sample data)")}`,
  "03-disabled-button-and-hint": `<h1>3 · Disabled yellow button and 5 · hint grey</h1><p class="lead">Sign in › Email me a link › the code step. Before: the disabled SIGN IN button is yellow at 42% opacity, a pale cream (law 02 bans it). After: grey fill (the disabled-field grey, --vt-grey-100) with muted text. Hint grey before: --vt-grey-500, 4.45:1 on white, 4.11:1 on the page grey. After: a 60/40 mix of --vt-grey-500 and --vt-charcoal-600, no new hex: 5.4:1 on white, 5.0:1 on the page grey. This grey is used for every muted line, so all of them get slightly darker.</p>
${spot("signin-sent", "/sign-in · code step: hint under the field, disabled SIGN IN")}`,
  "04-awaiting-payment-typo": `<h1>4 · Arabic typo in the dashboard words</h1><p class="lead">Wrong: <bdi lang="ar" style="font-size:22px">انتطار</bdi> (with ط). Right: <bdi lang="ar" style="font-size:22px">انتظار</bdi> (with ظ, “waiting”). Four strings carry the same typo: Awaiting payment, Awaiting live Stripe data, Waiting airport, Waiting city.</p>
${single("typo-strings", "The four strings as the dictionary returns them (Arabic)", "ar", 1440)}`,
};

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1900, height: 800 }, deviceScaleFactor: 1 });
for (const [file, body] of Object.entries(SHEETS)) {
  if (only && !only.has(file)) continue;
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screens}/${file}.jpg`, fullPage: true, type: "jpeg", quality: 82 });
  console.log("sheet", file);
}
await browser.close();
