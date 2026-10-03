// Fare lines browser proof. One language per run (LANG_CODE), four widths. Real home form, real /checkout, real intent,
// real confirmation / pay link / manage booking / booking detail pages on the local Worker build; Mapbox, Stripe,
// Turnstile and Resend are the repo's local stand-ins (tests/e2e-worker/fakes.mjs). Money is read back from the local DB.
import crypto from "node:crypto";
import fs from "node:fs";
import { launch, newContext, newPage, homeToCheckout, go, ensureUp, sql, rec, results, BASE, SHOTS } from "./lib.mjs";

const lang = process.env.LANG_CODE ?? "en";
const WIDTHS = (process.env.WIDTHS ?? "1440,1024,768,390").split(",").map(Number);
const prefix = lang === "en" ? "" : "/" + lang;
const heightOf = (w) => (w >= 1000 ? 900 : w >= 700 ? 1024 : 844);
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page, name, w, opts = {}) => page.screenshot({ path: `${SHOTS}/${name}-${w}-${lang}.png`, ...opts });
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const flat = (t) => t.replace(/\s+/g, " ").trim();
const COOKIE_BTN = /necessary only|nur notwendige|nécessaires uniquement|الضرورية فقط/i;

const PW = "localpass-fl-1";
const AIRPORT = { en: "Airport pickup fee", de: "Flughafen-Abholgebühr", fr: "Frais de prise en charge à l’aéroport", ar: "رسوم الاستقبال من المطار" }[lang];
const ROUTE_HINT = { en: "route", de: "Strecke", fr: "Trajet", ar: "مسار" }[lang];

const browser = await launch();
const errors = [];

let checkoutUrl = null;
async function checkoutAt(w, { pay = false } = {}) {
  const ctx = await newContext(browser, { lang, w, h: heightOf(w) });
  const page = await newPage(ctx, errors);
  const intents = [];
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith("/api/checkout/intent")) intents.push({ status: r.status(), text: (await r.text().catch(() => "")).slice(0, 300) });
  });
  if (checkoutUrl) { const cu = new URL(checkoutUrl); await go(page, BASE + prefix + cu.pathname + cu.search); }
  else checkoutUrl = await homeToCheckout(page, lang);
  await page.waitForTimeout(3500);
  await page.locator("button", { hasText: COOKIE_BTN }).first().click({ timeout: 2000 }).catch(() => {});
  await page.locator('[data-co-class="business"]').click();
  await page.waitForTimeout(2500);
  const desktop = w > 1080;
  const scope = desktop ? "[data-co-rail] [data-co-summary]" : "#co-summary [data-co-summary], [data-co-summary]";
  const sumEl = page.locator("[data-co-summary]:visible").first();
  await sumEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  const text = flat(await page.evaluate(() => [...document.querySelectorAll("[data-co-summary]")].find((e) => e.offsetParent)?.innerText ?? ""));
  const icons = await page.evaluate(() => {
    const root = [...document.querySelectorAll("[data-co-summary]")].find((e) => e.offsetParent);
    return [...root.querySelectorAll('[style*="plane-landing"], [style*="map-pin"]')].map((e) => /plane-landing/.test(e.getAttribute("style")) ? "plane" : "pin");
  });
  await shot(page, "checkout", w);
  if (desktop) await page.locator("[data-co-rail]").first().screenshot({ path: `${SHOTS}/checkout-rail-${w}-${lang}.png` });
  else await sumEl.screenshot({ path: `${SHOTS}/checkout-section3-${w}-${lang}.png` });
  rec(`checkout ${w}: Fare, airport fee (plane), route (pin), VAT, total`,
    text.includes(AIRPORT) && icons.includes("plane") && icons.includes("pin") && /Kloten/.test(text) && /Zug/.test(text) && await noSideways(page),
    `${text.slice(text.indexOf(AIRPORT) - 40, text.indexOf(AIRPORT) + 160)} | icons=${icons.join(",")} | sideways ok=${await noSideways(page)}`);
  if (!pay) { await ctx.close(); return { text }; }
  // Who is travelling, then PAY.
  await page.locator('input[type="radio"]').first().check({ force: true });
  await page.waitForTimeout(500);
  const stamp = Date.now().toString(36);
  await page.locator('input[autocomplete="given-name"]').fill("Anna");
  await page.locator('input[autocomplete="family-name"]').fill("Keller");
  await page.locator('input[autocomplete="email"]').fill(`fl-${lang}-${stamp}@example.com`);
  await page.locator('input[autocomplete="tel"]').fill("790000000").catch(() => {});
  await page.waitForTimeout(3000);
  const btn = page.locator(`[data-co-pay-bar="${desktop ? "rail" : "bar"}"] [data-co-pay]`).first();
  await btn.click({ timeout: 15000 });
  for (let i = 0; i < 80 && intents.length === 0; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1500);
  rec(`PAY (${lang})`, intents[0]?.status === 200, JSON.stringify(intents[0] ?? null).replace(/https?:\/\/[^"]+/g, "<url>").slice(0, 160));
  const cookies = await ctx.cookies();
  await ctx.close();
  return { text, cookies, email: `fl-${lang}-${stamp}@example.com` };
}

const first = await checkoutAt(WIDTHS[0], { pay: true });
const booking = sql(`select b.reference||'|'||b.id||'|'||b.status||'|'||s.total_rappen||'|'||coalesce(p.stripe_checkout_session_id,'') from public.bookings b join public.price_snapshots s on s.id=b.price_snapshot_id join public.booking_payments p on p.snapshot_id=s.id where b.contact_email='${first.email}'`);
const [ref, bookingId, , totalRappen, sessionId] = booking.split("|");
const lines = JSON.parse(sql(`select s.lines::text from public.price_snapshots s join public.bookings b on b.price_snapshot_id=s.id where b.id='${bookingId}'`));
const fares = lines.filter((l) => l.kind === "fare");
const classNet = Number(sql(`select 0`)) + fares.reduce((a, l) => a + l.amount_rappen, 0);
rec(`saved lines (${lang})`, fares.map((l) => l.code).join(",") === "distance_fare,airport_fee,fixed_route" && lines.reduce((a, l) => a + (l.amount_rappen ?? 0), 0) === Number(totalRappen),
  JSON.stringify(lines.map((l) => [l.seq, l.kind, l.code, l.amount_rappen, l.params?.origin ? `${l.params.origin}>${l.params.destination}` : undefined])));
const stripeAmount = JSON.parse(await (await fetch("http://127.0.0.1:4587/__sessions")).text()).find((s) => s.id === sessionId)?.amount_total;
const paymentCharged = Number(sql(`select charged_rappen from public.booking_payments where stripe_checkout_session_id='${sessionId}'`));
rec(`money identical (${lang})`, Number(totalRappen) === paymentCharged && paymentCharged === stripeAmount,
  `snapshot total=${totalRappen} booking_payments=${paymentCharged} stripe session=${stripeAmount} fare pieces sum=${classNet}`);
fs.writeFileSync(`/private/tmp/vamos-fl/state-${lang}.json`, JSON.stringify({ ref, bookingId, sessionId, totalRappen, email: first.email, cookies: first.cookies, lines }));

{
  const env = Object.fromEntries(fs.readFileSync("/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a6ce6d39e2579cbf7/apps/web/.e2e-sb.env", "utf8").split("\n").filter(Boolean).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
  const r = await fetch(`${env.API_URL}/auth/v1/admin/users`, { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ email: first.email, password: PW, email_confirm: true }) });
  rec(`local customer (${lang})`, r.status === 200, `admin create ${r.status}`);
}

// A pay link on the same (still unpaid) booking: the pay page, opened through the real pay-link route.
const raw = crypto.randomBytes(32);
const token = raw.toString("base64url");
const hashHex = crypto.createHash("sha256").update(raw).digest("hex");
sql(`select public.checkout_set_pay_link('${bookingId}'::uuid, 'individual', '', '', '', 'payer-${lang}@example.com', decode('${hashHex}','hex'), now() + interval '24 hours')`);
for (const w of WIDTHS) {
  const ctx = await newContext(browser, { lang, w, h: heightOf(w) });
  const page = await newPage(ctx, errors);
  await go(page, `${BASE}${prefix}/checkout/pay/${token}`);
  await page.waitForTimeout(4500);
  await page.locator("button", { hasText: COOKIE_BTN }).first().click({ timeout: 1500 }).catch(() => {});
  const priceEl = page.locator("[data-pay-link-price]").first();
  const t = flat(await priceEl.innerText().catch(() => ""));
  const icons = await page.evaluate(() => [...document.querySelectorAll('[data-pay-link-price] [style*="plane-landing"], [data-pay-link-price] [style*="map-pin"]')].length);
  await shot(page, "paylink", w);
  rec(`pay link ${w}`, t.includes(AIRPORT) && /Kloten/.test(t) && icons === 2 && await noSideways(page), `${t.slice(0, 220)} | icons=${icons}`);
  await ctx.close();
}

// Settle (the Stripe stand-in never pays by itself): the real settlement function, then the paid pages.
sql(`select count(*) from public.checkout_payment_settle('evt_fl_${lang}_${Date.now()}', '${sessionId}', 'pi_fl_${lang}', 'succeeded', null, null, null, null, null, null)`);
const status = sql(`select status from public.bookings where id='${bookingId}'`);
rec(`settled (${lang})`, status === "confirmed" || status === "paid", `booking status ${status}`);

for (const w of WIDTHS) {
  const ctx = await newContext(browser, { lang, w, h: heightOf(w) });
  await ctx.addCookies(first.cookies.map((c) => ({ ...c, url: undefined, domain: "localhost", path: "/" })));
  const page = await newPage(ctx, errors);
  await go(page, `${BASE}${prefix}/confirmation/${ref}`);
  await page.waitForTimeout(4500);
  await page.locator("button", { hasText: COOKIE_BTN }).first().click({ timeout: 1500 }).catch(() => {});
  const card = page.locator("[data-confirmation-voucher]").first();
  const t = flat(await card.innerText().catch(() => ""));
  const icons = await page.evaluate(() => [...document.querySelectorAll('[data-confirmation-voucher] [style*="plane-landing"], [data-confirmation-voucher] [style*="map-pin"]')].length);
  await shot(page, "confirmation", w, { fullPage: true });
  rec(`confirmation ${w}`, t.includes(AIRPORT) && /Kloten/.test(t) && icons === 2 && await noSideways(page), `${t.slice(t.indexOf(AIRPORT) - 30, t.indexOf(AIRPORT) + 200)} | icons=${icons}`);
  // Manage booking (DC page) with the manage cookie.
  await go(page, `${BASE}/manage-booking`);
  await page.waitForTimeout(5000);
  const mt = flat(await page.evaluate(() => document.body.innerText));
  await shot(page, "manage", w, { fullPage: true });
  const mIcons = await page.evaluate(() => [...document.querySelectorAll('[style*="plane-landing"], [style*="map-pin"]')].length);
  rec(`manage booking ${w}`, mt.includes(AIRPORT) && /Kloten/.test(mt) && await noSideways(page), `${mt.slice(mt.indexOf(AIRPORT) - 30, mt.indexOf(AIRPORT) + 220)} | icons=${mIcons}`);
  // Booking detail (DC page, My bookings): a real customer password sign-in, then the booking by reference.
  const ctx2 = await newContext(browser, { lang, w, h: heightOf(w) });
  const dp = await newPage(ctx2, errors);
  for (let attempt = 0; attempt < 3; attempt++) {
    await go(dp, `${BASE}${prefix}/sign-in`);
    await dp.waitForTimeout(2500);
    await dp.locator('input[type="email"]').fill(first.email);
    await dp.locator('input[type="password"]').fill(PW);
    await dp.getByRole("button", { name: /^\s*(sign in|anmelden|connexion|se connecter|تسجيل الدخول)\s*$/i }).last().click();
    const ok = await dp.waitForURL(/\/account/, { timeout: 12000 }).then(() => true).catch(() => false);
    if (ok) break;
  }
  await dp.waitForTimeout(1500);
  await go(dp, `${BASE}/booking-detail?ref=${ref}`);
  await dp.waitForTimeout(6000);
  await dp.locator("button", { hasText: COOKIE_BTN }).first().click({ timeout: 1500 }).catch(() => {});
  const dt = flat(await dp.evaluate(() => document.body.innerText));
  await shot(dp, "booking-detail", w, { fullPage: true });
  rec(`booking detail ${w}`, dt.includes(AIRPORT) && /Kloten/.test(dt) && await noSideways(dp), `${dt.slice(dt.indexOf(AIRPORT) - 30, dt.indexOf(AIRPORT) + 220)}`);
  await ctx2.close();
  await ctx.close();
}

// Checkout rail / Section 3 at the other widths (fresh quote each time, no pay).
for (const w of WIDTHS.slice(1)) await checkoutAt(w);

console.log("errors", JSON.stringify(errors.slice(0, 5)));
fs.writeFileSync(`/private/tmp/vamos-fl/results-${lang}.json`, JSON.stringify(results, null, 1));
await browser.close();
process.exit(results.some((r) => r.ok === false) ? 1 : 0);
