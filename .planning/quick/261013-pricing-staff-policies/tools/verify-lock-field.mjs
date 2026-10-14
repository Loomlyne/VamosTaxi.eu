// Offline Chromium check of the REAL "Price stays valid for" field (quick 261013, Task 3).
//   node .planning/quick/261013-pricing-staff-policies/tools/verify-lock-field.mjs
// Serves this branch's synced DC tree (apps/web/public after scripts/sync-dc-mock-to-public.mjs) through the
// shell the Worker serves (tools/serve.mjs), nothing edited in the page. Every /api/* answer is stubbed here;
// amounts are 0 (law 04). PUT /api/staff/rate-book answers 200 the first time and 400 invalid the second, so
// the page meets both a saved and a refused write. Frames: 1440 en, 390 en, 390 ar, 1440 de, 1440 fr.
// PNGs go to screens/final/ (frames stay out of git; sheet-final.png is committed). Exit 1 on any FAIL.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { serve } from "./serve.mjs";
import * as S from "./stubs.mjs";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const OUT = join(repo, ".planning/quick/261013-pricing-staff-policies/screens/final");
const require = createRequire(join(repo, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
mkdirSync(OUT, { recursive: true });

execFileSync("node", ["scripts/sync-dc-mock-to-public.mjs"], { cwd: repo, stdio: ["ignore", "ignore", "inherit"] });
const site = await serve(join(repo, "apps/web/public"));
const browser = await chromium.launch();
let failed = 0;

const STATUS = { sedan: "live", van: "live", lux: "live" };
const COPY = {
  en: { label: "Price stays valid for", suffix: "hours", hint: "How long a price you show a customer stays the same.", save: "Save", bad: "Enter whole hours, 1 or more.", fail: "Could not save. Try again.", ok: "Saved in the draft." },
  de: { label: "Preis gilt für", suffix: "Stunden", hint: "Wie lange ein Preis, den du einem Kunden zeigst, gleich bleibt.", save: "Speichern", bad: "Gib ganze Stunden ein, 1 oder mehr.", fail: "Speichern nicht möglich. Bitte erneut versuchen.", ok: "Im Entwurf gespeichert." },
  fr: { label: "Le prix reste valable", suffix: "heures", hint: "Combien de temps un prix montré à un client reste le même.", save: "Enregistrer", bad: "Saisissez des heures entières, 1 ou plus.", fail: "Enregistrement impossible. Réessayez.", ok: "Enregistré dans le brouillon." },
  ar: { label: "يبقى السعر صالحًا لمدة", suffix: "ساعة", hint: "المدة التي يبقى فيها السعر الذي تعرضه على العميل كما هو.", save: "حفظ", bad: "أدخل عددًا صحيحًا من الساعات، 1 أو أكثر.", fail: "تعذّر الحفظ. حاول مرة أخرى.", ok: "تم الحفظ في المسودة." },
};

/** Stateful stubs: the book holds quoteLockHours; PUT answers 200 (and updates it), then 400 invalid. */
async function stubs(page, rec) {
  let hours = "24";
  let puts = 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const send = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const ok = (data) => send(200, { ok: true, data });
    if (url.hostname !== "127.0.0.1") return route.abort();
    rec.log.push(`${req.method()} ${path}`);
    if (path === "/api/staff/me") return ok(S.ME);
    if (path === "/api/staff/rate-book" && req.method() === "PUT") {
      let body = null;
      try { body = JSON.parse(req.postData() || "null"); } catch (e) { body = "unparsable"; }
      rec.puts.push(body);
      puts += 1;
      if (puts === 1 && body && Number.isInteger(body.quoteLockHours) && body.quoteLockHours >= 1) {
        hours = String(body.quoteLockHours);
        return ok({ ...book(), quoteLockHours: hours });
      }
      return send(400, { ok: false, code: "invalid" });
    }
    if (req.method() !== "GET") return ok({});
    if (path === "/api/staff/vehicle-classes") return ok(S.classRows(STATUS));
    if (path === "/api/staff/rate-book") return ok(book());
    if (path === "/api/staff/rate-versions") return ok({ versions: [{ id: "v-live", status: "live" }, { id: "v-draft", status: "draft" }] });
    if (path === "/api/staff/rate-versions/v-draft") return ok({ gaps: [] });
    return ok([]);
  });
  await page.route((u) => u.hostname !== "127.0.0.1", (route) => route.abort());
  // Task 2's GET shape: no bands, regionPremiums or rules keys; quoteLockHours a string.
  function book() {
    const b = { ...S.rateBook(STATUS), quoteLockHours: hours, freeWaitHours: "1" };
    delete b.bands; delete b.regionPremiums; delete b.rules;
    return b;
  }
}

const frames = [];
/** Clip to sel (y and height) and to xSel (x and width; defaults to sel), plus extraBelow px under it. */
async function shot(page, w, file, sel, extraBelow = 0, xSel = sel) {
  const vpW = await page.evaluate(() => document.documentElement.scrollWidth);
  const box = (q) => page.locator(q).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
  const yb = await box(sel);
  const xb = await box(xSel);
  const abs = { x: xb.x, w: xb.w, y: yb.y, h: yb.h };
  const m = 20;
  const x = Math.max(0, abs.x - m);
  const clip = { x, y: Math.max(0, abs.y - m), width: Math.min(abs.w + 2 * m, vpW - x), height: abs.h + 2 * m + extraBelow };
  await page.screenshot({ path: join(OUT, file), fullPage: true, clip });
  frames.push({ file, w });
}

async function field(page) {
  return page.evaluate(() => {
    const f = document.querySelector("[data-lock-field]");
    if (!f) return null;
    const inp = f.querySelector("input");
    const box = inp.closest(".vt-input");
    const btn = f.querySelector("[data-lock-save] button");
    const err = f.querySelector(".vt-field__err");
    const hint = f.querySelector(":scope > p.vt-field__hint");
    const okLine = f.querySelector("[data-lock-ok]");
    const a = box.getBoundingClientRect(), b = btn.getBoundingClientRect();
    const overflow = [...f.querySelectorAll("*")].filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== "visible").map((n) => n.className || n.tagName);
    return {
      value: inp.value, inputMode: inp.inputMode, label: (f.querySelector("label") || {}).textContent || "", suffix: (f.querySelector(".vt-input__affix") || {}).textContent || "",
      hint: hint ? hint.textContent : "", hintVisible: hint ? getComputedStyle(hint).visibility !== "hidden" : false,
      err: err ? err.textContent.trim() : "", ariaInvalid: inp.getAttribute("aria-invalid"), boxError: box.classList.contains("vt-input--error"),
      okText: okLine && getComputedStyle(okLine).display !== "none" ? okLine.textContent : "",
      btnText: btn.textContent.trim(), btnPrimary: btn.classList.contains("vt-btn--primary"), btnGhost: btn.classList.contains("vt-btn--ghost"), btnDisabled: btn.disabled,
      inH: Math.round(a.height), btnH: Math.round(b.height), dMid: Math.round(Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2)),
      btnInlineEnd: document.documentElement.dir === "rtl" ? b.right <= a.left + 1 : b.left >= a.right - 1,
      errInsideField: err ? (() => { const r = err.getBoundingClientRect(), fr = f.getBoundingClientRect(); return r.bottom <= fr.bottom + 1 && r.top >= a.bottom; })() : true,
      overflow,
    };
  });
}

async function type(page, text) {
  const inp = page.locator("[data-lock-field] input");
  await inp.fill(text);
  await page.waitForTimeout(150);
}

async function run({ w, lang, full }) {
  const tag = `${w}-${lang}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: w <= 480 ? 844 : 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", locale: lang });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  const rec = { log: [], puts: [] };
  await stubs(page, rec);
  const checks = [];
  const c = COPY[lang];
  const add = (label, pass) => checks.push([label, !!pass]);
  try {
    await page.goto(site.base + "/pricing", { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await page.locator("[data-set-item]").nth(1).click();
    await page.waitForSelector("[data-lock-field] input", { timeout: 8000 });
    await page.waitForTimeout(500);

    // 1. At rest: the book's 24 hours, the signed copy, Save ghost and off.
    let f = await field(page);
    add("field shown", !!f);
    add(`value 24 (${f.value})`, f.value === "24");
    add(`label "${f.label}"`, f.label.trim() === c.label);
    add(`suffix "${f.suffix}"`, f.suffix.trim() === c.suffix);
    add("hint exact", f.hint === c.hint && f.hintVisible);
    add(`Save text "${f.btnText}"`, f.btnText === c.save);
    add("inputMode numeric", f.inputMode === "numeric");
    add("Save ghost and disabled at rest", f.btnGhost && !f.btnPrimary && f.btnDisabled);
    add(`touch targets >= 44 (${f.inH}/${f.btnH})`, f.inH >= 44 && f.btnH >= 44);
    add(`Save level with the box (mid offset ${f.dMid})`, f.btnH === f.inH && f.dMid <= 1);
    add("Save on the inline-end side", f.btnInlineEnd);
    add(`no clipped text in the field (${f.overflow.join(",")})`, f.overflow.length === 0);
    const lockAbove = await page.evaluate(() => {
      const pane = document.querySelector("[data-price-pane]");
      const fl = pane && pane.querySelector("[data-lock-field]");
      // The class table: the first element after the field that names a class (OpsTable renders a table on
      // desktop and stacked rows on a phone, so look for the row text rather than a tag).
      const later = pane ? [...pane.querySelectorAll("*")].filter((n) => fl && (fl.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) && !fl.contains(n)) : [];
      const hasClassRow = later.some((n) => n.children.length === 0 && /Economy Sedan/.test(n.textContent || ""));
      const before = pane ? [...pane.querySelectorAll("*")].filter((n) => fl && (fl.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING) && n.children.length === 0 && /Economy Sedan/.test(n.textContent || "")) : [];
      return !!fl && hasClassRow && before.length === 0;
    });
    add("field above the class table in the Distance rules pane", lockAbove);
    await shot(page, w, `lock-rest-${tag}.png`, "[data-lock-field]", 200, "[data-price-pane]");

    // No glow: focused input box and hovered/pressed Save carry no box-shadow.
    await page.locator("[data-lock-field] input").focus();
    const focusShadow = await page.evaluate(() => getComputedStyle(document.querySelector("[data-lock-field] .vt-input")).boxShadow);
    add(`focused input has no glow (${focusShadow})`, focusShadow === "none");

    if (lang === "en" && w > 480) {
      const cov = await page.evaluate(() => window.VamosLocale && window.VamosLocale.coverage(document.querySelector("[data-lock-field]"), "de"));
      const missing = cov ? [...Object.keys(cov.strings || {}), ...Object.keys(cov.attrs || {})] : ["no VamosLocale"];
      add(`coverage [data-lock-field] empty (${missing.join(" | ")})`, missing.length === 0);
    }

    // 2. Type 48: Save turns primary and on.
    await type(page, "48");
    f = await field(page);
    add("48 typed: Save primary and enabled", f.btnPrimary && !f.btnDisabled && f.value === "48");
    const hoverShadow = await page.locator("[data-lock-save] button").evaluate((b) => getComputedStyle(b).boxShadow);
    await page.locator("[data-lock-save] button").hover();
    const hoverShadow2 = await page.locator("[data-lock-save] button").evaluate((b) => getComputedStyle(b).boxShadow);
    add(`Save has no glow at rest/hover (${hoverShadow} / ${hoverShadow2})`, hoverShadow === "none" && hoverShadow2 === "none");
    if (full) await shot(page, w, `lock-edited-${tag}.png`, "[data-lock-field]");

    // 3. Save → PUT body is the contract; 200 → saved value 48, Save ghost, saved line.
    await page.locator("[data-lock-save] button").click();
    await page.waitForTimeout(500);
    const put1 = rec.puts[0];
    add(`PUT body ${JSON.stringify(put1)}`, put1 && JSON.stringify(put1) === JSON.stringify({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: 48 }));
    f = await field(page);
    add("after 200: value 48, Save ghost and disabled", f.value === "48" && f.btnGhost && f.btnDisabled);
    add(`after 200: saved line "${f.okText}"`, f.okText === c.ok);
    add("after 200: no error", !f.err && !f.boxError);
    if (full) await shot(page, w, `lock-saved-${tag}.png`, "[data-lock-field]");

    // 4. Type 0: error under the box in the hint's place, Save off, nothing sent.
    await type(page, "0");
    f = await field(page);
    add(`"0": error "${f.err}"`, f.err === c.bad && f.boxError && f.ariaInvalid === "true");
    add("\"0\": Save disabled", f.btnDisabled && !f.btnPrimary);
    add("\"0\": hint hidden, error inside the field block", !f.hintVisible && f.errInsideField);
    add(`"0": Save still level with the box (mid offset ${f.dMid})`, f.dMid <= 1);
    await shot(page, w, `lock-error-zero-${tag}.png`, "[data-lock-field]");
    await type(page, "1.5");
    f = await field(page);
    add("\"1.5\": same error, Save disabled", f.err === c.bad && f.btnDisabled);
    add("no PUT for 0 / 1.5", rec.puts.length === 1);

    // 5. Type 36, Save → stub answers 400 invalid: value stays, Save stays primary, failure line.
    await type(page, "36");
    await page.locator("[data-lock-save] button").click();
    await page.waitForTimeout(500);
    f = await field(page);
    add(`second PUT sent (${rec.puts.length})`, rec.puts.length === 2 && rec.puts[1] && rec.puts[1].quoteLockHours === 36);
    add(`after 400: error "${f.err}"`, f.err === c.fail && f.boxError);
    add("after 400: value 36 kept, Save primary and enabled", f.value === "36" && f.btnPrimary && !f.btnDisabled);
    add("after 400: no saved line", !f.okText);
    await shot(page, w, `lock-error-save-${tag}.png`, "[data-lock-field]");

    // 6. Publish dialog: no km band line, no warning element.
    if (w > 480) {
      await page.evaluate(() => { const b = [...document.querySelectorAll("header button")].find((x) => x.offsetParent && !x.closest("[role=dialog]") && x.className.includes("vt-btn--primary")); if (b) b.setAttribute("data-q-hit", "1"); });
      await page.locator("[data-q-hit]").first().click();
    } else {
      await page.evaluate(() => { const b = [...document.querySelectorAll("[aria-haspopup]")].filter((x) => x.offsetParent).at(-1); b.setAttribute("data-q-menu", "1"); });
      await page.locator("[data-q-menu]").click();
      await page.waitForSelector("[role=menu] button", { timeout: 5000 });
      await page.locator("[role=menu] button").first().click();
    }
    await page.waitForSelector("[role=dialog]", { timeout: 8000 });
    await page.waitForTimeout(400);
    const dlgText = await page.locator("[role=dialog]").first().innerText();
    const warnCount = await page.locator("[data-price-warn]").count();
    add("Publish dialog: no data-price-warn element", warnCount === 0);
    add("Publish dialog: no band line", !/band|Bänd|Band|tranche|شريح/i.test(dlgText));
    if (w > 480 || lang === "en" || lang === "ar") await shot(page, w, `publish-${tag}.png`, "[role=dialog]");

    const vp = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, dir: document.documentElement.dir }));
    if (w <= 480) add(`no sideways scroll (${vp.sw} <= ${vp.iw})`, vp.sw <= vp.iw);
    if (lang === "ar") add(`dir=${vp.dir} is rtl`, vp.dir === "rtl");
    add("no page error" + (errors.length ? ": " + errors[0] : ""), errors.length === 0);
  } catch (e) { add("exception: " + String(e.message).split("\n")[0].slice(0, 200), false); }
  const bad = checks.filter(([, p]) => !p);
  if (bad.length) failed++;
  console.log(`${bad.length ? "FAIL" : "PASS"} ${tag}  (${checks.length} checks)`);
  for (const [l, p] of checks) console.log(`  ${p ? "ok  " : "FAIL"} ${l}`);
  console.log(`  api: ${rec.log.filter((x) => !x.startsWith("GET /api/staff/me")).join(", ")}`);
  await ctx.close();
}

for (const [w, lang, full] of [[1440, "en", true], [390, "en", true], [390, "ar", true], [1440, "de", false], [1440, "fr", false]]) {
  await run({ w, lang, full });
}

// One sheet: the field at rest (1440 en, 390 en, 390 ar), its states at 1440 en, and the Publish dialog.
async function compose(file, title, rows) {
  const fig = (f, cap) => {
    const b64 = readFileSync(join(OUT, f)).toString("base64");
    const narrow = /-390-/.test(f);
    return `<figure><div class="cap">${cap}</div><img src="data:image/png;base64,${b64}" style="width:${narrow ? 260 : 600}px"></figure>`;
  };
  const body = rows.map(([label, list]) => `<h2>${label}</h2><div class="wrap">${list.map(([f, cap]) => fig(f, cap)).join("")}</div>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}body{padding:40px 48px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1e1f1f}
h1{font-size:20px;font-weight:600;margin:0 0 28px}h2{font-size:16px;font-weight:600;margin:32px 0 16px}.wrap{display:flex;flex-wrap:wrap;gap:40px 56px;align-items:flex-start}figure{margin:0}.cap{font-size:14px;margin-bottom:12px;color:#555}img{display:block;border:0;outline:0;box-shadow:none}</style>
<h1>${title}</h1>${body}`;
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  await ctx.close();
  console.log(`sheet ${file}: ${statSync(join(OUT, file)).size} B`);
}
await compose("sheet-final.png", "Pricing › Distance rules: Price stays valid for (real field, stubbed API) and the Publish dialog", [
  ["At rest (the book holds 24 hours)", [["lock-rest-1440-en.png", "1440 · English"], ["lock-rest-390-en.png", "390 · English"], ["lock-rest-390-ar.png", "390 · العربية"]]],
  ["States (1440 · English)", [["lock-edited-1440-en.png", "Typed 48: Save turns yellow"], ["lock-saved-1440-en.png", "Saved (server answered 200)"], ["lock-error-zero-1440-en.png", "Typed 0"], ["lock-error-save-1440-en.png", "Server refused the save (400)"]]],
  ["States (390)", [["lock-error-zero-390-en.png", "390 · English · typed 0"], ["lock-error-zero-390-ar.png", "390 · العربية · typed 0"], ["lock-error-save-390-ar.png", "390 · العربية · save refused"]]],
  ["German and French (1440)", [["lock-rest-1440-de.png", "1440 · Deutsch"], ["lock-rest-1440-fr.png", "1440 · Français"]]],
  ["Publish fare book dialog (no km band line, no overlap warning)", [["publish-1440-en.png", "1440 · English"], ["publish-390-en.png", "390 · English"], ["publish-390-ar.png", "390 · العربية"]]],
]);

await browser.close();
site.server.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
