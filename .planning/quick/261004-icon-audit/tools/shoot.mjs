#!/usr/bin/env node
// shoot: the two icons added by this job, from the real dashboard shell, offline.
//   arrow-down  the Support board column sort button (newest first, the default)
//   tag         the Pricing -> Surcharges & extras -> Add surcharge form, the first field (Name)
// Renders apps/web/public (after scripts/sync-dc-mock-to-public.mjs) the way the dashboard host does
// (ops.html with its base href, plus the vamosOpsAuth flag) in headless Chromium. Every /api/** request is
// answered from stubs.mjs; nothing reaches a server. The static server listens on a free port chosen by the
// OS and is closed by this script (no process is killed by name or by pattern).
//
// Pictures (bare crops, no frame), English and Arabic, 1440 wide:
//   sort-<lang>-1440.png    the header of the New column: toggle, count, sort arrow
//   extras-<lang>-1440.png  the Name field of the add-surcharge form, tag icon at the reading start
//
// Checks per run (printed, exit 1 on any failure): the icon names its file; the file answered 200 and no
// /assets/icons/* request answered 4xx/5xx; the icon paints pixels; Arabic is right to left with the icon on the
// reading-start side; nothing scrolls sideways; no page error and no console error. A control run answers the
// new file with 404: it must paint nothing, so the "paints pixels" check can fail.
//
// Usage: node shoot.mjs <out dir>
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { serve } from "../../261002-p6-followups/tools/mirror-serve.mjs";
import { answer } from "./stubs.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const root = resolve(new URL("../../../../apps/web/public", import.meta.url).pathname);
const out = resolve(process.argv[2] ?? "screens");
mkdirSync(out, { recursive: true });

const WIDTH = 1440;
const { server, base } = await serve(root, { ops: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let bad = 0;
function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) bad += 1;
}

async function open(lang, path, { notFound = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  const icons = new Map(); // /assets/icons/<name>.svg -> status
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/assets/icons/")) icons.set(u.pathname, r.status());
    if (r.status() >= 400 && !(notFound && u.pathname === `/assets/icons/${notFound}.svg`)) errors.push(`http ${r.status()}: ${u.pathname}`);
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
  if (notFound) await page.route(`**/assets/icons/${notFound}.svg`, (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
  return { ctx, page, errors, icons };
}

/** Count of pixels in a PNG (base64) that differ from its top-left pixel: >0 means something was painted. */
const PAINTED = `async (b64) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 4; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 30) n++; return n; }`;

async function iconChecks(tag, page, icon, name, icons, { control = false } = {}) {
  const mask = await icon.evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
  check(`${tag}: the icon names ${name}.svg`, mask.includes(`/${name}.svg`), mask);
  const status = icons.get(`/assets/icons/${name}.svg`);
  check(`${tag}: ${name}.svg ${control ? "answers 404 (control)" : "answered 200"}`, status === (control ? 404 : 200), String(status));
  if (!control) {
    const bad4xx = [...icons].filter(([, s]) => s >= 400).map(([p, s]) => `${s} ${p}`);
    check(`${tag}: no 404 (or any 4xx/5xx) on /assets/icons/*`, bad4xx.length === 0, `${icons.size} icon files requested${bad4xx.length ? `; ${bad4xx.join(", ")}` : ""}`);
  }
  const png = (await icon.screenshot({ animations: "disabled" })).toString("base64");
  const painted = await page.evaluate(`(${PAINTED})("${png}")`);
  check(`${tag}: the icon ${control ? "paints nothing (control: the check can fail)" : "paints pixels"}`, control ? painted === 0 : painted > 20, `${painted} px`);
}

async function common(tag, lang, page, errors) {
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${tag}: nothing scrolls sideways`, sideways <= 0, `overflow ${sideways}px`);
  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") || "ltr");
  check(`${tag}: direction`, lang === "ar" ? dir === "rtl" : dir !== "rtl", dir);
  check(`${tag}: no page error, console error or failed request`, errors.length === 0, errors.join(" / "));
}

/** The bounding box of several elements, padded, in page coordinates. */
async function union(locs, pad = 8) {
  const boxes = [];
  for (const l of locs) boxes.push(await l.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; }));
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

async function sortShot(lang, { control = false } = {}) {
  const tag = control ? `sort-control-404-${lang}` : `sort-${lang}`;
  const { ctx, page, errors, icons } = await open(lang, "/support", { notFound: control ? "arrow-down" : null });
  const col = page.locator('[data-kb-col][data-status="new"]');
  await col.waitFor({ state: "visible", timeout: 8000 });
  const sort = col.locator("[data-kb-sort]");
  check(`${tag}: the New column shows 2 tickets (the stub)`, (await col.locator("[data-kb-card]").count()) === 2);
  await iconChecks(tag, page, sort.locator('span[style*="/arrow-down.svg"]'), "arrow-down", icons, { control });
  if (!control) {
    const iconBox = await sort.locator('span[style*="/arrow-down.svg"]').boundingBox();
    const countBox = await sort.locator("[data-kb-count]").boundingBox();
    check(`${tag}: the arrow sits after the count at the reading end`, lang === "ar" ? iconBox.x < countBox.x : iconBox.x > countBox.x, `icon x ${iconBox.x.toFixed(0)}, count x ${countBox.x.toFixed(0)}`);
    await page.screenshot({ path: `${out}/${tag}.png`, fullPage: true, clip: await union([col.locator("[data-kb-hd]")]) });
  }
  await common(tag, lang, page, errors);
  await ctx.close();
}

async function extrasShot(lang, { control = false } = {}) {
  const tag = control ? `extras-control-404-${lang}` : `extras-${lang}`;
  const { ctx, page, errors, icons } = await open(lang, "/pricing", { notFound: control ? "tag" : null });
  // The Surcharges tab (third pane), then the add button; the first field of the form is the Name field with the tag icon.
  await page.locator("[data-set-item]").nth(2).click();
  await page.waitForTimeout(800);
  await page.locator('[data-price-pane] button:has(span[style*="plus.svg"])').first().click();
  const dialog = page.locator('[aria-modal="true"]').first();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(600);
  const icon = dialog.locator('span[style*="/tag.svg"]');
  check(`${tag}: the form has exactly one tag icon (the Name field)`, (await icon.count()) === 1, `${await icon.count()}`);
  await iconChecks(tag, page, icon, "tag", icons, { control });
  if (!control) {
    const wrap = icon.locator("xpath=ancestor::*[contains(@class, 'vt-field')][1]");
    await page.screenshot({ path: `${out}/${tag}.png`, fullPage: true, clip: await union([wrap], 12) });
    const iconBox = await icon.boundingBox();
    const inputBox = await dialog.locator("input").first().boundingBox();
    check(`${tag}: the tag icon sits at the reading start of the Name field`, lang === "ar" ? iconBox.x > inputBox.x + inputBox.width / 2 : iconBox.x < inputBox.x + inputBox.width / 2, `icon x ${iconBox.x.toFixed(0)}, input x ${inputBox.x.toFixed(0)}..${(inputBox.x + inputBox.width).toFixed(0)}`);
  }
  await common(tag, lang, page, errors);
  await ctx.close();
}

/** sun and moon sit in a form this dashboard cannot open today (see HANDOVER): their files are drawn here instead. */
async function fileChecks(names) {
  const { ctx, page, errors, icons } = await open("en", "/support");
  for (const name of names) {
    const painted = await page.evaluate(async (n) => {
      const img = new Image();
      img.src = `/assets/icons/${n}.svg`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = 48;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data;
      let k = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) k++;
      return k;
    }, name);
    check(`file ${name}.svg: decodes and draws strokes at 48 px`, painted > 100, `${painted} px`);
  }
  check("file checks: no page error", errors.length === 0, errors.join(" / "));
  void icons;
  await ctx.close();
}

try {
  await fileChecks(["sun", "moon"]);
  for (const lang of ["en", "ar"]) {
    await sortShot(lang);
    await extrasShot(lang);
  }
  await sortShot("en", { control: true });
  await extrasShot("en", { control: true });
} catch (e) {
  check("the run itself", false, String(e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
console.log(results.join("\n"));
console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
