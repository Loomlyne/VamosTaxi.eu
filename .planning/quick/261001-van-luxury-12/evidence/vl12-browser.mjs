// Van luxury 12 (quick 261001): the real home form and /checkout in Chromium against the local Worker build
// (local Supabase 644xx, class rows like live: Economy 3, Business 7, Van luxury 12). Mapbox, Stripe and Turnstile are
// local stand-ins reached through a fetch rewrite in the BUILT worker.js only. Prints PASS/FAIL lines.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:4490";
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 900);
const LANG = process.env.LANG_CODE ?? "en";
const SHOTS = process.env.SHOTS ?? "/tmp";
const STAGE = process.env.STAGE ?? "all"; // "stepper" stops after the + check
const PAY = process.env.PAY === "1";
const sql = (q) => execFileSync("docker", ["exec", "-i", "supabase_db_vamos-taxi-vl12", "psql", "-U", "postgres", "-At", "-c", q]).toString().trim();
const out = [];
const rec = (n, ok, ev) => { out.push({ n, ok, ev }); console.log(`${ok ? "PASS" : "FAIL"} | ${n} | ${ev}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, extraHTTPHeaders: { "cf-connecting-ip": `10.88.${W % 250}.${Math.floor(Math.random() * 250)}` } });
await ctx.addInitScript((lang) => { try { localStorage.setItem("vamosLang", lang); } catch (e) {} }, LANG);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
const quotes = [];
page.on("response", async (r) => {
  const u = new URL(r.url());
  if (u.pathname.endsWith("/api/quote")) {
    const j = await r.json().catch(() => null);
    quotes.push({ method: r.request().method(), status: r.status(), body: r.request().postData(), classes: (j?.classes ?? []).map((c) => `${c.slug}:${c.eligible ? "ok" : c.ineligible_reason}:${c.effective_max_pax}`) });
  }
  if (u.pathname.endsWith("/api/checkout/intent")) {
    const t = await r.text().catch(() => "");
    quotes.push({ method: "INTENT", status: r.status(), text: t.slice(0, 200) });
  }
});
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}-${LANG}-${W}.png`, fullPage: false });
const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const prefix = LANG === "en" ? "" : "/" + LANG;
await page.goto(BASE + prefix + "/", { waitUntil: "networkidle" });
const gets = quotes.filter((q) => q.method === "GET");
rec("1 home asks for the class list once", gets.length === 1 && gets[0].status === 200, `GET /api/quote x${gets.length}; ${gets[0]?.classes.join(" ")}`);

const narrow = W <= 1080;
let stepN, plus, minus, done;
if (!narrow) {
  await page.click("[data-trav-btn]");
  const panel = page.locator("[data-trav-panel]");
  plus = panel.locator("button[data-step]").nth(1);
  minus = panel.locator("button[data-step]").nth(0);
  stepN = panel.locator("[data-step-n]").first();
  done = panel.locator("button", { hasText: /./ }).last();
} else {
  // Phone and tablet: the docked bar's "Book a transfer" opens the sheet; Who (passengers, bags) sits in the sheet.
  await page.locator("button[data-ck-manage]").locator("xpath=..").locator("button").nth(1).click({ timeout: 3000 }).catch(() => {});
  await page.locator("button[data-bb]:visible").first().click();
  await page.waitForTimeout(700);
  const steps = page.locator("button[data-step]:visible");
  minus = steps.nth(0);
  plus = steps.nth(1);
  stepN = page.locator("[data-step-n]:visible").first();
  await stepN.scrollIntoViewIfNeeded();
  const order = await page.evaluate(() => [...document.querySelectorAll("[data-sheet], [role=dialog]")].filter((x) => x.offsetParent).map((x) => x.innerText.replace(/\s+/g, " ").slice(0, 160)).join(" || "));
  console.log("sheet text", order);
}
let presses = 0;
for (let i = 0; i < 20 && (await plus.isEnabled()); i++) { await plus.click(); presses++; }
const top = (await stepN.textContent())?.trim();
rec("2 + stops at the class-row limit", top === "12" && !(await plus.isEnabled()), `stopped at ${top} after ${presses} presses; + disabled=${!(await plus.isEnabled())}`);
const box = await stepN.boundingBox();
rec("2b the figure 12 fits its slot and nothing scrolls sideways", !!box && box.width > 0 && (await noSideways()), `slot ${box && Math.round(box.width)}px; scrollWidth ok=${await noSideways()}`);
await shot("stepper-12");
if (LANG !== "en") {
  await page.waitForTimeout(300);
  const cov = await page.evaluate(() => { try { const r = document.querySelector("[data-trav-panel]") || document.querySelector("[data-bs]"); return window.VamosLocale && window.VamosLocale.coverage ? window.VamosLocale.coverage(r) : "no runtime"; } catch (e) { return String(e); } });
  const dir = await page.evaluate(() => document.documentElement.dir || "ltr");
  rec("2c no English left in the open travellers panel or sheet at 12", !!cov && cov.count === 0, `coverage: ${JSON.stringify(cov).slice(0, 200)}; dir=${dir}`);
}
await minus.click(); await minus.click();
rec("3 back to 10", (await stepN.textContent())?.trim() === "10", `now ${(await stepN.textContent())?.trim()}`);

if (STAGE === "stepper") { console.log("errors", errors); await browser.close(); process.exit(out.some((x) => !x.ok) ? 1 : 0); }

if (!narrow) await done.click();
// From and To through the real combo boxes (Mapbox stand-in behind the Worker).
await page.fill('input[aria-label="From"]', "Zurich");
await page.locator('[role="listbox"] >> text=Zurich HB').first().click();
await page.fill('input[aria-label="To"]', "Zug");
await page.locator('[role="listbox"] >> text=Zug Bahnhof').first().click();
await page.click('[data-bx="when"] button');
await page.locator('[data-bx="when"] button', { hasText: /^10$/ }).first().click();
await page.locator('[data-bx="when"] button', { hasText: "Saved" }).first().click().catch(() => {});
await page.waitForTimeout(300);
await shot("form-filled");
await Promise.all([page.waitForURL(/\/checkout/, { timeout: 15000 }), page.locator('[data-bx="cta"] button').click()]);
const url = new URL(page.url());
rec("4 See prices hands 10 travellers to /checkout", url.searchParams.get("pax") === "10", `${url.pathname}?pax=${url.searchParams.get("pax")}&bags=${url.searchParams.get("bags")}`);

for (let i = 0; i < 40 && !quotes.some((q) => q.method === "POST"); i++) await page.waitForTimeout(250);
await page.waitForTimeout(1500);
const posts = quotes.filter((q) => q.method === "POST");
const last = posts[posts.length - 1];
rec("5 the quote for 10: only Van luxury fits (class rows)", !!last && last.status === 200 && last.classes.includes("van-luxury:ok:12") && last.classes.some((c) => c.startsWith("saden:pax")) && last.classes.some((c) => c.startsWith("mercedes-benz-v-class:pax")), `POST /api/quote ${last?.status}: ${last?.classes.join(" ")}`);
const text = await page.evaluate(() => document.body.innerText);
await page.locator("button", { hasText: /necessary only|nur notwendige|nécessaires uniquement|الضرورية فقط/i }).first().click({ timeout: 3000 }).catch(() => {});
rec("6 /checkout greys Economy (up to 3) and Business (up to 7); Van luxury priced", LANG !== "en" || (/Seats up to 3/.test(text) && /Seats up to 7/.test(text) && /Van luxury\s+12 seats\s+9 bags\s+CHF/.test(text)), `${text.match(/Choose your class[\s\S]{0,200}/)?.[0].replace(/\s+/g, " ").slice(0, 200)}`);
await shot("checkout-10");
fs.writeFileSync(`${SHOTS}/checkout-text-${LANG}-${W}.txt`, text);
rec("6b /checkout does not scroll sideways", await noSideways(), "scrollWidth ok");

// Edit trip: the Travellers counter stops at the quote's party limit (12), not 8.
await page.locator("button, a", { hasText: /^Edit trip$/ }).first().click();
const counterPlus = page.locator('[data-co-field="travellers"]').getByRole("button", { name: /add a passenger/i });
let n = 0;
for (let i = 0; i < 6 && (await counterPlus.isEnabled()); i++) { await counterPlus.click(); n++; }
const edVal = await page.locator('[data-co-field="travellers"]').first().innerText();
rec("7 Edit trip counter stops at 12", n === 2 && !(await counterPlus.isEnabled()), `+ pressed ${n} times from 10; disabled=${!(await counterPlus.isEnabled())}; ${edVal.replace(/\s+/g, " ").slice(0, 60)}`);
await shot("edit-trip-12");
await page.locator("button", { hasText: /^cancel$/i }).first().click();
await page.waitForTimeout(400);

if (PAY) {
  await page.locator("text=Van luxury").first().click();
  await page.getByLabel(/First name/).fill("Anna");
  await page.getByLabel(/Last name/).fill("Keller");
  await page.getByLabel(/^Email/).fill(`vl12-${Date.now().toString(36)}@example.com`);
  const phone = page.getByLabel(/Mobile|Phone/).first();
  if (await phone.count()) await phone.fill("+41790000000").catch(() => {});
  await page.waitForTimeout(2500); // Turnstile test key
  await shot("before-pay");
  const navs = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url().slice(0, 90)); });
  const payBtn = page.getByRole("button", { name: /^\s*pay\b/i }).first();
  console.log("pay buttons", await page.getByRole("button", { name: /pay/i }).allInnerTexts());
  await payBtn.click({ timeout: 10000 });
  for (let i = 0; i < 60 && !quotes.some((q) => q.method === "INTENT"); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1500);
  const intent = quotes.find((q) => q.method === "INTENT");
  rec("8 PAY: /api/checkout/intent accepts 10 travellers in Van luxury", !!intent && intent.status === 200, `intent ${intent?.status} ${intent?.text?.replace(/https?:\/\/[^"]+/g, "<url>").slice(0, 120)}; navigated: ${navs.join(" , ")}`);
  const row = sql("select b.status || '|' || l.pax || '|' || vc.slug from public.bookings b join public.booking_legs l on l.booking_id = b.id join public.vehicle_classes vc on vc.id = l.vehicle_class_id order by b.created_at desc limit 1");
  rec("9 the local booking row holds 10 travellers in Van luxury", /\|10\|van-luxury$/.test(row), `latest booking: ${row}`);
}
console.log("quotes", JSON.stringify(posts.map((q) => ({ s: q.status, c: q.classes, b: q.body?.slice(0, 160) }))));
console.log("errors", errors);
await browser.close();
process.exit(out.some((x) => !x.ok) ? 1 : 0);
