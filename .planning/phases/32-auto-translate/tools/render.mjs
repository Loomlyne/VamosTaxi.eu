// Offline render harness for the Phase 32 signing pictures (automatic translator, revision 2026-10-13).
//   node .planning/phases/32-auto-translate/tools/render.mjs [a] [b] [c]      (sheets; default all three)
// "Before" = git archive of BEFORE_REF (default origin/main) synced into a scratch public folder; "after" = this
// worktree (prototype applied) synced into apps/web/public. Both are served on free local ports from the real
// shells (dashboard ops.dc.html with base href + auth flag, public home.dc.html), every /api/* answer is stubbed
// (stubs.mjs), each crop is asserted on the DOM (common C1-C10 from 32-UI-SPEC.md § Signing plus the crop's own),
// then three bare sheets (no frames, plain white ground) are composed into ../screens (single crops in
// ../screens/frames-v2). Exit 1 on any FAIL.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { serve } from "./serve.mjs";
import * as S from "./stubs.mjs";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const PH = join(repo, ".planning/phases/32-auto-translate");
const OUT = join(PH, "screens");
const FR = join(OUT, "frames-v2");
const require = createRequire(join(S.DEPS, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
mkdirSync(FR, { recursive: true });
const BEFORE_REF = process.env.BEFORE_REF || "origin/main";
const ONLY = process.argv.slice(2).map((x) => x.toLowerCase());
const md5 = (b) => createHash("md5").update(b).digest("hex");

// ---------- copy ----------
function loadDict(file) {
  const window = {}; const ctx = { window, console };
  vm.createContext(ctx); vm.runInContext(readFileSync(file, "utf8"), ctx);
  return window.VamosI18n;
}
const DICT = loadDict(join(repo, "app/vamos-i18n-dict.js"));
const COPY = JSON.parse(readFileSync(process.env.P32_STRINGS || join(PH, "tools/strings.json"), "utf8"));
const KEYS = [...new Set(COPY.flatMap((g) => g.rows.map((r) => r[0])))].filter((k) => /[A-Z]/.test(k));
function T(key, lang) {
  for (const g of COPY) for (const r of g.rows) if (r[0] === key) return r[{ en: 1, de: 2, fr: 3, ar: 4 }[lang]];
  throw new Error("no copy key " + key);
}
const up = (x) => String(x).toLocaleUpperCase();
const squash = (x) => String(x || "").replace(/\s+/g, " ").trim();
const COLORS = readFileSync(join(repo, "design-system/tokens/colors.css"), "utf8");
const hex = (name) => (COLORS.match(new RegExp(`--vt-${name}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1];
const rgb = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const BANNED_BG = ["yellow-50", "yellow-100", "yellow-200", "yellow-300"].map((n) => rgb(hex(n)));
const BANNED_FG = ["yellow-600", "yellow-700"].map((n) => rgb(hex(n)));
const YELLOW = rgb(hex("yellow"));

// every new de string: swiss spelling, no eszett (C7)
const SS = COPY.flatMap((g) => g.rows).filter((r) => /ß/.test(r[2]));
if (SS.length) { console.log("FAIL eszett in de strings: " + SS.map((r) => r[0]).join(",")); process.exit(1); }

// ---------- the two trees ----------
execFileSync("node", ["scripts/sync-dc-mock-to-public.mjs"], { cwd: repo, stdio: ["ignore", "ignore", "inherit"] });
const beforeDir = mkdtempSync(join(tmpdir(), "p32-before-"));
execFileSync("sh", ["-c", `git -C "${repo}" archive ${BEFORE_REF} app design-system assets scripts apps/web/public | tar -x -C "${beforeDir}" && ln -s "${repo}/node_modules" "${beforeDir}/node_modules"`]);
execFileSync("node", ["scripts/sync-dc-mock-to-public.mjs"], { cwd: beforeDir, stdio: ["ignore", "ignore", "inherit"] });
const after = await serve(join(repo, "apps/web/public"));
const before = await serve(join(beforeDir, "apps/web/public"));
const browser = await chromium.launch();

let failed = 0, passed = 0;
const sizes = [];
const coverageOut = {};
const perSheet = {};
const info = {}; // file -> { w, h } css px of the crop
const YC = {};   // yellow-background counts of "before" crops
const SNAP = {}; // element snapshots of "before" crops

/** Common assertions C1, C2, C4-C7, C9, C10 on the crop roots. */
async function common(page, roots, lang, allowYellow, c6only) {
  return page.evaluate(({ roots, lang, BANNED_BG, BANNED_FG, YELLOW, KEYS, allowYellow, c6only }) => {
    const out = [];
    const squash = (x) => String(x || "").replace(/\s+/g, " ").trim();
    const els = roots.flatMap((sel) => [...document.querySelectorAll(sel)]).filter((e) => e.getClientRects().length);
    const all = [...new Set(els.flatMap((e) => [e, ...e.querySelectorAll("*")]))].filter((e) => e.getClientRects().length);
    const de = document.documentElement;
    out.push([`C1 scrollWidth ${de.scrollWidth} <= ${innerWidth}`, de.scrollWidth <= innerWidth]);
    out.push([`C2 dir=${de.dir} lang=${de.lang}`, de.dir === (lang === "ar" ? "rtl" : "ltr") && String(de.lang).slice(0, 2) === lang]);
    const badShadow = [], badYellow = [], small = [], over = [];
    const focus = document.activeElement;
    for (const e of all) {
      const cs = getComputedStyle(e);
      if (cs.boxShadow && cs.boxShadow !== "none") {
        const cols = cs.boxShadow.match(/rgba?\([^)]*\)/g) || [];
        const ok = cols.every((c) => /^rgba?\(17, 18, 18/.test(c) || /^rgba?\(255, 255, 255/.test(c) || /, 0\)$/.test(c));
        const ring = cols.every((c) => /^rgba?\(253, 194, 11/.test(c));
        if (!ok && !(ring && e === focus)) badShadow.push(e.tagName + ":" + cs.boxShadow.slice(0, 40));
      }
      if (/blur|drop-shadow/.test(cs.filter)) badShadow.push(e.tagName + " filter");
      if (BANNED_BG.includes(cs.backgroundColor) || BANNED_BG.includes(cs.borderTopColor)) badYellow.push(e.tagName + " tint " + (e.className || ""));
      if (BANNED_FG.includes(cs.color) && e.textContent.trim()) badYellow.push(e.tagName + " brown text");
      if (cs.backgroundColor === YELLOW && !allowYellow.some((s) => e.closest(s))) badYellow.push(e.tagName + " yellow " + squash(e.textContent).slice(0, 30));
      if (e.matches("button, a, input, textarea, select, [role=tab], [data-rv-tr]")) {
        if (e.closest(".vt-dialog__head .vt-iconbtn") || e.matches("[data-rail-toggle]")) continue; // unchanged by this phase
        if (c6only && !c6only.some((s) => e.closest(s))) continue; // sheet a: the logo link and the profile row are untouched
        let box = e.getBoundingClientRect();
        if (e.matches("input, textarea") && e.closest(".vt-input")) box = e.closest(".vt-input").getBoundingClientRect();
        if (box.height + 0.5 < 44 || (e.matches("[data-rv-tr]") && box.width + 0.5 < 44)) small.push(`${e.tagName}${e.getAttribute("aria-label") ? "[" + e.getAttribute("aria-label") + "]" : ""} ${Math.round(box.width)}x${Math.round(box.height)}px "${squash(e.textContent).slice(0, 24)}"`);
      }
      if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && !e.matches("textarea, input") && cs.overflowX !== "visible") over.push(e.tagName + "." + [...e.attributes].map((a) => a.name).filter((n) => n.startsWith("data-")).join(","));
    }
    out.push(["C4 neutral shadows only" + (badShadow.length ? ": " + badShadow.slice(0, 3).join(" | ") : ""), badShadow.length === 0]);
    out.push(["C5 no tinted yellow, yellow only where it is today" + (badYellow.length ? ": " + badYellow.slice(0, 3).join(" | ") : ""), badYellow.length === 0]);
    out.push(["C6 controls >= 44 px" + (small.length ? ": " + small.slice(0, 4).join(" | ") : ""), small.length === 0]);
    const text = els.map((e) => e.innerText).join("\n");
    const vendor = /gemma|google|cloudflare|workers|m2m|openai|anthropic|claude|gpt|machine/i.test(text) || /\bAI\b/.test(text);
    out.push(["C7 no vendor/model name, no 'machine', no ß", !vendor && !/ß/.test(text)]);
    out.push(["C9 no clipped overflow" + (over.length ? ": " + over.slice(0, 3).join(" | ") : ""), over.length === 0]);
    const keyHit = KEYS.filter((k) => new RegExp("\\b" + k + "\\b").test(text));
    out.push(["C10 no key names, no %s, no {{" + (keyHit.length ? ": " + keyHit.join(",") : ""), !keyHit.length && !text.includes("{{") && !text.includes("%s")]);
    return out;
  }, { roots, lang, BANNED_BG, BANNED_FG, YELLOW, KEYS, allowYellow: allowYellow || [], c6only: c6only || null });
}
const yellowCount = (page, roots) => page.evaluate(({ roots, YELLOW }) => {
  const els = roots.flatMap((s) => [...document.querySelectorAll(s)]);
  return [...new Set(els.flatMap((e) => [e, ...e.querySelectorAll("*")]))].filter((e) => e.getClientRects().length && getComputedStyle(e).backgroundColor === YELLOW).length;
}, { roots, YELLOW });

/**
 * One crop. spec: {sheet, file, base, w, lang, path, state, init?, motion?, caption, prep(page), crop:{roots, margin?, grow?}, checks(page),
 *   coverage?: [sel], allowYellow?: [sel], ycKey?, before?: bool}
 */
async function frame(spec) {
  const { w, lang } = spec;
  const ctx = await browser.newContext({ viewport: { width: w, height: w <= 480 ? 844 : 900 }, deviceScaleFactor: 2, reducedMotion: spec.motion || "reduce", locale: lang === "ar" ? "ar" : "en-GB" });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); localStorage.setItem("vamosOpsAuth", "1"); } catch (e) {} }, lang);
  if (spec.init) await ctx.addInitScript(spec.init);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  const log = [];
  await S.installStubs(page, Object.assign({ dash: lang }, spec.state), log);
  const results = [];
  let ok = true;
  try {
    await page.goto(spec.base + spec.path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await spec.prep(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    if (spec.crop.grow) {
      const hh = await page.evaluate(() => document.documentElement.scrollHeight);
      if (hh > page.viewportSize().height) { await page.setViewportSize({ width: w, height: hh }); await page.waitForTimeout(400); }
    }
    const rect = await page.evaluate((sels) => {
      const rs = sels.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect());
      if (!rs.length) return null;
      const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top)), x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom));
      return { x: x0 + scrollX, y: y0 + scrollY, x1: x1 + scrollX, y1: y1 + scrollY };
    }, spec.crop.roots);
    if (!rect) throw new Error("crop root not found: " + spec.crop.roots.join(", "));
    const m = spec.crop.margin == null ? 12 : spec.crop.margin;
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    const clip = { x: Math.max(0, rect.x - m), y: Math.max(0, rect.y - m) };
    clip.width = Math.min(rect.x1 + m, vw) - clip.x;
    clip.height = rect.y1 + m - clip.y;
    let checks = await common(page, spec.crop.roots, lang, spec.allowYellow, spec.c6only);
    if (spec.before) checks = checks.map(([l, p]) => (l.startsWith("C6") || l.startsWith("C9")) && !p ? [l + " (before = today's UI, not changed here; not counted)", true] : [l, p]);
    const yc = await yellowCount(page, spec.crop.roots);
    if (spec.ycKey) {
      if (spec.before) YC[spec.ycKey] = yc;
      else if (YC[spec.ycKey] != null) checks.push([`C5 #FDC20B backgrounds ${yc} ${spec.ycLE ? "<=" : "="} the before crop ${YC[spec.ycKey]}${spec.ycLE ? " (kit disabled style drops the yellow fill)" : ""}`, spec.ycLE ? yc <= YC[spec.ycKey] : yc === YC[spec.ycKey]]);
    }
    for (const c of await spec.checks(page)) checks.push(c);
    checks.push(["C8 no page error" + (errors.length ? ": " + errors[0] : ""), errors.length === 0]);
    for (const [label, pass] of checks) { results.push(`${pass ? "ok" : "NO"} ${label}`); if (!pass) ok = false; }
    await page.screenshot({ path: join(FR, spec.file), clip, fullPage: true });
    info[spec.file] = { w: clip.width, h: clip.height };
    results.push(`ok shot ${Math.round(clip.width)}x${Math.round(clip.height)} css px`);
    if (spec.coverage && lang === "en") {
      const out = {};
      for (const l of ["de", "fr", "ar"]) {
        out[l] = await page.evaluate(({ sels, l }) => {
          const miss = [];
          for (const e of sels.flatMap((s) => [...document.querySelectorAll(s)])) { const r = window.VamosLocale.coverage(e, l); const ks = (x) => (Array.isArray(x) ? x.map((y) => (typeof y === 'string' ? y : JSON.stringify(y))) : Object.keys(x || {}));
            miss.push(...ks(r.strings), ...ks(r.attrs)); }
          return [...new Set(miss)];
        }, { sels: spec.coverage, l });
      }
      coverageOut[spec.file] = out;
      const n = out.de.length + out.fr.length + out.ar.length;
      results.push(`${n === 0 ? "ok" : "NO"} C3 coverage empty (de, fr, ar) ${n ? JSON.stringify(out) : ""}`);
      if (n) ok = false;
    }
  } catch (e) {
    ok = false;
    results.push("NO exception: " + String(e.message).split("\n")[0].slice(0, 220));
  }
  const bytes = (() => { try { return statSync(join(FR, spec.file)).size; } catch { return 0; } })();
  console.log(`${ok ? "PASS" : "FAIL"} ${spec.file} (${bytes} B)`);
  for (const r of results) if (!ok || r.startsWith("NO") || process.env.VERBOSE) console.log("   " + r);
  if (!ok) { failed++; console.log("   api: " + log.slice(-6).join(" ; ")); } else passed++;
  perSheet[spec.sheet] = perSheet[spec.sheet] || { pass: 0, fail: 0 };
  perSheet[spec.sheet][ok ? "pass" : "fail"]++;
  await ctx.close();
  return ok;
}

/** Screenshot (png buffer + css box) of one element on one tree, for pixel comparisons. */
async function elShot({ base, w, lang, path, state, init, prep, sel }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w <= 480 ? 844 : 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", locale: lang === "ar" ? "ar" : "en-GB" });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); localStorage.setItem("vamosOpsAuth", "1"); } catch (e) {} }, lang);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  await S.installStubs(page, Object.assign({ dash: lang }, state), []);
  await page.goto(base + path, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await prep(page);
  await page.waitForTimeout(600);
  const loc = page.locator(sel).first();
  const buf = await loc.screenshot();
  const box = await loc.boundingBox();
  await ctx.close();
  return { buf, h: box ? box.height : 0, w: box ? box.width : 0 };
}

/** Bare sheet: rows of crops on a plain white ground, whitespace only, a caption above each. */
async function compose(base, title, rows) {
  const render = async (file, partRows, partTitle) => {
    const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}body{padding:40px 48px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1e1f1f;width:max-content}
h1{font-size:22px;font-weight:600;margin:0 0 24px}h2{font-size:17px;font-weight:600;margin:36px 0 14px;max-width:1500px}.wrap{display:flex;flex-wrap:nowrap;gap:32px 44px;align-items:flex-start}figure{margin:0}.cap{font-size:14px;margin-bottom:8px;color:#555}img{display:block;border:0;outline:0;box-shadow:none}</style>
<h1>${partTitle}</h1>` + partRows.map((r) => `<h2>${r.title}</h2><div class="wrap">` + r.frames.filter((f) => { try { statSync(join(FR, f.file)); return true; } catch { return false; } }).map((f) => {
      const b64 = readFileSync(join(FR, f.file)).toString("base64");
      const cap = f.w <= 480 ? 300 : 620;
      const wpx = Math.round(Math.min((info[f.file] || { w: cap }).w, cap));
      return `<figure><div class="cap">${f.caption}</div><img src="data:image/png;base64,${b64}" style="width:${wpx}px"></figure>`;
    }).join("") + "</div>").join("");
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(html);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, file), fullPage: true });
    const dim = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    await ctx.close();
    return { dim, bytes: statSync(join(OUT, file)).size };
  };
  let i = 0, n = 0;
  const groups = [];
  while (i < rows.length) {
    let j = rows.length;
    while (j > i + 1) {
      const r = await render(`${base}-probe.png`, rows.slice(i, j), title);
      if (r.dim[1] <= 12000 && r.bytes <= 1.5e6) break;
      j--;
    }
    groups.push(rows.slice(i, j));
    i = j;
  }
  execFileSync("rm", ["-f", join(OUT, `${base}-probe.png`)]);
  for (const g of groups) {
    const suffix = groups.length > 1 ? "-part-" + String.fromCharCode(97 + n++) : "";
    const file = base + suffix + ".png";
    const r = await render(file, g, title + (suffix ? ` (${suffix.slice(1)})` : ""));
    sizes.push(`${file} ${r.dim[0]}x${r.dim[1]} px, ${r.bytes} B`);
  }
}

// ---------- helpers ----------
const text = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((e) => e.innerText).join("\n"), sel);
const has = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.getClientRects().length), sel);
const count = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).length, sel);
const maskIn = (page, sel, icon) => page.evaluate(({ s, icon }) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).some((root) => [root, ...root.querySelectorAll("*")].some((e) => (e.style.maskImage || e.style.webkitMaskImage || "").includes(icon + ".svg"))), { s: sel, icon });
const noAnim = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].every((e) => [e, ...e.querySelectorAll("*")].every((x) => x.getAnimations().length === 0)), sel);
const attr = (page, sel, a) => page.evaluate(({ s, a }) => { const e = document.querySelector(s); return e ? e.getAttribute(a) : null; }, { s: sel, a });
const mutedColor = (page) => page.evaluate(() => { const p = document.createElement("span"); p.style.color = "var(--vt-text-muted)"; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; });
const subtleColor = (page) => page.evaluate(() => { const p = document.createElement("span"); p.style.color = "var(--vt-border-subtle)"; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; });
const WL = [[1440, "en"], [1440, "ar"], [390, "en"], [390, "ar"]];
const LANGNAME = { en: "English", ar: "Arabic dashboard" };
const row = (title, specs) => ({ title, specs });

// =====================================================================================================
// Sheet a: rail and Content
// =====================================================================================================
const NAVC = "[data-ops-nav]";
const CONTENT_BTN = `${NAVC} nav > button`;
const CONTENT_ITEMS = `${NAVC} nav > div a`;
async function drawer(page, w) {
  if (w > 1080) return;
  await page.locator("[data-ops-top-start] button").first().click();
  await page.waitForTimeout(500);
}
function sa(id, w, lang, kind) {
  const isBefore = kind === "before";
  const path = id === "SA-3" || id === "SA-4" ? "/bookings" : "/reviews";
  const cap = isBefore ? "today: Pages, Legal, Reviews" : { "SA-2": w > 480 ? "Reviews only (Content open)" : "Reviews only (drawer open)", "SA-3": "Content closed, Bookings active", "SA-4": "rail collapsed to icons" }[id];
  return {
    before: isBefore, sheet: "a", file: `sa-${isBefore ? "1-before" : id.slice(3)}-${w}-${lang}.png`, base: isBefore ? before.base : after.base, w, lang, path,
    state: {}, caption: `${w} · ${LANGNAME[lang]} · ${cap}`, ycKey: `sa-${w}-${lang}-${id === "SA-4" ? "c" : "r"}`,
    prep: async (page) => {
      await drawer(page, w);
      if (id === "SA-4") { await page.locator("[data-rail-toggle]").first().click(); await page.waitForTimeout(500); }
    },
    crop: { roots: [NAVC], margin: 0 }, allowYellow: [`${NAVC} a`, `${NAVC} button`], c6only: [`${NAVC} nav`],
    coverage: isBefore ? null : [`${NAVC} nav > div`],
    checks: async (page) => {
      const out = [];
      const hrefs = await page.evaluate((s) => [...document.querySelectorAll(s)].map((a) => a.getAttribute("href")), CONTENT_ITEMS);
      const inView = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5; }, NAVC);
      out.push(["nav inside the viewport (drawer open at 390)", inView]);
      if (isBefore) { out.push([`evidence: ${hrefs.length} children (${hrefs.join(", ")})`, hrefs.length === 3 && hrefs.includes("/pages") && hrefs.includes("/legal") && hrefs.includes("/reviews")]); return out; }
      const expanded = await attr(page, CONTENT_BTN, "aria-expanded");
      const bg = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : ""; }, sel);
      if (id === "SA-2") {
        out.push([`exactly one link in the Content group, href /reviews (${hrefs.join(",")})`, hrefs.length === 1 && hrefs[0] === "/reviews"]);
        out.push(["no a[href=/pages] or a[href=/legal] anywhere", (await count(page, 'a[href="/pages"], a[href="/legal"]')) === 0 && !(await page.evaluate(() => !!document.querySelector('a[href="/pages"], a[href="/legal"]')))]);
        out.push(["group header aria-expanded=true", expanded === "true"]);
        out.push(["active style (yellow row)", (await bg(`${CONTENT_ITEMS}[href="/reviews"]`)) === YELLOW]);
        out.push(["child row >= 44 px", await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().height >= 44, CONTENT_ITEMS)]);
        out.push([`label resolves (${lang === "ar" ? "التقييمات" : "Reviews"})`, squash(await text(page, CONTENT_ITEMS)) === (lang === "ar" ? "التقييمات" : "Reviews")]);
      }
      if (id === "SA-3") {
        out.push(["group header aria-expanded=false, no child rendered", expanded === "false" && hrefs.length === 0]);
        out.push(["Bookings carries the active style", (await bg(`${NAVC} nav > a[href="/bookings"]`)) === YELLOW]);
      }
      if (id === "SA-4") {
        out.push(["rail collapsed (width 76)", await page.evaluate((s) => Math.round(document.querySelector(s).getBoundingClientRect().width) <= 80, NAVC)]);
        out.push(["Content icon file-text present, no child", (await maskIn(page, CONTENT_BTN, "file-text")) && hrefs.length === 0]);
      }
      return out;
    },
  };
}
/** Non-picture checks of sheet a: SA-4 click, SA-5 old addresses. File names start with aux- (not on a sheet). */
function saAux(kind, lang) {
  const w = 1440;
  const base = { sheet: "a", w, lang, state: {}, caption: "", crop: { roots: [NAVC], margin: 0 }, allowYellow: [`${NAVC} a`, `${NAVC} button`], c6only: [`${NAVC} nav`] };
  if (kind === "click") return {
    ...base, file: `aux-SA-4-click-${lang}.png`, base: after.base, path: "/bookings",
    prep: async (page) => { await page.locator("[data-rail-toggle]").first().click(); await page.waitForTimeout(400); await page.locator(CONTENT_BTN).first().click(); await page.waitForTimeout(500); },
    checks: async (page) => {
      const hrefs = await page.evaluate((s) => [...document.querySelectorAll(s)].map((a) => a.getAttribute("href")), CONTENT_ITEMS);
      const wd = await page.evaluate((s) => Math.round(document.querySelector(s).getBoundingClientRect().width), NAVC);
      return [[`SA-4 click: rail expanded (${wd}px), Content open with one child (${hrefs.join(",")})`, wd > 200 && hrefs.length === 1 && hrefs[0] === "/reviews"]];
    },
  };
  return {
    ...base, file: `aux-SA-5-${kind}-${lang}.png`, base: after.base, path: kind === "pages" ? "/pages" : "/legal",
    prep: async () => {},
    checks: async (page) => {
      const grab = () => page.evaluate(() => document.querySelector("[data-ops-main]").innerText.replace(/\s+/g, " ").trim());
      const here = await grab();
      const path = await page.evaluate(() => location.pathname);
      await page.goto(after.base + "/dashboard", { waitUntil: "load" });
      await page.waitForTimeout(1500);
      const dash = await grab();
      const body = await page.evaluate(() => document.body.innerText);
      return [
        [`SA-5 ${kind}: ${path} renders the dashboard route (main text equals /dashboard's, ${here.length} chars)`, here.length > 0 && here === dash],
        ["SA-5: no OpsContent text and no Pages/Legal rail link", !/Coming soon|Bald verfügbar|قريبًا/.test(here + body) && (await count(page, 'a[href="/pages"], a[href="/legal"]')) === 0],
      ];
    },
  };
}

// =====================================================================================================
// Sheet b: support ticket
// =====================================================================================================
async function openTicket(page, w) {
  if (w <= 860) { await page.waitForSelector("[data-tbl-scroll] tbody tr", { state: "visible", timeout: 10000 }); await page.locator("[data-tbl-scroll] tbody tr").first().click(); }
  else { await page.waitForSelector("[data-kb-body]", { state: "visible", timeout: 10000 }); await page.locator("[data-kb-body]").first().click(); }
  await page.waitForSelector("[data-msg]", { timeout: 6000 });
  await page.waitForTimeout(300);
}
/** window.open is recorded and answered with a fake tab; mail app = Gmail unless auto; optional lapsed click activation. */
const initMail = (o) => `(() => {
  try { localStorage.setItem("vamosOpsMailApp", ${JSON.stringify(o.gmail === false ? "auto" : "gmail")}); } catch (e) {}
  window.__opened = [];
  window.open = function (u) { const rec = { u: u || "" }; window.__opened.push(rec); return { opener: null, closed: false, close() {}, location: { set href(v) { rec.u = v; }, get href() { return rec.u; } } }; };
  ${o.lapsed ? "Object.defineProperty(navigator, 'userActivation', { configurable: true, get() { return { isActive: false, hasBeenActive: true }; } });" : ""}
})();`;
const BUBBLE = '[data-msg][data-from="customer"]';
const TK = {
  "SB-2": ["de", "ready"], "SB-3": null, "SB-4": ["it", "ready"], "SB-5": null, "SB-6": ["de", "pending"], "SB-7": ["de", "failed"],
};
function sbMsg(id, w, lang, kind) {
  const isBefore = kind === "before";
  let tk;
  if (id === "SB-3") tk = lang === "ar" ? S.ticket("en", "ready", lang) : S.ticket("ar", "ready", lang);
  else if (id === "SB-5") tk = S.ticket(lang, "ready", lang);
  else if (isBefore) tk = S.ticket("de", "ready", lang);
  else tk = S.ticket(...TK[id], lang);
  const capm = { "SB-2": "German customer message", "SB-3": lang === "ar" ? "English message, Arabic dashboard" : "Arabic customer message", "SB-4": "Italian customer message (outside the four)", "SB-5": "message in your own language: unchanged", "SB-6": "translation pending", "SB-7": "translation failed" };
  const cap = isBefore ? "today" : capm[id];
  return {
    before: isBefore, sheet: "b", file: `sb-${isBefore ? id.slice(3) + "-before" : id.slice(3)}-${w}-${lang}.png`, base: isBefore ? before.base : after.base, w, lang, path: "/support",
    state: { tickets: [tk] }, caption: `${w} · ${LANGNAME[lang]} · ${cap}`,
    prep: (page) => openTicket(page, w),
    crop: { roots: [BUBBLE], margin: 16 },
    coverage: isBefore ? null : ["[data-msg-from]", "[data-msg-status]"],
    checks: async (page) => {
      const L = (k) => T(k, lang);
      const b = BUBBLE;
      const out = [];
      if (isBefore) return [["before: plain bubble, no translation parts", !(await has(page, "[data-msg-from]"))]];
      if (id === "SB-2" || id === "SB-3" || id === "SB-4") {
        const order = await page.evaluate((b) => { const m = document.querySelector(b); return [...m.querySelectorAll("[data-msg-tr],[data-msg-from],[data-msg-orig]")].map((e) => [...e.attributes].find((a) => a.name.startsWith("data-msg-")).name).join(","); }, b);
        out.push([`DOM order tr, from, orig (${order})`, order === "data-msg-tr,data-msg-from,data-msg-orig"]);
        out.push(["no Badge and no element named mark in the bubble", !(await has(page, b + " .vt-badge")) && !(await page.evaluate((b) => [...document.querySelector(b).querySelectorAll("*")].some((e) => /mark/i.test(e.className + " " + [...e.attributes].map((a) => a.name).join(" "))), b))]);
        out.push(["globe mask in the from line", await maskIn(page, b + " [data-msg-from]", "globe")]);
        const o = await page.evaluate((b) => { const e = document.querySelector(b + " [data-msg-orig]"); const cs = getComputedStyle(e); const m = document.querySelector(b).getBoundingClientRect(); const r = e.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(e); const tr = range.getBoundingClientRect(); return { lang: e.lang, dir: e.dir, fs: parseFloat(cs.fontSize), col: cs.color, bt: cs.borderTopWidth, btc: cs.borderTopColor, inside: r.left >= m.left - 0.5 && r.right <= m.right + 0.5, textRight: Math.abs(tr.right - r.right) < 3, textLeft: Math.abs(tr.left - r.left) < 3 }; }, b);
        out.push(["original <= 13 px, muted, 1px --vt-border-subtle rule above", o.fs <= 13 && o.col === (await mutedColor(page)) && o.bt === "1px" && o.btc === (await subtleColor(page))]);
        if (id === "SB-2") {
          out.push([`from line "${lang === "en" ? "Translated from German" : "تُرجم من الألمانية"}"`, squash(await text(page, b + " [data-msg-from]")) === (lang === "en" ? "Translated from German" : "تُرجم من الألمانية")]);
          out.push(["original lang=de dir=ltr", o.lang === "de" && o.dir === "ltr"]);
        }
        if (id === "SB-4") {
          out.push([`from line "${lang === "en" ? "Translated from Italian" : "تُرجم من الإيطالية"}"`, squash(await text(page, b + " [data-msg-from]")) === (lang === "en" ? "Translated from Italian" : "تُرجم من الإيطالية")]);
          out.push(["original lang=it dir=ltr", o.lang === "it" && o.dir === "ltr"]);
        }
        if (id === "SB-3") {
          if (lang === "en") {
            out.push(["original lang=ar dir=rtl, text edge at the bubble's right, inside the bubble", o.lang === "ar" && o.dir === "rtl" && o.textRight && o.inside]);
            out.push(["translation LTR", await page.evaluate((b) => document.querySelector(b + " [data-msg-tr]").dir === "ltr", b)]);
          } else {
            out.push(["original lang=en dir=ltr, left-aligned, inside (mirror of the Arabic case)", o.lang === "en" && o.dir === "ltr" && o.textLeft && o.inside]);
            out.push(["translation RTL", await page.evaluate((b) => document.querySelector(b + " [data-msg-tr]").dir === "rtl", b)]);
          }
          out.push(["bubble does not scroll sideways", await page.evaluate((b) => { const m = document.querySelector(b); return m.scrollWidth <= m.clientWidth + 1; }, b)]);
        }
        out.push(["translation present", (await text(page, b + " [data-msg-tr]")).length > 10]);
      }
      if (id === "SB-5") {
        out.push(["no from line, no original, no status", !(await has(page, b + " [data-msg-from]")) && !(await has(page, b + " [data-msg-orig]")) && !(await has(page, b + " [data-msg-status]"))]);
        const a0 = await elShot({ base: before.base, w, lang, path: "/support", state: { tickets: [S.ticket(lang, "ready", lang)] }, prep: (p) => openTicket(p, w), sel: BUBBLE });
        const a1 = await elShot({ base: after.base, w, lang, path: "/support", state: { tickets: [S.ticket(lang, "ready", lang)] }, prep: (p) => openTicket(p, w), sel: BUBBLE });
        out.push([`bubble pixel-identical to the before bubble (${md5(a0.buf).slice(0, 8)} vs ${md5(a1.buf).slice(0, 8)})`, md5(a0.buf) === md5(a1.buf)]);
      }
      if (id === "SB-6") out.push(["original in body, Translating… line with loader-circle, no animation, no tr block", (await has(page, b + " [data-msg-body]")) && !(await has(page, b + " [data-msg-tr]")) && (await text(page, b + " [data-msg-status]")) === L("translating") && (await maskIn(page, b + " [data-msg-status]", "loader-circle")) && (await noAnim(page, b + " [data-msg-status]"))]);
      if (id === "SB-7") out.push(["original in body, trNotAvailable line with info mask, no Alert, no button", (await has(page, b + " [data-msg-body]")) && (await text(page, b + " [data-msg-status]")) === L("trNotAvailable") && (await maskIn(page, b + " [data-msg-status]", "info")) && !(await has(page, b + " .vt-alert, " + b + " button"))]);
      return out;
    },
  };
}

const FOOT = "[data-ov-foot]";
const ANSWER = "[data-ov-actions] [data-answer]";
const typedShort = (lang) => S.REPLY_TEXT[lang];
const typedLong = (lang) => (lang === "ar" ? (S.REPLY_TEXT.ar + " ").repeat(16).trim() : S.LONG_TEXT);
function sbReply(id, w, lang, kind) {
  const isBefore = kind === "before";
  const L = (k) => T(k, lang);
  const it = id === "SB-12";
  const tk = isBefore ? S.ticket("de", "ready", lang) : S.ticket(it ? "it" : "de", "ready", lang, id === "SB-14");
  const typed = id === "SB-13a" ? typedLong(lang) : typedShort(lang);
  const replyTr = id === "SB-10" ? "hang" : id === "SB-11" ? "failed" : id === "SB-13b" ? "delay" : "ready";
  const capm = { "SB-8": "empty (German customer)", "SB-9": "typed, will translate", "SB-10": "waiting for the translation", "SB-11": "could not translate, e-mail opened as written", "SB-12": "Italian customer: text goes as written", "SB-13a": "too long for the mail link", "SB-13b": "translation ready after the click lapsed", "SB-14": "closed ticket" };
  const cap = isBefore ? "today (read-only hint)" : capm[id];
  const init = initMail({ gmail: id !== "SB-13b", lapsed: id === "SB-13b" });
  return {
    before: isBefore, sheet: "b", file: `sb-${isBefore ? "1-before" : id.slice(3)}-${w}-${lang}.png`, base: isBefore ? before.base : after.base, w, lang, path: "/support",
    state: { tickets: [tk], replyTr, delayMs: 900 }, init, caption: `${w} · ${LANGNAME[lang]} · ${cap}`,
    prep: async (page) => {
      await openTicket(page, w);
      if (isBefore || id === "SB-8" || id === "SB-14") return;
      await page.locator("textarea[data-reply-text]").fill(typed);
      await page.waitForTimeout(id === "SB-13b" ? 1000 : 1300);
      if (id === "SB-10" || id === "SB-11" || id === "SB-13b") { await page.locator(ANSWER).click(); await page.mouse.move(2, 2); await page.waitForTimeout(id === "SB-13b" ? 1500 : 300); }
    },
    crop: { roots: [FOOT], margin: 8 }, allowYellow: ["[data-answer]", "[data-ov-actions] .vt-btn--primary"], ycKey: "sb-foot-" + w + "-" + lang, ycLE: id === "SB-10",
    coverage: isBefore ? null : ["[data-reply]", "[data-answer]"],
    checks: async (page) => {
      if (isBefore) return [["before: read-only hint present", (await text(page, FOOT)).length > 0]];
      const out = [];
      const ansOff = () => page.locator(ANSWER).isDisabled();
      const ansLabel = async () => squash(await text(page, ANSWER));
      const hint = async () => squash(await text(page, "[data-reply-hint]"));
      const note = async () => squash(await text(page, "[data-reply-note]"));
      if (id !== "SB-14") {
        out.push(["old read-only hint absent", !(await page.evaluate(() => /Read only|للقراءة فقط/.test(document.body.innerText)))]);
        out.push(["no preview element, only the mail-app select", !(await has(page, "[data-reply-preview]")) && (await count(page, `${FOOT} [data-vs-btn]`)) === 1]);
      }
      if (id === "SB-8") {
        out.push(["[data-reply-text] with aria-label and placeholder", await page.evaluate(({ a, p }) => { const t = document.querySelector("textarea[data-reply-text]"); return !!t && t.getAttribute("aria-label") === a && t.placeholder === p; }, { a: L("replyLabel"), p: L("replyPh") })]);
        out.push(["hint equals replyHint, no note, ANSWER enabled", (await hint()) === L("replyHint") && !(await has(page, "[data-reply-note]")) && !(await ansOff())]);
      }
      if (id === "SB-9") {
        out.push(["hint replyHint; ANSWER enabled and labelled answer; mail-app select present", (await hint()) === L("replyHint") && !(await ansOff()) && (await ansLabel()).toLowerCase() === L("answer").toLowerCase() && (await count(page, `${FOOT} [data-vs-btn]`)) === 1]);
        if (w <= 480) {
          out.push(["footer scrolls inside (overflow-y:auto)", await page.evaluate(() => getComputedStyle(document.querySelector("[data-ov-foot]")).overflowY === "auto")]);
          const th = await page.evaluate(() => Math.round(document.querySelector("[data-thread]").getBoundingClientRect().height));
          out.push([`thread >= 160 px (${th})`, th >= 160]);
        }
      }
      if (id === "SB-10") {
        out.push(["button disabled, aria-busy=true, label translating, loader-circle mask, no mail mask", (await ansOff()) && (await attr(page, ANSWER, "aria-busy")) === "true" && (await ansLabel()).toLowerCase() === L("translating").toLowerCase() && (await maskIn(page, ANSWER, "loader-circle")) && !(await maskIn(page, ANSWER, "mail"))]);
        out.push(["box still editable, no animation", (await page.locator("textarea[data-reply-text]").isEditable()) && (await noAnim(page, ANSWER))]);
      }
      if (id === "SB-11") {
        out.push(["note replyUntranslated with info mask; button enabled and labelled answer", (await note()) === L("replyUntranslated") && (await maskIn(page, "[data-reply-note]", "info")) && !(await ansOff()) && (await ansLabel()).toLowerCase() === L("answer").toLowerCase()]);
        const opened = await page.evaluate(() => window.__opened.map((o) => o.u));
        const body = opened.length ? decodeURIComponent((opened[0].split("&body=")[1] || "")) : "";
        out.push(["the e-mail opened with his text as written, no divider", opened.length === 1 && body === typed && !body.includes("--------------------")]);
      }
      if (id === "SB-12") out.push(["hint equals replyHintRaw, no note, ANSWER enabled, nothing requested", (await hint()) === L("replyHintRaw") && !(await has(page, "[data-reply-note]")) && !(await ansOff())]);
      if (id === "SB-13a") out.push(["note equals mailTooLong", (await note()) === L("mailTooLong")]);
      if (id === "SB-13b") {
        out.push(["note equals replyReady, button enabled, mail not forced", (await note()) === L("replyReady") && !(await ansOff()) && (await page.evaluate(() => window.__opened.length)) === 0]);
      }
      if (id === "SB-14") out.push(["no [data-reply]; closedBody line and Reopen present", !(await has(page, "[data-reply]")) && (await text(page, FOOT)).length > 20 && (await count(page, "[data-ov-actions] .vt-btn")) >= 2]);
      return out;
    },
  };
}
/** Non-picture mail-link checks (unit stubs of the spec): body decoding, recipient, synchronous Gmail tab. */
function sbMail(kind, lang) {
  const w = 1440;
  const typed = kind === "toolong" ? typedLong(lang) : typedShort(lang);
  const tk = S.ticket(kind === "raw" ? "it" : "de", "ready", lang);
  const replyTr = kind === "failed" ? "failed" : kind === "wait" ? "delay" : "ready";
  return {
    sheet: "b", file: `aux-mail-${kind}-${lang}.png`, base: after.base, w, lang, path: "/support", state: { tickets: [tk], replyTr, delayMs: 700 }, init: initMail({ gmail: true }),
    caption: "", crop: { roots: [FOOT], margin: 8 }, allowYellow: ["[data-answer]", "[data-ov-actions] .vt-btn--primary"],
    prep: async (page) => {
      await openTicket(page, w);
      await page.locator("textarea[data-reply-text]").fill(typed);
      await page.waitForTimeout(kind === "wait" ? 100 : 1300); // "wait": click inside the 800 ms debounce, the answer arrives later
      if (kind === "wait") {
        await page.locator(ANSWER).click();
        await page.waitForTimeout(100);
        const sync = await page.evaluate(() => window.__opened.map((o) => o.u));
        await page.evaluate((s) => { window.__syncAfterClick = s; }, sync);
        await page.waitForTimeout(2500);
      } else {
        await page.locator(ANSWER).click();
        await page.waitForTimeout(400);
      }
    },
    checks: async (page) => {
      const opened = await page.evaluate(() => window.__opened.map((o) => o.u));
      const url = opened[opened.length - 1] || "";
      const body = decodeURIComponent((url.split("&body=")[1] || ""));
      const to = (url.match(/[?&]to=([^&]+)/) || [])[1];
      const out = [];
      out.push([`one Gmail tab, recipient ${decodeURIComponent(to || "")} equals the ticket address`, opened.length === 1 && decodeURIComponent(to || "") === tk.email]);
      const hy = "--------------------";
      if (kind === "ready") {
        const parts = body.split("\n\n");
        out.push(["body = translated, blank line, 20 hyphens, blank line, original", parts.length === 3 && parts[1] === hy && parts[2] === typed && parts[0].length > 10 && parts[0] !== typed]);
      }
      if (kind === "failed" || kind === "raw") out.push(["body = his text only, no divider", body === typed]);
      if (kind === "toolong") out.push(["over 1,800 characters: original omitted, translated text only", body.length > 600 && !body.includes(hy) && body !== typed]);
      if (kind === "wait") {
        const sync = await page.evaluate(() => window.__syncAfterClick);
        out.push([`the tab is opened synchronously at the click (${JSON.stringify(sync)}) and filled when the answer arrives`, sync.length === 1 && sync[0] === "" && body.split("\n\n").length === 3]);
      }
      return out;
    },
  };
}

// =====================================================================================================
// Sheet c: review card
// =====================================================================================================
const HOME = "/app/home/home.html";
const CARD = { en: { de: "Lena K." }, ar: { en: "Tom B." } };
const SEL = "[data-crop]";
async function homeReady(page) {
  await page.waitForSelector("[data-rv-card]", { state: "attached", timeout: 15000 });
  await page.evaluate(() => { const c = document.querySelector("#vt-boot-cover"); if (c) c.remove(); document.querySelector("#reviews").scrollIntoView(); });
  await page.waitForTimeout(500);
}
/** Mark the card of the review whose author name is `name` (first match, not an aria-hidden copy). */
async function tag(page, name) {
  const okk = await page.evaluate((name) => {
    const cards = [...document.querySelectorAll("[data-rv-card]")].filter((c) => !c.closest("[aria-hidden=true]") && c.querySelector("[data-rv-name]").textContent.trim() === name);
    if (!cards.length) return false;
    document.querySelectorAll("[data-crop]").forEach((e) => e.removeAttribute("data-crop"));
    cards[0].setAttribute("data-crop", "1");
    return true;
  }, name);
  if (!okk) throw new Error("no card for " + name);
}
const tapCard = async (page) => { await page.locator(`${SEL} [data-rv-tr]`).first().click(); await page.mouse.move(2, 2); };
function sc(id, w, lang, kind) {
  const isBefore = kind === "before";
  const name = CARD[lang === "ar" ? "ar" : "en"][lang === "ar" ? "en" : "de"];
  const sameSet = lang === "ar" ? "sameAr" : "sameEn";
  const set = id === "SC-3" ? sameSet : "five";
  const revTr = id === "SC-4" ? "hang" : id === "SC-6" ? "error" : "ok";
  const capm = { "SC-2": lang === "ar" ? "English review on an Arabic site: Translate" : "German review on an English site: Translate", "SC-3": "same language, and language unknown: no button", "SC-4": "waiting", "SC-5": "translated, Show original", "SC-6": "not available, Try again" };
  const cap = isBefore ? "today" : capm[id];
  const roots = id === "SC-3" ? ["[data-rv-wall]"] : [SEL];
  return {
    before: isBefore, sheet: "c", file: `sc-${isBefore ? "1-before" : id.slice(3)}-${w}-${lang}.png`, base: isBefore ? before.base : after.base, w, lang, path: HOME,
    state: { reviews: set, revTr }, caption: `${w} · ${lang === "ar" ? "Arabic site" : "English site"} · ${cap}`,
    prep: async (page) => {
      await homeReady(page);
      if (id !== "SC-3") await tag(page, name);
      if (id === "SC-4" || id === "SC-5" || id === "SC-6") await tapCard(page);
      if (id === "SC-5") await page.waitForFunction(() => /Show original|Original anzeigen|عرض النص الأصلي/.test(document.querySelector("[data-crop] [data-rv-tr]").innerText), null, { timeout: 5000 });
      if (id === "SC-6") await page.waitForSelector(`${SEL} [data-rv-tr-note]`, { timeout: 5000 });
      await page.waitForTimeout(200);
    },
    crop: { roots, margin: 12 }, allowYellow: ["[data-rv-star]"], ycKey: `sc-${id === "SC-3" ? "3" : "2"}-${w}-${lang}`,
    coverage: isBefore ? null : ["[data-rv-tr-row]"],
    checks: async (page) => {
      const L = (k) => T(k, lang);
      const out = [];
      const cardH = () => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().height, SEL);
      const snapEls = async () => {
        const o = {};
        for (const k of ["[data-rv-stars]", "[data-rv-who]", "[data-rv-mark]"]) {
          try {
            const g = await page.evaluate(({ s, k }) => { const c = document.querySelector(s), e = c.querySelector(k), r = e.getBoundingClientRect(), cr = c.getBoundingClientRect(), cs = getComputedStyle(e); return [Math.round(r.width * 10), Math.round(r.height * 10), Math.round((k === '[data-rv-stars]' ? r.top - cr.top : cr.bottom - r.bottom) * 10), Math.round((r.left - cr.left) * 10), cs.fontSize, cs.fontWeight, cs.color, e.innerHTML.length].join("|"); }, { s: SEL, k });
            o[k] = { px: md5(await page.locator(`${SEL} ${k}`).first().screenshot()), geo: g };
          } catch { o[k] = null; }
        }
        return o;
      };
      if (isBefore) {
        if (id !== "SC-3") { SNAP[`${w}-${lang}`] = { h: await cardH(), els: await snapEls() }; }
        return [["before: no translate row", !(await has(page, "[data-rv-tr-row]"))]];
      }
      const q = `${SEL} [data-rv-text]`;
      if (id === "SC-3") {
        out.push(["no [data-rv-tr-row] in any card of the crop (same language, unknown language)", (await count(page, "[data-rv-tr-row]")) === 0 && (await count(page, "[data-rv-card]")) >= 3]);
        const unk = await elShot({ base: after.base, w, lang, path: HOME, state: { reviews: sameSet }, prep: async (p) => { await homeReady(p); await tag(p, "Sam R."); }, sel: SEL });
        const unkB = await elShot({ base: before.base, w, lang, path: HOME, state: { reviews: sameSet }, prep: async (p) => { await homeReady(p); await tag(p, "Sam R."); }, sel: SEL });
        out.push([`unknown-language card identical to today's (${md5(unk.buf).slice(0, 8)} vs ${md5(unkB.buf).slice(0, 8)})`, md5(unk.buf) === md5(unkB.buf)]);
        return out;
      }
      const sn = SNAP[`${w}-${lang}`];
      const btn = `${SEL} [data-rv-tr]`;
      out.push(["one [data-rv-tr] with a globe mask or loader, >= 44x44", (await count(page, btn)) === 1 && await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return b.height >= 44 && b.width >= 44; }, btn)]);
      if (id === "SC-2") {
        out.push(["label equals rvTranslate, globe mask", squash(await text(page, btn)) === L("rvTranslate") && await maskIn(page, btn, "globe")]);
        out.push(["quote still the original", (await text(page, q)) === S.REVIEWS[lang === "ar" ? "en" : "de"].body]);
        const h = await cardH();
        if (sn) {
          const grow = h - sn.h;
          out.push([`card height grows by ${Math.round(grow)} px (<= 48)`, grow >= 0 && grow <= 48.5]);
          const now = await snapEls();
          const same = Object.keys(sn.els).every((k) => (sn.els[k] && now[k] && sn.els[k].geo === now[k].geo));
          const px = Object.keys(sn.els).every((k) => sn.els[k] && now[k] && sn.els[k].px === now[k].px);
          out.push([`stars, name block and mark: size, offset from the card's bottom and text style equal to today's card (pixel hashes equal: ${px})`, same]);
        }
      }
      if (id === "SC-4") {
        out.push(["aria-busy=true and aria-disabled=true, label translating, loader-circle mask", (await attr(page, btn, "aria-busy")) === "true" && (await attr(page, btn, "aria-disabled")) === "true" && squash(await text(page, btn)) === L("translating") && (await maskIn(page, btn, "loader-circle"))]);
        out.push(["quote still the original, no animation", (await text(page, q)) === S.REVIEWS[lang === "ar" ? "en" : "de"].body && (await noAnim(page, btn))]);
      }
      if (id === "SC-5") {
        const want = (S.REVIEW_TR[lang === "ar" ? "rv-en" : "rv-de"] || {})[lang];
        const qa = await page.evaluate((s) => { const e = document.querySelector(s); return { lang: e.lang, dir: e.dir, live: e.closest("blockquote").getAttribute("aria-live") }; }, q);
        out.push([`quote equals the stub translation, lang=${lang}, dir=${lang === "ar" ? "rtl" : "ltr"}`, squash(await text(page, q)) === want && qa.lang === lang && qa.dir === (lang === "ar" ? "rtl" : "ltr")]);
        out.push(["button label equals rvShowOriginal; blockquote aria-live=polite; focus not lost (button)", squash(await text(page, btn)) === L("rvShowOriginal") && qa.live === "polite"]);
        out.push(["bdi wrapper kept", await page.evaluate((s) => !!document.querySelector(s + " bdi"), q)]);
      }
      if (id === "SC-6") {
        const nt = `${SEL} [data-rv-tr-note]`;
        out.push(["note equals trNotAvailable (role=status), button labelled tryAgain, quote original", squash(await text(page, nt)) === L("trNotAvailable") && (await attr(page, nt, "role")) === "status" && squash(await text(page, btn)) === L("tryAgain") && (await text(page, q)) === S.REVIEWS[lang === "ar" ? "en" : "de"].body]);
        out.push(["note colour is not --vt-danger, no Alert", await page.evaluate((s) => { const p = document.createElement("span"); p.style.color = "var(--vt-danger)"; document.body.appendChild(p); const d = getComputedStyle(p).color; p.remove(); return getComputedStyle(document.querySelector(s)).color !== d && !document.querySelector(".vt-alert"); }, nt)]);
      }
      return out;
    },
  };
}
/** SC-7: drift wall, DOM only (1440 en, motion allowed). */
function scDrift() {
  return {
    sheet: "c", file: "aux-SC-7-1440-en.png", base: after.base, w: 1440, lang: "en", path: HOME, motion: "no-preference",
    state: { reviews: "drift", revTr: "ok" }, caption: "", crop: { roots: ["[data-rv-wall]"], margin: 0 }, allowYellow: ["[data-rv-star]"],
    prep: async (page) => {
      await homeReady(page);
      // the drifting wall never holds still for a pointer click: focus and click the real button in the page
      await page.evaluate(() => { const b = document.querySelector("[data-rv-item]:not([aria-hidden=true]) [data-rv-tr]"); b.focus(); b.click(); });
      await page.waitForFunction(() => /Show original/.test(document.querySelector("[data-rv-item]:not([aria-hidden=true]) [data-rv-tr]").innerText), null, { timeout: 5000 });
      await page.waitForTimeout(300);
    },
    checks: async (page) => {
      const want = S.REVIEW_TR["rv-de"].en;
      const r = await page.evaluate((want) => {
        const hits = [...document.querySelectorAll("[data-rv-text]")].filter((e) => e.textContent.trim() === want);
        const copies = hits.filter((e) => e.closest("[data-rv-clone='1']"));
        const col = document.querySelector("[data-rv-col]");
        return { n: hits.length, copies: copies.length, inert: copies.every((e) => e.closest("[inert]") && e.closest("[aria-hidden=true]") && e.closest("[inert]").querySelector("[data-rv-tr]")), focusIn: !!document.activeElement.closest("[data-rv-drift]"), state: getComputedStyle(col).animationPlayState, name: getComputedStyle(col).animationName };
      }, want);
      return [
        [`translated quote shown in the visible card and its aria-hidden copies (${r.n} hits, ${r.copies} copies)`, r.n === 4 && r.copies === 3],
        ["copies' [data-rv-tr] sit inside inert, aria-hidden items", r.inert],
        [`wall animation (${r.name}) paused while the button has focus (${r.state}, focus inside ${r.focusIn})`, r.name !== "none" && r.focusIn && r.state === "paused"],
      ];
    },
  };
}

// ---------- run ----------
const sheets = [
  { n: "a", base: "sheet-a-sidebar-content", title: "Phase 32 · A · Dashboard rail: Content keeps Reviews only (Pages and Legal removed)",
    rows: [row("SA-1 Before (today): Content open on Reviews, with Pages and Legal", WL.map(([w, l]) => sa("SA-1", w, l, "before"))),
      row("SA-2 After: Content open on Reviews (390: drawer open)", WL.map(([w, l]) => sa("SA-2", w, l))),
      row("SA-3 After: Content closed, on another page (Bookings)", WL.map(([w, l]) => sa("SA-3", w, l))),
      row("SA-4 After: rail collapsed to icons (1440)", WL.filter(([w]) => w > 480).map(([w, l]) => sa("SA-4", w, l)))],
    aux: [saAux("click", "en"), saAux("click", "ar"), saAux("pages", "en"), saAux("legal", "en"), saAux("pages", "ar"), saAux("legal", "ar")] },
  { n: "b", base: "sheet-b-support-ticket", title: "Phase 32 · B · Support ticket: customer messages translated for you, and your reply",
    rows: [row("SB-1 Before (today): footer with the read-only hint", WL.map(([w, l]) => sbReply("SB-8", w, l, "before"))),
      row("Before (today): the customer's message", WL.map(([w, l]) => sbMsg("SB-2", w, l, "before"))),
      row("SB-2 German customer message, read in your dashboard language", WL.map(([w, l]) => sbMsg("SB-2", w, l))),
      row("SB-3 Message whose direction differs from the dashboard (Arabic in English; English in Arabic)", WL.map(([w, l]) => sbMsg("SB-3", w, l))),
      row("SB-4 Italian customer message (outside the four languages)", WL.map(([w, l]) => sbMsg("SB-4", w, l))),
      row("SB-5 Message in your own language: unchanged", WL.map(([w, l]) => sbMsg("SB-5", w, l))),
      row("SB-6 Translation pending", WL.map(([w, l]) => sbMsg("SB-6", w, l))),
      row("SB-7 Translation failed", WL.map(([w, l]) => sbMsg("SB-7", w, l))),
      row("SB-8 Reply box, empty", WL.map(([w, l]) => sbReply("SB-8", w, l))),
      row("SB-9 Reply typed: the customer gets it in their language, your text below", WL.map(([w, l]) => sbReply("SB-9", w, l))),
      row("SB-10 Button pressed while the translation is still running", WL.map(([w, l]) => sbReply("SB-10", w, l))),
      row("SB-11 Translation failed: the e-mail opened with your text as written", WL.map(([w, l]) => sbReply("SB-11", w, l))),
      row("SB-12 Customer language outside the four: your text goes as written", WL.map(([w, l]) => sbReply("SB-12", w, l))),
      row("SB-13a Too long for the mail link", WL.map(([w, l]) => sbReply("SB-13a", w, l))),
      row("SB-13b Translation ready after the click lapsed", WL.map(([w, l]) => sbReply("SB-13b", w, l))),
      row("SB-14 Closed ticket", WL.map(([w, l]) => sbReply("SB-14", w, l)))],
    aux: [sbMail("ready", "en"), sbMail("ready", "ar"), sbMail("failed", "en"), sbMail("raw", "en"), sbMail("toolong", "en"), sbMail("toolong", "ar"), sbMail("wait", "en")] },
  { n: "c", base: "sheet-c-review-translate", title: "Phase 32 · C · Home review card: translate on tap",
    rows: [row("SC-1 Before (today): the card", WL.map(([w, l]) => sc("SC-2", w, l, "before"))),
      row("SC-2 After: review in another language, button Translate", WL.map(([w, l]) => sc("SC-2", w, l))),
      row("SC-3 Same language and unknown language: no button, card as today", WL.map(([w, l]) => sc("SC-3", w, l))),
      row("SC-4 Waiting", WL.map(([w, l]) => sc("SC-4", w, l))),
      row("SC-5 Translated: the button says Show original", WL.map(([w, l]) => sc("SC-5", w, l))),
      row("SC-6 Not available: Try again", WL.map(([w, l]) => sc("SC-6", w, l)))],
    aux: [scDrift()] },
];
for (const sh of sheets) {
  if (ONLY.length && !ONLY.includes(sh.n)) continue;
  let all = true;
  for (const r of sh.rows) for (const s of r.specs) if (!(await frame(s))) all = false;
  for (const s of sh.aux) if (!(await frame(s))) all = false;
  await compose(sh.base, sh.title + (all ? "" : " — DRAFT, a frame failed"), sh.rows.map((r) => ({ title: r.title, frames: r.specs.map((s) => ({ file: s.file, w: s.w, caption: s.caption })) })));
}
console.log("\nPER SHEET " + JSON.stringify(perSheet));
console.log("\nSHEETS\n" + sizes.join("\n"));
console.log("\nCOVERAGE " + JSON.stringify(coverageOut));
writeFileSync(join(FR, "coverage.json"), JSON.stringify(coverageOut, null, 1));
await browser.close();
after.server.close();
before.server.close();
console.log(`\n${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
