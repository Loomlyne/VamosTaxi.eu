// An OLD booking (one distance_fare line, as every booking before this change): its pages read as before.
import crypto from "node:crypto";
import fs from "node:fs";
import { launch, newContext, newPage, go, sql, rec, BASE, SHOTS } from "./lib.mjs";

const lang = process.env.LANG_CODE ?? "en";
const prefix = lang === "en" ? "" : "/" + lang;
const flat = (t) => t.replace(/\s+/g, " ").trim();
const raw = crypto.randomBytes(32);
const token = raw.toString("base64url");
const hashHex = crypto.createHash("sha256").update(raw).digest("hex");
const email = `flold-${lang}-${Date.now().toString(36)}@example.com`;
const lines = JSON.stringify([
  { seq: 1, code: "distance_fare", kind: "fare", i18n_key: "price.line.transfer", amount_rappen: 9000, params: { vehicleClass: "business" } },
  { seq: 2, code: "vat", kind: "vat", i18n_key: "price.line.vat", amount_rappen: 729, params: { vatRateBps: 81 } },
]);
sql(`
begin;
insert into public.bookings (reference, contact_name, contact_email, status, locale) values (public.next_booking_reference(), 'Old Booking', '${email}', 'confirmed', '${lang}');
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text, scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags)
 select b.id, 1, 'outbound', 'Zurich HB', 'Zug station', now() + interval '48 hours', to_char(now() + interval '48 hours', 'YYYY-MM-DD"T"HH24:MI'), vc.id, 55, 1, 0
 from public.bookings b, public.vehicle_classes vc where b.contact_email = '${email}' and vc.slug = 'business';
set local session_replication_role = replica;
insert into public.price_snapshots (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id, engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at, quote_lock_expires_at, booking_id, source)
 select gen_random_uuid(), vc.id, 1, true, sv.id, 'quote-engine@old', 1, 0, '${lines}'::jsonb,
  jsonb_build_object('cancellation_tiers','[]'::jsonb,'free_cancel_hours',24,'airport_waiting_minutes',60,'city_waiting_minutes',15,'settings_version_id',sv.id,'modification_deadline_hours',24,'min_advance_minutes',180,'policy_doc','old'),
  9729, 0, 0, 9729, now() + interval '1 day', now() + interval '1 day', b.id, 'web'
 from public.vehicle_classes vc cross join public.bookings b cross join lateral (select id from public.settings_versions order by id limit 1) sv where vc.slug='business' and b.contact_email='${email}';
update public.bookings b set price_snapshot_id = s.id from public.price_snapshots s where s.booking_id = b.id and b.contact_email='${email}';
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, charged_currency, status, captured_at)
 select b.id, b.price_snapshot_id, 'pi_old_${lang}_${Date.now()}', 9729, 'CHF', 'succeeded', now() from public.bookings b where b.contact_email='${email}';
set local session_replication_role = origin;
insert into public.booking_access_tokens (booking_id, token_hash, expires_at) select b.id, decode('${hashHex}','hex'), now() + interval '2 days' from public.bookings b where b.contact_email='${email}';
commit;`);
const ref = sql(`select reference from public.bookings where contact_email='${email}'`);
const env = Object.fromEntries(fs.readFileSync("/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a6ce6d39e2579cbf7/apps/web/.e2e-sb.env", "utf8").split("\n").filter(Boolean).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
await fetch(`${env.API_URL}/auth/v1/admin/users`, { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ email, password: "localpass-fl-1", email_confirm: true }) });

const browser = await launch();
const ctx = await newContext(browser, { lang, w: 1440, h: 900 });
await ctx.addCookies([{ name: "vt_manage", value: token, domain: "localhost", path: "/" }]);
const page = await newPage(ctx, []);
await go(page, `${BASE}${prefix}/confirmation/${ref}`);
await page.waitForTimeout(4500);
const ct = flat(await page.locator("[data-confirmation-voucher]").first().innerText().catch(() => ""));
await page.screenshot({ path: `${SHOTS}/old-confirmation-1440-${lang}.png`, fullPage: true });
rec(`old booking confirmation (${lang})`, /190?|90\.00/.test(ct) && !/Kloten|Airport pickup fee|Flughafen|aéroport|المطار/.test(ct.replace(/Zurich Airport/g, "")), ct.slice(ct.search(/Fare|Fahr|Course|الأجرة/), ct.search(/Fare|Fahr|Course|الأجرة/) + 160));
await go(page, `${BASE}/manage-booking`);
await page.waitForTimeout(5000);
const mt = flat(await page.evaluate(() => document.body.innerText));
await page.screenshot({ path: `${SHOTS}/old-manage-1440-${lang}.png`, fullPage: true });
const mi = mt.search(/YOU PAID|BEZAHLT HABEN|AVEZ PAYÉ|دفعته/);
rec(`old booking manage (${lang})`, mi >= 0 && /90\.00/.test(mt.slice(mi, mi + 250)) && !/airport pickup fee|Flughafen-Abhol/i.test(mt.slice(mi, mi + 250)), mt.slice(mi, mi + 220));
const ctx2 = await newContext(browser, { lang, w: 1440, h: 900 });
const dp = await newPage(ctx2, []);
for (let attempt = 0; attempt < 3; attempt++) {
  await go(dp, `${BASE}${prefix}/sign-in`);
  await dp.waitForTimeout(2500);
  await dp.locator('input[type="email"]').fill(email);
  await dp.locator('input[type="password"]').fill("localpass-fl-1");
  await dp.getByRole("button", { name: /^\s*(sign in|anmelden|connexion|se connecter|تسجيل الدخول)\s*$/i }).last().click();
  if (await dp.waitForURL(/\/account/, { timeout: 12000 }).then(() => true).catch(() => false)) break;
}
await go(dp, `${BASE}/booking-detail?ref=${ref}`);
await dp.waitForTimeout(6000);
const dt = flat(await dp.evaluate(() => document.body.innerText));
await dp.screenshot({ path: `${SHOTS}/old-booking-detail-1440-${lang}.png`, fullPage: true });
const di = dt.search(/WHAT YOU PAID|WAS SIE BEZAHLT|CE QUE VOUS AVEZ PAYÉ|ما دفعته/);
rec(`old booking detail (${lang}): one Fare line, as before`, di >= 0 && !/Kloten|airport pickup fee/i.test(dt.slice(di, di + 250)), dt.slice(di, di + 220));
await browser.close();
