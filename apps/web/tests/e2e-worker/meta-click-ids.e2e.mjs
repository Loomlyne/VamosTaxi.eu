// Phase 28 plan 28-07 (META-09): the two Meta cookie values at the Pay press, end to end on a real local Worker
// build against the phase-28 local Supabase stack, with the local stand-ins of fakes.mjs for Stripe and Turnstile.
// Run by meta-run.sh. Local only. Prints no secret; cookie values are fixtures.
import crypto from "node:crypto";
import {
  rec, finish, sql, ensureFixture, mintQuote, intentBody, ORIGIN, newIp, req,
} from "./checkout-common.mjs";

ensureFixture({ guestSwitch: true });
const TOKEN = "e2e-turnstile-token";
const CO = "/checkout?from=Zurich%20Airport&to=Zurich%20HB&when=2099-01-01T10%3A00&pax=2&bags=1&class=business";
const VERSION = sql("select '2026-10-01'"); // CONSENT_POLICY_VERSION (lib/consent/policy.ts)
const FBP = "fb.1.1727771234567.1234567890";
const FBC = "fb.1.1727771234567.IwAR0abc_DEF-123";

const consentRow = (subject, marketing, at) =>
  sql(`insert into public.consent_log (consent_subject_id, policy_version, method, necessary, functional, analytics, marketing, locale, recorded_at)
       values ('${subject}', '${VERSION}', '${marketing ? "accept_all" : "reject_all"}', true, ${marketing}, ${marketing}, ${marketing}, 'en', '${at}')`);

async function pay(email, cookie, { origin = ORIGIN.origin, quote } = {}) {
  const q = quote ?? (await mintQuote());
  const body = intentBody(q, { email, account: { choice: "guest", consent: false, turnstile_token: TOKEN, idempotency_key: `acct-${q.quoteId}`, return_to: CO } });
  const r = await req("POST", "/api/checkout/intent", { headers: { origin, "cf-connecting-ip": newIp(), cookie }, body });
  return { r, q };
}
const ids = (quoteId) => sql(`select coalesce(meta_fbp,'-') || '|' || coalesce(meta_fbc,'-') || '|' || status from public.bookings where quote_id='${quoteId}'`);

// 1 marketing Accept recorded for the subject: both values saved on the unpaid booking
const S1 = crypto.randomUUID();
consentRow(S1, true, "2026-10-03 10:00+00");
let { r, q } = await pay(`e2e-meta-1-${Date.now()}@example.com`, `consent_subject=${S1}; _fbp=${FBP}; _fbc=${FBC}`);
let row = ids(q.quoteId);
rec("1 Pay press with marketing Accept and both Meta cookies: both saved on the pending booking",
  r.status === 200 && r.json?.ok === true && row === `${FBP}|${FBC}|pending`, `status ${r.status} ok=${r.json?.ok}; row=${row === `${FBP}|${FBC}|pending` ? "values saved, pending" : row}`);

// 2 no consent row for the subject: nothing saved
const S2 = crypto.randomUUID();
({ r, q } = await pay(`e2e-meta-2-${Date.now()}@example.com`, `consent_subject=${S2}; _fbp=${FBP}; _fbc=${FBC}`));
row = ids(q.quoteId);
rec("2 Pay press with no consent record: nothing saved, Pay still answers", r.status === 200 && r.json?.ok === true && row === "-|-|pending", `status ${r.status}; row=${row}`);

// 3 latest choice is Necessary only: nothing saved
const S3 = crypto.randomUUID();
consentRow(S3, true, "2026-10-03 10:00+00");
consentRow(S3, false, "2026-10-03 11:00+00");
({ r, q } = await pay(`e2e-meta-3-${Date.now()}@example.com`, `consent_subject=${S3}; _fbp=${FBP}; _fbc=${FBC}`));
row = ids(q.quoteId);
rec("3 Accept then Necessary only: nothing saved", r.status === 200 && row === "-|-|pending", `status ${r.status}; row=${row}`);

// 4 accepted, but a value outside Meta's format: that value is dropped, the good one is kept
const S4 = crypto.randomUUID();
consentRow(S4, true, "2026-10-03 10:00+00");
({ r, q } = await pay(`e2e-meta-4-${Date.now()}@example.com`, `consent_subject=${S4}; _fbp=not-a-meta-value; _fbc=${FBC}`));
row = ids(q.quoteId);
rec("4 malformed _fbp is dropped, valid _fbc is kept", r.status === 200 && row === `-|${FBC}|pending`, `status ${r.status}; row=${row === `-|${FBC}|pending` ? "fbp empty, fbc saved" : row}`);

// 5 a dashboard Origin never stamps the booking (refused before it gets there without a staff session)
const S5 = crypto.randomUUID();
consentRow(S5, true, "2026-10-03 10:00+00");
({ r, q } = await pay(`e2e-meta-5-${Date.now()}@example.com`, `consent_subject=${S5}; _fbp=${FBP}; _fbc=${FBC}`, { origin: "https://dashboard.vamostaxi.site" }));
const n5 = Number(sql(`select count(*) from public.bookings where quote_id='${q.quoteId}' and (meta_fbp is not null or meta_fbc is not null)`));
rec("5 dashboard Origin without a staff session: refused, nothing saved", r.status === 403 && n5 === 0, `status ${r.status}; stamped=${n5}`);

// 6 (not run here) the Stripe stand-in does not expose request bodies; "not in Stripe" is pinned by source:
//   click-ids.test.ts asserts lib/checkout/stripe.ts and intent.ts hold no fbp/fbc and the session input carries none.
rec("6 values never reach Stripe", null, "N/A here; pinned by click-ids.test.ts (source) because the stand-in does not expose request bodies");

// 7 the database owner cannot backfill the (still unpaid -> paid) booking
const paidQuote = await mintQuote();
const S7 = crypto.randomUUID();
consentRow(S7, false, "2026-10-03 10:00+00");
await pay(`e2e-meta-7-${Date.now()}@example.com`, `consent_subject=${S7}`, { quote: paidQuote });
sql(`update public.bookings set status='paid' where quote_id='${paidQuote.quoteId}'`);
let refused = false;
try {
  sql(`update public.bookings set meta_fbp='${FBP}' where quote_id='${paidQuote.quoteId}'`);
} catch {
  refused = true;
}
rec("7 a paid booking refuses a late backfill (trigger)", refused, `refused=${refused}`);

finish(process.env.OUT);
