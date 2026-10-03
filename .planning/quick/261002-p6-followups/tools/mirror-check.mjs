#!/usr/bin/env node
// mirror-check: does every direction-bearing icon mirror exactly once in Arabic, and not at all in English?
//
// The law (design-system/tokens/laws.css, 03) mirrors an icon that points along the reading line when its
// inline style names one of: arrow-right, chevron-right, chevron-left, log-in, log-out. This script loads
// pages in Chromium, finds every rendered element whose inline `style` contains one of those file names,
// and multiplies the x-scale (sign of `a` in the computed `transform` matrix, plus the `scale` property)
// of the element and ALL its ancestors. Expected product:
//   Arabic  : -1  (mirrored exactly once; +1 = not mirrored, which is a bug; a second flip would be +1 too)
//   English : +1
//   inside .vt-dir-keep or [dir="ltr"] (a descendant of one): +1 in every language.
// Hover-motion wrappers are read at rest (transitions are switched off, nothing is hovered).
//
// Usage
//   node mirror-check.mjs --root <synced public tree>  [options]    static server (DC pages, ops host)
//   node mirror-check.mjs --base http://127.0.0.1:PORT [options]    an already running local Worker
//     --ops-base URL      the dashboard host when it differs from --base (default: same as --base)
//     --lang ar,en        languages (default ar,en)
//     --width 1440,390    viewport widths (default 1440,390)
//     --spots FILE        spot list (default ./mirror-spots.mjs; export default [ {name, path, setup?, ...} ])
//     --only a,b          run only these spots
//     --path /x           ad-hoc spot with no actions (repeatable); with --root/--base
//     --reduced-motion    emulate prefers-reduced-motion: reduce
//     --stub | --no-stub  stub /api/** (default: stub with --root, real server with --base)
//     --all               print every icon line (default: identical lines are collapsed with xN)
//     --json FILE         also write the raw rows as JSON
//     --dev-gallery       also run the spots that exist only on a dev server started with VAMOS_DEV_GALLERY=1
//     --headed            show the browser (debugging)
// Output: one line per icon: ok|FAIL, language, width, spot, path, short CSS path, icon, product, [flipped by].
// Exit code 1 when any line FAILs or a spot finds fewer icons than its `min` (default 1).
//
// A spot: { name, path, host?: "ops", needs?: "worker"|"dev-gallery", widths?, langs?, min?, stub?: {signedIn, guest},
//           prefix?: boolean (default true: /ar/<path> for non-English), ready?: selector,
//           setup?: async (page, env) => void } where env = { lang, width, wait(ms) }.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "./mirror-serve.mjs";
import { apiHandler, HIDE } from "./mirror-stubs.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

export const ICONS = ["arrow-right", "chevron-right", "chevron-left", "log-in", "log-out"];

function parseArgs(argv) {
  const o = { lang: ["ar", "en"], width: [1440, 390], paths: [], stub: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--root") o.root = resolve(next());
    else if (a === "--base") o.base = next().replace(/\/$/, "");
    else if (a === "--ops-base") o.opsBase = next().replace(/\/$/, "");
    else if (a === "--lang") o.lang = next().split(",").filter(Boolean);
    else if (a === "--width") o.width = next().split(",").map(Number);
    else if (a === "--spots") o.spots = resolve(next());
    else if (a === "--only") o.only = new Set(next().split(","));
    else if (a === "--path") o.paths.push(next());
    else if (a === "--reduced-motion") o.reduced = true;
    else if (a === "--stub") o.stub = true;
    else if (a === "--no-stub") o.stub = false;
    else if (a === "--all") o.all = true;
    else if (a === "--json") o.json = resolve(next());
    else if (a === "--headed") o.headed = true;
    else if (a === "--dev-gallery") o.devGallery = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!o.root && !o.base) throw new Error("give --root <public tree> or --base <url>");
  if (o.root && o.base) throw new Error("give --root or --base, not both");
  if (o.stub === null) o.stub = !!o.root;
  return o;
}

/** Runs in the page: one row per rendered direction-bearing icon. */
function collect({ icons }) {
  const sel = icons.map((n) => `[style*="/${n}.svg"]`).join(",");
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return `${s}#${el.id}`;
    const attr = [...el.attributes].find((a) => a.name.startsWith("data-") && !/^data-(om-|dc-|reactroot)/.test(a.name));
    if (attr) return `${s}[${attr.name}]`;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).find((c) => c && !/^sc(-|p\d)/.test(c)) /* skip the DC runtime's generated classes */ : "";
    return cls ? `${s}.${cls}` : s;
  };
  const informative = (el) => label(el) !== el.tagName.toLowerCase();
  const shortPath = (el) => {
    const parts = [];
    for (let n = el, depth = 0; n && n.nodeType === 1 && depth < 6 && parts.length < 3; n = n.parentElement, depth++) {
      if (n === el || informative(n)) parts.unshift(label(n));
    }
    return parts.join(" > ");
  };
  const scaleOf = (el) => {
    const cs = getComputedStyle(el);
    let sx = 1;
    let sy = 1;
    let rot = false;
    const t = cs.transform;
    if (t && t !== "none") {
      const m = t.match(/^matrix(3d)?\((.+)\)$/);
      if (m) {
        const v = m[2].split(",").map(Number);
        const [a, b, c, d] = m[1] ? [v[0], v[1], v[4], v[5]] : v;
        if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6) rot = true;
        if (a < 0) sx = -1;
        if (d < 0) sy = -1;
      }
    }
    const sc = cs.scale;
    if (sc && sc !== "none") {
      const [x, y = x] = sc.split(" ").map(parseFloat);
      if (x < 0) sx = -sx;
      if (y < 0) sy = -sy;
    }
    const r = cs.rotate;
    if (r && r !== "none") rot = true;
    return { sx, sy, rot };
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true });
    }
    return getComputedStyle(el).visibility !== "hidden";
  };
  const rows = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const style = el.getAttribute("style") || "";
    const icon = (icons.find((n) => style.includes(`/${n}.svg`)) || "?");
    let product = 1;
    let productY = 1;
    let rot = false;
    const flippedBy = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = scaleOf(n);
      product *= s.sx;
      productY *= s.sy;
      rot = rot || s.rot;
      if (s.sx < 0) flippedBy.push(n === el ? "self" : label(n));
    }
    let keepRoot = el.parentElement && el.parentElement.closest('.vt-dir-keep,[dir="ltr"]');
    if (keepRoot === document.documentElement) keepRoot = null; // an English page is dir="ltr" at the root: nothing special
    const r = el.getBoundingClientRect();
    rows.push({
      icon,
      product,
      flippedBy: flippedBy.join(" + "),
      note: [productY < 0 ? "y-flipped" : "", rot ? "rotated" : ""].filter(Boolean).join(","),
      keep: keepRoot ? label(keepRoot) : "",
      path: shortPath(el),
      box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
    });
  }
  const root = document.documentElement;
  return { rows, dir: root.getAttribute("dir") || "", lang: root.getAttribute("lang") || "" };
}

async function loadSpots(o) {
  if (o.paths.length) return o.paths.map((p) => ({ name: p, path: p }));
  const file = o.spots || resolve(dirname(new URL(import.meta.url).pathname), "mirror-spots.mjs");
  const mod = await import(pathToFileURL(file).href);
  return mod.default;
}

export async function run(argv) {
  const o = parseArgs(argv);
  const spots = (await loadSpots(o)).filter((s) => !o.only || o.only.has(s.name));
  let pagesServer;
  let opsServer;
  let base = o.base;
  let opsBase = o.opsBase || o.base;
  if (o.root) {
    pagesServer = await serve(o.root);
    opsServer = await serve(o.root, { ops: true });
    base = pagesServer.base;
    opsBase = opsServer.base;
  }
  const browser = await chromium.launch({ headless: !o.headed });
  const out = [];
  let fails = 0;
  for (const spot of spots) {
    if (spot.needs === "worker" && o.root) {
      console.log(`skip     ${spot.name} (needs a running Worker: use --base)`);
      continue;
    }
    if (spot.needs === "dev-gallery" && !o.devGallery) {
      console.log(`skip     ${spot.name} (needs a dev server with VAMOS_DEV_GALLERY=1: use --base ... --dev-gallery)`);
      continue;
    }
    for (const lang of spot.langs || o.lang) {
      for (const width of spot.widths || o.width) {
        const ctx = await browser.newContext({
          viewport: { width, height: width < 700 ? 844 : 900 },
          deviceScaleFactor: 1,
          reducedMotion: o.reduced ? "reduce" : "no-preference",
        });
        const page = await ctx.newPage();
        page.setDefaultTimeout(10_000);
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e).split("\n")[0].slice(0, 160)));
        await page.addInitScript(
          ([l, ops]) => {
            localStorage.setItem("vamosLang", l);
            if (ops) localStorage.setItem("vamosOpsAuth", "1");
          },
          [lang, spot.host === "ops"],
        );
        if (o.stub) await page.route("**/api/**", apiHandler(spot.stub || {}));
        const where = spot.host === "ops" ? opsBase : base;
        const prefix = spot.prefix === false || spot.host === "ops" || lang === "en" ? "" : `/${lang}`;
        const url = `${where}${prefix}${spot.path === "/" && prefix ? "" : spot.path}`;
        const env = { lang, width, wait: (ms) => page.waitForTimeout(ms) };
        let res;
        let failure = "";
        try {
          await page.goto(url, { waitUntil: "load" });
          await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(1500);
          if (spot.ready) await page.waitForSelector(spot.ready, { state: "visible" });
          await page.addStyleTag({ content: HIDE });
          await page.waitForTimeout(500);
          if (spot.setup) await spot.setup(page, env);
          await page.waitForTimeout(500);
          res = await page.evaluate(collect, { icons: ICONS });
        } catch (e) {
          failure = String(e).split("\n")[0].slice(0, 200);
        }
        const tag = `${lang} ${String(width).padStart(4)}  ${spot.name}`;
        if (failure) {
          fails++;
          console.log(`FAIL     ${tag}  ${spot.path}  spot did not run: ${failure}`);
          out.push({ spot: spot.name, lang, width, path: spot.path, error: failure });
        } else {
          const rtl = lang === "ar";
          if (rtl && res.dir !== "rtl") {
            fails++;
            console.log(`FAIL     ${tag}  ${spot.path}  page is not dir="rtl" (dir="${res.dir}")`);
          }
          const min = spot.min ?? 1;
          if (res.rows.length < min) {
            fails++;
            console.log(`FAIL     ${tag}  ${spot.path}  found ${res.rows.length} icon(s), expected at least ${min}`);
          }
          const groups = new Map();
          for (const r of res.rows) {
            const expected = r.keep ? 1 : rtl ? -1 : 1;
            const ok = r.product === expected;
            const row = { spot: spot.name, lang, width, spotPath: spot.path, ...r, expected, ok };
            out.push(row);
            const key = o.all ? Math.random() : [ok, r.path, r.icon, r.product, r.flippedBy, r.keep].join("|");
            const g = groups.get(key);
            if (g) g.count++;
            else groups.set(key, { ...row, count: 1 });
          }
          for (const g of groups.values()) {
            if (!g.ok) fails += g.count;
            const sign = g.product > 0 ? "+1" : "-1";
            const extra = [
              g.keep && rtl ? `keep:${g.keep}` : "",
              g.flippedBy ? `flip:${g.flippedBy}` : "",
              g.note,
              g.count > 1 ? `x${g.count}` : "",
            ].filter(Boolean).join(" ");
            console.log(`${g.ok ? "ok      " : "FAIL    "} ${tag}  ${spot.path}  ${g.path}  ${g.icon}  ${sign}  ${extra}`.trimEnd());
          }
          if (errors.length) console.log(`note     ${tag}  page errors: ${[...new Set(errors)].slice(0, 3).join(" | ")}`);
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  pagesServer?.server.close();
  opsServer?.server.close();
  const total = out.filter((r) => r.icon).length;
  console.log(`\n${fails === 0 ? "PASS" : "FAIL"}: ${total} icon(s) checked, ${fails} failure(s)`);
  if (o.json) {
    mkdirSync(dirname(o.json), { recursive: true });
    writeFileSync(o.json, JSON.stringify(out, null, 1));
  }
  return fails === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(String(e.stack || e));
      process.exit(2);
    },
  );
}
