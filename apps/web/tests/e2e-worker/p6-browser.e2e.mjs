// 26.2 P6: every changed DC form step in a REAL Chromium against the REAL local Worker build and the REAL local
// Supabase stack (run by p6-run.sh). Nothing is stubbed in the page or in the Worker; only the outside services
// (Stripe, Mapbox, Resend, Turnstile) are local stand-ins (fakes.mjs) reached by the fetch rewrite of the built
// worker.js. The bookings are seeded by lib/ops/trip-change-browser.local-seed.test.ts the way checkout writes them.
// One PASS/FAIL line per step, with the answers of the real /api routes and the database rows as evidence.
//   Dashboard (http://dashboard.localhost:E2E_DASH_PORT, the admin signs in with a password): O1..O8
//   Public site (http://localhost:E2E_PORT): C1..C6
// P6_ONLY=O1,O2 runs only those steps (development). Nothing printed is a secret: passwords are generated here, held in
// memory, and set on the local stack's users through its admin API; mail bodies are never printed, only subject,
// recipient and a short match of the expected sentence.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PORT, FAKE_PORT, API, SERVICE, rec, finish, sql } from "./checkout-common.mjs";

const DASH_PORT = Number(process.env.E2E_DASH_PORT ?? 4391);
const BASE = `http://localhost:${PORT}`;
const D = `http://dashboard.localhost:${DASH_PORT}`;
const FAKE = `http://127.0.0.1:${FAKE_PORT}`;
const S = JSON.parse(fs.readFileSync(process.env.P6_SEED, "utf8"));
const B = S.bookings;
const ONLY = (process.env.P6_ONLY ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const want = (id) => ONLY.length === 0 || ONLY.includes(id);
const SHOTS = fileURLToPath(new URL("../../../../.planning/quick/261001-p6-paid-trip-edit/screens/worker-run/", import.meta.url));
fs.mkdirSync(SHOTS, { recursive: true });

const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 140) => String(s ?? "").replace(/\s+/g, " ").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>").slice(0, n);
const fj = async (p) => (await fetch(FAKE + p)).json();
const q = (text) => sql(text);
const chf = (rappen) => (Number(rappen) / 100).toFixed(2);
const money = (rappen) => `CHF ${chf(rappen)}`;
const password = () => crypto.randomBytes(12).toString("base64url") + "Aa1!";
const adminApi = (method, p, body) => fetch(`${API}${p}`, { method, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: JSON.stringify(body) });

const errors = [];
const apiLog = [];
const NOISE = /^\/api\/(fx|staff\/(me|dashboard|chauffeurs|rate-book|bookings$|calendar)|auth\/session|geo\/suggest)/;
function watch(page, label) {
  page.on("pageerror", (e) => errors.push(`${label}: ${String(e).slice(0, 160)}`));
  page.on("requestfailed", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) apiLog.push({ m: r.method(), p: u.pathname, s: 0, b: String(r.failure()?.errorText ?? "failed") }); });
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/") || NOISE.test(u.pathname)) return;
    let body = "";
    try { body = await r.text(); } catch {}
    apiLog.push({ m: r.request().method(), p: u.pathname, s: r.status(), b: body });
  });
}
/** The answers of the real routes since index n, one short text each. */
const since = (n, re = /./) => apiLog.slice(n).filter((x) => re.test(x.p)).map((x) => `${x.m} ${short(x.p, 70)} ${x.s} ${short(x.b, 110)}`).join(" | ");
const apiOf = (n, re) => apiLog.slice(n).filter((x) => re.test(x.p));
const pretty = (ids) => ids.join(", ");

async function shot(locator, name) {
  try { await locator.screenshot({ path: SHOTS + name + ".png" }); } catch (e) { console.log(`(no screenshot ${name}: ${String(e).slice(0, 80)})`); }
}
async function mailsSince(t0) {
  return (await fj("/__mails")).filter((m) => m.at >= t0).map((m) => ({ ...m, text: m.text || "", html: m.html || "" }));
}
const fmtMails = (mails) => mails.map((m) => `[${m.to.join(",")}] ${short(m.subject, 90)}`).join("; ") || "no mail";

// ---------------------------------------------------------------------------------------------- dashboard helpers
async function openBooking(page, key) {
  await page.goto(`${D}/bookings/${B[key].reference}`, { waitUntil: "load", timeout: 60000 });
  await page.getByRole("button", { name: "Actions" }).first().waitFor({ timeout: 30000 });
  await page.waitForFunction((ref) => (document.body.innerText || "").includes(ref), B[key].reference, { timeout: 15000 });
  await nap(400);
}
async function actions(page, name) {
  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
const startEdit = (page) => actions(page, "Edit booking");
async function pickPlace(page, label, query, hit) {
  const box = page.getByRole("combobox", { name: label, exact: true });
  await box.fill(query);
  const row = page.locator("[data-ps-row]").filter({ hasText: hit });
  await row.first().waitFor({ timeout: 15000 });
  await row.first().click();
}
const changeBox = (page) => page.locator("[data-ops-change-box]");
async function waitPreview(page, mustHave = /./) {
  await changeBox(page).waitFor({ timeout: 20000 });
  await nap(900); // the page asks for the new figures 450 ms after the last key; only then is the busy marker up
  await page.waitForFunction(() => !document.querySelector("[data-ops-chg-busy]"), null, { timeout: 20000 });
  await page.waitForFunction(([src, fl]) => new RegExp(src, fl).test((document.querySelector("[data-ops-change-box]")?.innerText ?? "").replace(/\s+/g, " ")), [mustHave.source, mustHave.flags], { timeout: 20000 });
  await nap(300);
}
const primary = (page) => page.locator("[data-ops-edit-acts]").getByRole("button").last();
async function confirmDialog(page) {
  // The preview may still be settling when Continue is pressed: press it again until the dialog is there.
  const go = page.getByRole("button", { name: "Change the trip", exact: true });
  for (let i = 0; i < 3 && !(await go.isVisible().catch(() => false)); i++) {
    await go.waitFor({ timeout: 5000 }).catch(async () => { await primary(page).click().catch(() => {}); });
  }
  await go.waitFor({ timeout: 10000 });
  await go.click();
}
const toastText = async (page, re, ms = 20000) => {
  const loc = page.getByText(re).first();
  await loc.waitFor({ timeout: ms });
  return (await loc.innerText()).replace(/[\u2066-\u2069]/g, "").replace(/\s+/g, " ");
};
/** A step that stopped: one FAIL line, and (for debugging only, gitignored) a screenshot of the page it stopped on. */
async function stopped(name, e, page = dpage) {
  rec(name, false, `stopped: ${short(e, 240)}; last answers: ${since(Math.max(0, apiLog.length - 3))}`);
  try { await page?.screenshot({ path: new URL(`../../.wrangler/p6-fail-${name.split(" ")[0]}.png`, import.meta.url).pathname }); } catch {}
}
const legRow = (key) => q(`select json_build_object('pickup', pickup_text, 'pickup_place', pickup_place_id, 'pickup_lat', pickup_lat, 'dropoff', dropoff_text, 'dropoff_place', dropoff_place_id, 'dropoff_lat', dropoff_lat, 'dur', estimated_duration_minutes, 'local', scheduled_local, 'driver', assigned_chauffeur_id::text, 'kept', (overlap_kept_range = scheduled_range), 'flight', flight_no, 'pax', pax, 'status', status, 'note', note) from public.booking_legs where booking_id = '${B[key].id}'`);
const J = (t) => JSON.parse(t);

// ---------------------------------------------------------------------------------------------- run
const browser = await chromium.launch();
let dpage = null, dctx = null;
try {
  // The admin and the customer get a password through the local stack's admin API (in memory only).
  const adminPw = password(), custPw = password();
  const ra = await adminApi("PUT", `/auth/v1/admin/users/${S.adminId}`, { password: adminPw, email_confirm: true });
  let rc = await adminApi("POST", "/auth/v1/admin/users", { email: S.customerEmail, password: custPw, email_confirm: true });
  if (rc.status === 422) { // already there (a re-run on the same seed): set the password on that user
    const users = (await (await adminApi("GET", "/auth/v1/admin/users?per_page=1000")).json()).users ?? [];
    const u = users.find((x) => x.email === S.customerEmail);
    if (u) rc = await adminApi("PUT", `/auth/v1/admin/users/${u.id}`, { password: custPw, email_confirm: true });
  }
  rec("S0 the local stack accepts the admin's and the customer's passwords (admin API)", ra.status === 200 && rc.status < 300, `admin ${ra.status}, customer ${rc.status}`);

  // ------------------------------------------------------------------------------------------ dashboard
  // Its own client address: the local rate limiter keeps counters between runs (as in finish-account-browser.e2e.mjs).
  dctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "cf-connecting-ip": `10.66.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  await dctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
  dpage = await dctx.newPage();
  watch(dpage, "dashboard");
  await dpage.goto(`${D}/login`, { waitUntil: "load", timeout: 60000 });
  // The DC page compiles in the browser: fill only once the form has mounted, and check the values stuck before pressing the button.
  await dpage.waitForLoadState("networkidle");
  for (let i = 0; i < 4; i++) {
    await dpage.getByPlaceholder("you@example.com").fill(S.adminEmail);
    await dpage.getByPlaceholder("••••••••").fill(adminPw);
    if ((await dpage.getByPlaceholder("you@example.com").inputValue()) === S.adminEmail && (await dpage.getByPlaceholder("••••••••").inputValue()) === adminPw) break;
    await nap(800);
  }
  await dpage.getByRole("button", { name: "Sign in", exact: true }).click();
  await dpage.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  rec("S1 the admin signs in at the dashboard login page with a password", true, `landed on ${new URL(dpage.url()).pathname}`);
  await nap(1500);

  // O4 first: its trip X has a pickup 10 minutes before the seed, so the clash must be made soon after the seed.
  if (want("O4")) {
    try {
      const x = B.x, y = B.y, z = B.z, drvA = S.drivers.a;
      const [yDate, yTime] = S.o4.yTarget.split("T");
      await openBooking(dpage, "y");
      await startEdit(dpage);
      await dpage.getByLabel("Date", { exact: true }).fill(yDate);
      await dpage.getByLabel("Time", { exact: true }).fill(yTime);
      await dpage.locator("[data-ops-clash]").waitFor({ timeout: 25000 });
      await waitPreview(dpage, /No new price|Pickup|Date|Time/i);
      const clash = (await dpage.locator("[data-ops-clash]").innerText()).replace(/\s+/g, " ");
      await shot(changeBox(dpage), "o4-clash-box");
      const names = clash.includes(x.reference) && /Keep/.test(clash) && /Take .* off/.test(clash);
      rec("O4a moving trip Y onto driver a's trip X: the box names X with Keep / Take off", names, short(clash, 260));
      await dpage.getByText(/Keep .* on this trip/).first().click();
      const n0 = apiLog.length;
      await primary(dpage).click();
      await confirmDialog(dpage);
      const t = await toastText(dpage, /Trip changed|Could not change|Reassign/);
      const leg = J(legRow("y"));
      rec("O4b Keep -> Change the trip: applied; Y keeps driver a and carries overlap_kept_range = scheduled_range",
        /Trip changed/.test(t) && leg.driver === drvA && leg.kept === true && leg.local === S.o4.yTarget,
        `toast "${short(t, 110)}"; leg ${JSON.stringify({ local: leg.local, driverIsA: leg.driver === drvA, kept: leg.kept })}; ${since(n0, /change$/)}`);

      await openBooking(dpage, "x");
      const n1 = apiLog.length;
      await actions(dpage, "Complete");
      await nap(2500);
      const xs = q(`select b.status || '/' || l.status from public.bookings b join public.booking_legs l on l.booking_id = b.id where b.id = '${x.id}'`);
      const patch = apiOf(n1, /\/api\/staff\/bookings\/[^/]+$/).find((a) => a.m === "PATCH");
      rec("O4c Complete on trip X (another trip was kept against it) succeeds", patch?.s === 200 && xs.startsWith("completed"), `PATCH ${patch?.s} ${short(patch?.b, 80)}; booking/leg status in the database: ${xs}`);

      await openBooking(dpage, "z");
      await dpage.locator("[data-ops-assign-select] select").selectOption({ label: "P6E Driver a" });
      const n2 = apiLog.length;
      await dpage.locator("[data-ops-assign]").getByRole("button", { name: "Assign", exact: true }).click();
      await dpage.locator("[data-ops-assign-err]").waitFor({ timeout: 15000 });
      const err = (await dpage.locator("[data-ops-assign-err]").innerText()).replace(/\s+/g, " ");
      const zdrv = J(legRow("z")).driver;
      rec("O4d an ordinary Assign of driver a onto a third trip overlapping Y is refused", /Overlaps/.test(err) && zdrv === null, `page: "${short(err, 90)}"; ${since(n2, /assign/)}; trip Z driver in the database: ${zdrv}`);
    } catch (e) {
      await stopped("O4 clash, Keep, Complete, Assign", e);
    }
  }
  const driverMail = (d) => `p6e-driver-${d}-${S.tag}@example.test`;
  const boxFigures = (text) => {
    const flat = text.replace(/\s+/g, " ");
    const get = (label) => { const m = new RegExp(`${label}\\s*CHF[\\s\\u00a0]*([\\d.]+)`, "i").exec(flat); return m ? Math.round(Number(m[1]) * 100) : null; };
    return { paid: get("Paid so far"), total: get("New total"), diff: get("Difference to pay"), refund: get("Refund due"), text: flat };
  };

  // O1 a dearer place: the customer gets the pay link, the trip keeps its place until paid; then Withdraw.
  if (want("O1")) {
    try {
      const d = B.dear;
      const t0 = new Date().toISOString();
      const nStats = (await fj("/__stats")).refunds;
      await openBooking(dpage, "dear");
      await startEdit(dpage);
      await pickPlace(dpage, "Pickup", "Zug", "Zug station");
      await waitPreview(dpage, /Difference to pay/i);
      const f = boxFigures(await changeBox(dpage).innerText());
      await shot(changeBox(dpage), "o1-dearer-change-box");
      rec("O1a Pickup 'Zug': the box shows Pickup old -> new, paid so far, new total and the difference to pay",
        /Pickup Zurich Oerlikon.*Zug station/.test(f.text) && f.paid === d.paid && f.total > f.paid && f.diff === f.total - f.paid,
        `paid ${money(f.paid)}, new total ${money(f.total)}, difference to pay ${money(f.diff)}; "${short(f.text.slice(0, 90))}"`);
      const n0 = apiLog.length;
      await primary(dpage).click();
      await confirmDialog(dpage);
      const t1 = await toastText(dpage, /e-mailed the link|Could not change|did not go out/);
      const leg = J(legRow("dear"));
      const reqRow = q(`select coalesce(json_agg(json_build_object('status', status, 'place', payload ->> 'pickup_place_id', 'session', extra_session_id, 'actor', actor)), '[]') from public.booking_edit_requests where booking_id = '${d.id}' and status = 'requested'`);
      const reqs = J(reqRow);
      const sessions = await fj("/__sessions");
      const sess = sessions.find((s) => s.id === reqs[0]?.session);
      const mails = await mailsSince(t0);
      const payMail = mails.find((m) => m.to.includes(d.email));
      rec("O1b Continue -> Change the trip: the page says the customer was e-mailed the pay link; the leg keeps the OLD pickup; a pending request waits",
        new RegExp(`e-mailed the link to pay ${money(f.diff).replace(".", "\\.")}`).test(t1) && leg.pickup === "Zurich Oerlikon" && leg.pickup_place === "mb-oerlikon" && reqs.length === 1 && reqs[0].place === "mb-zug",
        `toast "${short(t1, 120)}"; leg pickup still "${leg.pickup}" (${leg.pickup_place}); requests ${JSON.stringify(reqs.map((r) => ({ status: r.status, place: r.place, actor: r.actor })))}; ${since(n0, /change$/)}`);
      rec("O1c a Stripe stand-in session exists for exactly the difference",
        sess?.status === "open" && sess.amount_total === f.diff, `session ${sess ? `${sess.status}, amount_total ${sess.amount_total} = ${money(sess.amount_total)}` : "none"} (difference ${f.diff})`);
      const sentence = payMail?.text.includes("Neuer Abholort:") && payMail.text.includes("Zug station");
      rec("O1d the Resend stand-in got the D14 mail in German (subject, 'Neuer Abholort:' sentence)",
        !!payMail && payMail.subject === `Ihre Vamos Taxi-Buchung ${d.reference}: Differenz bezahlen` && !!sentence,
        `${fmtMails(mails)}; sentence 'Neuer Abholort: ... Zug station' ${sentence ? "found" : "NOT found"}; difference in text: ${payMail ? payMail.text.includes(chf(f.diff).replace(".", ".")) : "-"}`);
      // The waiting change on the page, then Withdraw.
      await openBooking(dpage, "dear");
      await dpage.getByText(/Waiting for payment of the difference/).first().waitFor({ timeout: 15000 });
      const waitTxt = (await dpage.getByText(/Waiting for payment of the difference/).first().locator("xpath=ancestor::*[contains(@class,'vt-alert')][1]").innerText().catch(() => "")).replace(/\s+/g, " ");
      const n1 = apiLog.length;
      await actions(dpage, "Withdraw change");
      await dpage.getByRole("button", { name: "Withdraw change", exact: true }).last().click();
      const t2 = await toastText(dpage, /Change withdrawn|did not close the payment page|No class change is waiting|has just paid/);
      const after = J(q(`select coalesce(json_agg(status), '[]') from public.booking_edit_requests where booking_id = '${d.id}'`));
      const sess2 = (await fj("/__sessions")).find((s) => s.id === reqs[0]?.session);
      rec("O1e Withdraw change: the request is withdrawn and the Stripe session expired",
        /Change withdrawn/.test(t2) && after.includes("withdrawn") && !after.includes("requested") && sess2?.status === "expired",
        `page shows "${short(waitTxt, 90)}"; toast "${short(t2, 80)}"; request statuses ${JSON.stringify(after)}; session ${sess2?.status}; ${since(n1, /withdraw/)}`);
      const refunds = (await fj("/__stats")).refunds - nStats;
      rec("O1f no refund call reached the Stripe stand-in", refunds === 0, `refund calls: ${refunds}`);
    } catch (e) {
      await stopped("O1 dearer place, pay link, withdraw", e);
    }
  }

  // O2 a cheaper place: written at once, Refund due with the full difference, no refund sent.
  if (want("O2")) {
    try {
      const c = B.cheap;
      const nStats = (await fj("/__stats")).refunds;
      await openBooking(dpage, "cheap");
      await startEdit(dpage);
      await pickPlace(dpage, "Destination", "Walli", "Wallisellen");
      await waitPreview(dpage, /Refund due/i);
      const f = boxFigures(await changeBox(dpage).innerText());
      await shot(changeBox(dpage), "o2-cheaper-change-box");
      const n0 = apiLog.length;
      await primary(dpage).click();
      await confirmDialog(dpage);
      const t1 = await toastText(dpage, /Trip changed|Could not change/);
      const leg = J(legRow("cheap"));
      const snap = J(q(`select json_build_object('km', s.distance_km, 'min', s.duration_min, 'total', s.total_rappen, 'refund', b.refund_status, 'owed', b.refund_owed_rappen) from public.bookings b join public.price_snapshots s on s.id = b.price_snapshot_id where b.id = '${c.id}'`));
      const due = c.paid - snap.total;
      rec("O2a Destination 'Wallisellen': 'Trip changed. Refund due: CHF ...' and the leg carries the new drop-off (text, place id, coordinates, duration)",
        /Trip changed\. Refund due: /.test(t1) && leg.dropoff === "Wallisellen" && leg.dropoff_place === "mb-wallisellen" && Number(leg.dropoff_lat) === 47.4148 && leg.dur === 11,
        `toast "${short(t1, 100)}"; leg ${JSON.stringify({ dropoff: leg.dropoff, place: leg.dropoff_place, lat: leg.dropoff_lat, duration_min: leg.dur })}; ${since(n0, /change$/)}`);
      rec("O2b the price record carries the new distance; Refund due is the full difference; the Stripe stand-in got no refund call",
        Number(snap.km) === 6.21 && snap.min === 11 && snap.owed === due && snap.refund === "pending_ops" && f.refund === due && (await fj("/__stats")).refunds === nStats,
        `distance_km ${snap.km} (route 6210 m), duration ${snap.min} min; box said Refund due ${money(f.refund)}; refund_owed ${money(snap.owed)} = paid ${money(c.paid)} - new total ${money(snap.total)}; refund_status ${snap.refund}; Stripe refund calls ${(await fj("/__stats")).refunds - nStats}`);
      await openBooking(dpage, "cheap");
      await dpage.getByText("Refund due", { exact: true }).first().waitFor({ timeout: 15000 });
      const region = dpage.locator("[data-ops-refund-region]").first();
      const regionText = (await region.innerText().catch(() => "")).replace(/\s+/g, " ");
      await shot(region, "o2-refund-due-panel");
      rec("O2c the booking page shows the Refund due panel with the full difference", regionText.includes(money(due)), `panel: "${short(regionText, 170)}"`);
    } catch (e) {
      await stopped("O2 cheaper place", e);
    }
  }

  // O3 time only on a booking with driver b: no new price, applied, driver and customer get their mails.
  if (want("O3")) {
    try {
      const tm = B.time;
      const t0 = new Date().toISOString();
      await openBooking(dpage, "time");
      await startEdit(dpage);
      await dpage.getByLabel("Time", { exact: true }).fill("12:00");
      await waitPreview(dpage, /No new price/i);
      const text = (await changeBox(dpage).innerText()).replace(/\s+/g, " ");
      const n0 = apiLog.length;
      await primary(dpage).click();
      await confirmDialog(dpage);
      const t1 = await toastText(dpage, /Trip changed|Could not change/);
      await nap(1500);
      const leg = J(legRow("time"));
      const mails = await mailsSince(t0);
      const toDriver = mails.find((m) => m.to.includes(driverMail("b")));
      const toCust = mails.find((m) => m.to.includes(tm.email));
      rec("O3a time +2 h on a trip with driver b: 'No new price', applied, the leg has the new time and keeps driver b",
        /No new price: the customer keeps the price paid/.test(text) && /Trip changed/.test(t1) && leg.local === "2030-01-05T12:00" && leg.driver === S.drivers.b,
        `box "${short(text, 120)}"; toast "${short(t1, 120)}"; leg ${leg.local}, driver b kept: ${leg.driver === S.drivers.b}; ${since(n0, /change$/)}`);
      rec("O3b driver b got the existing time-change mail and the customer got the confirmation again", !!toDriver && !!toCust, fmtMails(mails));
    } catch (e) {
      await stopped("O3 time only", e);
    }
  }

  // O5 contact: Mobile and Note saved at once, in the history, no mail.
  if (want("O5")) {
    try {
      const ct = B.contact;
      const t0 = new Date().toISOString();
      const ev0 = Number(q(`select count(*) from public.booking_events where booking_id = '${ct.id}'`));
      await openBooking(dpage, "contact");
      await startEdit(dpage);
      await dpage.getByLabel("Mobile", { exact: true }).fill("+41 79 111 22 33");
      await dpage.getByLabel("Note", { exact: true }).fill("Wait at arrivals, sign with the name");
      const n0 = apiLog.length;
      const btn = await primary(dpage).innerText();
      await primary(dpage).click();
      const t1 = await toastText(dpage, /Saved\. |Could not/);
      await nap(1200);
      const row = J(q(`select json_build_object('phone', contact_phone, 'note', note) from public.bookings where id = '${ct.id}'`));
      const leg = J(legRow("contact"));
      const ev = q(`select coalesce(string_agg(kind, ','), '') from public.booking_events where booking_id = '${ct.id}' and kind like 'booking.modified%'`);
      const evN = Number(q(`select count(*) from public.booking_events where booking_id = '${ct.id}'`)) - ev0;
      const mails = await mailsSince(t0);
      rec("O5 Mobile and Note -> Save changes: 'Saved. The change is in the history.', the database holds both, a booking_events row, NO mail",
        /Saved\. The change is in the history\./.test(t1) && row.phone.replace(/\D/g, "") === "41791112233" && /Wait at arrivals/.test(row.note) && evN >= 1 && mails.length === 0,
        `button "${btn.trim()}"; toast "${short(t1, 70)}"; phone ${row.phone}; note "${short(row.note, 40)}"; new events ${evN} (${ev}); ${fmtMails(mails)}; ${since(n0, /bookings\/[^/]+$/)}`);
    } catch (e) {
      await stopped("O5 contact", e);
    }
  }

  // O6 flight number on an airport pickup with a driver: saved, the driver gets the flight-number mail.
  if (want("O6")) {
    try {
      const t0 = new Date().toISOString();
      await openBooking(dpage, "air");
      await startEdit(dpage);
      await dpage.getByLabel("Flight", { exact: true }).fill("LX 320");
      const n0 = apiLog.length;
      await primary(dpage).click();
      const t1 = await toastText(dpage, /Saved\. |Could not/);
      await nap(1500);
      const leg = J(legRow("air"));
      const mails = await mailsSince(t0);
      const toDriver = mails.find((m) => m.to.includes(driverMail("c")));
      rec("O6 airport pickup with driver c: Flight number -> Save changes: saved, the driver got the flight-number mail",
        /Saved\. The driver gets the new flight number by e-mail\./.test(t1) && leg.flight === "LX 320" && !!toDriver,
        `toast "${short(t1, 80)}"; flight in the database ${leg.flight}; ${fmtMails(mails)}; ${since(n0, /bookings\/[^/]+$/)}`);
    } catch (e) {
      await stopped("O6 flight", e);
    }
  }

  // O7 a place the site cannot book: refused under the field, nothing written.
  if (want("O7")) {
    try {
      const e8 = B.edit8;
      const before = legRow("edit8");
      const reqBefore = q(`select count(*) from public.booking_edit_requests where booking_id = '${e8.id}'`);
      const evBefore = q(`select count(*) from public.booking_events where booking_id = '${e8.id}'`);
      await openBooking(dpage, "edit8");
      await startEdit(dpage);
      await pickPlace(dpage, "Pickup", "Dubai", "Dubai Mall");
      await dpage.getByText("The site cannot book this place. Nothing has changed.").first().waitFor({ timeout: 20000 });
      await shot(dpage.locator("[data-ops-trip-grid]"), "o7-dubai-refused");
      const cont = await primary(dpage).isDisabled().catch(() => null);
      rec("O7 Pickup 'Dubai': refused under the field ('The site cannot book this place. Nothing has changed.'), nothing written",
        legRow("edit8") === before && q(`select count(*) from public.booking_edit_requests where booking_id = '${e8.id}'`) === reqBefore && q(`select count(*) from public.booking_events where booking_id = '${e8.id}'`) === evBefore,
        `leg unchanged: ${legRow("edit8") === before}; requests ${reqBefore} -> ${q(`select count(*) from public.booking_edit_requests where booking_id = '${e8.id}'`)}; events ${evBefore} -> ${q(`select count(*) from public.booking_events where booking_id = '${e8.id}'`)}; Continue disabled: ${cont}; ${since(0, /change\/preview$/).split(" | ").slice(-1)[0]}`);
    } catch (e) {
      await stopped("O7 Dubai", e);
    }
  }

  // O8 more passengers than Economy takes: the class list offers only classes that fit, one price for the whole change.
  if (want("O8")) {
    try {
      const e8 = B.edit8;
      const before = legRow("edit8");
      await openBooking(dpage, "edit8");
      await startEdit(dpage);
      await dpage.getByLabel("Passengers", { exact: true }).fill("6");
      await dpage.getByText(/Classes that fit: Business|cannot take this party/).first().waitFor({ timeout: 20000 });
      const opts = await dpage.getByLabel("Vehicle class").locator("option").allInnerTexts();
      const hint = (await dpage.locator("[data-ops-trip-grid]").innerText()).replace(/\s+/g, " ");
      await dpage.getByLabel("Vehicle class").selectOption({ label: "Business" });
      await waitPreview(dpage, /Vehicle class.*Business/i);
      const f = boxFigures(await changeBox(dpage).innerText());
      await shot(dpage.locator("[data-ops-edit-group='trip']"), "o8-classes-that-fit");
      const rows = (await dpage.locator("[data-ops-chg-row]").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
      const oneDiff = (f.text.match(/Difference to pay/gi) ?? []).length === 1;
      rec("O8 Passengers 6 on an Economy booking: the class list offers only the classes that fit (Business, besides the current one tagged 'too small'); one price for the whole change",
        opts.some((o) => /^Business$/.test(o.trim())) && opts.some((o) => /too small/.test(o)) && /Passengers.*2.*6/.test(rows.join(" ")) && /Vehicle class.*Economy.*Business/.test(rows.join(" ")) && oneDiff && f.diff > 0,
        `options ${JSON.stringify(opts.map((o) => o.trim()))}; hint "Classes that fit: Business" ${/Classes that fit: Business/.test(hint)}; box rows ${JSON.stringify(rows)}; one total: new total ${money(f.total)}, paid ${money(f.paid)}, difference to pay ${money(f.diff)}`);
      await dpage.locator("[data-ops-edit-acts]").getByRole("button").first().click(); // Cancel: nothing was confirmed
      rec("O8b leaving the edit without confirming wrote nothing", legRow("edit8") === before, `leg unchanged: ${legRow("edit8") === before}`);
    } catch (e) {
      await stopped("O8 classes that fit", e);
    }
  }

  // ------------------------------------------------------------------------------------------ public site
  const norm = (s) => String(s ?? "").replace(/[‎‏⁦-⁩؜]/g, "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
  const scroll390 = []; // { name, over } for C5b
  const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const LANGS = { en: "English", de: "Deutsch", fr: "Français", ar: "العربية" };
  async function setLang(page, code) {
    await page.locator("button[aria-haspopup=listbox]").first().click();
    await page.getByRole("option", { name: new RegExp(LANGS[code]) }).first().click();
    await page.waitForFunction((c) => document.documentElement.lang === c, code, { timeout: 8000 });
    await nap(500);
  }
  const widthsOf = async (page, widths) => {
    const out = [];
    for (const w of widths) { await page.setViewportSize({ width: w, height: 900 }); await nap(350); out.push(`${w}:${await sideways(page)}`); }
    await page.setViewportSize({ width: 1440, height: 1000 });
    return out;
  };
  const over = (x) => Number(x.split(":")[1]);
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "cf-connecting-ip": `10.67.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  await cctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
  const cpage = await cctx.newPage();
  watch(cpage, "public");
  let bannerGone = false;
  async function manage(page, key) {
    await page.goto(`${BASE}/manage-booking?token=${S.tokens[key]}`, { waitUntil: "load", timeout: 60000 });
    await page.getByText(B[key].reference).first().waitFor({ timeout: 25000 });
    if (!bannerGone) { // the cookie banner: the privacy-preserving choice, once per browser
      await page.getByRole("button", { name: "Necessary only" }).click({ timeout: 6000 }).catch(() => {});
      bannerGone = true;
    }
    await nap(600);
  }
  const msg = async (page, re, ms = 20000) => { const l = page.getByText(re).first(); await l.waitFor({ timeout: ms }); return norm(await l.innerText()); };
  // The WhenPicker: open it, pick the next day and one hour later, "Time set".
  async function pickNextDayLater(page) {
    await page.locator("button[aria-haspopup=dialog]").filter({ hasText: "Jan" }).first().click();
    const pop = page.locator("[role=dialog][aria-label]").first();
    const cur = await pop.locator("button[aria-pressed=true]").first().innerText().catch(() => "");
    const day = Number(cur) || 8;
    await pop.locator("[data-wp-cal] button").filter({ hasText: new RegExp(`^${day + 1}$`) }).first().click();
    await pop.getByRole("button", { name: "Hour up" }).click();
    await pop.getByRole("button", { name: "Time set" }).click();
    await nap(400);
    return day + 1;
  }
  /** The request must hold the day and time the page showed as 'new pickup' (e.g. "Fri 9 Oct · 11:00"), not the booked ones. */
  const shownLocal = (diff) => {
    const m = /(\d{1,2}) ([A-Z][a-z]{2}) · (\d{2}:\d{2})\s*$/.exec(diff);
    if (!m) return null;
    const month = String(new Date(`${m[2]} 1, 2026`).getMonth() + 1).padStart(2, "0");
    return { dd: m[1].padStart(2, "0"), month, time: m[3] };
  };
  const holdsShown = (payload, sh) => !!sh && new RegExp(`^\\d{4}-${sh.month}-${sh.dd}T${sh.time}`).test(String(payload?.scheduled_local ?? ""));
  const requestRow = (key) => q(`select coalesce((select json_build_object('actor', actor, 'status', status, 'payload', payload) from public.booking_edit_requests where booking_id = '${B[key].id}' and actor <> 'staff' order by created_at desc limit 1), 'null'::json)`);

  // C1 the D15 line on the customer's booking page, in four languages, no sideways scroll at 390 and 1440.
  if (want("C1")) {
    try {
      const c = B.cheap;
      const due = Number(q(`select refund_owed_rappen from public.bookings where id = '${c.id}'`));
      const a = chf(due);
      const LINE = {
        en: "Your trip has changed. The difference of CHF {a} comes back to the payment method you used; our team sends it.",
        de: "Ihre Fahrt wurde geändert. Die Differenz von CHF {a} geht auf das Zahlungsmittel zurück, mit dem Sie bezahlt haben; unser Team veranlasst sie.",
        fr: "Votre trajet a été modifié. La différence de CHF {a} vous est remboursée sur le moyen de paiement utilisé ; notre équipe l’envoie.",
        ar: "تم تعديل رحلتك. يُردّ إليك الفرق البالغ CHF {a} إلى وسيلة الدفع التي استخدمتها؛ يرسله فريقنا.",
      };
      const START = { en: "Your trip has changed", de: "Ihre Fahrt wurde geändert", fr: "Votre trajet a été modifié", ar: "تم تعديل رحلتك" };
      await manage(cpage, "cheap");
      const res = [];
      for (const lang of ["en", "de", "fr", "ar"]) {
        if (lang !== "en") await setLang(cpage, lang);
        const body = norm(await cpage.locator("body").innerText());
        const found = body.includes(norm(LINE[lang].replace("{a}", a)));
        const dir = await cpage.evaluate(() => document.documentElement.dir);
        const w = await widthsOf(cpage, [390, 1440]);
        scroll390.push({ name: `C1 ${lang}`, over: over(w[0]) });
        res.push({ lang, found, dir, w });
        if (lang === "de" || lang === "ar" || lang === "en") await shot(cpage.locator("p").filter({ hasText: START[lang] }).first(), `c1-d15-line-${lang}`);
      }
      const ok = res.every((r) => r.found && r.w.every((x) => over(x) <= 1)) && res.find((r) => r.lang === "ar").dir === "rtl";
      rec("C1 manage-booking after the cheaper change: the approved D15 line in English, Deutsch, Français and العربية (Arabic page is rtl); no sideways scroll at 390 and 1440",
        ok, `refund line amount CHF ${a} (database refund_owed); ` + res.map((r) => `${r.lang}: line ${r.found ? "found" : "MISSING"}, dir ${r.dir}, overflow(px) ${r.w.join(" ")}`).join("; "));
    } catch (e) {
      await stopped("C1 D15 line", e, cpage);
    }
  }

  // C2 manage-booking on the airport-pickup booking: flight Save, Resend, then another day and time.
  if (want("C2")) {
    try {
      const air = B.air;
      await manage(cpage, "air");
      scroll390.push({ name: "C2 manage page", over: over((await widthsOf(cpage, [390]))[0]) });
      await cpage.getByRole("button", { name: "Edit", exact: true }).click();
      await cpage.locator("#mb-flight").fill("LX 322");
      const n0 = apiLog.length;
      await cpage.getByRole("button", { name: "Save flight number" }).click();
      const m1 = await msg(cpage, /Flight number saved\./);
      const leg = J(legRow("air"));
      rec("C2a flight Save: 'Flight number saved.' and the database holds the new number", leg.flight === "LX 322", `message "${m1}"; flight in the database ${leg.flight}; ${since(n0, /manage\/flight/)}`);

      const t0 = new Date().toISOString();
      const n1 = apiLog.length;
      await cpage.getByRole("button", { name: "Resend email", exact: true }).first().click();
      const m2 = await msg(cpage, /Sent\. Check .* in a minute or two\./);
      await nap(1200);
      const mails = (await mailsSince(t0)).filter((m) => m.to.includes(air.email));
      rec("C2b Resend: 'Sent. Check <the booking's address> ...' and the Resend stand-in got the confirmation",
        m2.includes(air.email) && mails.length >= 1 && mails.some((m) => m.subject.includes(air.reference) && !/storniert/.test(m.subject)),
        `message "${m2}"; ${fmtMails(mails)}; ${since(n1, /manage\/resend/)}`);

      const n2 = apiLog.length;
      await cpage.getByRole("button", { name: /Make a change/ }).click();
      const newDay = await pickNextDayLater(cpage);
      const diffs = norm(await cpage.locator("[data-diff]").first().innerText().catch(() => ""));
      await shot(cpage.locator("[data-diff]").first(), "c2-change-diff");
      await cpage.getByRole("button", { name: "Request these changes", exact: true }).click();
      const m3 = await msg(cpage, /Time-change requested/);
      const rr = J(requestRow("air"));
      const sh = shownLocal(diffs);
      rec("C2c Change -> another DAY and time -> Request: 'Time-change requested' and the request in the database holds the new day and time",
        /Time-change requested/.test(m3) && holdsShown(rr.payload, sh) && !String(rr.payload.scheduled_local).startsWith("2030-01-08"),
        `diff "${diffs}" (booked day 2030-01-08); message "${short(m3, 90)}"; request ${rr.status} ${short(JSON.stringify(rr.payload), 100)} (page showed ${sh ? `${sh.month}-${sh.dd} ${sh.time}` : "?"}); ${since(n2, /manage\/(modify|change|time)/)}`);
    } catch (e) {
      await stopped("C2 manage-booking flight, resend, change", e, cpage);
    }
  }

  // C3 the cancel view: "Move it instead" keeps its title and button, the sentence is gone (D12).
  if (want("C3")) {
    try {
      await manage(cpage, "dear");
      await cpage.getByRole("button", { name: /Cancel this transfer/ }).first().click();
      const box = cpage.locator("button[data-fork]").filter({ hasText: "Move it instead" }).first();
      await box.waitFor({ timeout: 15000 });
      const boxText = norm(await box.innerText());
      const body = norm(await cpage.locator("body").innerText());
      scroll390.push({ name: "C3 cancel view", over: over((await widthsOf(cpage, [390]))[0]) });
      await shot(box, "c3-move-it-instead");
      rec("C3 Cancel this transfer: the 'Move it instead' box shows its title and button and NOT 'Keep the booking and the fare where they are...'",
        /Move it instead/.test(boxText) && /Change instead/i.test(boxText) && !/Keep the booking and the fare where they are/.test(body),
        `box text "${boxText}"; sentence on the page: ${/Keep the booking and the fare/.test(body)}`);
    } catch (e) {
      await stopped("C3 cancel view", e, cpage);
    }
  }

  // C4 the signed-in booking view: flight Save, Resend, Change this booking -> Request.
  if (want("C4")) {
    try {
      const ac = B.acct;
      const pctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "cf-connecting-ip": `10.68.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
      await pctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
      const ppage = await pctx.newPage();
      watch(ppage, "account");
      await ppage.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 60000 });
      await ppage.waitForLoadState("networkidle");
      await ppage.getByRole("button", { name: "Necessary only" }).click({ timeout: 6000 }).catch(() => {});
      for (let i = 0; i < 4; i++) {
        await ppage.getByLabel("Email").fill(S.customerEmail);
        await ppage.getByLabel("Password").first().fill(custPw);
        if ((await ppage.getByLabel("Email").inputValue()) === S.customerEmail && (await ppage.getByLabel("Password").first().inputValue()) === custPw) break;
        await nap(800);
      }
      await ppage.getByRole("button", { name: "Sign in", exact: true }).last().click();
      await ppage.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 });
      rec("C4a the customer signs in at /sign-in with a password", true, `landed on ${new URL(ppage.url()).pathname}`);
      await ppage.goto(`${BASE}/booking-detail?ref=${ac.reference}`, { waitUntil: "load", timeout: 60000 });
      await ppage.getByText(ac.reference).first().waitFor({ timeout: 25000 });
      await nap(800);
      scroll390.push({ name: "C4 booking-detail", over: over((await widthsOf(ppage, [390]))[0]) });
      const pmsg = async (re) => msg(ppage, re);
      await ppage.getByRole("button", { name: "Edit", exact: true }).click();
      await ppage.locator("#mb-flight").fill("LX 324");
      const n0 = apiLog.length;
      await ppage.getByRole("button", { name: "Save flight number" }).click();
      const m1 = await pmsg(/Flight number saved\./);
      const leg = J(legRow("acct"));
      rec("C4b signed in: flight Save posts /api/account/bookings/flight, 'Flight number saved.', the database holds it",
        leg.flight === "LX 324" && apiOf(n0, /account\/bookings\/flight/).some((x) => x.s === 200), `message "${m1}"; flight ${leg.flight}; ${since(n0, /account\/bookings\/flight/)}`);

      const t0 = new Date().toISOString();
      const n1 = apiLog.length;
      await ppage.getByRole("button", { name: "Resend email", exact: true }).first().click();
      const m2 = await pmsg(/Sent\. Check .* in a minute or two\./);
      await nap(1200);
      const mails = (await mailsSince(t0)).filter((m) => m.to.includes(ac.email));
      rec("C4c signed in: Resend email posts /api/account/bookings/resend, 'Sent. Check <address> ...', the stand-in got the confirmation",
        m2.includes(ac.email) && apiOf(n1, /account\/bookings\/resend/).some((x) => x.s === 200) && mails.some((m) => m.subject.includes(ac.reference)),
        `message "${m2}"; ${fmtMails(mails)}; ${since(n1, /account\/bookings\/resend/)}`);

      const n2 = apiLog.length;
      await ppage.getByRole("button", { name: /Make a change/ }).click();
      const newDay = await pickNextDayLater(ppage);
      const diffs4 = norm(await ppage.locator("[data-diff]").first().innerText().catch(() => ""));
      await ppage.getByRole("button", { name: "Request these changes", exact: true }).click();
      const m3 = await pmsg(/Time-change requested/);
      await shot(ppage.getByText(/Time-change requested/).first(), "c4-time-change-requested");
      const rr = J(requestRow("acct"));
      const sh4 = shownLocal(diffs4);
      rec("C4d signed in: Change this booking -> another day and time -> Request: 'Time-change requested', the database request holds the new day",
        /Time-change requested/.test(m3) && holdsShown(rr.payload, sh4) && !String(rr.payload.scheduled_local).startsWith("2030-01-10"),
        `diff "${diffs4}" (booked day 2030-01-10); message "${short(m3, 90)}"; request ${rr.status} ${short(JSON.stringify(rr.payload), 100)} (page showed ${sh4 ? `${sh4.month}-${sh4.dd} ${sh4.time}` : "?"}); ${since(n2, /account\/bookings(?!\/(flight|resend))/)}`);

      // C6 (lead): the three pages at 1024 and 768 in English and Arabic.
      const six = [];
      for (const [name, page, go] of [
        ["C1 page (manage, cheaper trip)", cpage, () => manage(cpage, "cheap")],
        ["C2 page (manage, airport pickup)", cpage, () => manage(cpage, "air")],
        ["C4 page (booking view)", ppage, async () => { await ppage.goto(`${BASE}/booking-detail?ref=${ac.reference}`, { waitUntil: "load" }); await ppage.getByText(ac.reference).first().waitFor({ timeout: 25000 }); await nap(800); }],
      ]) {
        await go();
        const en = await widthsOf(page, [1024, 768]);
        await setLang(page, "ar");
        const ar = await widthsOf(page, [1024, 768]);
        const dir = await page.evaluate(() => document.documentElement.dir);
        six.push({ name, en, ar, dir });
      }
      const bad = six.filter((r) => [...r.en, ...r.ar].some((x) => over(x) > 1) || r.dir !== "rtl");
      rec("C6 no sideways scroll at 1024 and 768 in English and Arabic on the C1, C2 and C4 pages", bad.length === 0,
        six.map((r) => `${r.name}: en ${r.en.join(" ")} | ar(${r.dir}) ${r.ar.join(" ")}`).join("; "));
      await pctx.close();
    } catch (e) {
      await stopped("C4 signed-in booking view", e, cpage);
    }
  }

  // C7 (D20) a cancelled booking: "Resend confirmation" sends the cancellation e-mail, not the "Booked" mail.
  if (want("C7")) {
    try {
      const cn = B.canc;
      await manage(cpage, "canc");
      await cpage.getByRole("button", { name: /Cancel this transfer/ }).first().click();
      await cpage.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
      await cpage.getByText("This transfer is cancelled").first().waitFor({ timeout: 25000 });
      await nap(1500);
      scroll390.push({ name: "C7 cancelled view", over: over((await widthsOf(cpage, [390]))[0]) });
      const st = q(`select status from public.bookings where id = '${cn.id}'`);
      const t0 = new Date().toISOString();
      const n0 = apiLog.length;
      await cpage.getByRole("button", { name: "Resend confirmation" }).click();
      const m = await msg(cpage, /Sent\. Check .* in a minute or two\./);
      await nap(1500);
      const allNew = await mailsSince(t0);
      const mails = allNew.filter((x) => x.to.includes(cn.email));
      rec("C7 cancelled booking -> Resend confirmation: 'Sent. Check <address> ...'; the stand-in got exactly ONE mail to it, the cancellation subject, no 'Gebucht' mail",
        st === "cancelled" && m.includes(cn.email) && mails.length === 1 && new RegExp(`^Buchung ${cn.reference} ist storniert`).test(mails[0].subject) && !allNew.some((x) => /Gebucht/.test(x.subject)),
        `booking status ${st}; message "${m}"; mails to the address since the press: ${fmtMails(mails)}; all mails since: ${allNew.length}; ${since(n0, /manage\/resend/)}`);
    } catch (e) {
      await stopped("C7 cancelled resend", e, cpage);
    }
  }
  await cctx.close();
  rec("C5b no sideways scroll at 390 on the pages visited", scroll390.every((x) => x.over <= 1), scroll390.map((x) => `${x.name}: ${x.over}`).join("; ") || "no page measured");
} catch (e) {
  rec("RUN the browser run", false, short(e, 300));
} finally {
  rec("C5a no page errors on any page", errors.length === 0, errors.length ? errors.slice(0, 3).join(" | ") : "none");
  await dctx?.close();
  await browser.close();
  finish(process.env.OUT);
}
