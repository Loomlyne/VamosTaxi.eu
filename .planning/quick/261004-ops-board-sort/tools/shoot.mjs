#!/usr/bin/env node
// shoot: the dashboard bookings table with sortable headers, from the real shell, offline.
//
// Renders apps/web/public (after scripts/sync-dc-mock-to-public.mjs) the way the dashboard host does
// (serveOpsDc: ops.html with its base href, plus the vamosOpsAuth flag) in headless Chromium. Every /api/**
// request is answered from rows.mjs: seven bookings run through the real mapBoardBooking, so the board gets the
// answer shape GET /api/staff/bookings sends and the real vamos-ops-data.js store reads it. Nothing reaches a
// server. The static server listens on a free port chosen by the OS and is closed by this script (no process
// is killed by name or by pattern).
//
// Pictures (bare crops of the table, no frame), English and Arabic, 1440 and 390 wide:
//   sort-<state>-<lang>-<w>.png   state: booked (the default) | total | driver | vehicle
//   sort-hover-en-1440.png        mouse over the inactive Vehicle header: the muted cue
//   sort-focus-en-1440.png        keyboard focus on a header: the ring
// At 390 the table keeps its own horizontal scroll; the crop is scrolled so the sorted column is in view.
//
// Checks per run (printed, exit 1 on any failure): the order of the customers after every click, first
// direction and flip, for Booked, Total, Driver and Vehicle; aria-sort on the active <th> only; the arrow of the
// active header; the accessible name; the button is a real, focusable button of at least 44 px; Tab, Enter and
// Space on a header; the label and arrow stay inside the header cell; the arrow sits on the logical end; the page
// never scrolls sideways; no page error, console error or failed request. English 1440 only: the sort survives a
// filter switch, a row with no booking time and no total goes last both ways, and VamosLocale.coverage lists
// nothing from the header buttons. German and French: the same order and name checks at 1440, no picture.
//
// Usage: node shoot.mjs <out dir>
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { serve } from "./serve.mjs";
import { answer, EXPECT, stubRows } from "./rows.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const root = resolve(new URL("../../../../apps/web/public", import.meta.url).pathname);
const dcFile = new URL("../../../../app/ops/OpsBoard.dc.html", import.meta.url).pathname;

const out = resolve(process.argv[2] ?? "screens");
mkdirSync(out, { recursive: true });

// The page's own T tables, read as text.
const dc = readFileSync(dcFile, "utf8");
const LANGS = ["en", "de", "fr", "ar"];
const SHOT = new Set(["en", "ar"]);
function table(lang) {
  const start = dc.search(new RegExp(`\\n\\s{2}${lang}: \\{`));
  const next = LANGS.map((l) => dc.search(new RegExp(`\\n\\s{2}${l}: \\{`))).filter((i) => i > start).sort((a, b) => a - b)[0];
  const body = dc.slice(start, next ?? dc.indexOf("class Component extends DCLogic", start));
  const map = {};
  for (const m of body.matchAll(/\b([A-Za-z0-9_]+):'((?:[^'\\]|\\.)*)'/g)) map[m[1]] = m[2].replace(/\\'/g, "'");
  return map;
}
const T = Object.fromEntries(LANGS.map((l) => [l, table(l)]));
const SORTABLE = [["booked", "colBooked"], ["vehicle", "colVehicle"], ["driver", "colDriver"], ["total", "colTotal"]];
const HEADER_KEYS = ["colBooked", "colPickup", "colCustomer", "colRoute", "colVehicle", "colDriver", "colTotal"];
const nameOf = (lang, headerKey) => T[lang].sortBy.replace("%s", T[lang][headerKey]);

const rows = await stubRows();
const rowsWithUnknown = await stubRows({ withUnknown: true });
const { server, base } = await serve(root, { ops: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let bad = 0;

function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) bad += 1;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function open(lang, width, data) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width >= 1000 ? 1 : 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${new URL(r.url()).pathname}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).split("\n")[0].slice(0, 160)}`));
  await page.addInitScript((l) => {
    localStorage.setItem("vamosLang", l);
    localStorage.setItem("vamosOpsAuth", "1");
  }, lang);
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const a = answer(req.method(), new URL(req.url()).pathname, data);
    return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) });
  });
  await page.goto(`${base}/bookings`, { waitUntil: "load" });
  await page.waitForSelector("[data-vt-board] tbody tr", { timeout: 15000 });
  await page.waitForTimeout(1800);
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
  return { ctx, page, errors };
}

const customers = (page) => page.locator("[data-vt-board] tbody tr td:nth-child(3) [data-vt-clip]").allTextContents();
const head = (page, key) => page.locator(`[data-vt-board] thead th:nth-child(${HEADER_KEYS.indexOf(key) + 1}) [data-vt-sort]`);
const ariaSorts = (page) => page.locator("[data-vt-board] thead th").evaluateAll((ths) => ths.map((th) => th.getAttribute("aria-sort")));
const arrowOf = (page, key) => head(page, key).evaluate((b) => {
  const ico = b.querySelector("[data-vt-sort-ico] span");
  const m = ico ? (getComputedStyle(ico).webkitMaskImage || getComputedStyle(ico).maskImage) : "";
  return (m.match(/arrow-(up|down)\.svg/) || [])[1] || "";
});

async function shot(page, lang, width, state, headerKey) {
  if (!SHOT.has(lang)) return;
  if (width <= 768) await head(page, headerKey).evaluate((b) => b.scrollIntoView({ block: "nearest", inline: "center" }));
  await page.mouse.move(2, 2);
  await page.locator("[data-vt-board]").screenshot({ path: `${out}/sort-${state}-${lang}-${width}.png`, animations: "disabled" });
}

async function run(lang, width) {
  const tag = `${lang}-${width}`;
  const { ctx, page, errors } = await open(lang, width, rows);
  const board = page.locator("[data-vt-board]");
  const click = async (key) => { await head(page, key).click(); await page.waitForTimeout(150); };

  // Header words in the page's own language; only the four sortable ones are buttons.
  const heads = (await page.locator("[data-vt-board] thead th").allTextContents()).map((s) => s.trim());
  check(`${tag}: header order and words`, same(heads, HEADER_KEYS.map((k) => T[lang][k])), heads.join(" | "));
  const buttons = await page.locator("[data-vt-board] thead th [data-vt-sort]").count();
  check(`${tag}: four sortable headers (Booked, Vehicle, Driver, Total); Pickup, Customer and Route are not`, buttons === 4 && (await head(page, "colPickup").count()) === 0 && (await head(page, "colCustomer").count()) === 0 && (await head(page, "colRoute").count()) === 0, String(buttons));

  // Default.
  check(`${tag}: default is newest booked first`, same(await customers(page), EXPECT.bookedFirst), (await customers(page)).join(", "));
  check(`${tag}: default aria-sort is descending on Booked only`, same(await ariaSorts(page), ["descending", null, null, null, null, null, null]), JSON.stringify(await ariaSorts(page)));
  check(`${tag}: Booked shows the down arrow`, (await arrowOf(page, "colBooked")) === "down");
  await shot(page, lang, width, "booked", "colBooked");

  // Accessible names, size, a real button.
  for (const [, hk] of SORTABLE) {
    const b = head(page, hk);
    const info = await b.evaluate((el) => { const r = el.getBoundingClientRect(); const th = el.closest("th").getBoundingClientRect(); const ico = el.querySelector("[data-vt-sort-ico]").getBoundingClientRect(); const lab = el.firstElementChild.getBoundingClientRect(); return { tag: el.tagName, type: el.getAttribute("type"), name: el.getAttribute("aria-label"), h: r.height, w: r.width, tabindex: el.tabIndex, inCell: ico.left >= th.left - 1 && ico.right <= th.right + 1 && lab.left >= th.left - 1 && lab.right <= th.right + 1, icoX: ico.x, labX: lab.x }; });
    check(`${tag}: ${hk} is a real button named "${nameOf(lang, hk)}"`, info.tag === "BUTTON" && info.type === "button" && info.name === nameOf(lang, hk) && info.tabindex === 0, `${info.tag} ${info.name}`);
    check(`${tag}: ${hk} target is at least 44 px high`, info.h >= 44 && info.w >= 44, `${info.w.toFixed(0)}x${info.h.toFixed(0)}`);
    check(`${tag}: ${hk} label and arrow stay inside the header cell`, info.inCell);
    check(`${tag}: ${hk} arrow sits after the label on the reading direction`, lang === "ar" ? info.icoX < info.labX : info.icoX > info.labX, `arrow ${info.icoX.toFixed(0)} label ${info.labX.toFixed(0)}`);
  }

  // Inactive headers: arrow hidden until hover or focus.
  const op = (hk) => head(page, hk).evaluate((el) => getComputedStyle(el.querySelector("[data-vt-sort-ico]")).opacity);
  check(`${tag}: an inactive header hides its arrow`, (await op("colVehicle")) === "0", await op("colVehicle"));
  check(`${tag}: the active header shows its arrow`, (await op("colBooked")) === "1");
  await head(page, "colVehicle").hover();
  check(`${tag}: hovering an inactive header shows its muted arrow`, (await op("colVehicle")) === "1");
  if (lang === "en" && width === 1440) await board.screenshot({ path: `${out}/sort-hover-en-1440.png`, animations: "disabled" });
  await page.mouse.move(2, 2);

  // Booked flip, then Total, Driver, Vehicle: first direction, then flip.
  await click("colBooked");
  check(`${tag}: Booked flip is oldest first`, same(await customers(page), EXPECT.bookedFlip), (await customers(page)).join(", "));
  check(`${tag}: Booked flip aria-sort ascending, up arrow`, same(await ariaSorts(page), ["ascending", null, null, null, null, null, null]) && (await arrowOf(page, "colBooked")) === "up");

  await click("colTotal");
  check(`${tag}: Total first click is biggest first, ties newest booked first`, same(await customers(page), EXPECT.totalFirst), (await customers(page)).join(", "));
  check(`${tag}: Total aria-sort descending on Total only (Booked cleared)`, same(await ariaSorts(page), [null, null, null, null, null, null, "descending"]), JSON.stringify(await ariaSorts(page)));
  const amounts = (await page.locator("[data-vt-board] tbody tr td:nth-child(7)").allTextContents()).map((s) => Number(s.replace(/[^0-9.]/g, "")));
  check(`${tag}: the Total column itself reads biggest to smallest`, amounts.every((v, i) => i === 0 || amounts[i - 1] >= v), amounts.join(", "));
  await shot(page, lang, width, "total", "colTotal");
  await click("colTotal");
  check(`${tag}: Total flip is smallest first`, same(await customers(page), EXPECT.totalFlip), (await customers(page)).join(", "));
  check(`${tag}: Total flip aria-sort ascending, up arrow`, same(await ariaSorts(page), [null, null, null, null, null, null, "ascending"]) && (await arrowOf(page, "colTotal")) === "up");

  await click("colDriver");
  check(`${tag}: Driver first click is not assigned first`, same(await customers(page), EXPECT.driverFirst), (await customers(page)).join(", "));
  check(`${tag}: Driver aria-sort ascending on Driver only`, same(await ariaSorts(page), [null, null, null, null, null, "ascending", null]), JSON.stringify(await ariaSorts(page)));
  await shot(page, lang, width, "driver", "colDriver");
  await click("colDriver");
  check(`${tag}: Driver flip is assigned first`, same(await customers(page), EXPECT.driverFlip), (await customers(page)).join(", "));

  await click("colVehicle");
  check(`${tag}: Vehicle first click is class order Economy, Business, Van luxury`, same(await customers(page), EXPECT.vehicleFirst), (await customers(page)).join(", "));
  const classes = await page.locator("[data-vt-board] tbody tr td:nth-child(5) [data-vt-clip]").allTextContents();
  check(`${tag}: the Vehicle column itself reads in class order`, same(classes, ["Economy", "Economy", "Economy", "Business", "Business", "Van luxury", "Van luxury"]), classes.join(", "));
  await shot(page, lang, width, "vehicle", "colVehicle");
  await click("colVehicle");
  check(`${tag}: Vehicle flip is reversed class order`, same(await customers(page), EXPECT.vehicleFlip), (await customers(page)).join(", "));

  // Clicking another header starts in its own first direction, and Booked is back to newest first.
  await click("colBooked");
  check(`${tag}: Booked after other columns starts newest first again`, same(await customers(page), EXPECT.bookedFirst), (await customers(page)).join(", "));

  // Keyboard: Tab reaches the first header, Enter flips, focus stays; Space on the next one.
  await page.mouse.move(2, 2);
  await page.locator("[data-ops-search] input").first().focus();
  let reached = "";
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => (document.activeElement && document.activeElement.getAttribute("data-vt-sort") ? document.activeElement.getAttribute("aria-label") : ""));
    if (reached) break;
  }
  check(`${tag}: Tab reaches the Booked header button`, reached === nameOf(lang, "colBooked"), reached);
  if (lang === "en" && width === 1440) await board.screenshot({ path: `${out}/sort-focus-en-1440.png`, animations: "disabled" });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  check(`${tag}: Enter on the focused header flips it to oldest first`, same(await customers(page), EXPECT.bookedFlip), (await customers(page)).join(", "));
  const stillFocused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label"));
  check(`${tag}: focus stays on the header after Enter`, stillFocused === nameOf(lang, "colBooked"), String(stillFocused));
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  check(`${tag}: Tab then Space sorts the next header (Vehicle) in class order`, same(await customers(page), EXPECT.vehicleFirst), (await customers(page)).join(", "));

  // Layout.
  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") || "ltr");
  check(`${tag}: direction`, lang === "ar" ? dir === "rtl" : dir !== "rtl", dir);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${tag}: the page does not scroll sideways`, sideways <= 0, `overflow ${sideways}px`);
  const own = await board.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  if (width <= 768) check(`${tag}: the table keeps its own horizontal scroll`, own.sw > own.cw, `${own.sw} > ${own.cw}`);
  else check(`${tag}: the table fits without its own scroll`, own.sw <= own.cw + 1, `${own.sw} <= ${own.cw}`);

  check(`${tag}: no page error, console error or failed request`, errors.length === 0, errors.join(" / "));
  await ctx.close();
}

async function controlEnglish() {
  const { ctx, page, errors } = await open("en", 1440, rows);
  const click = async (key) => { await head(page, key).click(); await page.waitForTimeout(150); };

  // The sort survives a filter switch: Total biggest first, narrow to Unassigned, flip, clear the filter.
  await click("colTotal");
  await page.getByRole("button", { name: /Unassigned/ }).first().click();
  await page.waitForTimeout(200);
  check("control: filter Unassigned keeps Total biggest first", same(await customers(page), ["Jonas Weber", "Elena Brunner"]), (await customers(page)).join(", "));
  check("control: the sort header is still active after the filter switch", same(await ariaSorts(page), [null, null, null, null, null, null, "descending"]));
  await click("colTotal");
  check("control: flipping inside the filter gives smallest first", same(await customers(page), ["Elena Brunner", "Jonas Weber"]), (await customers(page)).join(", "));
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.waitForTimeout(200);
  check("control: clearing the filter shows all seven, still Total smallest first", same(await customers(page), EXPECT.totalFlip), (await customers(page)).join(", "));

  // English page: the runtime lists what it cannot turn into de / fr / ar; none of it may come from the header buttons.
  for (const target of ["de", "fr", "ar"]) {
    const res = await page.evaluate((to) => window.VamosLocale.coverage(document.querySelector("[data-vt-board] thead"), to), target);
    check(`control: VamosLocale.coverage (${target}) lists nothing from the table header`, res.count === 0, `${res.count} listed: ${[...res.strings, ...res.attrs].join(" / ")}`);
  }
  check("control: no page error, console error or failed request", errors.length === 0, errors.join(" / "));
  await ctx.close();
}

async function controlMissing() {
  const { ctx, page, errors } = await open("en", 1440, rowsWithUnknown);
  const last = async () => (await customers(page)).at(-1);
  check("missing: Booked newest first puts the row with no booking time last", (await last()) === "Test Unknown", String(await last()));
  await head(page, "colBooked").click();
  await page.waitForTimeout(150);
  check("missing: Booked oldest first still puts it last", (await last()) === "Test Unknown", String(await last()));
  await head(page, "colTotal").click();
  await page.waitForTimeout(150);
  check("missing: Total biggest first puts the row with no total last", (await last()) === "Test Unknown", String(await last()));
  await head(page, "colTotal").click();
  await page.waitForTimeout(150);
  check("missing: Total smallest first still puts it last", (await last()) === "Test Unknown", String(await last()));
  check("missing: no page error, console error or failed request", errors.length === 0, errors.join(" / "));
  await ctx.close();
}

for (const lang of LANGS) {
  for (const width of SHOT.has(lang) ? [1440, 390] : [1440]) await run(lang, width);
}
await controlEnglish();
await controlMissing();
await browser.close();
server.close();
console.log(results.join("\n"));
console.log(bad ? `${bad} FAILED` : "all checks passed");
process.exit(bad ? 1 : 0);
