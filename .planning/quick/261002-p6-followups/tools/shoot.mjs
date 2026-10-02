// Signing pictures for quick task 261002-p6-followups.
// usage: node shoot.mjs <synced public root> <raw out dir>      (ONLY=shot1,shot2 limits the run)
// Renders the manage-booking and booking-detail spots (and the date picker) at 1440 and 390, English and Arabic,
// before (the files as they are) and after (the proposed string patches served on the fly), with every /api/*
// answer stubbed. Nothing reaches a real server, no repo file is changed.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { serve } from "./serve.mjs";
import { apiHandler, HIDE, TOKEN, REF } from "./stubs.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [root, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const TEL = 'a[href="tel:+41796267082"]';
const GUEST = `/manage-booking?token=${TOKEN}`;
const GUEST_LATE = `${GUEST}&timing=late`;
const DETAIL = `/booking-detail?ref=${REF}`;
const DETAIL_LATE = `${DETAIL}&timing=late`;
const NOTES = [];

async function open(page, path, settle = 1500) {
  await page.goto(page.__base + path, { waitUntil: "load" });
  await page.waitForTimeout(settle);
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(700);
}

const boxOfTel = (page) => page.locator(`main ${TEL}:visible`).first().locator("xpath=ancestor::div[3]");

/** The change-your-booking view: day field of the time change, then the time slots. */
async function openModify(page, path = GUEST) {
  await open(page, path);
  await page.locator('button[data-fork]').first().click();
  await page.waitForTimeout(600);
}

async function chooseTime(page, time) {
  await page.getByRole("button", { name: /pickup|abhol|prise|الانطلاق|date|Pick/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.locator(`button:has-text("${time}")`).first().click();
  await page.waitForTimeout(500);
}

/** Where the toast box is and how many lines its sentence takes (the box is the first child of the fixed wrapper). */
async function toastReport(page, label) {
  const r = await page.evaluate(() => {
    const wrap = document.querySelector('[aria-live="polite"]');
    const vw = document.documentElement.clientWidth;
    if (!wrap || !wrap.firstElementChild) return { shown: false };
    // The visible box is the widest, tallest descendant (the first child of the wrapper can be a zero-size host).
    let box = null;
    for (const el of wrap.querySelectorAll("*")) {
      const q = el.getBoundingClientRect();
      if (q.width > 0 && q.height > 0 && (!box || q.width * q.height > box.width * box.height)) box = q;
    }
    const b = box || wrap.firstElementChild.getBoundingClientRect();
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
    let lines = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.textContent || "").trim().length < 8) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      lines = new Set([...range.getClientRects()].map((q) => Math.round(q.top))).size;
      break;
    }
    return { shown: true, vw, left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), centreOffset: Math.round((b.left + b.right) / 2 - vw / 2), cutLeft: b.left < 0, cutRight: b.right > vw, lines };
  });
  NOTES.push({ label, toast: r });
}

/** A time change that the server refuses (409 staff-change-waiting): pick a new time, press the request button, shoot the toast. */
function timeRefused(path, signedIn) {
  return {
    sides: ["before", "after"],
    signedIn,
    after3: true,
    timeChange: { status: 409, body: { ok: false, code: "staff-change-waiting" } },
    run: async (page, w, tag) => {
      await openModify(page, path);
      // The picker: open it, move the hour up once (a new time), keep it with the button at the foot of the popover.
      await page.locator('main button[aria-haspopup="dialog"]').first().click();
      await page.waitForTimeout(500);
      await page.locator("[data-wp-time] button").first().click();
      await page.waitForTimeout(300);
      await page.locator("[data-wp-row]").locator("xpath=..").locator("button").last().click();
      await page.waitForTimeout(700);
      const req = page.locator("main button.vt-btn--primary:not([disabled])").last();
      // Scroll so the button sits near the foot of the screen: the toast (fixed, bottom) then lands on the light
      // page under the card instead of on the dark footer.
      await req.evaluate((el, y) => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top + r.height / 2 - y); }, w > 1200 ? 735 : 450);
      await page.waitForTimeout(300);
      await req.click();
      await page.waitForTimeout(450);
      await toastReport(page, tag);
      const vh = page.viewportSize().height;
      // 1440: the left part of the 1200 px column (card, button and toast); Arabic keeps the whole column (the card sits on the
      // right); 390: the whole width. Lower part of the screen.
      const rtl = (await page.evaluate(() => localStorage.getItem("vamosLang"))) === "ar";
      return { clip: { x: w > 1200 ? 120 : 0, y: Math.round(vh * 0.38), width: w > 1200 ? (rtl ? 1200 : 880) : w, height: Math.round(vh * 0.62) } };
    },
  };
}

/** The shots. Each returns the element to capture, or { el, clip }. `pages` says where the shot lives. */
const SHOTS = {
  "mb-phone-lookup": { sides: ["before", "after"], run: async (page) => { await open(page, "/manage-booking"); return boxOfTel(page); } },
  "mb-phone-person": { sides: ["before", "after"], run: async (page) => { await open(page, GUEST); return boxOfTel(page); } },
  "mb-phone-fork": {
    sides: ["before", "after"],
    run: async (page) => {
      await open(page, GUEST_LATE);
      await page.locator("button[data-fork]").first().click();
      await page.waitForTimeout(600);
      return page.locator('a[data-fork][href="tel:+41796267082"]').locator("xpath=..");
    },
  },
  "bd-phone-lookup": { sides: ["before", "after"], run: async (page) => { await open(page, "/booking-detail"); return boxOfTel(page); } },
  "bd-phone-person": { sides: ["before", "after"], signedIn: true, run: async (page) => { await open(page, DETAIL); return boxOfTel(page); } },
  "bd-phone-fork": {
    sides: ["before", "after"],
    signedIn: true,
    run: async (page) => {
      await open(page, DETAIL_LATE);
      await page.locator("button[data-fork]").first().click();
      await page.waitForTimeout(600);
      return page.locator('a[data-fork][href="tel:+41796267082"]').locator("xpath=..");
    },
  },
  "mb-passengers": { sides: ["before"], run: async (page) => { await open(page, GUEST); return page.locator("article[data-card]").first(); } },
  "mb-passengers-voucher": {
    sides: ["before"],
    run: async (page) => {
      await open(page, GUEST);
      await page.getByRole("button", { name: /voucher|قسيمة/i }).first().click();
      await page.waitForTimeout(700);
      return page.locator("[data-confirmation-voucher]").first();
    },
  },
  "bd-passengers": { sides: ["before"], signedIn: true, run: async (page) => { await open(page, DETAIL); return page.locator("article[data-card]").first(); } },
  "bd-passengers-voucher": {
    sides: ["before"],
    signedIn: true,
    run: async (page) => {
      await open(page, DETAIL);
      await page.getByRole("button", { name: /voucher|قسيمة/i }).first().click();
      await page.waitForTimeout(700);
      return page.locator("[data-confirmation-voucher]").first();
    },
  },
  "mb-time-refused": timeRefused(GUEST, false),
  "bd-time-refused": timeRefused(DETAIL, true),
};

/** What each month control in the open calendar looks like: which glyph file, and whether a mirror transform is on it. */
async function navReport(page, label) {
  const rows = await page.evaluate(() => {
    const cal = document.querySelector("[data-wp-cal]");
    const head = cal && cal.firstElementChild;
    if (!head) return [];
    return [...head.children].map((c) => {
      const el = c.querySelector("[style*='chevron-']");
      if (!el) return { kind: "title", x: Math.round(c.getBoundingClientRect().x), text: (c.textContent || "").trim().slice(0, 24) };
      const m = (el.getAttribute("style") || "").match(/(chevron-(?:left|right))\.svg/);
      return {
        kind: c.tagName.toLowerCase() === "button" ? "button " + (c.getAttribute("aria-label") || "") : "disabled-" + c.tagName.toLowerCase(),
        x: Math.round(c.getBoundingClientRect().x),
        glyphFile: m ? m[1] : "?",
        transform: getComputedStyle(el).transform,
      };
    });
  });
  // Does the page's live style sheet still carry `.vt-dp__nav *` in the arrow-mirror rule? (After must say no.)
  const mirrorRuleHasDpNav = await page.evaluate(() => {
    const seen = [];
    const walk = (sheet) => {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { return; }
      for (const r of rules) {
        if (r.type === 3 && r.styleSheet) walk(r.styleSheet);
        else if ((r.cssText || "").includes("arrow-right.svg") && (r.cssText || "").includes("scaleX(-1)")) seen.push((r.cssText || "").includes(".vt-dp__nav"));
      }
    };
    for (const sh of document.styleSheets) walk(sh);
    return seen;
  });
  NOTES.push({ label, rows, mirrorRuleHasDpNav });
}

SHOTS["dp-manage"] = {
  sides: ["before", "after"],
  laws: true,
  scale: 2,
  run: async (page, w, tag) => {
    await openModify(page);
    await page.locator('main button[aria-haspopup="dialog"]').first().click();
    await page.waitForTimeout(700);
    await navReport(page, tag);
    return page.locator("[data-wp-cal]").first();
  },
};
SHOTS["dp-home"] = {
  sides: ["before", "after"],
  laws: true,
  scale: 2,
  run: async (page, w, tag) => {
    await open(page, "/", 2500);
    // On the phone the fields live in a sheet (the "Where to?" bar opens it) with a Date field of its own.
    if (w < 700) {
      await page.locator("#book button[data-bb]").first().click();
      await page.waitForTimeout(900);
      await page.locator("button.scp1:visible").first().click();
    } else {
      const when = page.locator("#book [data-bx=when]");
      await when.scrollIntoViewIfNeeded();
      await when.locator('button[aria-haspopup="dialog"]').first().click();
    }
    await page.waitForTimeout(900);
    await navReport(page, tag);
    return page.locator("[data-wp-cal]").first();
  },
};

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const before = await serve(root, { patches: new Set(["reach"]) });
const after = await serve(root, { patches: new Set(["reach", "phones", "time"]) });
const lawsAfter = await serve(root, { patches: new Set(["reach", "laws"]) });
const after3 = await serve(root, { patches: new Set(["reach", "phones", "time", "toast"]) });
const browser = await chromium.launch();

for (const [name, shot] of Object.entries(SHOTS)) {
  if (only && !only.has(name)) continue;
  for (const side of shot.sides) {
    if (process.env.SIDES && !process.env.SIDES.split(",").includes(side)) continue;
    const srv = side === "before" ? before : shot.laws ? lawsAfter : shot.after3 ? after3 : after;
    for (const lang of ["en", "ar"]) {
      for (const w of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: shot.scale || 1 });
        const page = await ctx.newPage();
        page.__base = srv.base;
        page.setDefaultTimeout(8000);
        await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
        await page.route("**/api/**", apiHandler({ signedIn: !!shot.signedIn, timeChange: shot.timeChange, guest: name.endsWith("-lookup") ? false : undefined }));
        const file = `${out}/${name}-${side}-${lang}-${w}.png`;
        try {
          const got = await shot.run(page, w, `${name} ${side} ${lang} ${w}`);
          if (got.clip) await page.screenshot({ path: file, clip: got.clip });
          else {
            await got.scrollIntoViewIfNeeded();
            await page.waitForTimeout(250);
            await got.screenshot({ path: file });
          }
          console.log("ok", name, side, lang, w);
        } catch (e) {
          console.log("FAIL", name, side, lang, w, String(e).split("\n")[0]);
          await page.screenshot({ path: `${out}/_fail-${name}-${side}-${lang}-${w}.png`, fullPage: true }).catch(() => {});
        }
        await ctx.close();
      }
    }
  }
}
// One notes file per run, so a partial run never overwrites the report of the full one.
writeFileSync(`${out}/_notes${only ? "-" + [...only].join("+") : ""}${process.env.SIDES ? "-" + process.env.SIDES : ""}.json`, JSON.stringify(NOTES, null, 2));
await browser.close();
before.server.close();
after.server.close();
lawsAfter.server.close();
after3.server.close();
