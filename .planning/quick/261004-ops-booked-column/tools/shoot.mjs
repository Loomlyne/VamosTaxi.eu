#!/usr/bin/env node
// shoot: the dashboard bookings table with the new Booked column, from the real shell, offline.
//
// Renders apps/web/public (after scripts/sync-dc-mock-to-public.mjs) the way the dashboard host does
// (serveOpsDc: ops.html with its base href, plus the vamosOpsAuth flag) in headless Chromium. Every /api/**
// request is answered from rows.mjs: five bookings run through the real mapBoardBooking, so the board gets
// the answer shape GET /api/staff/bookings sends, createdAt included, and the real vamos-ops-data.js store
// reads it. Nothing reaches a server. The static server listens on a free port chosen by the OS and is
// closed by this script (no process is killed by name or by pattern).
//
// Pictures (bare crops of the table, no frame), English and Arabic, 1440 and 390 wide:
//   bookings-booked-<lang>-<w>.png
// German and French run the same checks at 1440 for the text only (no picture).
//
// Checks per run (printed, exit 1 on any failure): header order Booked, Pickup, Customer, Route, Vehicle,
// Driver, Total in the page's own words; each Booked cell reads the expected text in that language (month
// from the shared dictionary: Oct / Okt / oct / أكتوبر); the title holds the full Zurich date and time;
// day, year and time are left-to-right isolates; the visual order inside the cell follows the reading
// direction; nothing in the Booked cell is clipped; the document never scrolls sideways (the table keeps its
// own scroll at 390); no page error, no console error, no failed request; VamosLocale.coverage (English)
// lists nothing from the new column. A control run with one row that has no creation time must show a dash
// in the muted colour.
//
// Usage: node shoot.mjs <out dir>
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { serve } from "./serve.mjs";
import { answer, EXPECTED_EN, EXPECTED_TITLE, stubRows } from "./rows.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const root = resolve(new URL("../../../../apps/web/public", import.meta.url).pathname);
const dcFile = new URL("../../../../app/ops/OpsBoard.dc.html", import.meta.url).pathname;
const dictFile = new URL("../../../../app/vamos-i18n-dict.js", import.meta.url).pathname;

const out = resolve(process.argv[2] ?? "screens");
mkdirSync(out, { recursive: true });

if (new Date().getFullYear() !== 2026) {
  console.log("FAIL  the stub rows are dated for the year 2026; the expected labels need updating");
  process.exit(1);
}

// The page's own T tables, read as text: the header of each column, per language.
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
const HEADER_KEYS = ["colBooked", "colPickup", "colCustomer", "colRoute", "colVehicle", "colDriver", "colTotal"];

// Month words per language, from the shared dictionary the runtime translates with.
const dict = readFileSync(dictFile, "utf8");
const MONTH = {};
for (const m of dict.matchAll(/'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)': \{ de: '([^']*)', fr: '([^']*)', ar: '([^']*)' \}/g)) {
  MONTH[m[1]] = { en: m[1], de: m[2], fr: m[3], ar: m[4] };
}
if (Object.keys(MONTH).length !== 12) throw new Error(`dictionary has ${Object.keys(MONTH).length} of 12 month entries`);
const expectedText = (lang, i) => EXPECTED_EN[i].replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/, (m) => MONTH[m][lang]);
const monthWord = (lang, i) => MONTH[EXPECTED_EN[i].match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/)[1]][lang];

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

async function open(lang, width, data) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
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

const RGB_OF = `(css) => { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillStyle = css; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }`;

async function run(lang, width) {
  const tag = `${lang}-${width}`;
  const { ctx, page, errors } = await open(lang, width, rows);
  const board = page.locator("[data-vt-board]");

  // Header order, in the page's own words.
  const heads = (await page.locator("[data-vt-board] thead th").allTextContents()).map((s) => s.trim());
  check(`${tag}: header order is Booked, Pickup, Customer, Route, Vehicle, Driver, Total`, JSON.stringify(heads) === JSON.stringify(HEADER_KEYS.map((k) => T[lang][k])), heads.join(" | "));
  if (lang !== "en") check(`${tag}: the Booked header is not the English word`, heads[0] !== T.en.colBooked, heads[0]);

  // The five Booked cells.
  const n = await page.locator("[data-vt-board] tbody tr").count();
  check(`${tag}: five rows`, n === 5, String(n));
  for (let i = 0; i < Math.min(n, 5); i++) {
    const cell = page.locator("[data-vt-board] tbody tr").nth(i).locator("td").first();
    const text = (await cell.textContent()).replace(/\s+/g, " ").trim();
    check(`${tag}: row ${i + 1} reads "${expectedText(lang, i)}"`, text === expectedText(lang, i), text);
    const info = await cell.evaluate((td) => {
      const wrap = td.querySelector("[data-vt-booked]");
      const keeps = [...td.querySelectorAll(".vt-dir-keep")].map((e) => ({ t: e.textContent, dir: getComputedStyle(e).direction, bidi: getComputedStyle(e).unicodeBidi, skip: e.getAttribute("data-vt-no-i18n"), x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y }));
      const d = td.querySelector("[data-vt-booked-d]");
      const t = td.querySelector("[data-vt-booked-t]");
      const month = [...d.children].find((e) => !e.classList.contains("vt-dir-keep"));
      const mb = month.getBoundingClientRect();
      return {
        title: wrap.getAttribute("title"),
        keeps, month: month.textContent, monthX: mb.x, monthY: mb.y,
        clipped: wrap.scrollWidth > wrap.clientWidth + 1 || td.scrollWidth > td.clientWidth + 1,
        wrapped: t.getBoundingClientRect().top > d.getBoundingClientRect().top + 4,
      };
    });
    check(`${tag}: row ${i + 1} title is the full Zurich date and time`, info.title === EXPECTED_TITLE[i], JSON.stringify(info.title));
    const wantKeeps = EXPECTED_EN[i].includes("2025") ? 3 : 2;
    check(`${tag}: row ${i + 1} day${wantKeeps === 3 ? ", year" : ""} and time are left-to-right isolates, skipped by the translator`,
      info.keeps.length === wantKeeps && info.keeps.every((k) => k.skip === "1") && (lang !== "ar" || info.keeps.every((k) => k.dir === "ltr" && k.bidi === "isolate")),
      info.keeps.map((k) => `${k.t}:${k.dir}`).join(","));
    check(`${tag}: row ${i + 1} month word is ${monthWord(lang, i)}`, info.month === monthWord(lang, i), info.month);
    check(`${tag}: row ${i + 1} nothing in the cell is clipped`, !info.clipped);
    // Visual order on one line: English reads day, month, time left to right; Arabic the other way.
    if (!info.wrapped) {
      const day = info.keeps[0];
      const time = info.keeps[info.keeps.length - 1];
      const ordered = lang === "ar" ? day.x > info.monthX && info.monthX > time.x : day.x < info.monthX && info.monthX < time.x;
      check(`${tag}: row ${i + 1} day, month, time follow the reading direction`, ordered, `day ${day.x.toFixed(0)} month ${info.monthX.toFixed(0)} time ${time.x.toFixed(0)}`);
    } else {
      results.push(`INFO  ${tag}: row ${i + 1} wraps the time onto a second line (year present or narrow column)`);
    }
  }

  // Layout.
  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") || "ltr");
  check(`${tag}: direction`, lang === "ar" ? dir === "rtl" : dir !== "rtl", dir);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${tag}: the page does not scroll sideways`, sideways <= 0, `overflow ${sideways}px`);
  const own = await board.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  if (width <= 768) check(`${tag}: the table keeps its own horizontal scroll`, own.sw > own.cw, `${own.sw} > ${own.cw}`);
  else check(`${tag}: the table fits without its own scroll`, own.sw <= own.cw + 1, `${own.sw} <= ${own.cw}`);
  const headBox = await page.locator("[data-vt-board] thead th").first().evaluate((th) => ({ sw: th.scrollWidth, cw: th.clientWidth }));
  check(`${tag}: the Booked header is not clipped`, headBox.sw <= headBox.cw + 1, `${headBox.sw} <= ${headBox.cw}`);

  // English page only: the runtime lists what it cannot turn into de / fr / ar. The table also holds names and
  // addresses (never translated); none of the listed strings may be the new column's header or a month word.
  if (lang === "en") {
    for (const target of ["de", "fr", "ar"]) {
      const res = await page.evaluate((to) => window.VamosLocale.coverage(document.querySelector("[data-vt-board]"), to), target);
      const listed = [...res.strings, ...res.attrs];
      const mine = listed.filter((g) => /^Booked$|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(String(g)));
      check(`${tag}: VamosLocale.coverage (${target}) lists nothing from the Booked column`, mine.length === 0, `${res.count} listed from other columns, e.g. ${listed.slice(0, 4).join(" / ")}`);
    }
  }

  check(`${tag}: no page error, console error or failed request`, errors.length === 0, errors.join(" / "));
  if (SHOT.has(lang)) await board.screenshot({ path: `${out}/bookings-booked-${lang}-${width}.png`, animations: "disabled" });
  await ctx.close();
}

async function controlNoCreationTime() {
  const { ctx, page, errors } = await open("en", 1440, rowsWithUnknown);
  const last = page.locator("[data-vt-board] tbody tr").nth(5).locator("td").first();
  const text = (await last.textContent()).trim();
  check("control: a row with no creation time shows a dash", text === "—", JSON.stringify(text));
  const col = await last.evaluate((td, rgbSrc) => {
    const rgbOf = eval(rgbSrc);
    const el = td.querySelector("[data-vt-quiet]");
    return { has: !!el, color: el ? rgbOf(getComputedStyle(el).color) : null, muted: rgbOf(getComputedStyle(document.documentElement).getPropertyValue("--vt-text-muted").trim()) };
  }, RGB_OF);
  check("control: the dash is in the muted text colour", col.has && col.color.join(",") === col.muted.join(","), `${col.color} vs ${col.muted}`);
  check("control: no page error, console error or failed request", errors.length === 0, errors.join(" / "));
  await ctx.close();
}

for (const lang of LANGS) {
  for (const width of SHOT.has(lang) ? [1440, 390] : [1440]) await run(lang, width);
}
await controlNoCreationTime();
await browser.close();
server.close();
console.log(results.join("\n"));
console.log(bad ? `${bad} FAILED` : "all checks passed");
process.exit(bad ? 1 : 0);
