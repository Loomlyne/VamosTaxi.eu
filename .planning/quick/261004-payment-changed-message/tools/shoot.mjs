#!/usr/bin/env node
// shoot: the dashboard's payment-changed message, from the real shell, offline.
//
// Renders apps/web/public (after scripts/sync-dc-mock-to-public.mjs) the way the dashboard host does
// (serveOpsDc: ops.html with its base href, plus the vamosOpsAuth flag) in headless Chromium. Every
// /api/** request is answered from stubs.mjs; the two POSTs that matter (…/refund and …/change) answer
// 409 { ok:false, code:"payment-changed" } as the Worker now does. Nothing reaches a server.
//
// Two screens, English and Arabic, 1440 and 390 wide (German and French at 1440, text check only):
//   refund  booking cancelled more than 24 h ahead -> Confirm refund -> the refund error box
//   change  Actions -> Edit booking -> another class -> Continue -> Confirm -> the toast
// Each shot is a bare crop of the region that changed (no frame, no page chrome around it).
// Checks per run (printed, exit 1 on any failure): the shown text is the page's own errPaymentChanged
// string for that language, no page error and no console error, nothing scrolls sideways, Arabic is
// right to left. English also runs VamosLocale.coverage on the page (untranslated strings).
//
// Usage: node shoot.mjs <out dir> [--debug <dir for full-page steps>]
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { serve } from "../../261002-p6-followups/tools/mirror-serve.mjs";
import { answer, CHANGE_REF, REFUND_REF } from "./stubs.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const root = resolve(new URL("../../../../apps/web/public", import.meta.url).pathname);
const dcFile = new URL("../../../../app/ops/OpsDetail.dc.html", import.meta.url).pathname;

const args = process.argv.slice(2);
const out = resolve(args[0] ?? "screens");
const debugAt = args.indexOf("--debug");
const debugDir = debugAt === -1 ? null : resolve(args[debugAt + 1]);
mkdirSync(out, { recursive: true });
if (debugDir) mkdirSync(debugDir, { recursive: true });

// The page's own T tables, read as text: the label of each button in each language, and the sentence.
const dc = readFileSync(dcFile, "utf8");
const LANGS = ["en", "de", "fr", "ar"];
// Pictures in English and Arabic; German and French run the same flows for the text check only.
const SHOT_LANGS = new Set(["en", "ar"]);
function table(lang) {
  const start = dc.search(new RegExp(`\\n\\s{2}${lang}: \\{`));
  const next = ["en", "de", "fr", "ar"].map((l) => dc.search(new RegExp(`\\n\\s{2}${l}: \\{`))).filter((i) => i > start).sort((a, b) => a - b)[0];
  const body = dc.slice(start, next ?? dc.indexOf("class Component extends DCLogic", start));
  const map = {};
  for (const m of body.matchAll(/\b([A-Za-z0-9_]+):'((?:[^'\\]|\\.)*)'/g)) map[m[1]] = m[2].replace(/\\'/g, "'");
  return map;
}
const T = Object.fromEntries(LANGS.map((l) => [l, table(l)]));
const keyOf = (en) => Object.keys(T.en).find((k) => T.en[k] === en);
const KEYS = { actions: keyOf("Actions"), edit: keyOf("Edit booking"), cont: keyOf("Continue"), classConfirm: T.en.classConfirm ? "classConfirm" : null };
for (const [name, key] of Object.entries(KEYS)) if (!key) throw new Error(`no T key for ${name}`);
const SENTENCE = Object.fromEntries(LANGS.map((l) => [l, T[l].errPaymentChanged]));

const { server, base } = await serve(root, { ops: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let bad = 0;

function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) bad += 1;
}

/** The union of the boxes, padded, clamped to the page. */
async function unionClip(page, boxes, pad = 16) {
  const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const x1 = Math.min(size.w, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const y1 = Math.min(size.h, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

async function open(lang, width, ref) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  // A 4xx/5xx answer logs "Failed to load resource" in the console: those are judged from the response
  // itself below (the two stubbed 409s are the point of the run; any other one is an error).
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("response", (r) => {
    const u = new URL(r.url());
    const expected =
      (r.status() === 409 && /\/(refund|change)$/.test(u.pathname)) ||
      // Known and not this job's: the Lucide "route" icon (distance chip, OpsDetail.dc.html line 178) is not vendored in assets/icons.
      (r.status() === 404 && u.pathname === "/assets/icons/route.svg");
    if (r.status() >= 400 && !expected) errors.push(`http ${r.status()}: ${u.pathname}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).split("\n")[0].slice(0, 160)}`));
  await page.addInitScript((l) => {
    localStorage.setItem("vamosLang", l);
    localStorage.setItem("vamosOpsAuth", "1");
  }, lang);
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const a = answer(req.method(), new URL(req.url()).pathname);
    return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) });
  });
  await page.goto(`${base}/bookings/${ref}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
  return { ctx, page, errors };
}

async function common(tag, lang, width, page, errors) {
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${tag}: nothing scrolls sideways`, sideways <= 0, `overflow ${sideways}px`);
  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") || "ltr");
  check(`${tag}: direction`, lang === "ar" ? dir === "rtl" : dir !== "rtl", dir);
  check(`${tag}: no page or console error`, errors.length === 0, errors.join(" / "));
  if (lang === "en") {
    // The dashboard screens translate through their own T tables, not the shared dictionary, so
    // coverage lists every T-table sentence of the page. What matters: the new sentence is not the only
    // reason for a gap; it is in the table of every language (checked below by text) and the list is printed.
    const cov = await page.evaluate(() => (window.VamosLocale && window.VamosLocale.coverage ? window.VamosLocale.coverage(document.body, "de") : null));
    results.push(`INFO  ${tag}: VamosLocale.coverage(de) lists ${cov ? cov.count : "n/a"} strings${cov && cov.strings.includes(SENTENCE.en) ? ", the new sentence among them (as every T-table sentence)" : ""}`);
    if (cov && process.env.COVERAGE_LIST) results.push(JSON.stringify(cov.strings));
  }
}

async function refundShot(lang, width) {
  const tag = `refund-${lang}-${width}`;
  const { ctx, page, errors } = await open(lang, width, REFUND_REF);
  await page.locator("[data-ops-refund-row] button").first().click();
  const text = page.getByText(SENTENCE[lang], { exact: true });
  await text.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
  check(`${tag}: the refund error box shows the page's own sentence`, (await text.count()) === 1);
  const regions = page.locator("[data-ops-refund-region]");
  const boxes = [];
  // Page coordinates (the click may have scrolled the page): box in the viewport plus the scroll offset.
  for (let i = 0; i < (await regions.count()); i++) {
    boxes.push(await regions.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
    }));
  }
  if (debugDir) await page.screenshot({ path: `${debugDir}/${tag}-full.png`, fullPage: true });
  if (SHOT_LANGS.has(lang)) await page.screenshot({ path: `${out}/${tag}.png`, fullPage: true, clip: await unionClip(page, boxes.filter(Boolean)) });
  await common(tag, lang, width, page, errors);
  await ctx.close();
}

async function changeShot(lang, width) {
  const tag = `change-${lang}-${width}`;
  const { ctx, page, errors } = await open(lang, width, CHANGE_REF);
  await page.getByRole("button", { name: T[lang][KEYS.actions], exact: true }).first().click();
  await page.getByText(T[lang][KEYS.edit], { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.locator("select").last().selectOption("business");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: T[lang][KEYS.cont], exact: true }).first().click();
  await page.waitForTimeout(600);
  if (debugDir) await page.screenshot({ path: `${debugDir}/${tag}-confirm.png` });
  await page.getByRole("button", { name: T[lang][KEYS.classConfirm], exact: true }).last().click();
  const text = page.getByText(SENTENCE[lang], { exact: true });
  await text.waitFor({ state: "visible", timeout: 5000 });
  check(`${tag}: the change answer shows the page's own sentence`, (await text.count()) === 1);
  // The toast closes by itself after 3.6 s: shoot it now. The toast's own box (the nearest ancestor of the
  // sentence that has a background and rounded corners), nothing around it.
  const toast = await text.first().evaluateHandle((el) => {
    let n = el;
    while (n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && parseFloat(cs.borderTopLeftRadius) > 0) return n;
      n = n.parentElement;
    }
    return el;
  });
  if (debugDir) await page.screenshot({ path: `${debugDir}/${tag}-full.png`, fullPage: true });
  if (SHOT_LANGS.has(lang)) await toast.asElement().screenshot({ path: `${out}/${tag}.png`, animations: "disabled" });
  await common(tag, lang, width, page, errors);
  await ctx.close();
}

for (const lang of LANGS) {
  for (const width of SHOT_LANGS.has(lang) ? [1440, 390] : [1440]) {
    await refundShot(lang, width);
    await changeShot(lang, width);
  }
}
await browser.close();
server.close();
console.log(results.join("\n"));
console.log(bad ? `${bad} FAILED` : "all checks passed");
process.exit(bad ? 1 : 0);
