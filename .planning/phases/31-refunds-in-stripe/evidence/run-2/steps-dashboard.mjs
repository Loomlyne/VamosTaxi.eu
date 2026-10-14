// Phase 31 run 2: steps D6, D12 (dashboard). Run: eval "$(scripts/test-lab/lab.sh env p31-refunds)" && node <this file>
// Sign-in note: the dashboard login is email link + 6-digit code only (no password field); the code is read from the
// lab's local mail file (apps/web/.wrangler/tmp/email) and typed into the real form as the admin lab-admin@vamos.local.
import fs from "node:fs";
import { start, finish, open, DASH, setLang, step } from "../../../../../scripts/test-lab/lab-browser.mjs";
import { signInCode } from "./signin-code.mjs";
const EV = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
await start({ evidenceDir: EV });
const s = await open({ viewport: 1440, name: "dash" });
const { page, ctx } = s;
const sleep = (ms) => page.waitForTimeout(ms);
const reqs = []; page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) reqs.push({ m: r.method(), p: u.pathname }); });
const opened = []; ctx.on("page", (p) => opened.push(p));
await ctx.route(/dashboard\.stripe\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>stub" })); // new tab stays off the internet; its URL is still checked
const SIZE = { 1440: [1440, 900], 1024: [1024, 768], 768: [768, 1024], 390: [390, 844] };
const shot = (id) => page.screenshot({ path: `${EV}/${id}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const flat = (t) => t.replace(/\s+/g, " ");
await signInCode(page);

/** Opens a booking at a width (and language, in place); resolves once /stripe-payments answered. */
async function openBooking(ref, w, lang) {
  await page.setViewportSize({ width: SIZE[w][0], height: SIZE[w][1] });
  const resp = page.waitForResponse((r) => /\/stripe-payments/.test(r.url()), { timeout: 20000 }).catch(() => null);
  await page.goto(`${DASH}/bookings/${ref}`, { waitUntil: "domcontentloaded" });
  await page.locator("button[aria-haspopup=menu]:visible").first().waitFor({ timeout: 20000 }).catch(() => {});
  if (lang) await setLang(s, lang);
  const r = await resp; await sleep(1000);
  return r;
}
// the visible Actions button: the page's own at 1440, the top bar's at 1080 and narrower (either label, any language)
const actionsBtn = () => page.locator("button[aria-haspopup=menu]:visible").filter({ hasText: /^\s*(actions|aktionen|actions|الإجراءات)\s*$/i }).first();
const item = (re) => page.locator("[data-am-item]").filter({ hasText: re }).first();
async function openMenu() { await actionsBtn().click(); await page.locator("[data-am-pop]").first().waitFor({ timeout: 5000 }); await sleep(250); }
const stripeRows = () => page.locator("[data-ops-stripe-row]");
const cov = (sel) => page.evaluate((q) => { const el = document.querySelector(q); if (!el) return { missing: true }; const c = window.VamosLocale.coverage(el); return { count: c.count ?? c.length ?? 0, strings: (c.strings ?? c).slice?.(0, 5) }; }, sel);
const disabledState = (loc) => loc.evaluate((e) => ({ disabled: e.disabled === true || e.hasAttribute("disabled"), aria: e.getAttribute("aria-disabled") }));
async function clickForTab(re) {
  const n0 = opened.length, np = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
  await item(re).click();
  const p = await np; await sleep(800);
  let url = p ? p.url() : ""; if (p && !/stripe\.com/.test(url)) { await p.waitForURL(/dashboard\.stripe\.com/, { timeout: 5000 }).catch(() => {}); url = p.url(); }
  return { p, url, count: opened.length - n0 };
}

await step("D6", "(f) Refund issued visible, no Refund to check", async () => {
  await openBooking("VT-99-31306", 1440);
  const t = await text(); await shot("D6");
  return { ok: !/refund to check/i.test(t) && /Refund issued/.test(t), evidence: `refund to check (ci) ${/refund to check/i.test(t)}; "Refund issued" visible ${/Refund issued/.test(t)}` };
});

const cov12 = [];
await step("D12", "1440 de/fr/ar coverage (9 calls)", async () => {
  let ok = true;
  const label = { de: /In Stripe rückerstatten/, fr: /Stripe/, ar: /Stripe/ };
  for (const lang of ["de", "fr", "ar"]) {
    await openBooking("VT-99-31302", 1440, lang);
    await openMenu();
    const menu = await cov("[data-am-pop]");
    await item(label[lang]).click(); await sleep(1000);
    const rows = await stripeRows().count();
    const region = await cov("[data-ops-refund-region]");
    await openBooking("VT-99-31304", 1440, lang);
    let target = "[data-ops-refund-region]", note = await cov(target);
    if (note.missing) { // the note sits outside a refund region: the Alert holding it
      target = "Alert"; note = await page.evaluate(() => { const all = [...document.querySelectorAll("[role=alert],[class*=lert]")].filter((e) => /\S/.test(e.innerText)); const hit = all.find((e) => /Stripe/.test(e.innerText)) || all[0]; if (!hit) return { missing: true }; const c = window.VamosLocale.coverage(hit); return { count: c.count ?? c.length ?? 0, strings: (c.strings ?? c).slice?.(0, 5), alert: hit.innerText.slice(0, 60) }; });
    }
    await shot(`D12-${lang}`);
    cov12.push({ lang, menu, region, rowsInList: rows, noteTarget: target, note });
    for (const c of [menu, region, note]) if (c.missing || c.count !== 0) ok = false;
  }
  fs.writeFileSync(`${EV}/d12-coverage.json`, JSON.stringify(cov12, null, 1));
  return { ok, evidence: cov12.map((c) => `${c.lang}: menu ${c.menu.count ?? "missing"}, region ${c.region.count ?? "missing"} (rows ${c.rowsInList}), note[${c.noteTarget}] ${c.note.count ?? "missing"}`).join("; ") };
});

fs.existsSync(`${EV}/results.json`);
await finish();
