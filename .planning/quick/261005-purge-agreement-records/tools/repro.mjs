// Reproduction of the purge / agreement-record bug on the test lab (real Worker build, native local Supabase).
//   eval "$(scripts/test-lab/lab.sh env <name>)" && node .planning/quick/261005-purge-agreement-records/tools/repro.mjs before|after
// (b) customer path: home -> /checkout (guest, the live default) -> PAY -> back from Stripe (the session's cancel_url,
//     built exactly as lib/checkout/intent.ts builds it) -> another class -> PAY again.
// (a) hourly purge: the booking's Stripe session is expired at the stand-in, then the same SQL the sweep runs
//     (SET ROLE vamos_system; select public.purge_unpaid_booking(id, 'unpaid_expired')).
// The Turnstile script is stubbed in the browser (its token is checked by the lab's siteverify stand-in), so
// nothing reaches Cloudflare. Local only. Amounts are the lab's stand-ins, never prices.
import { execFileSync } from "node:child_process";
import { start, finish, open, bookFromHome, chooseClass, fillTraveller, pressPay, BASE, FAKE, db, step } from "../../../../scripts/test-lab/lab-browser.mjs";

const MODE = process.argv[2] === "after" ? "after" : "before";
const DIR = new URL(`../evidence-${MODE}/`, import.meta.url).pathname;
await start({ evidenceDir: DIR });

/** Writes on the lab database (the purge call); returns { out } or { err } with the first error line. */
function write(sql) {
  try {
    return { out: execFileSync(process.env.LAB_PSQL, [process.env.LAB_DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim() };
  } catch (e) {
    return { err: String(e.stderr ?? e.message).split("\n").find((l) => /ERROR/.test(l)) ?? String(e.message).split("\n")[0] };
  }
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const STUB = "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('lab-stub-token')},50);return 'lab-w1'},remove:function(){},reset:function(){}};";

db("select 1"); // fails early when the lab variables are missing
const guestLive = db("select guest_accounts_live from public.settings where id = 1");

const s = await open({ viewport: 1440, name: `repro-${MODE}` });
await s.ctx.route(/challenges\.cloudflare\.com\/turnstile/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
const intents = [];
s.page.on("request", (r) => { if (r.url().includes("/api/checkout/intent") && r.method() === "POST") intents.push(JSON.parse(r.postData() ?? "{}")); });

let email, first, firstReq, second, b1, b2;

await step("R1", "home -> /checkout, Economy, traveller filled, guest choice preselected", async () => {
  await bookFromHome(s);
  await chooseClass(s, /Economy/i);
  ({ email } = await fillTraveller(s));
  const choice = await s.page.locator("[data-co-account] input[type=radio]:checked").first().getAttribute("value").catch(() => null);
  return { ok: guestLive === "t" && /\/checkout/.test(s.page.url()), evidence: `guest_accounts_live=${guestLive}; account choice checked=${choice}; ${new URL(s.page.url()).pathname}` };
});

await step("R2", "PAY: one booking, one account record", async () => {
  first = await pressPay(s);
  firstReq = intents[intents.length - 1];
  const body = JSON.parse(first?.response ?? "{}");
  b1 = body.booking_id;
  let recs = "0";
  for (let i = 0; i < 20 && recs === "0"; i++) { recs = db(`select count(*) from public.account_agreement_records where booking_id = ${q(b1)}`); if (recs === "0") await s.page.waitForTimeout(250); }
  return { ok: first?.status === 200 && !!b1 && recs === "1" && firstReq?.account?.choice === "guest",
    evidence: `intent ${first?.status} ${body.reference ?? ""}; account block sent: ${firstReq?.account?.choice}; records on the booking: ${recs}; quote ${firstReq?.quote_id}` };
});

await step("R3", "back from Stripe (cancel_url with resume), Business chosen", async () => {
  const t = firstReq.trip, p = new URLSearchParams();
  const put = (k, v) => { if (v != null && v !== "") p.set(k, String(v)); };
  put("from", t.from); put("fid", t.fid); put("to", t.to); put("tid", t.tid); put("gs", t.gs); put("when", t.when);
  put("pax", t.pax); put("bags", t.bags); put("flight", t.flight); put("class", firstReq.vehicle_class);
  if ((firstReq.extra_codes ?? []).length) put("extras", firstReq.extra_codes.join(","));
  put("resume", firstReq.quote_id);
  await s.page.goto(`${BASE}/checkout?${p.toString()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await s.page.locator("[data-co-class]").first().waitFor({ timeout: 60000 });
  await s.page.waitForTimeout(2500);
  const filled = await s.page.getByLabel(/^Email/).inputValue().catch(() => "");
  if (filled !== email) await fillTraveller(s, { email });
  await chooseClass(s, /Business/i);
  await s.shot("R3-before-second-pay");
  return { ok: true, evidence: `resume=${firstReq.quote_id}; email restored=${filled === email}` };
});

await step("R4", "PAY again after the change", async () => {
  second = await pressPay(s);
  const body = JSON.parse(second?.response ?? "{}");
  const secondReq = intents[intents.length - 1];
  b2 = body.booking_id ?? null;
  await s.page.waitForTimeout(1000);
  const shown = MODE === "before"
    ? (await s.page.getByText("This quote already has a booking.").first().isVisible().catch(() => false))
    : null;
  if (MODE === "before") await s.shot("R4-refused");
  const pending = db(`select count(*) from public.bookings where contact_email = ${q(email)} and status = 'pending'`);
  const b1Left = db(`select count(*) from public.bookings where id = ${q(b1)}`);
  const recB1 = db(`select count(*) from public.account_agreement_records where booking_id = ${q(b1)}`);
  const detached = db(`select count(*) from public.account_agreement_records where lower(email) = lower(${q(email)}) and booking_id is null`);
  const audit = db(`select count(*) from public.audit_log where table_name = 'bookings' and action = 'delete' and record_id = ${q(b1)} and before_value ->> 'reason' = 'superseded'`);
  const ev = `intent ${second?.status} ${JSON.stringify(body).slice(0, 120)}; supersedes sent=${secondReq?.supersedes ?? null}; same quote=${secondReq?.quote_id === firstReq.quote_id}; ` +
    `message "This quote already has a booking." visible=${shown}; pending bookings for the e-mail=${pending}; first booking left=${b1Left}; records still on it=${recB1}; detached records=${detached}; superseded audit lines=${audit}`;
  if (MODE === "before") return { ok: second?.status === 409 && body.code === "quote_already_booked" && shown === true && b1Left === "1" && recB1 === "1", evidence: `BUG REPRODUCED: ${ev}` };
  let recB2 = "0";
  for (let i = 0; i < 20 && recB2 === "0"; i++) { recB2 = db(`select count(*) from public.account_agreement_records where booking_id = ${q(b2)}`); if (recB2 === "0") await s.page.waitForTimeout(250); }
  return { ok: second?.status === 200 && !!b2 && b2 !== b1 && pending === "1" && b1Left === "0" && recB1 === "0" && detached === "1" && audit === "1" && recB2 === "1",
    evidence: `${ev}; new booking has its own record=${recB2}` };
});

await step("R5", "hourly purge of the unpaid booking that is left (session expired at the stand-in)", async () => {
  const target = MODE === "before" ? b1 : b2;
  const sid = db(`select stripe_checkout_session_id from public.booking_payments where booking_id = ${q(target)} order by id desc limit 1`);
  const exp = await (await fetch(`${FAKE}/__stripe/v1/checkout/sessions/${sid}/expire`, { method: "POST" })).json();
  const listed = db(`select count(*) from public.purge_candidates('0 minutes'::interval) where booking_id = ${q(target)}`);
  const r = write(`set role vamos_system; select public.purge_unpaid_booking(${q(target)}::uuid, 'unpaid_expired')`);
  const left = db(`select count(*) from public.bookings where id = ${q(target)}`);
  const kept = db(`select count(*) from public.account_agreement_records where lower(email) = lower(${q(email)})`);
  const attached = db(`select count(*) from public.account_agreement_records where booking_id = ${q(target)}`);
  const ev = `session ${exp.status}; candidate listed=${listed}; purge -> ${r.err ? `ERROR "${r.err.replace(/^.*ERROR:\s*/, "")}"` : r.out}; booking left=${left}; records for the e-mail=${kept}, still attached=${attached}`;
  if (MODE === "before") return { ok: exp.status === "expired" && listed === "1" && !!r.err && /append-only table public\.account_agreement_records: UPDATE/.test(r.err) && left === "1", evidence: `BUG REPRODUCED: ${ev}` };
  return { ok: exp.status === "expired" && listed === "1" && r.out?.endsWith("t") && left === "0" && attached === "0" && kept === "2", evidence: ev };
});

await s.ctx.close();
await finish();
