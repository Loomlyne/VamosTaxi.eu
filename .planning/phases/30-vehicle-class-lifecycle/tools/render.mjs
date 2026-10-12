// Offline render harness for the Phase 30 signing pictures (sheets 6-10).
//   node .planning/phases/30-vehicle-class-lifecycle/tools/render.mjs            all sheets
//   node .planning/phases/30-vehicle-class-lifecycle/tools/render.mjs --sheet 6  one sheet
// Syncs the DC mock into apps/web/public, serves it on a free local port, stubs every /api/* request, renders
// each frame (cropped PNG in ../screens), asserts on the DOM, then composes the bare sheet PNG. Exit 1 on any FAIL.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { serve } from "./serve.mjs";
import * as S from "./stubs.mjs";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const OUT = join(repo, ".planning/phases/30-vehicle-class-lifecycle/screens");
const require = createRequire(join(repo, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
mkdirSync(OUT, { recursive: true });

const argSheet = process.argv.includes("--sheet") ? process.argv[process.argv.indexOf("--sheet") + 1] : null;
let failed = 0;
const coverageOut = {};
const sizesOut = [];

execFileSync("node", ["scripts/sync-dc-mock-to-public.mjs"], { cwd: repo, stdio: ["ignore", "ignore", "inherit"] });
const { server, base } = await serve();
const browser = await chromium.launch();

const LANGNAME = { en: "English", ar: "العربية" };
const RETIRE = { en: "Retire", ar: "إيقاف" };
const BRING = { en: "Bring back", ar: "إعادة" };
const reason140 = S.REASON_140;
if (reason140.length !== 140) { console.log(`FAIL setup: reason is ${reason140.length} characters, not 140`); process.exit(1); }

/** Run one frame. spec: {sheet, file, w, lang, path, state, prep(page), target(page)->handle, checks(page,box)->[[label,bool]], css, coverage} */
async function frame(spec) {
  const { w, lang } = spec;
  const ctx = await browser.newContext({
    viewport: { width: w, height: w <= 480 ? 844 : 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", locale: lang === "ar" ? "ar" : "en",
  });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  const log = [];
  await S.installStubs(page, spec.state, log);
  const results = [];
  let ok = true;
  try {
    await page.goto(base + spec.path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    if (spec.css) await page.addStyleTag({ content: spec.css });
    await spec.prep(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const h = await spec.target(page);
    const box = await h.boundingBox();
    if (!box) throw new Error("target has no box");
    const vp = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: Math.max(document.documentElement.scrollHeight, innerHeight), dir: document.documentElement.dir, lang: document.documentElement.lang }));
    const m = 20;
    const abs = await h.evaluate((e, withPrev) => {
      let r = e.getBoundingClientRect();
      let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
      const p = withPrev && e.previousElementSibling;
      if (p) { const q = p.getBoundingClientRect(); x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
      return { x: x0 + scrollX, y: y0 + scrollY, w: x1 - x0, h: y1 - y0 };
    }, !!spec.withPrev);
    const clip = { x: Math.max(0, abs.x - m), y: Math.max(0, abs.y - m), width: Math.min(abs.w + 2 * m, vp.w - Math.max(0, abs.x - m)), height: abs.h + 2 * m };
    const checks = [];
    if (w <= 480) checks.push([`scrollWidth ${vp.w} <= 390`, vp.w <= 390]);
    if (lang === "ar") checks.push([`dir=${vp.dir} is rtl`, vp.dir === "rtl"]);
    for (const c of await spec.checks(page, h)) checks.push(c);
    checks.push(["no page error" + (errors.length ? ": " + errors[0] : ""), errors.length === 0]);
    for (const [label, pass] of checks) { results.push(`${pass ? "ok" : "NO"} ${label}`); if (!pass) ok = false; }
    await page.screenshot({ path: join(OUT, spec.file), fullPage: true, clip });
    if (spec.coverage) {
      // Coverage runs on the English page: switch language back would reload; use a second fresh page.
      coverageOut[spec.sheet] = coverageOut[spec.sheet] || {};
    }
    spec.handle = h;
    if (spec.after) await spec.after(page, h);
  } catch (e) {
    ok = false;
    results.push("NO exception: " + String(e.message).split("\n")[0].slice(0, 200));
  }
  const bytes = (() => { try { return statSync(join(OUT, spec.file)).size; } catch { return 0; } })();
  console.log(`${ok ? "PASS" : "FAIL"} sheet ${spec.sheet} ${spec.file} (${bytes} B)${ok ? "" : "  " + results.filter((r) => r.startsWith("NO")).join("; ")}`);
  if (!ok) failed++;
  sizesOut.push(spec.file);
  await ctx.close();
  return ok;
}

/** VamosLocale.coverage on the surface root, page in English, for de/fr/ar. */
async function coverage(sheet, spec) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
  const page = await ctx.newPage();
  await S.installStubs(page, spec.state, []);
  try {
    await page.goto(base + spec.path, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    await spec.prep(page);
    await page.waitForTimeout(600);
    const roots = spec.covTargets ? await spec.covTargets(page) : [await spec.target(page)];
    const out = {};
    for (const l of ["de", "fr", "ar"]) {
      out[l] = [];
      for (const h of roots) {
        const r = await h.evaluate((root, lg) => window.VamosLocale.coverage(root, lg), l);
        out[l].push(...(r.strings || []), ...(r.attrs || []));
      }
    }
    coverageOut[sheet] = out;
    console.log(`coverage sheet ${sheet}: ` + JSON.stringify(out));
  } catch (e) { console.log(`coverage sheet ${sheet}: ERROR ${String(e.message).split("\n")[0]}`); }
  await ctx.close();
}

/** Bare sheet: frames on a plain light ground, whitespace only, caption above each, one-line title. */
async function compose(file, title, frames) {
  const items = frames.map((f) => {
    const b64 = readFileSync(join(OUT, f.file)).toString("base64");
    const width = f.w <= 480 ? 280 : 640;
    return `<figure><div class="cap">${f.caption}</div><img src="data:image/png;base64,${b64}" style="width:${width}px"></figure>`;
  }).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}body{padding:40px 48px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1e1f1f}
h1{font-size:20px;font-weight:600;margin:0 0 36px}.wrap{display:flex;flex-wrap:wrap;gap:56px 64px;align-items:flex-start}figure{margin:0}.cap{font-size:14px;margin-bottom:12px;color:#555}img{display:block;border:0;outline:0;box-shadow:none}</style>
<h1>${title}</h1><div class="wrap">${items}</div>`;
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  await ctx.close();
  const size = statSync(join(OUT, file)).size;
  console.log(`sheet ${file}: ${size} B${size > 700 * 1024 ? "  (over 700 KB)" : ""}`);
  sizesOut.push(file);
}

// ---------- shared pieces ----------
const cap = (w, lang) => `${w} · ${LANGNAME[lang]}`;
const rtlDir = (lang) => (lang === "ar" ? "rtl" : "ltr");
const openClassesPane = async (page) => {
  await page.locator("[data-set-item]").nth(1).click();
  await page.waitForSelector("[data-class-cell], [data-retired]", { timeout: 8000 });
};
/** Click the Retire button in the row of a class (by its name), language-independent. */
const clickRetire = async (page, name, lang) => {
  const ok = await page.evaluate(([n, label]) => {
    const cell = [...document.querySelectorAll("[data-class-name]")].find((e) => e.textContent.trim() === n);
    let e = cell;
    while (e && !e.querySelector(`button[title="${label}"]`)) e = e.parentElement;
    const btn = e && e.querySelector(`button[title="${label}"]`);
    if (!btn) return false;
    btn.setAttribute("data-p30-hit", "1");
    return true;
  }, [name, RETIRE[lang]]);
  if (!ok) throw new Error(`no Retire button on row ${name}`);
  await page.locator("[data-p30-hit]").click();
  await page.waitForSelector("[data-retiring]", { timeout: 5000 });
};
const dialogOf = (page) => page.locator("[role=dialog]").filter({ has: page.locator("[data-retiring]") }).first().elementHandle();
const T = (en, ar, lang) => (lang === "ar" ? ar : en);

// ---------- sheet 6 ----------
// The close button's own box drawn as a faint dashed outline (it is the tap area; the log prints its real size).
// For sheet 6 only: the close X's invisible 44px tap area (OpsPricing ::before, inset -6px) drawn as a faint dashed outline.
const TAP = `[role=dialog] .vt-dialog__head .vt-iconbtn::before{outline:1px dashed rgba(30,31,31,.45)}`;
const ch6a = () => S.chauffeurRows([["Samir Haddad", "van"], ["Marc Keller", "van"], ["Luca Meier", "lux"]]);
const st6a = () => ({ status: { sedan: "retired", van: "live", lux: "draft" }, reasons: {}, chauffeurs: ch6a(), bookings: [], quoteClasses: [] });
const st6b = () => ({ status: { sedan: "retired", van: "live", lux: "live" }, reasons: {}, chauffeurs: S.chauffeurRows([["Samir Haddad", "van"], ["Marc Keller", "lux"], ["Luca Meier", "lux"]]), bookings: [], quoteClasses: [] });
function s6(w, lang, one) {
  const suffix = one ? "-one" : "";
  return {
    sheet: 6, w, lang, path: "/pricing", state: one ? st6b() : st6a(), css: TAP,
    file: `6-retire-dialog-${w}-${lang}${suffix}.png`, caption: cap(w, lang) + (one ? " · one chauffeur, another class live" : " · last live class"),
    prep: async (page) => { await openClassesPane(page); await clickRetire(page, "Economy Van", lang); },
    target: dialogOf,
    checks: async (page, h) => {
      const count = await page.locator("[data-retire-count]").first().innerText().catch(() => "");
      const last = await page.locator("[data-retire-lastlive]").count();
      const lastTxt = last ? await page.locator("[data-retire-lastlive]").first().innerText() : "";
      const x = await page.evaluate(() => { const b = document.querySelector('[role=dialog] button[aria-label="Close"],[role=dialog] .vt-iconbtn--plain'); const r = b && b.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null; });
      console.log(`  info close button box ${x ? x.join("x") : "none"}`);
      const tap = await page.evaluate(() => { const b = document.querySelector('[role=dialog] .vt-dialog__head .vt-iconbtn'); if (!b) return null; const c = getComputedStyle(b, '::before'); return [c.width, c.height, c.position]; });
      console.log(`  info close tap area ${tap ? tap.join(" ") : "none"}`);
      if (lang === "ar") return [["count line present", count.length > 0], ["last-live line " + (one ? "absent" : "present"), one ? last === 0 : last === 1]];
      return one
        ? [[`count line "1 chauffeur is on this class" (got ${JSON.stringify(count.replace(/\s+/g, " "))})`, /^1\s+chauffeur is on this class$/.test(count.replace(/\s+/g, " ").trim())], ["no last-live warning", last === 0]]
        : [[`count line "2 chauffeurs are on this class" (got ${JSON.stringify(count.replace(/\s+/g, " "))})`, /^2\s+chauffeurs are on this class$/.test(count.replace(/\s+/g, " ").trim())],
           [`last-live line (got ${JSON.stringify(lastTxt)})`, lastTxt.trim() === "This is your last live class. Customers cannot book until another class is live."]];
    },
  };
}

// ---------- sheet 7 ----------
const BK = "/bookings/" + S.BOOKING_REF;
const st7 = async (names) => ({ status: { sedan: "live", van: "retired", lux: "live" }, reasons: {}, chauffeurs: S.chauffeurRows(names), bookings: await S.bookingRows(), quoteClasses: [] });
const assignBlock = async (page) => {
  await page.waitForSelector("[data-ops-assign]", { timeout: 8000 });
  await page.waitForTimeout(600);
  return page.locator("[data-ops-assign]").first().elementHandle();
};
function s7(w, lang, one, state) {
  return {
    sheet: 7, w, lang, path: BK, withPrev: true, state, file: `7-assign-left-out-${w}-${lang}${one ? "-one" : ""}.png`,
    caption: cap(w, lang) + (one ? " · one chauffeur left out" : ""),
    prep: async (page) => { await page.waitForSelector("[data-ops-assign]", { timeout: 8000 }); },
    target: assignBlock,
    // coverage on the new element only: ops screens translate their own copy through page T tables, not the dictionary
    covTargets: async (page) => [await page.locator("[data-ops-assign-leftout]").first().elementHandle()],
    checks: async (page) => {
      const left = await page.locator("[data-ops-assign-leftout]").count();
      const leftTxt = left ? (await page.locator("[data-ops-assign-leftout]").first().innerText()).replace(/\s+/g, " ").trim() : "";
      const noClass = await page.evaluate(() => /No chauffeur has the class/i.test(document.body.innerText));
      const opts = await page.evaluate(() => { const s = document.querySelector("[data-ops-assign] select"); return s ? s.options.length : -1; });
      const out = [["left-out line present", left === 1], ['no "No chauffeur has the class" sentence', !noClass], [`picker empty (options ${opts})`, opts <= 1]];
      if (lang === "en") out.push([`line reads "${one ? "1 chauffeur left out: retired class" : "2 chauffeurs left out: retired class"}" (got ${JSON.stringify(leftTxt)})`, leftTxt === (one ? "1 chauffeur left out: retired class" : "2 chauffeurs left out: retired class")]);
      return out;
    },
  };
}

// ---------- sheet 8 ----------
const quoteClasses = [
  { slug: "saden", name: "Economy Sedan", effective_max_pax: 3, max_bags: 3, photo_url: "/photos/site/economy-sedan.jpg" },
  { slug: "van-luxury", name: "Luxury Van", effective_max_pax: 6, max_bags: 6, photo_url: "/photos/site/luxury-van.jpg" },
];
function s8(w, lang) {
  return {
    sheet: 8, w, lang, path: "/app/pages/about.html", state: { status: { sedan: "live", van: "retired", lux: "live" }, chauffeurs: [], bookings: [], quoteClasses }, file: `8-about-classes-${w}-${lang}.png`, caption: cap(w, lang),
    prep: async (page) => { await page.waitForSelector("[data-vc-title]", { timeout: 8000 }); await page.waitForTimeout(800); await page.locator("[data-vc-title]").scrollIntoViewIfNeeded(); },
    target: (page) => page.locator("[data-vc-title]").first().evaluateHandle((e) => e.closest("section") || e.parentElement.parentElement),
    checks: async (page, h) => {
      const t = await h.evaluate((e) => e.innerText);
      const title = await page.locator("[data-vc-title]").first().innerText();
      const kick = await page.locator("[data-vc-kicker]").first().innerText();
      const out = [["Economy Sedan card", /Economy Sedan/.test(t)], ["Luxury Van card", /Luxury Van/.test(t)], ["no Economy Van card", !/Economy Van/.test(t)]];
      if (lang === "en") out.push([`kicker "Our classes" (got ${JSON.stringify(kick.trim())})`, kick.trim().toLowerCase() === "our classes"], [`title "Pick the class that fits." (got ${JSON.stringify(title.trim())})`, title.trim() === "Pick the class that fits."]);
      return out;
    },
  };
}

// ---------- sheet 9 ----------
const st9 = () => ({ status: { sedan: "retired", van: "retired", lux: "retired" }, reasons: { sedan: "No longer offered", lux: reason140 }, chauffeurs: [], bookings: [], quoteClasses: [] });
function s9(lang) {
  return {
    sheet: 9, w: 390, lang, path: "/pricing", state: st9(), file: `9-retired-row-390-${lang}.png`, caption: cap(390, lang),
    prep: async (page) => { await openClassesPane(page); await page.waitForSelector("[data-retired-head]", { timeout: 8000 }); await page.locator("[data-retired-head]").click(); await page.waitForSelector("[data-retired-row]", { timeout: 5000 }); },
    target: (page) => page.locator("[data-retired]").first().elementHandle(),
    checks: async (page) => {
      const info = await page.evaluate((reason) => {
        const rows = [...document.querySelectorAll("[data-retired-row]")];
        return rows.map((r) => {
          const name = r.querySelector("[data-retired-name]"), rs = r.querySelector("[data-retired-reason]"), btn = r.querySelector("button");
          const nb = name && name.getBoundingClientRect(), rb = rs && rs.getBoundingClientRect(), bb = btn && btn.getBoundingClientRect();
          return { name: name && name.textContent.trim(), reason: rs ? rs.textContent.trim() : "", btnH: bb ? Math.round(bb.height) : 0, under: !!(nb && rb && rs.textContent.trim() ? rb.top >= nb.bottom - 1 : true), full: rs && rs.textContent.trim() === reason };
        });
      }, reason140);
      const find = (n) => info.find((i) => i.name === n) || {};
      return [
        ["3 retired rows", info.length === 3],
        ["BRING BACK buttons >= 44px high (" + info.map((i) => i.btnH).join(",") + ")", info.length === 3 && info.every((i) => i.btnH >= 44)],
        ["reason sits under the name (all rows)", info.every((i) => i.under)],
        ["Economy Sedan reason 'No longer offered'", find("Economy Sedan").reason === "No longer offered"],
        ["Economy Van has no reason", find("Economy Van").reason === ""],
        ["Luxury Van reason is the full 140 characters", !!find("Luxury Van").full],
      ];
    },
  };
}

// ---------- sheet 10 ----------
const st10 = () => ({ status: { sedan: "live", van: "retired", lux: "live" }, reasons: {}, chauffeurs: S.chauffeurRows([["Marc Keller", "sedan", "shift"], ["Samir Haddad", "van", "off"], ["Luca Meier", "lux", "shift"]]), bookings: [], quoteClasses: [] });
function s10(w, lang) {
  return {
    sheet: 10, w, lang, path: "/chauffeurs", state: st10(), file: `10-with-a-class-${w}-${lang}.png`, caption: cap(w, lang),
    prep: async (page) => { await page.waitForFunction(() => /Samir Haddad/.test(document.body.innerText) && document.querySelector("[data-fleet-count],[data-cnt]") !== undefined, null, { timeout: 8000 }); await page.waitForTimeout(800); },
    target: (page) => page.locator(".sc-host").first().elementHandle(),
    // coverage on the red flag only: the WITH A CLASS card changes only its number (its label and foot are unchanged
    // page T-table strings), and the rest of the screen translates through page T tables, not the dictionary
    covTargets: async (page) => [await page.getByText("Retired class: pick a new one").first().evaluateHandle((e) => e.parentElement)],
    checks: async (page, h) => {
      const t = await h.evaluate((e) => e.innerText.replace(/\s+/g, " "));
      const out = [["Marc Keller, Samir Haddad, Luca Meier listed", /Marc Keller/.test(t) && /Samir Haddad/.test(t) && /Luca Meier/.test(t)]];
      if (lang === "en") {
        out.push(["WITH A CLASS reads 2 / 3", /WITH A CLASS\s*2\s*\/ 3/i.test(t)], ["ON SHIFT reads 2 / 3", /ON SHIFT\s*2\s*\/ 3/i.test(t)], ["red flag 'Retired class: pick a new one'", /Retired class: pick a new one/.test(t)]);
      } else out.push(["Arabic page shows digits 2 and 3", /2/.test(t) && /3/.test(t)]);
      return out;
    },
  };
}

// ---------- run ----------
const sheets = {
  6: { file: "sheet-6-retire-dialog.png", title: "Sheet 6 · Retire dialog: chauffeur count and last-live warning", build: () => [s6(1440, "en"), s6(1440, "ar"), s6(390, "en"), s6(390, "ar"), s6(1440, "en", true)] },
  7: { file: "sheet-7-assign-left-out.png", title: "Sheet 7 · Assign: chauffeurs left out because the class is retired", build: async () => {
    const two = [["Samir Haddad", "van"], ["Marc Keller", "van"], ["Luca Meier", "lux"]];
    const oneL = [["Samir Haddad", "van"], ["Marc Keller", "sedan"], ["Luca Meier", "lux"]];
    return [s7(1440, "en", false, await st7(two)), s7(1440, "ar", false, await st7(two)), s7(390, "en", false, await st7(two)), s7(390, "ar", false, await st7(two)), s7(1440, "en", true, await st7(oneL))];
  } },
  8: { file: "sheet-8-about-classes.png", title: "Sheet 8 · About: Our classes", build: () => [s8(1440, "en"), s8(1440, "ar"), s8(390, "en"), s8(390, "ar")] },
  9: { file: "sheet-9-retired-row-390.png", title: "Sheet 9 · Retired classes list at 390", build: () => [s9("en"), s9("ar")] },
  10: { file: "sheet-10-with-a-class.png", title: "Sheet 10 · Chauffeurs: WITH A CLASS counts live classes only", build: () => [s10(1440, "en"), s10(1440, "ar"), s10(390, "en"), s10(390, "ar")] },
};

try {
  for (const n of Object.keys(sheets)) {
    if (argSheet && argSheet !== n) continue;
    const sh = sheets[n];
    const specs = await sh.build();
    const okFrames = [];
    for (const s of specs) { if (await frame(s)) okFrames.push(s); }
    await coverage(n, specs[0]);
    if (okFrames.length === specs.length) await compose(sh.file, sh.title, specs.map((s) => ({ file: s.file, w: s.w, caption: s.caption })));
    else console.log(`sheet ${sh.file}: not composed (a frame failed)`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `RESULT: ${failed} frame(s) FAILED` : "RESULT: all frames PASS");
process.exit(failed ? 1 : 0);
