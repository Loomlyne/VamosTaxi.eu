// Test lab browser helpers: a browser check against a lab site in about 20 lines. Model: example-booking.mjs.
// Needs the lab's variables: eval "$(scripts/test-lab/lab.sh env <name>)". Local only, headless Chromium, no live site.
import { createRequire } from "node:module";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const need = (k) => { if (!process.env[k]) throw new Error(`${k} is not set: run  eval "$(scripts/test-lab/lab.sh env <name>)"  first`); return process.env[k]; };
const { chromium } = createRequire(need("WEB_DIR") + "/package.json")("@playwright/test");
export const BASE = need("LAB_BASE"), DASH = need("LAB_DASH"), FAKE = need("LAB_FAKE");

const SIZES = { 1440: [1440, 900], 1024: [1024, 768], 768: [768, 1024], 390: [390, 844] };
let browser, evidenceDir, current, results = [], ipN = Math.floor(Math.random() * 200);

/** Launches headless Chromium and makes the evidence folder. */
export async function start({ evidenceDir: dir }) {
  evidenceDir = dir; fs.mkdirSync(dir, { recursive: true });
  browser = await chromium.launch();
  return browser;
}
/** Writes results.json, closes the browser and exits 1 if any step FAILed. */
export async function finish() {
  fs.writeFileSync(`${evidenceDir}/results.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 1));
  await browser?.close();
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`${results.length - failed} pass, ${failed} fail`);
  process.exit(failed ? 1 : 0);
}

/** A page of its own at 1440/1024/768/390 in one language: own client address, /api/fx local, Stripe aborted, intent answer captured. */
export async function open({ viewport = 1440, lang = "en", name = `s${ipN}` } = {}) {
  const [width, height] = SIZES[viewport] ?? [viewport, 900];
  const ctx = await browser.newContext({ viewport: { width, height }, extraHTTPHeaders: { "cf-connecting-ip": `10.78.${ipN++ % 250}.${Math.floor(Math.random() * 250)}` } });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang); // the one place the key is written
  const page = await ctx.newPage();
  const apiLog = [], errors = [];
  const push = (method, path, status, request, response) => apiLog.push({ at: new Date().toISOString(), method, path, status, request: (request ?? "").slice(0, 1500), response: (response ?? "").slice(0, 1500) });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/") || u.pathname.startsWith("/api/fx") || u.pathname.startsWith("/api/checkout/intent")) return;
    let body = ""; try { body = await r.text(); } catch (e) {}
    push(r.request().method(), u.pathname + u.search, r.status(), r.request().postData(), body);
  });
  await page.route(/checkout\.stripe\.com/, (r) => r.abort());
  await page.route(/\/api\/fx/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ base: "CHF", rates: { CHF: 1, EUR: 1, USD: 1, AED: 1 }, rate: 1 }) }));
  await page.route(/\/api\/checkout\/intent/, async (route) => { // read here: the page leaves for the (aborted) Stripe URL and drops the body
    const r = await route.fetch(), text = await r.text();
    push(route.request().method(), new URL(route.request().url()).pathname, r.status(), route.request().postData(), text);
    await route.fulfill({ response: r, body: text });
  });
  const shot = (label) => page.screenshot({ path: `${evidenceDir}/${name}-${label}.png` });
  return (current = { page, ctx, shot, apiLog, errors, name, viewport, lang });
}

/** Clicks "necessary only" (en/de) if the cookie banner is up. */
export async function dismissCookies(page) {
  await page.locator("button", { hasText: /necessary only|nur notwendige/i }).first().click({ timeout: 2500 }).catch(() => {});
}
/** DC mock pages (home, legal ...) only: switches language in place through VamosLocale.setLang. /checkout is a Next page without VamosLocale: use pickLang. */
export async function setLang(s, lang) {
  await s.page.evaluate((l) => window.VamosLocale.setLang(l), lang);
  await s.page.waitForTimeout(600);
}
/** Header language menu, as a person does it (desktop widths): pickLang(s, "de") for en / de / fr / ar. */
export async function pickLang(s, lang) {
  const name = { en: "English", de: "Deutsch", fr: "Fran\u00e7ais", ar: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" }[lang];
  await s.page.locator('button[aria-label="Language"], button[aria-label="Sprache"], button[aria-label="Langue"]').first().click();
  await s.page.getByRole("option", { name: new RegExp(name) }).first().click();
  await s.page.waitForTimeout(800);
}

/** Home -> /checkout: From, To, day, optional travellers; the phone/tablet sheet (button[data-bb] opens [data-bs]) is handled. */
export async function bookFromHome(s, { from = "Zurich Airport", to = "Zug", day = 10, pax } = {}) {
  const { page } = s;
  const narrow = s.viewport <= 1080;
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await dismissCookies(page);
  if (narrow) { // phone and tablet: the docked "Book a transfer" opens the sheet; the airport pick adds a flight field, so To is the last input
    await page.locator("#book button[data-bb]").first().click();
    await page.waitForSelector("[data-bs]", { state: "visible" });
    await page.locator("[data-bs] input").nth(0).fill(from);
    await page.locator('[data-bs] [role="option"]').first().click();
    await page.locator('[data-bs] input[placeholder="LX 318"]').fill("LX 318").catch(() => {}); // the sheet requires a flight for an airport pickup
    await page.locator("[data-bs] input").last().fill(to);
    await page.locator('[data-bs] [role="option"]').first().click();
    await page.locator('[data-bs] button[aria-haspopup="dialog"]').first().click();
  } else {
    await page.fill('input[aria-label="From"]', from);
    await page.locator('[role="listbox"] >> text=' + from).first().click();
    await page.locator('input[placeholder="LX 318"]').fill("LX 318").catch(() => {});
    await page.fill('input[aria-label="To"]', to);
    await page.locator('[role="listbox"] >> text=' + (to === "Zug" ? "Zug station" : to)).first().click();
    await page.click('[data-bx="when"] button');
  }
  const scope = narrow ? page.locator('[role="dialog"]') : page.locator('[data-bx="when"]');
  await scope.locator("button", { hasText: new RegExp(`^${day}$`) }).first().click();
  await scope.locator("button", { hasText: /^(Saved|Done|Save)$/i }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  if (pax) { // the Travellers stepper: + until the number shows
    const plus = page.locator("button[data-step]:visible").nth(1);
    for (let i = 1; i < pax; i++) await plus.click();
  }
  await Promise.all([page.waitForURL(/\/checkout/, { timeout: 15000 }),
    (narrow ? page.locator("[data-bs] button", { hasText: /see prices/i }) : page.locator('[data-bx="cta"] button')).click()]);
  await dismissCookies(page);
  await page.locator("[data-co-class]").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
}
/** Clicks the class card whose text matches re (default Economy). */
export async function chooseClass(s, re = /Economy/i) {
  await s.page.locator("[data-co-class]", { hasText: re }).first().click();
  await s.page.waitForTimeout(1500);
}
/** Fills the traveller block; email is unique per call. */
export async function fillTraveller(s, { first = "Anna", last = "Keller", email = `lab-${Date.now().toString(36)}@example.com`, phone = "+41790000000" } = {}) {
  const { page } = s;
  await page.getByLabel(/First name|Vorname/).fill(first);
  await page.getByLabel(/Last name|Nachname/).fill(last);
  await page.getByLabel(/^Email|^E-Mail/).fill(email);
  const ph = page.getByLabel(/Mobile|Phone|Mobil|Telefon/).first();
  if (await ph.count()) await ph.fill(phone).catch(() => {});
  await page.waitForTimeout(2500);
  return { email };
}
/** Opens the voucher field, types the code, presses Apply and waits for the applied line. */
export async function applyVoucher(s, code) {
  const { page } = s;
  await page.locator("[data-co-voucher-open]").click();
  await page.getByLabel(/voucher|gutschein|code/i).first().fill(code);
  await page.locator("[data-co-voucher-apply]").click();
  await page.locator("[data-co-voucher-applied]").waitFor({ timeout: 15000 });
  await page.waitForTimeout(2000);
}
/** Presses PAY and returns the captured /api/checkout/intent answer { status, response } (or null). */
export async function pressPay(s) {
  const before = s.apiLog.length;
  await s.page.getByRole("button", { name: /^\s*(pay|bezahlen)\b/i }).first().click({ timeout: 10000 });
  for (let i = 0; i < 60 && !s.apiLog.slice(before).some((l) => l.path.startsWith("/api/checkout/intent")); i++) await s.page.waitForTimeout(250);
  await s.page.waitForTimeout(1500);
  return s.apiLog.slice(before).find((l) => l.path.startsWith("/api/checkout/intent")) ?? null;
}
/** Signs in on the dashboard host with the lab admin (password in admin.txt). */
export async function dashboardSignIn(s) {
  const f = Object.fromEntries(fs.readFileSync(need("LAB_ADMIN_FILE"), "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const { page } = s;
  await page.goto(DASH + "/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[autocomplete="email"], input[autocomplete="username"]').first().fill(f.email);
  await page.locator('input[type="password"]').first().fill(f.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
}

/** One numbered brief step: prints PASS | id | evidence or FAIL | id | first error line; screenshot on FAIL (and on PASS with opts.shot). */
export async function step(id, title, fn, opts = {}) {
  let status = "PASS", evidence = "", s = current; // the page opened last gets the screenshot unless fn returns { s }
  try {
    const r = await fn();
    s = r?.s ?? current; evidence = String(r?.evidence ?? r ?? title).replace(/\s+/g, " ").slice(0, 400);
    if (r?.ok === false) { status = "FAIL"; }
  } catch (e) { status = "FAIL"; evidence = String(e?.message ?? e).split("\n")[0].slice(0, 400); }
  if (s && (status === "FAIL" || opts.shot)) await s.shot(id).catch(() => {});
  results.push({ id, title, status, evidence });
  console.log(`${status} | ${id} | ${evidence}`);
  return status === "PASS";
}

const SELECT_ONLY = /^\s*(select|with)\b/i, FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do)\b/i;
/** Read-only SQL on the lab database (docker exec psql -At); anything but select/with is refused. Returns the text. */
export function db(sql) {
  if (!SELECT_ONLY.test(sql) || FORBIDDEN.test(sql.replace(/'[^']*'/g, "''"))) throw new Error("db(): select only");
  // default_transaction_read_only makes the database itself refuse a write, on top of the verb check above.
  return execFileSync("docker", ["exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on", need("LAB_DB_CONTAINER"), "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql]).toString().trim();
}
/** JSON from the fakes server: "/__sessions", "/__mails" or "/__stats". */
export async function fakes(path) { return (await fetch(FAKE + path)).json(); }
/** VamosLocale.coverage(node): { count, strings } for the first match of selector (default body). DC mock pages only (home, legal ...), not /checkout. */
export async function coverage(page, selector = "body") {
  return page.evaluate((sel) => window.VamosLocale.coverage(document.querySelector(sel)), selector);
}
/** CHF amount in a text such as "PAY CHF 0.44": a number, or null. */
export const money = (t) => { const m = /CHF\s*([\d'’.,]+)/.exec(t ?? ""); return m ? Number(m[1].replace(/['’,]/g, "")) : null; };
