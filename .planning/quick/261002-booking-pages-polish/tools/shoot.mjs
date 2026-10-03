// Signing pictures for quick task 261002-booking-pages-polish.
// usage: node shoot.mjs <before public root> <after public root> <raw out dir>   (ONLY=shot1,shot2 limits the run;
//        SIDES=before,after limits the sides)
// Every /api/* answer is stubbed (stubs.mjs). Nothing reaches a real server, no repo file is changed.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { serve } from "./serve.mjs";
import { apiHandler, HIDE, TOKEN, REF } from "./stubs.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [beforeRoot, afterRoot, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const GUEST = `/manage-booking?token=${TOKEN}`;
const DETAIL = `/booking-detail?ref=${REF}`;
const NOTES = [];

async function open(page, path, settle = 1600) {
  await page.goto(page.__base + path, { waitUntil: "load" });
  await page.waitForTimeout(settle);
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(600);
}

/** A clip from the top of `a` to the bottom of `b` (page coordinates, full width of the wider one, 12 px air). */
async function clipBetween(page, a, b) {
  const ra = await a.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
  const rb = await b.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
  const x = Math.max(0, Math.min(ra.x, rb.x));
  const right = Math.max(ra.x + ra.w, rb.x + rb.w);
  const y = Math.max(0, ra.y);
  const bottom = rb.y + rb.h;
  return { x, y, width: Math.min(right, page.viewportSize().width) - x, height: bottom - y };
}

/** Sets the open picker's spinner to hh:mm by pressing its own up/down buttons (DOM order: hour up, hour down, minute up, minute down). */
async function readSpinner(page, scope) {
  return page.evaluate((sel) => {
    const col = document.querySelector(sel);
    if (!col) return null;
    const big = [...col.querySelectorAll("span")].filter((s) => s.children.length === 0 && /^\d{2}$/.test((s.textContent || "").trim()) && parseFloat(getComputedStyle(s).fontSize) >= 30);
    return big.length >= 2 ? [big[0].textContent.trim(), big[1].textContent.trim()] : null;
  }, scope);
}

/** Moves the spinner toward hh:mm; a bound (earliest bookable time today) stops it where it is. Returns [hh, mm] shown. */
async function setSpinner(page, scope, hh, mm) {
  const btns = page.locator(`${scope} button[aria-label]`);
  for (let i = 0; i < 120; i++) {
    const v = await readSpinner(page, scope);
    if (!v) throw new Error("spinner not found");
    let idx = -1;
    if (v[0] !== hh) idx = Number(v[0]) > Number(hh) ? 1 : 0;
    else if (v[1] !== mm) idx = Number(v[1]) > Number(mm) ? 3 : 2;
    if (idx < 0) return v;
    await btns.nth(idx).click();
    await page.waitForTimeout(60);
    const after = await readSpinner(page, scope);
    if (after && after[0] === v[0] && after[1] === v[1]) return after;
  }
  return readSpinner(page, scope);
}

async function forkTo(page, which) {
  // which: 0 = change, 1 = cancel
  await page.locator("button[data-fork]").nth(which).click();
  await page.waitForTimeout(700);
}

const SHOTS = {
  // Item 1: signed-in booking page, card plus the two action tiles.
  "bd-paid": {
    signedIn: true, langs: ["en", "ar"],
    run: async (page) => {
      await open(page, DETAIL);
      const card = page.locator("article[data-card]").first();
      const tiles = page.locator("[data-two]").first();
      const badge = await card.locator(".vt-badge, [class*='badge']").first().textContent().catch(() => "");
      const cancelTiles = await page.locator("button[data-fork]").count();
      NOTES.push({ shot: "bd-paid", lang: page.__lang, w: page.__w, side: page.__side, badge: (badge || "").trim(), forkButtons: cancelTiles });
      await card.scrollIntoViewIfNeeded();
      return { clip: await clipBetween(page, card, tiles) };
    },
  },
  // Item 1: the cancel sheet behind the new Cancel tile (after only).
  "bd-cancel-sheet": {
    signedIn: true, langs: ["en", "ar"], sides: ["after"],
    run: async (page) => {
      await open(page, DETAIL);
      await forkTo(page, 1);
      return page.locator("div[data-card]").filter({ has: page.locator("[data-back]") }).first();
    },
  },
  // Item 2: the booking card header (date pill, route summary with its date row).
  "mb-dates": {
    langs: ["en", "de", "ar"],
    run: async (page) => { await open(page, GUEST); return page.locator("article[data-card]").first(); },
  },
  // Item 2 (+ item 5 on the change view): booked-for / new pickup rows after a new time is chosen.
  "bd-change": {
    signedIn: true, langs: ["de", "ar"],
    run: async (page) => {
      await open(page, DETAIL);
      await forkTo(page, 0);
      await page.locator('main button[aria-haspopup="dialog"]').first().click();
      await page.waitForTimeout(600);
      await setSpinner(page, "[data-wp-time]", "09", "30").catch(async () => {
        await page.locator("[data-wp-time] button").first().click();
      });
      await page.waitForTimeout(300);
      const pop = page.locator("[data-wp-time]").first();
      const shotPicker = await pop.isVisible().catch(() => false);
      if (shotPicker) {
        const pk = `${page.__file.replace(/\.png$/, "")}-picker.png`;
        await pop.locator("xpath=../..").screenshot({ path: pk }).catch(() => {});
      }
      // Keep the time with the picker's own foot button, then shoot the rows.
      await page.locator("[data-wp-row]").locator("xpath=..").locator("button").last().click().catch(() => {});
      await page.waitForTimeout(700);
      return page.locator('div[data-card][data-noprint]').filter({ has: page.locator('[aria-haspopup="dialog"]') }).first();
    },
  },
  // Item 3 + item 2: voucher rows Date and Bags; 2 bags and 12 bags.
  "mb-voucher-2bags": {
    langs: ["en", "ar"], bags: 2,
    run: async (page) => {
      await open(page, GUEST);
      await page.getByRole("button", { name: /voucher|قسيمة|Gutschein|bon/i }).first().click();
      await page.waitForTimeout(700);
      return page.locator("[data-confirmation-voucher]").first();
    },
  },
  "mb-voucher-12bags": {
    langs: ["ar"], bags: 12, pax: 12,
    run: async (page) => {
      await open(page, GUEST);
      await page.getByRole("button", { name: /voucher|قسيمة|Gutschein|bon/i }).first().click();
      await page.waitForTimeout(700);
      return page.locator("[data-confirmation-voucher]").first();
    },
  },
  // Item 4: refunded booking, the Refund row.
  "mb-refund": {
    langs: ["en", "de", "ar"], refunded: true,
    run: async (page) => {
      await open(page, GUEST);
      const row = page.locator("article[data-card] [data-row]").last();
      return row;
    },
  },
  // Item 5: home time spinner at 04:30.
  "home-spinner": {
    langs: ["en", "ar"], scale: 2,
    run: async (page, w) => {
      await open(page, "/", 2600);
      if (w < 700) {
        await page.locator("#book button[data-bb]").first().click();
        await page.waitForTimeout(900);
        const pickers = page.locator('button[aria-haspopup="dialog"]:visible');
        const n = await pickers.count();
        await pickers.nth(Math.max(0, n - 1)).click();
      } else {
        const when = page.locator("#book [data-bx=when]");
        await when.scrollIntoViewIfNeeded();
        await when.locator('button[aria-haspopup="dialog"]').first().click();
      }
      await page.waitForTimeout(900);
      const v = await setSpinner(page, "[data-wp-time]", "18", "30");
      NOTES.push({ shot: "home-spinner", lang: page.__lang, w, side: page.__side, spinner: v });
      return page.locator("[data-wp-time]").first();
    },
  },
};

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const sidesWanted = process.env.SIDES ? process.env.SIDES.split(",") : ["before", "after"];
const srv = { before: await serve(beforeRoot), after: await serve(afterRoot) };
const browser = await chromium.launch();

for (const [name, shot] of Object.entries(SHOTS)) {
  if (only && !only.has(name)) continue;
  for (const side of shot.sides || ["before", "after"]) {
    if (!sidesWanted.includes(side)) continue;
    for (const lang of shot.langs) {
      for (const w of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: shot.scale || 1 });
        const page = await ctx.newPage();
        page.__base = srv[side].base;
        page.__lang = lang; page.__w = w; page.__side = side;
        page.setDefaultTimeout(8000);
        await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
        await page.route("**/api/**", apiHandler({ side, signedIn: !!shot.signedIn, refunded: !!shot.refunded, bags: shot.bags, pax: shot.pax }));
        const file = `${out}/${name}-${side}-${lang}-${w}.png`;
        page.__file = file;
        try {
          const got = await shot.run(page, w);
          if (got.clip) await page.screenshot({ path: file, clip: got.clip, fullPage: true });
          else {
            await got.scrollIntoViewIfNeeded();
            await page.waitForTimeout(250);
            await got.screenshot({ path: file });
          }
          const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          NOTES.push({ shot: name, side, lang, w, sideways });
          console.log("ok", name, side, lang, w, sideways > 0 ? `SIDEWAYS ${sideways}px` : "");
        } catch (e) {
          console.log("FAIL", name, side, lang, w, String(e).split("\n")[0]);
          await page.screenshot({ path: `${out}/_fail-${name}-${side}-${lang}-${w}.png`, fullPage: true }).catch(() => {});
        }
        await ctx.close();
      }
    }
  }
}
writeFileSync(`${out}/_notes${only ? "-" + [...only].join("+") : ""}.json`, JSON.stringify(NOTES, null, 2));
await browser.close();
srv.before.server.close();
srv.after.server.close();
