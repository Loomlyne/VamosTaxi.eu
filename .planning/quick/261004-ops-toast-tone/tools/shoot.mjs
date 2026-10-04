#!/usr/bin/env node
// shoot: the dashboard toast in its two tones, and the distance chip's icon, from the real shell, offline.
//
// Renders apps/web/public (after scripts/sync-dc-mock-to-public.mjs) the way the dashboard host does
// (serveOpsDc: ops.html with its base href, plus the vamosOpsAuth flag) in headless Chromium. Every /api/**
// request is answered from stubs.mjs. Nothing reaches a server. The static server listens on a free port
// chosen by the OS and is closed by this script (no process is killed by name or by pattern).
//
// Pictures (bare crops, no frame), English and Arabic, 1440 and 390 wide:
//   toast-error-<lang>-<w>.png    class change -> Business -> Continue -> Confirm; the price moved (409 price-changed)
//   toast-success-<lang>-<w>.png  the same flow; the change is applied (the customer got the confirmation again)
//   chip-<lang>-<w>.png           the duration and distance chips under the route (the distance chip has the route icon)
// German and French run the same flows at 1440 for the text check only (no picture).
//
// Checks per run (printed, exit 1 on any failure): the toast shows the page's own T-table sentence for that
// language; role is alert (error) / status (success); the toast's icon is triangle-alert / circle-check, its
// icon file answered 200; the icon colour reads on the charcoal toast (WCAG contrast printed, 3:1 needed for a
// graphic); charcoal background, no gradient; Arabic is right to left with the icon on the reading-start side;
// nothing scrolls sideways; no page error, no console error, no failed request; the route icon file answers 200
// and the chip's icon paints pixels (a control run with route.svg answering 404 must fail that check).
//
// Usage: node shoot.mjs <out dir> [--debug <dir for full-page steps>]
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { serve } from "../../261002-p6-followups/tools/mirror-serve.mjs";
import { answer, CHANGE_REF } from "./stubs.mjs";

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

// The page's own T tables, read as text: the label of each button and each sentence, per language.
const dc = readFileSync(dcFile, "utf8");
const LANGS = ["en", "de", "fr", "ar"];
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
// Which sentence each mode shows, per language, and what the toast must be.
const SENTENCE = {
  error: Object.fromEntries(LANGS.map((l) => [l, T[l].errClassPriceChanged])),
  success: Object.fromEntries(LANGS.map((l) => [l, T[l].classDoneApplied])),
};
for (const mode of ["error", "success"]) for (const l of LANGS) if (!SENTENCE[mode][l]) throw new Error(`no ${mode} sentence for ${l}`);
const EXPECT = {
  error: { tone: "danger", role: "alert", glyph: "triangle-alert" },
  success: { tone: "success", role: "status", glyph: "circle-check" },
};

const { server, base } = await serve(root, { ops: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let bad = 0;

function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) bad += 1;
}

async function open(lang, width, mode, { routeIcon404 = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  const answered = new Map(); // pathname -> status, for the icon files
  // A 4xx/5xx answer logs "Failed to load resource" in the console: judged from the response below.
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/assets/icons/")) answered.set(u.pathname, r.status());
    // The only answer >= 400 this run expects: the stubbed 409 of the class change (error mode), and the
    // control run's route.svg 404.
    const expected = (mode === "error" && r.status() === 409 && /\/change$/.test(u.pathname)) || (routeIcon404 && r.status() === 404 && u.pathname === "/assets/icons/route.svg");
    if (r.status() >= 400 && !expected) errors.push(`http ${r.status()}: ${u.pathname}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).split("\n")[0].slice(0, 160)}`));
  await page.addInitScript((l) => {
    localStorage.setItem("vamosLang", l);
    localStorage.setItem("vamosOpsAuth", "1");
  }, lang);
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const a = answer(req.method(), new URL(req.url()).pathname, mode);
    return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) });
  });
  if (routeIcon404) await page.route("**/assets/icons/route.svg", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(`${base}/bookings/${CHANGE_REF}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
  return { ctx, page, errors, answered };
}

async function common(tag, lang, page, errors) {
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${tag}: nothing scrolls sideways`, sideways <= 0, `overflow ${sideways}px`);
  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") || "ltr");
  check(`${tag}: direction`, lang === "ar" ? dir === "rtl" : dir !== "rtl", dir);
  check(`${tag}: no page error, console error or failed request`, errors.length === 0, errors.join(" / "));
}

/** sRGB [r,g,b] of any CSS colour (oklch included), via a canvas pixel. */
const RGB_OF = `(css) => { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillStyle = css; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }`;
const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

async function toastShot(mode, lang, width) {
  const tag = `toast-${mode}-${lang}-${width}`;
  const want = EXPECT[mode];
  const { ctx, page, errors, answered } = await open(lang, width, mode);
  await page.getByRole("button", { name: T[lang][KEYS.actions], exact: true }).first().click();
  await page.getByText(T[lang][KEYS.edit], { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.locator("select").last().selectOption("business");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: T[lang][KEYS.cont], exact: true }).first().click();
  await page.waitForTimeout(600);
  if (debugDir) await page.screenshot({ path: `${debugDir}/${tag}-confirm.png` });
  await page.getByRole("button", { name: T[lang].classConfirm, exact: true }).last().click();
  const toastBox = page.locator(".vt-toast");
  await toastBox.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(250);
  check(`${tag}: one toast`, (await toastBox.count()) === 1);
  const info = await toastBox.evaluate((el, rgbOfSrc) => {
    const rgbOf = eval(rgbOfSrc);
    const icon = el.querySelector("span[aria-hidden]");
    const msg = el.querySelector(".vt-toast__msg");
    const cs = getComputedStyle(el);
    const ics = getComputedStyle(icon);
    const ib = icon.getBoundingClientRect();
    const mb = msg.getBoundingClientRect();
    return {
      role: el.getAttribute("role"),
      text: msg.textContent,
      mask: ics.maskImage || ics.webkitMaskImage,
      iconRgb: rgbOf(ics.backgroundColor),
      iconCss: ics.backgroundColor,
      bgRgb: rgbOf(cs.backgroundColor),
      bgImage: cs.backgroundImage,
      iconX: ib.x, iconW: ib.width, msgX: mb.x, msgW: mb.width,
      iconBeforeText: ib.x < mb.x,
    };
  }, RGB_OF);
  check(`${tag}: the toast shows the page's own sentence`, info.text === SENTENCE[mode][lang], info.text);
  check(`${tag}: role is ${want.role}`, info.role === want.role, String(info.role));
  check(`${tag}: icon is ${want.glyph}`, info.mask.includes(`/${want.glyph}.svg`), info.mask);
  check(`${tag}: icon file answered 200`, answered.get(`/assets/icons/${want.glyph}.svg`) === 200, String(answered.get(`/assets/icons/${want.glyph}.svg`)));
  check(`${tag}: charcoal toast, no gradient`, info.bgRgb.join(",") === "30,31,31" && info.bgImage === "none", `${info.bgRgb.join(",")} ${info.bgImage}`);
  const r = ratio(info.iconRgb, info.bgRgb);
  results.push(`INFO  ${tag}: icon ${info.iconCss} -> rgb(${info.iconRgb.join(",")}) on rgb(${info.bgRgb.join(",")}), contrast ${r.toFixed(2)}:1`);
  check(`${tag}: icon contrast on the charcoal toast is at least 3:1 (graphic)`, r >= 3, `${r.toFixed(2)}:1`);
  check(`${tag}: icon sits on the reading-start side`, lang === "ar" ? !info.iconBeforeText : info.iconBeforeText, `iconX ${info.iconX.toFixed(0)} msgX ${info.msgX.toFixed(0)}`);
  if (debugDir) await page.screenshot({ path: `${debugDir}/${tag}-full.png`, fullPage: true });
  // The toast closes by itself after 3.6 s: shoot it now. The toast's own box, nothing around it.
  if (SHOT_LANGS.has(lang)) await toastBox.screenshot({ path: `${out}/${tag}.png`, animations: "disabled" });
  await common(tag, lang, page, errors);
  await ctx.close();
}

/** Count of pixels in a PNG (base64) that differ from its top-left pixel: >0 means something was painted. */
const PAINTED = `async (b64) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 4; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 30) n++; return n; }`;

async function chipShot(lang, width, { control = false } = {}) {
  const tag = control ? `chip-control-404-${lang}-${width}` : `chip-${lang}-${width}`;
  const { ctx, page, errors, answered } = await open(lang, width, "success", { routeIcon404: control });
  const chips = page.locator("[data-ops-route-chip]");
  check(`${tag}: the duration chip and the distance chip are both shown`, (await chips.count()) === 2, `${await chips.count()} chips`);
  const icon = chips.nth(1).locator("span[aria-hidden]");
  const mask = await icon.evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
  check(`${tag}: the distance chip names the route icon`, mask.includes("/route.svg"), mask);
  check(`${tag}: route.svg ${control ? "answers 404 (control)" : "answered 200, no 404 in the network log"}`, answered.get("/assets/icons/route.svg") === (control ? 404 : 200), String(answered.get("/assets/icons/route.svg")));
  // The icon paints: a screenshot of its box has pixels that differ from the chip's own background.
  const png = (await icon.screenshot({ animations: "disabled" })).toString("base64");
  const painted = await page.evaluate(`(${PAINTED})("${png}")`);
  check(`${tag}: the icon ${control ? "paints nothing (control: the check can fail)" : "paints pixels"}`, control ? painted === 0 : painted > 20, `${painted} px`);
  const box = async (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; });
  const boxes = [await box(chips.nth(0)), await box(chips.nth(1))];
  const pad = 6;
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  if (!control && SHOT_LANGS.has(lang)) await page.screenshot({ path: `${out}/${tag}.png`, fullPage: true, clip: { x: Math.max(0, x0), y: Math.max(0, y0), width: x1 - Math.max(0, x0), height: y1 - Math.max(0, y0) } });
  await common(tag, lang, page, errors);
  await ctx.close();
}

for (const lang of LANGS) {
  for (const width of SHOT_LANGS.has(lang) ? [1440, 390] : [1440]) {
    await toastShot("error", lang, width);
    await toastShot("success", lang, width);
    if (SHOT_LANGS.has(lang)) await chipShot(lang, width);
  }
}
await chipShot("en", 1440, { control: true });
await browser.close();
server.close();
console.log(results.join("\n"));
console.log(bad ? `${bad} FAILED` : "all checks passed");
process.exit(bad ? 1 : 0);
