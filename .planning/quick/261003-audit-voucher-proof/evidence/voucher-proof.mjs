// Audit voucher proof (quick 261003): home -> /checkout -> voucher -> PAY in headless Chromium against the LOCAL Worker build.
// Only Stripe/Mapbox/Turnstile/Resend are local stand-ins (fakes-audit.mjs, reached through a fetch rewrite of the built worker.js).
import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.WEB_DIR + "/package.json")("@playwright/test");
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:4590";
const FAKE = process.env.FAKE ?? "http://127.0.0.1:4597";
const SHOTS = process.env.SHOTS, ONLY = process.env.ONLY;
const results = [];
const rec = (n, ok, ev) => { results.push({ n, ok, ev }); console.log(`${ok ? "PASS" : "FAIL"} | ${n} | ${ev}`); };
const money = (s) => { const m = /CHF\s*([\d'’.,]+)/.exec(s ?? ""); return m ? Number(m[1].replace(/['’,]/g, "")) : null; };
const browser = await chromium.launch();
let ipSeed = Math.floor(Math.random() * 200);

async function session(name, { lang = "en" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "cf-connecting-ip": `10.77.${ipSeed++ % 250}.${Math.floor(Math.random() * 250)}` } });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  const log = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/fx")) r._t = Date.now(); });
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/") || u.pathname.startsWith("/api/fx") || u.pathname.startsWith("/api/checkout/intent")) return;
    const req = r.request();
    let body = null; try { body = await r.text(); } catch (e) {}
    log.push({ at: new Date().toISOString(), method: req.method(), path: u.pathname + u.search, status: r.status(), request: (req.postData() ?? "").slice(0, 1500), response: (body ?? "").slice(0, 1500) });
  });
  // Stripe's hosted page is fake: never let the browser leave for it.
  await page.route(/checkout\.stripe\.com/, (r) => r.abort());
  await page.route(/\/api\/fx/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ base: "CHF", rates: { CHF: 1, EUR: 1, USD: 1, AED: 1 }, rate: 1 }) }));
  // The intent answer is read here (the page navigates away to the fake Stripe URL, which drops the body).
  await page.route(/\/api\/checkout\/intent/, async (route) => {
    const r = await route.fetch();
    const text = await r.text();
    log.push({ at: new Date().toISOString(), method: route.request().method(), path: new URL(route.request().url()).pathname, status: r.status(), request: (route.request().postData() ?? "").slice(0, 1500), response: text.slice(0, 1500) });
    await route.fulfill({ response: r, body: text });
  });
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${name}-${n}.png` });
  return { ctx, page, log, errors, shot, name };
}

async function homeToCheckout(s, lang = "en") {
  const { page } = s;
  const prefix = lang === "en" ? "" : "/" + lang;
  await page.goto(BASE + prefix + "/", { waitUntil: "networkidle" });
  await page.locator("button", { hasText: /necessary only|nur notwendige/i }).first().click({ timeout: 4000 }).catch(() => {});
  await page.fill('input[aria-label="From"]', "Zurich Airport");
  await page.locator('[role="listbox"] >> text=Zurich Airport').first().click();
  await page.locator('input[placeholder="LX 318"]').fill("LX 318").catch(() => {});
  await page.fill('input[aria-label="To"]', "Zug");
  await page.locator('[role="listbox"] >> text=Zug station').first().click();
  await page.click('[data-bx="when"] button');
  await page.locator('[data-bx="when"] button', { hasText: /^10$/ }).first().click();
  await page.locator('[data-bx="when"] button', { hasText: "Saved" }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await s.shot("0-home-filled");
  await Promise.all([page.waitForURL(/\/checkout/, { timeout: 15000 }), page.locator('[data-bx="cta"] button').click()]).catch(async (e) => { await s.shot("0-home-stuck"); console.log("stuck", (await page.locator('[data-bx="cta"]').innerText().catch(()=>"")).slice(0,200), s.log.slice(-3)); throw e; });
  await page.locator("button", { hasText: /necessary only|nur notwendige/i }).first().click({ timeout: 2500 }).catch(() => {});
  await page.locator("[data-co-class]").first().waitFor({ timeout: 20000 }).catch(async (e) => { await s.shot("0-checkout-stuck"); console.log("checkout text:", (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 900), JSON.stringify(s.log.slice(-3)).slice(0, 900)); throw e; });
  await page.waitForTimeout(800);
}

async function chooseClass(s, re = /Economy/i) {
  const { page } = s;
  await page.locator("[data-co-class]", { hasText: re }).first().click();
  await page.waitForTimeout(1500);
}
const totalText = async (s) => (await s.page.locator("[data-co-summary], [data-co-rail]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
async function payLabel(s) { return (await s.page.getByRole("button", { name: /^\s*pay\b/i }).first().innerText().catch(() => "")).replace(/\s+/g, " "); }
async function openAndApply(s, code) {
  const { page } = s;
  await page.locator("[data-co-voucher-open]").click();
  await page.getByLabel(/voucher|gutschein|code/i).first().fill(code);
  await page.locator("[data-co-voucher-apply]").click();
  await page.locator("[data-co-voucher-applied]").waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
}
async function fillTraveller(s) {
  const { page } = s;
  await page.getByLabel(/First name/).fill("Anna");
  await page.getByLabel(/Last name/).fill("Keller");
  await page.getByLabel(/^Email/).fill(`aud-${Date.now().toString(36)}@example.com`);
  const phone = page.getByLabel(/Mobile|Phone/).first();
  if (await phone.count()) await phone.fill("+41790000000").catch(() => {});
  await page.waitForTimeout(2500);
}
const stripeLog = async () => (await fetch(FAKE + "/__stripelog")).json();
async function pay(s) {
  const before = (await stripeLog()).length, logBefore = s.log.length;
  await s.page.getByRole("button", { name: /^\s*pay\b/i }).first().click({ timeout: 10000 });
  for (let i = 0; i < 60 && !s.log.slice(logBefore).some((l) => l.path.startsWith("/api/checkout/intent")); i++) await s.page.waitForTimeout(250);
  await s.page.waitForTimeout(1500);
  const intent = s.log.slice(logBefore).find((l) => l.path.startsWith("/api/checkout/intent"));
  const received = (await stripeLog()).slice(before);
  return { intent, received };
}
const ok200 = (i) => !!i && i.status === 200 && /checkout\.stripe\.com/.test(i.response);

const want = (k) => !ONLY || ONLY.split(",").includes(k);
let all = [];
const finish = (s) => { all.push({ scenario: s.name, errors: s.errors, api: s.log }); };

// Step 1 + 2: fixed voucher
if (want("fix")) {
  const s = await session("s1-fixed");
  await homeToCheckout(s); await chooseClass(s);
  const fullText = await totalText(s), fullPay = await payLabel(s);
  await s.shot("1-before-voucher");
  await openAndApply(s, "AUDITFIX");
  const t = await totalText(s), p = await payLabel(s);
  await s.shot("2-voucher-applied");
  rec("1 fixed voucher: summary shows voucher line and lower total", /AUDITFIX/i.test(t) && money(p) < money(fullPay), `before PAY label "${fullPay}", after "${p}"; applied line=${await s.page.locator("[data-co-voucher-applied]").count()}; summary: ${t.slice(0, 260)}`);
  await fillTraveller(s); await s.shot("3-before-pay");
  const { intent, received } = await pay(s);
  await s.shot("4-after-pay");
  const rappen = received.map((r) => r.unit_amount);
  rec("2 fixed voucher: PAY ok, fake Stripe amount equals discounted total", ok200(intent) && rappen.length === 1 && rappen[0] === Math.round(money(p) * 100), `intent ${intent?.status} ${intent?.response?.replace(/https?:\/\/[^"]+/g, "<url>").slice(0, 100)}; stripe got ${JSON.stringify(rappen)} rappen; displayed ${money(p)}; full was ${money(fullPay)}`);
  finish(s); await s.ctx.close();
}
// Step 3: percent
if (want("pct")) {
  const s = await session("s3-percent");
  await homeToCheckout(s); await chooseClass(s);
  const fullPay = await payLabel(s);
  await openAndApply(s, "AUDITPCT");
  const t = await totalText(s), p = await payLabel(s);
  await s.shot("1-voucher-applied");
  await fillTraveller(s);
  const { intent, received } = await pay(s);
  await s.shot("2-after-pay");
  const rappen = received.map((r) => r.unit_amount);
  rec("3 percent voucher: voucher line, lower total, PAY ok, Stripe amount equals total", /AUDITPCT/i.test(t) && money(p) < money(fullPay) && ok200(intent) && rappen.length === 1 && rappen[0] === Math.round(money(p) * 100), `full ${money(fullPay)} -> ${money(p)}; intent ${intent?.status}; stripe got ${JSON.stringify(rappen)} rappen`);
  finish(s); await s.ctx.close();
}
// Step 4: remove before PAY
if (want("rm")) {
  const s = await session("s4-removed");
  await homeToCheckout(s); await chooseClass(s);
  const fullPay = await payLabel(s);
  await openAndApply(s, "AUDITFIX");
  const mid = await payLabel(s);
  await s.page.locator("[data-co-voucher-remove]").click();
  await s.page.waitForTimeout(2500);
  const p = await payLabel(s);
  await s.shot("1-voucher-removed");
  await fillTraveller(s);
  const { intent, received } = await pay(s);
  const rappen = received.map((r) => r.unit_amount);
  rec("4 voucher removed before PAY: PAY charges the full total", ok200(intent) && money(mid) < money(fullPay) && money(p) === money(fullPay) && rappen.length === 1 && rappen[0] === Math.round(money(fullPay) * 100), `full ${money(fullPay)}, with voucher ${money(mid)}, after remove ${money(p)}; intent ${intent?.status}; stripe got ${JSON.stringify(rappen)} rappen`);
  finish(s); await s.ctx.close();
}
// Step 5: Stripe keeps answering 500 (initial call + the SDK's 2 retries = 3), then a second press
if (want("retry")) {
  const s = await session("s5-retry");
  await homeToCheckout(s); await chooseClass(s);
  await openAndApply(s, "AUDITFIX");
  const p = await payLabel(s);
  await fillTraveller(s);
  await fetch(FAKE + "/__failnext?n=3");
  const a = await pay(s);
  await s.shot("1-after-first-press");
  const errText = (await s.page.locator("[data-co-error-code], [role=alert], [data-co-section-error]").allInnerTexts().catch(() => [])).join(" | ").replace(/\s+/g, " ").slice(0, 200);
  const bodyText = (await s.page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 300);
  const b = await pay(s);
  await s.shot("2-after-second-press");
  const k1 = a.received.map((r) => r.idempotencyKey), k2 = b.received.map((r) => r.idempotencyKey);
  rec("5a first PAY: fake Stripe answers 500 (3 calls: initial + 2 SDK retries), PAY is refused, page stays usable", !!a.intent && a.intent.status !== 200 && a.received.length === 3 && a.received.every((r) => r.failed), `intent ${a.intent?.status} ${a.intent?.response?.slice(0, 120)}; stripe calls ${a.received.length}, keys ${[...new Set(k1)]}; page error: ${errText || "(none)"}; body: ${bodyText.slice(0, 160)}`);
  rec("5b second PAY: new session with a different idempotency key, succeeds, discounted amount", ok200(b.intent) && k1.length > 0 && k2.length === 1 && !k1.includes(k2[0]) && b.received[0].unit_amount === Math.round(money(p) * 100), `first press key ${[...new Set(k1)]}; second press key ${k2}; intent ${b.intent?.status}; stripe got ${b.received.map((r) => r.unit_amount)} rappen vs displayed ${money(p)}`);
  finish(s); await s.ctx.close();
}
// Step 5c: a single 500 is absorbed by the SDK's own retry (same key, second call succeeds): one press, one booking
if (want("retry1")) {
  const s = await session("s5c-single-500");
  await homeToCheckout(s); await chooseClass(s);
  await openAndApply(s, "AUDITFIX");
  const p = await payLabel(s);
  await fillTraveller(s);
  await fetch(FAKE + "/__failnext?n=1");
  const a = await pay(s);
  const keys = a.received.map((r) => r.idempotencyKey);
  rec("5c one 500 only: SDK retry inside the same press succeeds (same key twice, 500 then 200)", ok200(a.intent) && a.received.length === 2 && a.received[0].failed && !a.received[1].failed && keys[0] === keys[1], `intent ${a.intent?.status}; calls ${JSON.stringify(a.received.map((r) => [r.failed, r.unit_amount]))}; keys equal ${keys[0] === keys[1]}`);
  finish(s); await s.ctx.close();
}
// Step 6: German
if (want("de")) {
  const s = await session("s6-de");
  await homeToCheckout(s); // English home (labels differ per language), then the same trip on /de/checkout
  { const u = new URL(s.page.url()); await s.page.goto(`${BASE}/de${u.pathname}${u.search}`, { waitUntil: "domcontentloaded", timeout: 60000 }); await s.page.locator("[data-co-class]").first().waitFor({ timeout: 20000 }); await s.page.waitForTimeout(800); }
  await chooseClass(s, /Economy|Business|Van/i);
  await s.page.locator("[data-co-voucher-open]").click();
  await s.page.locator("[data-co-voucher-form], [data-co-voucher]").first().locator("input").first().fill("AUDITFIX");
  await s.page.locator("[data-co-voucher-apply]").click();
  await s.page.locator("[data-co-voucher-applied]").waitFor({ timeout: 15000 }).catch(() => {});
  await s.page.waitForTimeout(2000);
  const line = (await s.page.locator("[data-co-voucher-applied]").innerText().catch(() => "")).replace(/\s+/g, " ");
  const url = new URL(s.page.url());
  await s.page.locator("[data-co-voucher]").scrollIntoViewIfNeeded().catch(() => {});
  await s.shot("1-de-checkout-voucher");
  const html = await s.page.evaluate(() => document.documentElement.lang);
  const de = (await s.page.locator("button", { hasText: /bezahlen/i }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
  rec("6 /de/checkout voucher line in German (the Worker 308s /de/checkout to /checkout; German comes from the language store)", /Gutschein/i.test(line) && html === "de", `${url.pathname}; html lang=${html}; line: "${line}"; pay button: "${de}"`);
  finish(s); await s.ctx.close();
}
fs.writeFileSync(`${SHOTS}/../api-log${ONLY ? "-" + ONLY.replace(/,/g, "_") : ""}.json`, JSON.stringify({ results, scenarios: all }, null, 1));
await browser.close();
process.exit(results.some((x) => !x.ok) ? 1 : 0);
