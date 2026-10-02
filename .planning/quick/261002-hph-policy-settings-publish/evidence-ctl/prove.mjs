import { createRequire } from "node:module";
const require_ = createRequire(process.cwd() + "/apps/web/package.json");
const { chromium } = require_("@playwright/test");
import { serve } from "./serve.mjs";
import { writeFileSync } from "node:fs";

const OUT = process.cwd() + "/.planning/quick/261002-hph-policy-settings-publish/evidence-ctl";
const BOUNDS = { minAdvance: [10080, "settings-error-min-advance"], cancelWindow: [720, "settings-error-free-cancel"], airportWait: [1440, "settings-error-airport-wait"], cityWait: [1440, "settings-error-city-wait"] };
const res = [];
const rec = (k, v) => { res.push([k, v]); console.log(k, "=", typeof v === "string" ? v : JSON.stringify(v)); };

function fresh(lang="en") {
  const s = { company: "Vamos Taxi", address: "", uid: "", phone: "", email: "", defaultLang: lang, defaultCur: "CHF",
    cash: false, card: true, twint: true, invoice: false, emailConfirm: true, emailReminder: true, smsReminder: false, opsAlerts: true,
    chauffeurTurnaround: 30, vatRateBps: 0, minAdvance: 180, cancelWindow: 24, airportWait: 60, cityWait: 15,
    liveMinAdvance: 180, liveCancelWindow: 24, liveAirportWait: 60, liveCityWait: 15,
    policyChanges: [], policyDirty: false, policySlug: "fare-publish-18", policyLabel: "Staging matrix", policyEffectiveFrom: "2026-09-26T23:43:05Z" };
  return s;
}
function recompute(state) {
  const pairs = [["min_advance_minutes","minAdvance","liveMinAdvance"],["free_cancel_hours","cancelWindow","liveCancelWindow"],["airport_waiting_minutes","airportWait","liveAirportWait"],["city_waiting_minutes","cityWait","liveCityWait"]];
  state.policyChanges = pairs.flatMap(([f,d,l]) => String(state[d]) === String(state[l]) ? [] : [{ field: f, from: state[l], to: state[d] }]);
  state.policyDirty = state.policyChanges.length > 0;
}
function mkApi(state, log) {
  return async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    const json = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
    if (path.endsWith("/api/staff/settings") && req.method() === "GET") { recompute(state); return json(state); }
    if (path.endsWith("/api/staff/settings") && req.method() === "PATCH") {
      const body = JSON.parse(req.postData() || "{}");
      log.push(body);
      // mirrors parsePolicyDraftBody (Number() per field, in order) then assertPolicyDraftInput (bounds)
      const parsed = {}; 
      for (const k of Object.keys(BOUNDS)) {
        const sent = body[k];
        if (sent === undefined) { parsed[k] = state[k]; continue; }
        if (sent === null || sent === "") { parsed[k] = null; continue; }
        if (typeof sent === "number") { parsed[k] = sent; continue; }
        const n = String(sent).trim() === "" ? null : Number(String(sent).trim());
        if (n !== null && !Number.isFinite(n)) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, code: "settings-error-policy-number" }) });
        parsed[k] = n;
      }
      for (const k of Object.keys(BOUNDS)) {
        const v = parsed[k];
        if (v !== null && (!Number.isInteger(v) || v < 0 || v > BOUNDS[k][0])) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, code: BOUNDS[k][1] }) });
      }
      Object.assign(state, parsed); recompute(state); return json(state);
    }
    if (path.endsWith("/policy-publish")) return json({ published: true });
    if (path.endsWith("/api/staff/profile")) return json({ email: "owner@vamostaxi.site", role: "admin" });
    if (path.includes("/api/auth")) return json({ email: "owner@vamostaxi.site", role: "admin", passkeys: [] });
    return json({});
  };
}

const { server, base } = await serve("apps/web/public", { ops: true });
console.log("SERVER_PORT", server.address().port, "PID", process.pid);
const browser = await chromium.launch();

async function open(lang, width) {
  const state = fresh(lang); const log = [];
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await ctx.newPage();
  await page.addInitScript((l) => { localStorage.setItem("vamosOpsAuth", "1"); localStorage.setItem("vamosLang", l); }, lang);
  await page.route("**/api/**", mkApi(state, log));
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(`${base}/settings`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(900);
  await page.locator("button").filter({ hasText: /Booking policy|Buchungsregeln|Réservation|قواعد الحجز/ }).first().click();
  await page.waitForTimeout(500);
  return { ctx, page, state, log };
}
const saveBtn = (page) => page.locator('button:has-text("SAVE"), button:has-text("Save"), button:has-text("حفظ")').first();
const section = (page) => page.locator("section").filter({ has: page.locator("input") }).first();
const shot = async (page, name, full = true) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log("SHOT", name); };
const sec = async (page, name) => { await section(page).screenshot({ path: `${OUT}/${name}.png` }); console.log("SHOT", name); };

try {
  // ---- Point 1
  for (const lang of ["en", "ar"]) for (const w of [1440, 390]) {
    const { ctx, page } = await open(lang, w);
    const info = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll("section input")];
      const b = boxes[0];
      // climb to the field wrapper to read its text (suffix + hint)
      let wrap = b.parentElement; for (let i = 0; i < 4 && wrap.parentElement && wrap.innerText.trim().length < 12; i++) wrap = wrap.parentElement;
      const d = document.documentElement;
      return { n: boxes.length, ph: boxes.map((x) => x.placeholder), wrapText: wrap.innerText.replace(/\n/g, " | "), scrollW: d.scrollWidth, clientW: d.clientWidth, bodyScrollW: document.body.scrollWidth };
    });
    rec(`p1 ${lang} ${w}`, info);
    await sec(page, `p1-policy-card-${lang}-${w}`);
    await shot(page, `p1-policy-page-${lang}-${w}`);
    await ctx.close();
  }

  // ---- Points 2 & 3 & 4 & 5
  for (const lang of ["en", "ar"]) {
    const { ctx, page, state, log } = await open(lang, 1440);
    const boxes = page.locator("section input");
    // point 2
    await boxes.nth(0).fill("30.5"); await page.waitForTimeout(200);
    await saveBtn(page).click(); await page.waitForTimeout(700);
    const t2 = await section(page).innerText();
    rec(`p2 ${lang} body sent`, log.slice(-1));
    rec(`p2 ${lang} error line`, t2.split("\n").filter((l) => /0|٠/.test(l) && /(Check|تحقّق)/.test(l)));
    await sec(page, `p2-error-30.5-${lang}`);
    await boxes.nth(0).fill("31"); await page.waitForTimeout(400);
    const t2b = await section(page).innerText();
    rec(`p2 ${lang} error after edit`, t2b.split("\n").filter((l) => /(Check|تحقّق)/.test(l)));
    await sec(page, `p2-error-cleared-${lang}`);
    // point 3
    await boxes.nth(0).fill("180"); await boxes.nth(2).fill("45 min"); await page.waitForTimeout(200);
    await saveBtn(page).click(); await page.waitForTimeout(700);
    const t3 = await section(page).innerText();
    rec(`p3 ${lang} error line`, t3.split("\n").filter((l) => /(Check|تحقّق)/.test(l)));
    const pos = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll("section input")];
      const re = /(Check the value|تحقّق من القيمة)/; const err = [...document.querySelectorAll("section *")].filter((e) => re.test(e.textContent || "") && ![...e.children].some((c) => re.test(c.textContent || "")));
      return err.map((e) => ({ text: e.textContent.trim(), y: Math.round(e.getBoundingClientRect().top), boxTops: boxes.map((b) => Math.round(b.getBoundingClientRect().top)), role: e.getAttribute("role") }));
    });
    rec(`p3 ${lang} error position`, pos);
    await sec(page, `p3-error-45min-${lang}`);
    await boxes.nth(2).fill("60"); await page.waitForTimeout(300);

    // point 4: draft differs from live
    await boxes.nth(3).fill("30"); await page.waitForTimeout(200);
    await saveBtn(page).click(); await page.waitForTimeout(700);
    await page.locator('[data-publish-row="1"] button').first().click(); await page.waitForTimeout(400);
    const p4 = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-pol-chg="1"]')];
      const rowInfo = rows.map((r) => {
        const arrow = r.querySelector('[data-pol-chg-arrow="1"]');
        const inner = arrow ? [arrow, ...arrow.querySelectorAll("*")] : [];
        const tf = inner.map((e) => getComputedStyle(e).transform).filter((x) => x && x !== "none");
        const icon = arrow && arrow.querySelector("span,i,svg");
        const cs = icon ? getComputedStyle(icon) : null;
        return { text: r.innerText.replace(/\n/g, " "), arrowTransforms: tf, arrowHTML: arrow ? arrow.innerHTML.slice(0, 260) : null,
          maskImage: cs ? (cs.maskImage || cs.webkitMaskImage || "").slice(0, 80) : null,
          oldDir: getComputedStyle(r.querySelector('[data-pol-chg-old="1"]')).direction, newDir: getComputedStyle(r.querySelector('[data-pol-chg-new="1"]')).direction,
          oldUb: getComputedStyle(r.querySelector('[data-pol-chg-old="1"]')).unicodeBidi, rowDir: getComputedStyle(r).direction };
      });
      const confirm = document.querySelector('[data-publish-confirm="1"]');
      const btns = [...confirm.querySelectorAll("button")].map((b) => { const c = getComputedStyle(b); return { text: b.innerText, bg: c.backgroundColor, border: c.border, radius: c.borderRadius, font: c.fontFamily.slice(0, 30), h: Math.round(b.getBoundingClientRect().height) }; });
      const body = document.body.innerText;
      return { rows: rowInfo, confirmVisible: getComputedStyle(confirm).display, btns, hintCount: (body.match(/Publishing makes|Veröffentlichen|ينشر|النشر يجعل/g) || []).length, pageDir: document.documentElement.dir };
    });
    rec(`p4 ${lang}`, p4);
    const hintText = await page.evaluate(() => document.querySelector('[data-publish-row="1"] p').innerText);
    const occ = await page.evaluate((h) => document.body.innerText.split(h).length - 1, hintText);
    rec(`p4 ${lang} hint "${hintText}" occurrences`, occ);
    await sec(page, `p4-publish-confirm-${lang}`);
    await shot(page, `p4-publish-confirm-page-${lang}`);
    // point 5
    const cov = await page.evaluate(() => (window.VamosLocale && window.VamosLocale.coverage ? window.VamosLocale.coverage(document.body) : "NO_COVERAGE_FN"));
    rec(`p5 ${lang} coverage`, cov);
    if (lang === "ar") {
      // visible latin words
      const latin = await page.evaluate(() => {
        const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) { const n = w.currentNode; const s = n.textContent.trim(); if (!s || !/[A-Za-z]{2,}/.test(s)) continue; const p = n.parentElement; if (!p || ["SCRIPT","STYLE"].includes(p.tagName)) continue; const r = p.getBoundingClientRect(); if (r.width === 0 || r.height === 0 || getComputedStyle(p).visibility === "hidden") continue; out.push(s.slice(0, 70)); }
        return out;
      });
      rec("p5 ar visible latin strings (policy pane open)", latin);
    }
    await ctx.close();
  }
} catch (e) { console.log("THREW", e.message); }
finally { await browser.close(); server.close(); writeFileSync(`${OUT}/results.json`, JSON.stringify(res, null, 1)); console.log("DONE"); process.exit(0); }
