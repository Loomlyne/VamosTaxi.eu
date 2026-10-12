// Offline render harness for the Phase 32 signing pictures (automatic translator).
//   git apply .planning/phases/32-auto-translate/32-prototype-wip.patch   (the "after" markup)
//   node .planning/phases/32-auto-translate/tools/render.mjs [sheet numbers, e.g. 1 3]
//   git checkout -- app                                                    (prototype off again)
// "Before" = git archive of BEFORE_REF (default HEAD) synced into a scratch public folder; "after" = this
// worktree (prototype) synced into apps/web/public. Both are served on free local ports from the real ops shell
// (base href + auth flag), every /api/* answer is stubbed (stubs.mjs), each frame is cropped and asserted on the
// DOM (common C1-C10 from 32-UI-SPEC.md § Signing plus each crop's own), then bare sheets (no frames, plain white
// ground) are composed into ../screens (individual frames in ../screens/frames). Exit 1 on any FAIL.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { serve } from "./serve.mjs";
import * as S from "./stubs.mjs";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const PH = join(repo, ".planning/phases/32-auto-translate");
const OUT = join(PH, "screens");
const FR = join(OUT, "frames");
const require = createRequire(join(S.DEPS, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
mkdirSync(FR, { recursive: true });
const BEFORE_REF = process.env.BEFORE_REF || "HEAD";
const ONLY = process.argv.slice(2).map(Number).filter(Boolean);

// ---------- copy: the same T strings the prototype renders (for assertions) ----------
function loadDict(file) {
  const window = {}; const ctx = { window, console };
  vm.createContext(ctx); vm.runInContext(readFileSync(file, "utf8"), ctx);
  return window.VamosI18n;
}
const DICT = loadDict(join(repo, "app/vamos-i18n-dict.js"));
const COPY = JSON.parse(readFileSync(process.env.P32_STRINGS || join(PH, "tools/strings.json"), "utf8"));
// camelCase key names only (plain-word keys such as "save" are ordinary words in the copy itself)
const KEYS = [...new Set(COPY.flatMap((g) => g.rows.map((r) => r[0])))].filter((k) => /[A-Z]/.test(k));
/** T(key, lang): the copy row for key ('en' or 'ar' frames). */
function T(key, lang) {
  for (const g of COPY) for (const r of g.rows) if (r[0] === key) return r[{ en: 1, de: 2, fr: 3, ar: 4 }[lang]];
  throw new Error("no copy key " + key);
}
const up = (x) => String(x).toLocaleUpperCase();
const COLORS = readFileSync(join(repo, "design-system/tokens/colors.css"), "utf8");
const hex = (name) => (COLORS.match(new RegExp(`--vt-${name}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1];
const rgb = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const BANNED_BG = ["yellow-50", "yellow-100", "yellow-200", "yellow-300"].map((n) => rgb(hex(n)));
const BANNED_FG = ["yellow-600", "yellow-700"].map((n) => rgb(hex(n)));
const YELLOW = rgb(hex("yellow"));

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
const relaxed = new Set();
const LANGNAME = { en: "English", ar: "Arabic dashboard" };
const squash = (x) => String(x || "").replace(/\s+/g, " ").trim();

/** Common assertions C1, C2, C4-C7, C9, C10 on the crop root (and extra roots such as a toast). */
async function common(page, roots, lang, allowYellow) {
  return page.evaluate(({ roots, lang, BANNED_BG, BANNED_FG, YELLOW, KEYS, allowYellow }) => {
    const out = [];
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
      if (e.matches("button, a, input, textarea, [role=tab], [data-tr-row]")) {
        if (e.closest(".vt-dialog__head .vt-iconbtn")) continue; // kit Dialog close (IconButton sm, 32 px), unchanged by this phase
        let box = e.getBoundingClientRect();
        if (e.matches("input, textarea") && e.closest(".vt-input")) box = e.closest(".vt-input").getBoundingClientRect();
        if (box.height + 0.5 < 44) small.push(`${e.tagName}${e.getAttribute("aria-label") ? "[" + e.getAttribute("aria-label") + "]" : ""} ${Math.round(box.height)}px "${squash(e.textContent).slice(0, 24)}"`);
      }
      if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && !e.closest("[data-tr-cell]") && !e.matches("textarea, input") && cs.overflowX !== "visible") over.push(e.tagName + "." + [...e.attributes].map((a) => a.name).filter((n) => n.startsWith("data-")).join(","));
    }
    function squash(x) { return String(x || "").replace(/\s+/g, " ").trim(); }
    out.push(["C4 neutral shadows only" + (badShadow.length ? ": " + badShadow.slice(0, 3).join(" | ") : ""), badShadow.length === 0]);
    out.push(["C5 no tinted yellow, yellow only on the allowed CTA" + (badYellow.length ? ": " + badYellow.slice(0, 3).join(" | ") : ""), badYellow.length === 0]);
    out.push(["C6 controls >= 44 px" + (small.length ? ": " + small.slice(0, 4).join(" | ") : ""), small.length === 0]);
    const text = els.map((e) => e.innerText).join("\n");
    const vendor = /gemma|google|cloudflare|workers|m2m|openai|anthropic|claude|gpt/i.test(text) || /\bAI\b/.test(text);
    out.push(["C7 no vendor/model name, no ß", !vendor && !/ß/.test(text)]);
    out.push(["C9 no clipped overflow" + (over.length ? ": " + over.slice(0, 3).join(" | ") : ""), over.length === 0]);
    const keyHit = KEYS.filter((k) => new RegExp("\\b" + k + "\\b").test(text));
    out.push(["C10 no key names, no {{" + (keyHit.length ? ": " + keyHit.join(",") : ""), !keyHit.length && !text.includes("{{")]);
    return out;
  }, { roots, lang, BANNED_BG, BANNED_FG, YELLOW, KEYS, allowYellow: allowYellow || [] });
}

/** One frame. spec: {sheet, file, base, w, lang, path, state, caption, prep(page), crop: {roots:[sel], grow?}, checks(page)->[[label,bool]], coverage?: [sel], allowYellow?:[sel]} */
async function frame(spec) {
  const { w, lang } = spec;
  const ctx = await browser.newContext({ viewport: { width: w, height: w <= 480 ? 844 : 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", locale: lang === "ar" ? "ar" : "en-GB" });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); localStorage.setItem("vamosOpsAuth", "1"); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  const log = [];
  await S.installStubs(page, Object.assign({ dict: DICT.strings, dash: lang }, spec.state), log);
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
    let checks = await common(page, spec.crop.roots, lang, spec.allowYellow);
    if (spec.before) checks = checks.map(([l, p]) => l.startsWith("C6") && !p ? [l + " (before = today's UI, not changed here; not counted)", true] : [l, p]);
    for (const c of await spec.checks(page)) checks.push(c);
    checks.push(["C8 no page error" + (errors.length ? ": " + errors[0] : ""), errors.length === 0]);
    for (const [label, pass] of checks) { results.push(`${pass ? "ok" : "NO"} ${label}`); if (!pass) ok = false; }
    await page.screenshot({ path: join(FR, spec.file), clip, fullPage: true });
    results.push(`ok shot ${Math.round(clip.width)}x${Math.round(clip.height)} css px`);
    if (spec.coverage && lang === "en") {
      const out = {};
      for (const l of ["de", "fr", "ar"]) {
        out[l] = await page.evaluate(({ sels, l }) => {
          const miss = [];
          for (const e of sels.flatMap((s) => [...document.querySelectorAll(s)])) { const r = window.VamosLocale.coverage(e, l); miss.push(...Object.keys(r.strings || {}), ...Object.keys(r.attrs || {})); }
          return [...new Set(miss)];
        }, { sels: spec.coverage, l });
      }
      coverageOut[spec.file] = out;
      const n = out.de.length + out.fr.length + out.ar.length;
      results.push(`${n === 0 ? "ok" : "NO"} C3 coverage empty ${n ? JSON.stringify(out) : ""}`);
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

/** Bare sheet: rows of crops on a plain white ground, whitespace only, a caption above each. Split into parts
 *  when a part would pass ~12000 px tall or ~1.5 MB. */
async function compose(base, title, rows) {
  const render = async (file, partRows, partTitle) => {
    const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}body{padding:40px 48px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1e1f1f;width:max-content}
h1{font-size:22px;font-weight:600;margin:0 0 24px}h2{font-size:17px;font-weight:600;margin:36px 0 14px;max-width:1500px}.wrap{display:flex;flex-wrap:nowrap;gap:32px 44px;align-items:flex-start}figure{margin:0}.cap{font-size:14px;margin-bottom:8px;color:#555}img{display:block;border:0;outline:0;box-shadow:none}</style>
<h1>${partTitle}</h1>` + partRows.map((r) => `<h2>${r.title}</h2><div class="wrap">` + r.frames.filter((f) => { try { statSync(join(FR, f.file)); return true; } catch { return false; } }).map((f) => {
      const b64 = readFileSync(join(FR, f.file)).toString("base64");
      return `<figure><div class="cap">${f.caption}</div><img src="data:image/png;base64,${b64}" style="width:${f.w <= 480 ? 300 : 620}px"></figure>`;
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
  // Greedy: as many rows per part as fit; letters a, b, c… only when it splits.
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
    const suffix = groups.length > 1 ? String.fromCharCode(97 + n++) : "";
    const file = base.replace(/^(sheet-\d)/, "$1" + suffix) + ".png";
    const r = await render(file, g, title + (suffix ? ` (part ${suffix})` : ""));
    sizes.push(`${file} ${r.dim[0]}x${r.dim[1]} px, ${r.bytes} B`);
  }
}

// ---------- helpers for prep ----------
const W = (w) => w >= 1240;
async function clickSel(page, sel, timeout = 8000) { await page.waitForSelector(sel, { state: "visible", timeout }); await page.locator(sel).first().click(); }
async function openLine(page, w, id) {
  await clickSel(page, W(w) ? `[data-tr-en][data-id="${id}"]` : `[data-tr-row][data-id="${id}"]`);
  await page.waitForSelector("[data-tr-editor]", { timeout: 5000 });
}
async function pickSelect(page, rootSel, index) {
  await clickSel(page, `${rootSel} [data-vs-btn]`);
  await page.waitForSelector("[data-vs-pop] [data-vs-opt]", { timeout: 4000 });
  await page.locator("[data-vs-pop] [data-vs-opt]").nth(index).click();
}
const text = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((e) => e.innerText).join("\n"), sel);
const has = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.getClientRects().length), sel);
const count = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).length, sel);
const maskIn = (page, sel, icon) => page.evaluate(({ s, icon }) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).some((root) => [root, ...root.querySelectorAll("*")].some((e) => (e.style.maskImage || e.style.webkitMaskImage || "").includes(icon + ".svg"))), { s: sel, icon });
const noAnim = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].every((e) => [e, ...e.querySelectorAll("*")].every((x) => x.getAnimations().length === 0)), sel);

// ---------- sheet 1 and 2: Translations ----------
const LIST_CROP = { roots: ["[data-vt-content] > header", "[data-tr-page]"], grow: true };
function trFrame(sheet, id, w, lang, o) {
  return {
    sheet, file: `s${sheet}-${id}-${w}-${lang}.png`, base: o.base || after.base, w, lang, path: o.path || "/pages", state: o.state || {},
    caption: `${w} · ${LANGNAME[lang]}${o.cap ? " · " + o.cap : ""}`,
    prep: o.prep || (async (page) => { await page.waitForSelector(W(w) ? "[data-tr-wide] tbody tr" : "[data-tr-row]", { state: "visible", timeout: 10000 }); }),
    crop: o.crop || LIST_CROP, checks: o.checks || (async () => []), coverage: o.coverage, allowYellow: o.allowYellow || ["[data-tr-save]"],
  };
}
const listReady = (w) => async (page) => { await page.waitForSelector(W(w) ? "[data-tr-wide] tbody tr" : "[data-tr-row]", { state: "visible", timeout: 10000 }); };
function s1(id, w, lang) {
  const L = (k) => T(k, lang);
  if (id === "1.1") return trFrame(1, id, w, lang, {
    cap: "default list, All",
    coverage: ["[data-vt-content] > header", "[data-tr-tools]", "[data-tr-list]"],
    checks: async (page) => {
      const out = [];
      if (W(w)) {
        const th = await page.$$eval("[data-tr-wide] th", (a) => a.map((e) => e.innerText.trim()));
        out.push([`4 th ${JSON.stringify(th)}`, th.length === 4 && th[0].toLocaleUpperCase() === up(L("colEn")) && th[3].toLocaleUpperCase() === up(L("colAr"))]);
        out.push(["≥4 tr", (await count(page, "[data-tr-wide] tbody tr")) >= 4]);
      } else {
        out.push(["≥4 rows", (await count(page, "[data-tr-row]")) >= 4]);
        const tabs = await page.$$eval("[data-tr-langtabs] [role=tab]", (a) => a.map((e) => e.getAttribute("aria-selected")));
        out.push([`3 language tabs, one selected ${JSON.stringify(tabs)}`, tabs.length === 3 && tabs.filter((x) => x === "true").length === 1]);
        out.push(["filter is a BrandSelect at 390", (await has(page, "[data-tr-filter-sel] [data-vs-btn]")) && !(await has(page, "[data-tr-filter-tabs] [role=tab]"))]);
      }
      const scope = W(w) ? "[data-tr-wide]" : "[data-tr-narrow]";
      const marks = await page.evaluate((sc) => [...document.querySelectorAll(sc + " [data-tr-mark=machine]")].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()), scope);
      out.push([`machine marks read ${up(L("markMachine"))}`, marks.length > 0 && marks.every((m) => m === up(L("markMachine")))]);
      if (W(w)) {
        out.push(["yours cell (mixed fr) has no mark", !(await has(page, `[data-tr-en][data-id="ln-mixed"]`)) ? false : await page.evaluate(() => { const tr = document.querySelector('[data-tr-en][data-id="ln-mixed"]').closest("tr"); return !tr.querySelector('[data-tr-cell="fr"] [data-tr-mark]'); })]);
        out.push(["failed cell: danger mark + Shows English", await page.evaluate((se) => { const tr = document.querySelector('[data-tr-en][data-id="ln-mixed"]').closest("tr"); const c = tr.querySelector('[data-tr-cell="ar"]'); return !!c.querySelector("[data-tr-mark=failed]") && c.innerText.includes(se); }, L("shownEnglish"))]);
        out.push(["locked row: lock badge, no machine mark", await page.evaluate(() => { const tr = document.querySelector('[data-tr-en][data-id="ln-legal"]').closest("tr"); const b = tr.querySelector("[data-tr-mark=locked]"); return !!b && [...b.querySelectorAll("*")].some((x) => (x.style.maskImage || x.style.webkitMaskImage || "").includes("lock.svg")) && !tr.querySelector("[data-tr-mark=machine]"); })]);
      } else {
        out.push(["failed (de tab has none) / locked badge with lock mask", await maskIn(page, '[data-tr-row][data-id="ln-legal"] [data-tr-mark=locked]', "lock")]);
      }
      const en = await page.evaluate((sc) => [...document.querySelectorAll(sc + ' [data-tr-cell="en"] [data-tr-src]')].filter((e) => e.getClientRects().length).map((e) => [e.innerText, e.hasAttribute("data-vt-no-i18n"), e.getAttribute("lang"), e.getAttribute("dir")]), scope);
      out.push(["English cells stay English, no-i18n, lang=en dir=ltr", en.length > 0 && en.every(([t, n, l, d]) => /[A-Za-z]/.test(t) && !/[؀-ۿ]/.test(t) && n && l === "en" && d === "ltr")]);
      if (W(w)) {
        const ar = await page.evaluate(() => [...document.querySelectorAll('[data-tr-wide] [data-tr-cell="ar"] [data-tr-txt]')].filter((e) => e.textContent && e.getAttribute("lang") === "ar").map((e) => e.getAttribute("dir")));
        out.push(["Arabic cell text dir=rtl lang=ar", ar.length > 0 && ar.every((d) => d === "rtl")]);
        const ltr = await page.evaluate(() => [...document.querySelectorAll('[data-tr-wide] [data-tr-cell="de"] [data-tr-txt], [data-tr-wide] [data-tr-cell="fr"] [data-tr-txt]')].every((e) => e.getAttribute("dir") === "ltr"));
        out.push(["German/French cells dir=ltr", ltr]);
        out.push(["tab counts in .vt-dir-keep", (await count(page, "[data-tr-filter-tabs] [role=tab] .vt-dir-keep")) === 4]);
      }
      const bdi = await page.evaluate((sc) => [...document.querySelectorAll(sc + " [data-tr-src], " + sc + " [data-tr-txt]")].filter((e) => e.getClientRects().length && /%n|ZRH|VT-4821/.test(e.textContent)).every((e) => [...e.querySelectorAll("bdi.vt-dir-keep")].length > 0), scope);
      out.push(["placeholder tokens inside bdi.vt-dir-keep", bdi]);
      return out;
    },
  });
  if (id === "1.2") return trFrame(1, id, w, lang, {
    cap: "loading", state: { tr: "hang" }, coverage: ["[data-tr-tools]"],
    prep: async (page) => { await page.waitForSelector(W(w) ? "[data-tr-wide] [data-tr-skel]" : "[data-tr-narrow] [data-tr-skel]", { state: "visible", timeout: 8000 }); },
    checks: async (page) => [
      [`8 visible skeleton rows (${await count(page, "[data-tr-skel]")})`, (await count(page, "[data-tr-skel]")) === 8],
      ["list aria-busy=true", await has(page, '[data-tr-list][aria-busy="true"]')],
      ["toolbar present, search enabled", (await has(page, "[data-tr-search] input")) && !(await page.locator("[data-tr-search] input").isDisabled())],
      ["no row text", !(await has(page, "[data-tr-src]"))],
      ["no animation under reduced motion", await noAnim(page, "[data-tr-list]")],
    ],
  });
  if (id === "1.3") return trFrame(1, id, w, lang, {
    cap: "search with no match", coverage: ["[data-tr-empty]"],
    prep: async (page) => { await listReady(w)(page); await page.locator("[data-tr-search] input").fill("taxi rank"); await page.waitForSelector('[data-tr-empty="nomatch"]', { timeout: 6000 }); },
    checks: async (page) => [
      ["no-match title", (await text(page, "[data-tr-empty]")).includes(L("noMatchTitle"))],
      ["Clear filters button ≥44 px", await page.evaluate(() => { const b = document.querySelector("[data-tr-empty] button"); return !!b && b.getBoundingClientRect().height >= 44; })],
      ["search holds the query", (await page.locator("[data-tr-search] input").inputValue()) === "taxi rank"],
    ],
  });
  if (id === "1.4") return trFrame(1, id, w, lang, {
    cap: "load error", state: { tr: "error" }, coverage: ["[data-tr-err]"],
    prep: async (page) => { await page.waitForSelector("[data-tr-err]", { timeout: 8000 }); },
    checks: async (page) => [
      ["danger Alert with loadError", await page.evaluate((m) => { const a = document.querySelector("[data-tr-err] .vt-alert--danger"); return !!a && a.innerText.includes(m); }, L("loadError"))],
      ["Try again button", (await text(page, "[data-tr-err] button")).toLocaleUpperCase().includes(up(L("tryAgain")))],
      ["toolbar present", await has(page, "[data-tr-bar]")],
    ],
  });
  if (id === "1.5") return trFrame(1, id, w, lang, {
    cap: "Failed filter, nothing failed", state: { lines: "nofailed" }, coverage: ["[data-tr-empty]", "[data-tr-tools]"],
    prep: async (page) => {
      await listReady(w)(page);
      if (w <= 480) await pickSelect(page, "[data-tr-filter-sel]", 3);
      else await page.locator("[data-tr-filter-tabs] [role=tab]").nth(3).click();
      await page.waitForSelector('[data-tr-empty="failed"]', { timeout: 6000 });
    },
    checks: async (page) => [
      [w <= 480 ? "select shows Failed" : "Failed tab selected", w <= 480 ? (await text(page, "[data-tr-filter-sel] [data-vs-btn]")).includes(L("fFailed")) : await page.evaluate(() => document.querySelectorAll("[data-tr-filter-tabs] [role=tab]")[3].getAttribute("aria-selected") === "true")],
      ["emptyFailedTitle", (await text(page, "[data-tr-empty]")).includes(L("emptyFailedTitle"))],
    ],
  });
  if (id.startsWith("1.6")) {
    const tab = id === "1.6b" ? 1 : 0;
    const rowsSel = W(w) ? ['[data-tr-wide] thead', '[data-tr-en][data-id="ln-pending"]', '[data-tr-en][data-id="ln-stale"]'] : [`[data-tr-row][data-id="${tab ? "ln-stale" : "ln-pending"}"]`];
    return trFrame(1, id, w, lang, {
      cap: W(w) ? "de translating, fr English changed" : tab ? "French tab: English changed" : "German tab: translating",
      crop: { roots: W(w) ? ["[data-tr-wide] thead", '[data-tr-wide] tr:has([data-id="ln-pending"])', '[data-tr-wide] tr:has([data-id="ln-stale"])'] : rowsSel, margin: 16 },
      coverage: W(w) ? ['[data-tr-wide] tr:has([data-id="ln-pending"])', '[data-tr-wide] tr:has([data-id="ln-stale"])'] : rowsSel,
      prep: async (page) => { await listReady(w)(page); if (!W(w) && tab) await page.locator("[data-tr-langtabs] [role=tab]").nth(1).click(); await page.waitForTimeout(200); },
      checks: async (page) => {
        const out = [];
        const pend = W(w) ? '[data-tr-wide] tr:has([data-id="ln-pending"]) [data-tr-cell="de"]' : '[data-tr-row][data-id="ln-pending"] [data-tr-cell="de"]';
        const stale = W(w) ? '[data-tr-wide] tr:has([data-id="ln-stale"]) [data-tr-cell="fr"]' : '[data-tr-row][data-id="ln-stale"] [data-tr-cell="fr"]';
        if (W(w) || !tab) {
          out.push(["pending cell: Translating… line with loader mask", (await text(page, pend + " [data-tr-meta]")).includes(L("translating")) && (await maskIn(page, pend, "loader-circle"))]);
          out.push(["pending cell: no badge, shows served text", !(await has(page, pend + " [data-tr-mark]")) && (await text(page, pend + " [data-tr-txt]")).includes("Wartezeit")]);
          out.push(["no animation under reduced motion", await noAnim(page, pend)]);
        }
        if (W(w) || tab) out.push(["stale cell: English-changed line with info mask, text kept", (await text(page, stale)).includes(L("englishChanged")) && (await maskIn(page, stale, "info")) && (await text(page, stale + " [data-tr-txt]")).includes("Siège enfant")]);
        return out;
      },
    });
  }
}
function s2(id, w, lang) {
  const L = (k) => T(k, lang);
  const ED = { roots: [".vt-dialog:has([data-tr-editor])"], margin: 12 };
  const dlgW = async (page) => [[`dialog width ≤ innerWidth-16 at 390`, w > 480 || (await page.evaluate(() => document.querySelector(".vt-dialog").getBoundingClientRect().width <= innerWidth - 16))],
    ["footer visible without page scroll", await page.evaluate(() => { const f = document.querySelector(".vt-dialog__foot"); const r = f.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })]];
  const edit = async (page, l, v) => { await page.locator(`textarea[data-tr-input="${l}"]`).fill(v); };
  const DE_EDIT = "Ihr Fahrer wartet %n Minuten nach der Landung in ZRH.";
  if (id === "2.1") return trFrame(2, id, w, lang, {
    cap: "mixed line: de machine, fr yours, ar failed", crop: ED, coverage: [".vt-dialog"],
    prep: async (page) => { await listReady(w)(page); await openLine(page, w, "ln-mixed"); },
    checks: async (page) => [
      ["dialog title", (await text(page, ".vt-dialog__title")) === L("edTitle")],
      ["English block lang=en dir=ltr", await has(page, '[data-tr-src-block][lang="en"][dir="ltr"]')],
      ["three fields", (await count(page, "[data-tr-field]")) === 3],
      ["de machine badge", (await text(page, '[data-tr-field="de"] [data-fld-mark] .vt-badge')) === up(L("markMachine"))],
      ["fr no mark, hintYours", !(await has(page, '[data-tr-field="fr"] [data-fld-mark] .vt-badge')) && (await text(page, '[data-tr-field="fr"] .vt-field__hint')) === L("hintYours")],
      ["ar danger mark, info Alert, empty rtl textarea", (await has(page, '[data-tr-field="ar"] .vt-badge--danger')) && (await text(page, "[data-tr-fail-why] , .vt-alert--info")).includes(L("failedExplain")) && (await page.evaluate(() => { const t = document.querySelector('textarea[data-tr-input="ar"]'); return t.value === "" && t.dir === "rtl" && t.lang === "ar"; }))],
      ["Save translations disabled", await page.locator("[data-tr-save]").isDisabled()],
      ["Close and Save ≥44 px", await page.evaluate(() => [...document.querySelectorAll(".vt-dialog__foot .vt-btn")].every((b) => b.getBoundingClientRect().height >= 44))],
      ...(await dlgW(page)),
    ],
  });
  if (id === "2.2") return trFrame(2, id, w, lang, {
    cap: "locked legal line", crop: ED, coverage: [".vt-dialog"],
    prep: async (page) => { await listReady(w)(page); await openLine(page, w, "ln-legal"); },
    checks: async (page) => [
      ["no textarea", !(await has(page, ".vt-dialog textarea"))],
      ["three read-only blocks (+ English)", (await count(page, "[data-tr-ro]")) === 4],
      ["info Alert lockedLegal", (await text(page, ".vt-dialog .vt-alert--info")).includes(L("lockedLegal"))],
      ["one Close, no Save", (await count(page, ".vt-dialog__foot .vt-btn")) === 1 && !(await has(page, "[data-tr-save]")) && (await text(page, ".vt-dialog__foot")).toLocaleUpperCase().includes(up(L("closeBtn")))],
      ["blocks muted", await page.evaluate(() => [...document.querySelectorAll('[data-tr-ro]:not([data-tr-ro-lang="en"]) [data-tr-src-block]')].every((e) => e.getAttribute("data-muted") === "1"))],
      ...(await dlgW(page)),
    ],
  });
  if (id === "2.3") return trFrame(2, id, w, lang, {
    cap: "de edited, fr missing placeholders", crop: ED, coverage: [".vt-dialog"],
    prep: async (page) => { await listReady(w)(page); await openLine(page, w, "ln-mixed"); await edit(page, "de", DE_EDIT); await edit(page, "fr", "Votre chauffeur attend après l’atterrissage."); },
    checks: async (page) => [
      ["de: no mark, hintYours", !(await has(page, '[data-tr-field="de"] [data-fld-mark] .vt-badge')) && (await text(page, '[data-tr-field="de"] .vt-field__hint')) === L("hintYours")],
      ["fr: error with tokens in .vt-dir-keep", (await text(page, '[data-tr-field="fr"] .vt-field__err .vt-dir-keep')).includes("%n") && (await has(page, '[data-tr-field="fr"] .vt-input--error'))],
      ["Save translations enabled", !(await page.locator("[data-tr-save]").isDisabled())],
      ["error on the inline start side", await page.evaluate((ar) => { const e = document.querySelector('[data-tr-field="fr"] .vt-field__err'); const f = e.closest("[data-tr-field]").getBoundingClientRect(); const r = e.getBoundingClientRect(); return ar ? Math.abs(r.right - f.right) < 2 : Math.abs(r.left - f.left) < 2; }, lang === "ar")],
    ],
  });
  if (id === "2.4") return trFrame(2, id, w, lang, {
    cap: "saving", state: { patch: "hang" }, crop: ED, coverage: [".vt-dialog"],
    prep: async (page) => { await listReady(w)(page); await openLine(page, w, "ln-mixed"); await edit(page, "de", DE_EDIT); await page.locator("[data-tr-save]").click(); await page.waitForTimeout(300); },
    checks: async (page) => [
      ["textareas and Close disabled", await page.evaluate(() => [...document.querySelectorAll(".vt-dialog textarea")].every((t) => t.disabled) && document.querySelector("[data-tr-close]").disabled)],
      ["Save disabled, label Saving…, loader mask", (await page.locator("[data-tr-save]").isDisabled()) && (await text(page, "[data-tr-save]")).includes(up(L("saving"))) && (await maskIn(page, "[data-tr-save]", "loader-circle"))],
    ],
  });
  if (id === "2.5") return trFrame(2, id, w, lang, {
    cap: "save failed", state: { patch: "error" }, crop: ED, coverage: [".vt-dialog"],
    prep: async (page) => { await listReady(w)(page); await openLine(page, w, "ln-mixed"); await edit(page, "de", DE_EDIT); await page.locator("[data-tr-save]").click(); await page.waitForSelector("[data-tr-save-err]", { timeout: 5000 }); },
    checks: async (page) => [
      ["danger Alert saveError at top", (await text(page, "[data-tr-save-err]")).includes(L("saveError")) && (await page.evaluate(() => document.querySelector("[data-tr-editor]").firstElementChild.contains(document.querySelector("[data-tr-save-err]")) || document.querySelector("[data-tr-editor]").querySelector("[data-tr-save-err]") === document.querySelector("[data-tr-editor] > *")))],
      ["fields keep the typed text", (await page.locator('textarea[data-tr-input="de"]').inputValue()) === DE_EDIT],
      ["Save enabled", !(await page.locator("[data-tr-save]").isDisabled())],
    ],
  });
  if (id === "2.6") return trFrame(2, id, w, lang, {
    cap: "saved: mark gone, toast", crop: { roots: ["[data-vt-content] > header", "[data-tr-page]", "[data-tr-toast] .vt-toast"], grow: true }, coverage: ["[data-tr-toast]"],
    prep: async (page) => { await listReady(w)(page); await openLine(page, w, "ln-mixed"); await edit(page, "de", DE_EDIT); await page.locator("[data-tr-save]").click(); await page.waitForSelector("[data-tr-toast]", { timeout: 5000 }); await page.waitForTimeout(250); },
    checks: async (page) => [
      ["saved de cell has no machine mark", W(w) ? await page.evaluate(() => !document.querySelector('[data-tr-en][data-id="ln-mixed"]').closest("tr").querySelector('[data-tr-cell="de"] [data-tr-mark=machine]')) : !(await has(page, '[data-tr-row][data-id="ln-mixed"] [data-tr-mark=machine]'))],
      ["Toast with saved", (await text(page, "[data-tr-toast]")).includes(L("saved"))],
      ["focus on the row's button", await page.evaluate((wide) => { const a = document.activeElement; return !!a && a.getAttribute("data-id") === "ln-mixed" && a.matches(wide ? "[data-tr-en]" : "[data-tr-row]"); }, W(w))],
    ],
  });
}

// ---------- sheet 3: Pricing extras ----------
async function openExtras(page, how) {
  await page.waitForSelector("[data-set-item]", { timeout: 10000 });
  await page.locator("[data-set-item]").nth(2).click();
  await page.waitForTimeout(500);
  if (how === "new") {
    const ok = await page.evaluate(() => { const b = [...document.querySelectorAll("[data-price-pane] .vt-btn")].find((x) => x.getClientRects().length && [...x.querySelectorAll("*")].some((i) => (i.style.maskImage || i.style.webkitMaskImage || "").includes("plus.svg"))); if (!b) return false; b.click(); return true; });
    if (!ok) throw new Error("no add button");
  } else {
    await page.waitForSelector("[data-price-pane] tbody tr", { state: "visible", timeout: 8000 });
    const ok = await page.evaluate(() => { const b = [...document.querySelectorAll("[data-price-pane] tbody tr button")].find((x) => x.getClientRects().length && [...x.querySelectorAll("*")].some((i) => (i.style.maskImage || i.style.webkitMaskImage || "").includes("pencil.svg"))); if (!b) return false; b.click(); return true; });
    if (!ok) throw new Error("no edit button");
  }
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  await page.waitForTimeout(300);
}
function s3(id, w, lang, kind) {
  const L = (k) => T(k, lang);
  const isBefore = kind === "before";
  const state = { surcharges: id === "3.1" ? [] : [S.extra({ "3.2": "machine", "3.3": "mixed", "3.4": "pending", "3.5": "stale" }[id] || "machine")] };
  const fld = (k) => `[data-fld-key="${k}"]`;
  const hint = (page, k) => text(page, `${fld(k)} .vt-field__hint`);
  const disjoint = (page, keys) => page.evaluate((keys) => keys.every((k) => {
    const w = document.querySelector(`[data-fld-key="${k}"]`); const m = w && w.querySelector("[data-fld-mark]"); const lab = w && w.querySelector(".vt-field__label");
    if (!m || !lab || !m.getClientRects().length) return true;
    const range = document.createRange(); range.selectNodeContents(lab); const a = range.getBoundingClientRect(); const b = m.getBoundingClientRect();
    return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
  }), keys);
  return {
    before: isBefore, sheet: 3, file: `s3-${isBefore ? "before" : id}-${w}-${lang}.png`, base: isBefore ? before.base : after.base, w, lang, path: "/pricing", state,
    caption: `${w} · ${LANGNAME[lang]}`,
    prep: async (page) => { await openExtras(page, id === "3.1" ? "new" : "edit"); if (id === "3.3") await page.locator(`${fld("labelDe")} input`).fill("Kindersitz (ab 9 kg)"); await page.waitForTimeout(200); },
    crop: { roots: ['[role="dialog"]'], margin: 12 }, allowYellow: ['[role="dialog"] .vt-btn--primary'],
    coverage: isBefore ? null : [`${fld("labelDe")} [data-fld-mark]`, `${fld("labelFr")} [data-fld-mark]`, `${fld("labelAr")} [data-fld-mark]`, `${fld("labelDe")} .vt-field__hint`, `${fld("labelFr")} .vt-field__hint`, `${fld("labelAr")} .vt-field__hint`],
    checks: async (page) => {
      if (isBefore) return [["before: shared hint, no marks", !(await has(page, "[data-fld-mark]"))]];
      const out = [];
      const K = ["labelDe", "labelFr", "labelAr"];
      if (id === "3.1") {
        for (const k of K) out.push([`${k}: extraPending, no mark`, (await hint(page, k)) === L("extraPending") && !(await has(page, `${fld(k)} [data-fld-mark]`))]);
        out.push(["English name field unchanged (no mark)", !(await has(page, `${fld("name")} [data-fld-mark]`))]);
      }
      if (id === "3.2") {
        for (const k of K) out.push([`${k}: machine badge + extraMachine`, (await text(page, `${fld(k)} [data-fld-mark] .vt-badge`)) === up(L("markMachine")) && (await hint(page, k)) === L("extraMachine")]);
        out.push(["label and badge disjoint", await disjoint(page, K)]);
      }
      if (id === "3.3") {
        out.push(["de: no mark, extraYours", !(await has(page, `${fld("labelDe")} [data-fld-mark]`)) && (await hint(page, "labelDe")) === L("extraYours")]);
        out.push(["fr: machine mark, extraMachine", (await text(page, `${fld("labelFr")} .vt-badge`)) === up(L("markMachine")) && (await hint(page, "labelFr")) === L("extraMachine")]);
        out.push(["ar: danger badge markFailed, extraMissing", (await text(page, `${fld("labelAr")} .vt-badge--danger`)) === up(L("markFailed")) && (await hint(page, "labelAr")) === L("extraMissing")]);
        out.push(["label and badge disjoint", await disjoint(page, K)]);
      }
      if (id === "3.4") {
        for (const k of K) out.push([`${k}: Translating… line, loader mask, not a Badge`, (await text(page, `${fld(k)} [data-fld-mark]`)) === L("translating") && (await maskIn(page, `${fld(k)} [data-fld-mark]`, "loader-circle")) && !(await has(page, `${fld(k)} [data-fld-mark] .vt-badge`))]);
        out.push(["fields editable", await page.evaluate(() => ["labelDe", "labelFr", "labelAr"].every((k) => !document.querySelector(`[data-fld-key="${k}"] input`).disabled))]);
        out.push(["no animation under reduced motion", await noAnim(page, "[data-fld-mark]")]);
        out.push(["label and mark disjoint", await disjoint(page, K)]);
      }
      if (id === "3.5") {
        out.push(["de: no mark, englishChanged with info mask, text kept", !(await has(page, `${fld("labelDe")} [data-fld-mark]`)) && (await hint(page, "labelDe")) === L("englishChanged") && (await maskIn(page, `${fld("labelDe")} .vt-field__hint`, "info")) && (await page.locator(`${fld("labelDe")} input`).inputValue()) === "Kindersitz"]);
        out.push(["fr: machine mark", (await text(page, `${fld("labelFr")} .vt-badge`)) === up(L("markMachine"))]);
      }
      return out;
    },
  };
}

// ---------- sheet 4 and 5: Support ----------
async function openTicket(page, w) {
  if (w <= 860) { await page.waitForSelector("[data-tbl-scroll] tbody tr", { state: "visible", timeout: 10000 }); await page.locator("[data-tbl-scroll] tbody tr").first().click(); }
  else { await page.waitForSelector("[data-kb-body]", { state: "visible", timeout: 10000 }); await page.locator("[data-kb-body]").first().click(); }
  await page.waitForSelector("[data-msg]", { timeout: 6000 });
  await page.waitForTimeout(300);
}
function s4(id, w, lang, kind) {
  const isBefore = kind === "before";
  const tk = isBefore ? "de-ready" : { "4.1": "de-ready", "4.2": lang === "ar" ? "en-ready" : "ar-ready", "4.3": lang === "ar" ? "ar-same" : "en-same", "4.4": "de-failed", "4.5": "de-pending" }[id];
  const L = (k) => T(k, lang);
  const cap = isBefore ? "German customer message, today" : { "4.1": "German customer message", "4.2": lang === "ar" ? "English message, Arabic dashboard" : "Arabic customer message", "4.3": lang === "ar" ? "Arabic message, Arabic dashboard" : "English message, English dashboard", "4.4": "translation failed", "4.5": "translation pending" }[id];
  return {
    before: isBefore, sheet: 4, file: `s4-${isBefore ? "before" : id}-${w}-${lang}.png`, base: isBefore ? before.base : after.base, w, lang, path: "/support",
    state: { tickets: [S.ticket(tk, lang)] }, caption: `${w} · ${LANGNAME[lang]} · ${cap}`,
    prep: (page) => openTicket(page, w),
    crop: { roots: ['[data-msg][data-from="customer"]'], margin: 16 },
    coverage: isBefore ? null : ["[data-msg-from]", "[data-msg-note]"],
    checks: async (page) => {
      if (isBefore) return [["before: plain bubble", !(await has(page, "[data-msg-from]"))]];
      const b = '[data-msg][data-from="customer"]';
      const out = [];
      if (id === "4.1" || id === "4.2") {
        const order = await page.evaluate((b) => { const m = document.querySelector(b); const kids = [...m.querySelectorAll("[data-msg-tr],[data-msg-from],[data-msg-orig]")].map((e) => [...e.attributes].find((a) => a.name.startsWith("data-msg-")).name); return kids.join(","); }, b);
        out.push([`DOM order tr, from, orig (${order})`, order === "data-msg-tr,data-msg-from,data-msg-orig"]);
        out.push(["no Badge in the bubble", !(await has(page, b + " .vt-badge"))]);
        const o = await page.evaluate((b) => { const e = document.querySelector(b + " [data-msg-orig]"); const cs = getComputedStyle(e); const m = document.querySelector(b).getBoundingClientRect(); const r = e.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(e); const tr = range.getBoundingClientRect(); return { lang: e.lang, dir: e.dir, fs: parseFloat(cs.fontSize), col: cs.color, bt: cs.borderTopWidth, inside: r.left >= m.left - 0.5 && r.right <= m.right + 0.5, textRight: Math.abs(tr.right - r.right) < 3, textLeft: Math.abs(tr.left - r.left) < 3 }; }, b);
        const muted = await page.evaluate(() => { const p = document.createElement("span"); p.style.color = "var(--vt-text-muted)"; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; });
        out.push(["original ≤13 px, muted, hairline above", o.fs <= 13 && o.col === muted && o.bt === "1px"]);
        if (id === "4.1") {
          out.push([`from line ${lang === "en" ? '"Translated from German"' : "has الألمانية"}`, lang === "en" ? (await text(page, b + " [data-msg-from]")) === "Translated from German" : (await text(page, b + " [data-msg-from]")).includes("الألمانية")]);
          out.push(["original lang=de dir=ltr", o.lang === "de" && o.dir === "ltr"]);
          out.push(["translation present", (await text(page, b + " [data-msg-tr]")).length > 10]);
        } else if (lang === "en") {
          out.push(["original lang=ar dir=rtl, right-aligned, inside bubble", o.lang === "ar" && o.dir === "rtl" && o.textRight && o.inside]);
          out.push(["translation LTR", await page.evaluate((b) => document.querySelector(b + " [data-msg-tr]").dir === "ltr", b)]);
          out.push(["bubble does not scroll sideways", await page.evaluate((b) => { const m = document.querySelector(b); return m.scrollWidth <= m.clientWidth + 1; }, b)]);
        } else {
          out.push(["original lang=en dir=ltr, left-aligned, inside bubble", o.lang === "en" && o.dir === "ltr" && o.textLeft && o.inside]);
          out.push(["translation RTL", await page.evaluate((b) => document.querySelector(b + " [data-msg-tr]").dir === "rtl", b)]);
        }
      }
      if (id === "4.3") out.push(["no from line, no original", !(await has(page, b + " [data-msg-from]")) && !(await has(page, b + " [data-msg-orig]"))]);
      if (id === "4.4") out.push(["original in body, one trNotAvailable line, no Alert/button", (await has(page, b + " [data-msg-body]")) && (await text(page, b + " [data-msg-note]")) === L("trNotAvailable") && !(await has(page, b + " .vt-alert, " + b + " button"))]);
      if (id === "4.5") out.push(["original in body, Translating… with loader mask, no animation", (await has(page, b + " [data-msg-body]")) && (await text(page, b + " [data-msg-note]")) === L("translating") && (await maskIn(page, b + " [data-msg-note]", "loader-circle")) && (await noAnim(page, b + " [data-msg-note]"))]);
      return out;
    },
  };
}
function s5(id, w, lang, kind) {
  const isBefore = kind === "before";
  const L = (k) => T(k, lang);
  const arTicket = id === "5.4";
  const tk = S.ticket(arTicket ? "ar-same" : "de-ready", lang, id === "5.7");
  const replyTr = id === "5.2" ? "hang" : id === "5.6" ? "failed" : "ready";
  const typed = arTicket ? (lang === "ar" ? "نعم، يمكننا تجهيز مقعد طفل ليوم السبت." : S.REPLY_TEXT_SEAT) : S.REPLY_TEXT[lang];
  const cap = isBefore ? "today (read-only hint)" : { "5.1": "empty", "5.2": "translating", "5.3": "ready, machine", "5.4": lang === "ar" ? "Arabic customer, Arabic dashboard: same language" : "ready, target Arabic", "5.5": "preview edited", "5.6": "translation failed", "5.7": "closed ticket" }[id];
  const answer = "[data-ov-actions] [data-answer], [data-ov-actions] .vt-btn--primary";
  return {
    before: isBefore, sheet: 5, file: `s5-${isBefore ? "before" : id}-${w}-${lang}.png`, base: isBefore ? before.base : after.base, w, lang, path: "/support",
    state: { tickets: [tk], replyTr }, caption: `${w} · ${LANGNAME[lang]} · ${cap}`,
    prep: async (page) => {
      await openTicket(page, w);
      if (isBefore || id === "5.1" || id === "5.7") return;
      await page.locator("textarea[data-reply-text]").fill(typed);
      await page.waitForTimeout(1300);
      if (id === "5.5") { await page.waitForSelector("textarea[data-reply-out]", { timeout: 4000 }); await page.locator("textarea[data-reply-out]").fill("Ja, der Fahrer wartet am Ausgang mit einem Schild. Zwei Koffer sind kein Problem. Bis morgen."); await page.waitForTimeout(200); }
    },
    crop: { roots: ["[data-ov-foot]"], margin: 8 }, allowYellow: ["[data-answer]", "[data-ov-actions] .vt-btn--primary"],
    coverage: isBefore ? null : ["[data-reply]"],
    checks: async (page) => {
      if (isBefore) return [["before: read-only hint present", (await text(page, "[data-ov-foot]")).length > 0]];
      const out = [];
      const ansOff = () => page.locator("[data-ov-actions] [data-answer]").isDisabled();
      if (id === "5.1") {
        out.push(["reply textarea with aria-label + placeholder", await page.evaluate((l) => { const t = document.querySelector("textarea[data-reply-text]"); return !!t && t.getAttribute("aria-label") === l && !!t.placeholder; }, L("replyLabel"))]);
        const sel = await text(page, "[data-reply-lang] [data-vs-btn]");
        out.push([`Send in shows customer language with suffix ("${squash(sel)}")`, sel.includes(T("sendInCustomer", lang).replace("%s", "").trim())]);
        out.push(["no preview", !(await has(page, "[data-reply-preview]"))]);
        out.push(["ANSWER enabled", !(await ansOff())]);
        out.push(["old mailHint absent", !(await page.evaluate(() => /Read only|للقراءة فقط/.test(document.body.innerText)))]);
      }
      if (id === "5.2") {
        out.push(["preview with skeleton bar and Translating…", (await has(page, "[data-reply-preview] [data-tr-skel]")) && (await text(page, "[data-reply-preview]")).includes(L("translating"))]);
        out.push(["ANSWER disabled", await ansOff()]);
      }
      if (id === "5.3") {
        out.push([`preview label ${T("previewLabel", lang).replace("%s", "…")}`, (await text(page, "[data-reply-label]")) === T("previewLabel", lang).replace("%s", lang === "en" ? "German" : "الألمانية")]);
        out.push(["machine badge in [data-reply-mark]", (await text(page, "[data-reply-mark] .vt-badge")) === up(L("markMachine"))]);
        out.push(["preview textarea filled, lang=de dir=ltr", await page.evaluate(() => { const t = document.querySelector("textarea[data-reply-out]"); return !!t && t.value.length > 0 && t.lang === "de" && t.dir === "ltr"; })]);
        out.push(["ANSWER enabled", !(await ansOff())]);
        if (w <= 480) {
          out.push(["footer scrolls inside (overflow-y:auto)", await page.evaluate(() => getComputedStyle(document.querySelector("[data-ov-foot]")).overflowY === "auto")]);
          const th = await page.evaluate(() => Math.round(document.querySelector("[data-thread]").getBoundingClientRect().height));
          out.push([`thread ≥160 px (${th})`, th >= 160]);
        }
      }
      if (id === "5.4") {
        if (lang === "en") {
          out.push(["preview textarea dir=rtl lang=ar", await page.evaluate(() => { const t = document.querySelector("textarea[data-reply-out]"); return !!t && t.dir === "rtl" && t.lang === "ar"; })]);
          out.push(["reply textarea computed ltr", await page.evaluate(() => getComputedStyle(document.querySelector("textarea[data-reply-text]")).direction === "ltr")]);
          out.push(["mark present", await has(page, "[data-reply-mark] .vt-badge")]);
        } else {
          out.push(["same language: no preview, short hint", !(await has(page, "[data-reply-preview]")) && (await text(page, "[data-reply-hint]")) === L("replyHintSame")]);
        }
      }
      if (id === "5.5") {
        out.push(["no machine badge", !(await has(page, "[data-reply-mark] .vt-badge"))]);
        out.push(["previewEdited hint", (await text(page, "[data-reply-edit]")).includes(L("previewEdited"))]);
        out.push(["Translate again ≥44 px", await page.evaluate(() => { const b = document.querySelector("[data-reply-again]"); return !!b && b.getBoundingClientRect().height >= 44; })]);
      }
      if (id === "5.6") {
        out.push(["no preview; info Alert previewFail; Try again", !(await has(page, "[data-reply-preview]")) && (await text(page, '[data-reply-note] .vt-alert--info')).includes(L("previewFail")) && (await has(page, "[data-reply-retry]"))]);
        out.push(["ANSWER enabled", !(await ansOff())]);
      }
      if (id === "5.7") {
        out.push(["no reply block", !(await has(page, "[data-reply]"))]);
        out.push(["closedBody and Reopen present", (await text(page, "[data-ov-foot]")).length > 20 && (await count(page, "[data-ov-actions] .vt-btn")) >= 2]);
      }
      return out;
    },
  };
}

// ---------- run ----------
const WL = [[1440, "en"], [1440, "ar"], [390, "en"], [390, "ar"]];
const row = (title, specs) => ({ title, specs });
const sheets = [
  { n: 1, base: "sheet-1-translations-list", title: "Phase 32 · Content › Translations, the list (Pages becomes Translations; demo lines, no amounts)",
    rows: [row("1.1 Default list, filter All: machine, mixed (de machine, fr yours, ar failed), locked legal, locked name, translating, English changed", WL.map(([w, l]) => s1("1.1", w, l))),
      row("1.2 Loading", WL.map(([w, l]) => s1("1.2", w, l))),
      row("1.3 Search with no match", WL.map(([w, l]) => s1("1.3", w, l))),
      row("1.4 Could not load", WL.map(([w, l]) => s1("1.4", w, l))),
      row("1.5 Failed filter with nothing failed", WL.map(([w, l]) => s1("1.5", w, l))),
      row("1.6 A cell being translated (German) and a line whose English changed (French, his text kept)", [...WL.filter(([w]) => w > 480).map(([w, l]) => s1("1.6", w, l)), ...WL.filter(([w]) => w <= 480).flatMap(([w, l]) => [s1("1.6", w, l), s1("1.6b", w, l)])])] },
  { n: 2, base: "sheet-2-translations-editor", title: "Phase 32 · Content › Translations, the line editor",
    rows: [row("2.1 Mixed line: German machine, French his, Arabic failed (shows English)", WL.map(([w, l]) => s2("2.1", w, l))),
      row("2.2 Locked legal line: read only, never machine-translated", WL.map(([w, l]) => s2("2.2", w, l))),
      row("2.3 German edited (mark gone), French missing placeholders", WL.map(([w, l]) => s2("2.3", w, l))),
      row("2.4 Saving", WL.map(([w, l]) => s2("2.4", w, l))),
      row("2.5 Save failed", WL.map(([w, l]) => s2("2.5", w, l))),
      row("2.6 Saved: the row loses its German machine mark, a toast confirms", WL.map(([w, l]) => s2("2.6", w, l)))] },
  { n: 3, base: "sheet-3-pricing-extras", title: "Phase 32 · Pricing › Surcharges & extras, the name fields (amounts CHF 000)",
    rows: [row("Before: one shared hint, no marks", WL.map(([w, l]) => s3("3.2", w, l, "before"))),
      row("3.1 New extra, not saved yet", WL.map(([w, l]) => s3("3.1", w, l))),
      row("3.2 Saved, machine text in all three", WL.map(([w, l]) => s3("3.2", w, l))),
      row("3.3 German edited by you, French machine, Arabic failed (empty)", WL.map(([w, l]) => s3("3.3", w, l))),
      row("3.4 Just saved, languages translating", WL.map(([w, l]) => s3("3.4", w, l))),
      row("3.5 German written by you, English name changed since", WL.map(([w, l]) => s3("3.5", w, l)))] },
  { n: 4, base: "sheet-4-support-thread", title: "Phase 32 · Support ticket, customer messages in another language",
    rows: [row("Before: the customer's message as today", WL.map(([w, l]) => s4("4.1", w, l, "before"))),
      row("4.1 German customer message, read in your dashboard language", WL.map(([w, l]) => s4("4.1", w, l))),
      row("4.2 Message whose direction differs from the dashboard (Arabic in English; English in Arabic)", WL.map(([w, l]) => s4("4.2", w, l))),
      row("4.3 Message in your own dashboard language: unchanged", WL.map(([w, l]) => s4("4.3", w, l))),
      row("4.4 Translation failed", WL.map(([w, l]) => s4("4.4", w, l))),
      row("4.5 Translation pending", WL.map(([w, l]) => s4("4.5", w, l)))] },
  { n: 5, base: "sheet-5-support-reply", title: "Phase 32 · Support ticket, your reply in the customer's language (Q1 = A: your mail app)",
    rows: [row("Before: read-only footer", WL.map(([w, l]) => s5("5.1", w, l, "before"))),
      row("5.1 Empty", WL.map(([w, l]) => s5("5.1", w, l))),
      row("5.2 Translating", WL.map(([w, l]) => s5("5.2", w, l))),
      row("5.3 Ready (machine)", WL.map(([w, l]) => s5("5.3", w, l))),
      row("5.4 Target Arabic in an English dashboard (Arabic dashboard: same language, no preview)", WL.map(([w, l]) => s5("5.4", w, l))),
      row("5.5 You edited the preview", WL.map(([w, l]) => s5("5.5", w, l))),
      row("5.6 Translation failed", WL.map(([w, l]) => s5("5.6", w, l))),
      row("5.7 Closed ticket", WL.map(([w, l]) => s5("5.7", w, l)))] },
];
for (const sh of sheets) {
  if (ONLY.length && !ONLY.includes(sh.n)) continue;
  let all = true;
  for (const r of sh.rows) for (const s of r.specs) if (!(await frame(s))) all = false;
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
