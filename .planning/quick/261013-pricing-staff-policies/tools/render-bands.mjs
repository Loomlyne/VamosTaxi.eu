// Signing pictures for quick 261013 (PR #81 re-scope: remove km bands and region %).
//   node .planning/quick/261013-pricing-staff-policies/tools/render-bands.mjs
// "Before" = this branch's DC tree (= origin/main 7953ba4d for these files), synced into apps/web/public.
// "After"  = a copy of that synced tree OUTSIDE the repo (~/.vamos-scratch/pricing-bands-after) with the one
// visible change applied to OpsPricing.dc.html: the band-overlap warning paragraph is gone, and band gap kinds
// no longer exist (the server stops sending them, so the after stub sends only the gaps that remain).
// Every /api/* answer is stubbed; amounts are 0 (law 04). Exit 1 on any FAIL.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { serve } from "./serve.mjs";
import * as S from "./stubs.mjs";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const OUT = join(repo, ".planning/quick/261013-pricing-staff-policies/screens", process.env.RENDER_SUB || "");
const require = createRequire(join(repo, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
mkdirSync(OUT, { recursive: true });

execFileSync("node", ["scripts/sync-dc-mock-to-public.mjs"], { cwd: repo, stdio: ["ignore", "ignore", "inherit"] });
const BEFORE_ROOT = join(repo, "apps/web/public");
const AFTER_ROOT = join(homedir(), ".vamos-scratch/pricing-bands-after");
rmSync(AFTER_ROOT, { recursive: true, force: true });
cpSync(BEFORE_ROOT, AFTER_ROOT, { recursive: true });
const pricingFile = join(AFTER_ROOT, "app/ops/OpsPricing.dc.html");
const src = readFileSync(pricingFile, "utf8");
const warnLine = '<p data-price-warn="1" style="display:{{ bandWarnDisplay }}">{{ tBandOverlapWarn }}</p>\n';
if (!src.includes(warnLine)) { console.log("FAIL setup: warning paragraph not found in OpsPricing.dc.html"); process.exit(1); }
let out = src.replace(warnLine, "");
// Item 13: one book-level field on Distance rules, same kit pattern as the VAT field (Input + Save button).
const paneOpen = '<sc-if value="{{ isDistance }}" hint-placeholder-val="{{ false }}">\n<div data-price-pane="1" data-price-swipe="1" data-scroll-native="1">\n';
const lockField = '<div data-lock-field="1" style="display:flex;flex-direction:column;gap:6px;max-width:520px;margin-bottom:var(--vt-space-5)">\n' +
  '<div style="display:flex;align-items:flex-end;gap:8px;min-width:0">\n' +
  '<div style="flex:1 1 auto;min-width:0">\n' +
  '<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Input" size="md" label="{{ tLockLabel }}" value="{{ lockHours }}" onChange="{{ setLockHours }}" suffix="{{ tLockSuffix }}" inputMode="numeric" hint-size="100%,76px"></x-import>\n' +
  '</div>\n<div data-lock-save="1">\n' +
  '<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button" size="md" variant="ghost" onClick="{{ saveLock }}" hint-size="110px,44px">{{ tSaveLock }}</x-import>\n' +
  '</div>\n</div>\n' +
  '<p class="vt-field__hint" style="margin:0">{{ tLockHint }}</p>\n' +
  '</div>\n';
if (!out.includes(paneOpen)) { console.log("FAIL setup: distance pane not found"); process.exit(1); }
out = out.replace(paneOpen, paneOpen + lockField);
const LOCK = {
  en: "lockLabel:'Price stays valid for', lockSuffix:'hours', lockHint:'How long a price you show a customer stays the same.', saveLock:'Save',",
  de: "lockLabel:'Preis gilt für', lockSuffix:'Stunden', lockHint:'Wie lange ein Preis, den du einem Kunden zeigst, gleich bleibt.', saveLock:'Speichern',",
  fr: "lockLabel:'Le prix reste valable', lockSuffix:'heures', lockHint:'Combien de temps un prix montré à un client reste le même.', saveLock:'Enregistrer',",
  ar: "lockLabel:'يبقى السعر صالحًا لمدة', lockSuffix:'ساعة', lockHint:'المدة التي يبقى فيها السعر الذي تعرضه على العميل كما هو.', saveLock:'حفظ',",
};
const vatLines = ["    vatLabel:'VAT',", "    vatLabel:'MwSt.',", "    vatLabel:'TVA',", "    vatLabel:'ضريبة القيمة المضافة',"];
["en", "de", "fr", "ar"].forEach((l, i) => {
  if (!out.includes(vatLines[i])) { console.log("FAIL setup: T block " + l); process.exit(1); }
  out = out.replace(vatLines[i], "    " + LOCK[l] + "\n" + vatLines[i]);
});
const vals = "tVatLabel: t.vatLabel,";
if (!out.includes(vals)) { console.log("FAIL setup: renderVals"); process.exit(1); }
out = out.replace(vals, "tLockLabel: t.lockLabel, tLockSuffix: t.lockSuffix, tLockHint: t.lockHint, tSaveLock: t.saveLock, lockHours: '24', setLockHours: () => {}, saveLock: () => {}, " + vals);
writeFileSync(pricingFile, out);

const before = await serve(BEFORE_ROOT);
const after = await serve(AFTER_ROOT);
const browser = await chromium.launch();
let failed = 0;

const NAME = { en: "English", ar: "العربية" };
const ID = S.ID;
// Two overlapping Economy Sedan bands in the draft (what "before" can still show) + one rule gap that stays.
const BANDS = [
  { id: "b-1", fromKm: 0, toKm: 50, perKm: { CHF: "0", EUR: "0", USD: "0", AED: "0" }, klass: "Economy Sedan", vehicleClassId: ID.sedan },
  { id: "b-2", fromKm: 30, toKm: 100, perKm: { CHF: "0", EUR: "0", USD: "0", AED: "0" }, klass: "Economy Sedan", vehicleClassId: ID.sedan },
];
const GAPS_BEFORE = [{ kind: "band", name: "saden" }, { kind: "band_overlap", name: "saden" }, { kind: "rule", name: "waiting" }];
const GAPS_AFTER = [{ kind: "rule", name: "waiting" }];
const STATUS = { sedan: "live", van: "live", lux: "live" };

async function stubs(page, which) {
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const ok = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (path === "/api/staff/me") return ok(S.ME);
    if (req.method() !== "GET") return ok({});
    if (path === "/api/staff/vehicle-classes") return ok(S.classRows(STATUS));
    if (path === "/api/staff/rate-book") return ok({ ...S.rateBook(STATUS), bands: which === "before" ? BANDS : [] });
    if (path === "/api/staff/rate-versions") return ok({ versions: [{ id: "v-live", status: "live" }, { id: "v-draft", status: "draft" }] });
    if (path === "/api/staff/rate-versions/v-draft") return ok({ gaps: which === "before" ? GAPS_BEFORE : GAPS_AFTER });
    return ok([]);
  });
  await page.route((u) => u.hostname !== "127.0.0.1", (route) => route.abort());
}

const frames = [];
async function frame({ which, w, lang, kind }) {
  const file = `${kind}-${which}-${w}-${lang}.png`;
  const ctx = await browser.newContext({ viewport: { width: w, height: w <= 480 ? 844 : 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", locale: lang });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  await stubs(page, which);
  const checks = [];
  try {
    await page.goto((which === "before" ? before.base : after.base) + "/pricing", { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    let target;
    if (kind === "publish") {
      if (w > 480) {
        // The header Publish button.
        await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /publish/i.test(x.textContent || "") && !x.closest("[role=dialog]") && x.offsetParent); if (b) b.setAttribute("data-q-hit", "1"); });
        await page.locator("[data-q-hit]").first().click();
      } else {
        // Phone: the console top bar's Actions menu (the last visible menu button; the first is the account
        // menu), then its first item, Publish fare book (Discard draft is second).
        await page.evaluate(() => { const b = [...document.querySelectorAll("[aria-haspopup]")].filter((x) => x.offsetParent).at(-1); b.setAttribute("data-q-menu", "1"); });
        await page.locator("[data-q-menu]").click();
        await page.waitForSelector("[role=menu] button", { timeout: 5000 });
        await page.locator("[role=menu] button").first().click();
      }
      await page.waitForSelector("[role=dialog]", { timeout: 8000 });
      await page.waitForTimeout(500);
      target = await page.locator("[role=dialog]").first().elementHandle();
      const text = await page.locator("[role=dialog]").first().innerText();
      const warn = await page.locator("[role=dialog] [data-price-warn]").count();
      const warnShown = warn ? await page.locator("[role=dialog] [data-price-warn]").first().isVisible() : false;
      const bandLine = lang === "en" ? /Km band/i.test(text) : /الكم|كم/.test(text);
      if (which === "before") { checks.push(["band gap line shown", bandLine], ["overlap warning shown", warnShown]); }
      else { checks.push(["no band gap line", !/Km band|band/i.test(lang === "en" ? text : "")], ["no overlap warning element", warn === 0]); }
    } else {
      await page.locator("[data-set-item]").nth(1).click();
      await page.waitForTimeout(800);
      target = await page.locator("[data-price-pane]").first().elementHandle();
      const lock = await page.evaluate(() => {
        const f = document.querySelector("[data-lock-field]");
        if (!f) return null;
        const inp = f.querySelector("input"), btn = f.querySelector("[data-lock-save] button");
        const a = inp.closest(".vt-input").getBoundingClientRect(), b = btn.getBoundingClientRect();
        return { value: inp.value, text: f.innerText, inH: Math.round(a.height), btnH: Math.round(b.height), dTop: Math.round(Math.abs(a.top - b.top)), dMid: Math.round(Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2)), btnW: Math.round(b.width) };
      });
      const visible = await page.locator("main").first().innerText();
      if (which === "before") checks.push(["no quote-lock field yet", lock === null], ["no rules list", !/Add rule|Waiting unit/.test(visible)]);
      else {
        checks.push(["quote-lock field shown", !!lock], ["value 24", lock && lock.value === "24"], ["no rules list", !/Add rule|Waiting unit/.test(visible)]);
        if (lock) {
          console.log(`  info lock field ${JSON.stringify({ inH: lock.inH, btnH: lock.btnH, dTop: lock.dTop, dMid: lock.dMid, btnW: lock.btnW })}`);
          checks.push([`Save button beside the box, same height and line (${lock.btnH} vs ${lock.inH}, mid offset ${lock.dMid})`, lock.btnH === lock.inH && lock.dMid <= 1], [`touch targets >= 44 (${lock.inH}/${lock.btnH})`, lock.inH >= 44 && lock.btnH >= 44]);
          if (lang === "en") checks.push(["English copy", /Price stays valid for/.test(lock.text) && /How long a price you show a customer stays the same\./.test(lock.text) && /hours/.test(lock.text)]);
          if (lang === "ar") checks.push(["Arabic copy", /يبقى السعر صالحًا لمدة/.test(lock.text) && /ساعة/.test(lock.text)]);
        }
      }
    }
    const box = await target.boundingBox();
    if (!box) throw new Error("no target box");
    const vp = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, dir: document.documentElement.dir }));
    if (w <= 480) checks.push([`scrollWidth ${vp.w} <= 390`, vp.w <= 390]);
    if (lang === "ar") checks.push([`dir=${vp.dir} is rtl`, vp.dir === "rtl"]);
    checks.push(["no page error" + (errors.length ? ": " + errors[0] : ""), errors.length === 0]);
    const abs = await target.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
    const m = 20;
    const clip = { x: Math.max(0, abs.x - m), y: Math.max(0, abs.y - m), width: Math.min(abs.w + 2 * m, vp.w - Math.max(0, abs.x - m)), height: abs.h + 2 * m };
    await page.screenshot({ path: join(OUT, file), fullPage: true, clip });
  } catch (e) { checks.push(["exception: " + String(e.message).split("\n")[0].slice(0, 200), false]); }
  const bad = checks.filter(([, p]) => !p);
  if (bad.length) failed++;
  console.log(`${bad.length ? "FAIL" : "PASS"} ${file}${bad.length ? "  " + bad.map(([l]) => l).join("; ") : ""}`);
  frames.push({ file, w, lang, which, kind });
  await ctx.close();
}

for (const kind of ["publish", "distance"]) {
  for (const [w, lang] of [[1440, "en"], [390, "en"], [390, "ar"]]) {
    for (const which of ["before", "after"]) await frame({ which, w, lang, kind });
  }
}

const md5 = (f) => createHash("md5").update(readFileSync(join(OUT, f))).digest("hex");
for (const f of frames.filter((x) => x.which === "before")) {
  const a = f.file.replace("-before-", "-after-");
  console.log(`md5 ${f.file} ${md5(f.file)} | ${a} ${md5(a)}${md5(f.file) === md5(a) ? "  (identical)" : ""}`);
}

async function compose(file, title, rows) {
  const fig = (f, cap) => {
    const b64 = readFileSync(join(OUT, f.file)).toString("base64");
    return `<figure><div class="cap">${cap}</div><img src="data:image/png;base64,${b64}" style="width:${f.w <= 480 ? 280 : 640}px"></figure>`;
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
const pick = (which, kind) => frames.filter((f) => f.which === which && f.kind === kind).map((f) => [f, `${f.w} · ${NAME[f.lang]}`]);
await compose("sheet-1-publish-dialog.png", "Pricing › Publish fare book dialog (a draft with two overlapping Economy Sedan km bands and one rule gap)",
  [["Before (main today)", pick("before", "publish")], ["After (km bands removed)", pick("after", "publish")]]);
await compose("sheet-2-distance-rules-price-valid.png", "Pricing › Distance rules: one field, Price stays valid for 24 hours (no km-band, region % or Rules list exists on today's screen)",
  [["Before", pick("before", "distance")], ["After", pick("after", "distance")]]);

await browser.close();
before.server.close();
after.server.close();
rmSync(AFTER_ROOT, { recursive: true, force: true });
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
